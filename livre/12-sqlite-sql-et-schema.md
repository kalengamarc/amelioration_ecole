# 12. SQLite : schéma, SQL, transactions

## 12.1 Pourquoi SQLite ?

| Critère | SQLite | PostgreSQL / Supabase |
|---|---|---|
| Installation | aucune, un fichier | serveur à héberger |
| Connexion | accès disque direct | réseau |
| Hors ligne | natif | impossible |
| Multi-postes | non | oui |
| Sauvegarde | copier un fichier | dump / réplication |

Le projet utilise **les deux** : SQLite comme base de travail, Supabase comme miroir
partagé (chapitre 17). C'est le bon choix pour une école à connexion intermittente.

## 12.2 Le schéma, en un coup d'œil

18 tables, regroupées en quatre familles :

```text
Référentiel      Etablissement · AnneeScolaire · Classe · User · ParametreEtablissement
Population       Eleve · Tuteur · TuteurEleve · EleveClasse
Finance          FraisScolaire · FraisClasse · Echeance · Paiement · AnnulationRecu · Depense
Exploitation     AuditLog · ConfigSysteme · SyncLog
```

### Une table, lue en détail

```sql
CREATE TABLE IF NOT EXISTS Echeance (
    id                      TEXT PRIMARY KEY,
    eleve_id                TEXT NOT NULL,
    frais_scolaire_id       TEXT NOT NULL,
    etablissement_id        TEXT NOT NULL,
    annee_scolaire_id       TEXT NOT NULL,
    montant_du              REAL NOT NULL,
    montant_paye            REAL NOT NULL DEFAULT 0,
    statut                  TEXT NOT NULL DEFAULT 'EN_ATTENTE',
    date_echeance           TEXT,
    date_paiement_complet   TEXT,
    created_at              TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at              TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (eleve_id) REFERENCES Eleve(id) ON UPDATE CASCADE ON DELETE CASCADE,
    FOREIGN KEY (frais_scolaire_id) REFERENCES FraisScolaire(id) ON UPDATE CASCADE ON DELETE CASCADE,
    FOREIGN KEY (annee_scolaire_id) REFERENCES AnneeScolaire(id) ON UPDATE CASCADE ON DELETE CASCADE,
    UNIQUE(eleve_id, frais_scolaire_id)
);
```

Chaque choix se défend :

| Choix | Justification |
|---|---|
| `TEXT PRIMARY KEY` (UUID) | générable hors-ligne, sans conflit à la synchronisation |
| `REAL` pour l'argent | simplicité SQLite ; **pas** idéal pour la comptabilité exacte (ch. 14) |
| `TEXT` pour les dates ISO | tri lexicographique = tri chronologique |
| `INTEGER 0/1` pour les booléens | SQLite n'a pas de type booléen |
| `ON DELETE CASCADE` | supprimer un frais supprime ses échéances — cohérent |
| `UNIQUE(eleve_id, frais_scolaire_id)` | une seule échéance par élève et par frais |

> 🧠 **La clé étrangère n'est active que si on l'active.** SQLite les ignore par défaut.
> Le projet l'exécute au démarrage :
> ```rust
> conn.execute_batch("PRAGMA foreign_keys=ON;")?;
> ```
> Sans cette ligne, `ON DELETE CASCADE` ne fait rien : des données orphelines
> apparaissent. C'est la cause n°1 de bases corrompues dans les projets SQLite.

## 12.3 Les index : la performance écrite à la main

```sql
CREATE INDEX IF NOT EXISTS idx_echeance_eleve_statut ON Echeance(eleve_id, statut);
CREATE INDEX IF NOT EXISTS idx_paiement_etab_date     ON Paiement(etablissement_id, created_at);
CREATE INDEX IF NOT EXISTS idx_eleve_nom_prenom       ON Eleve(nom, prenom);
```

Un index est comme l'index d'un livre : il évite de parcourir toutes les pages. Règles :

- indexez les colonnes utilisées dans `WHERE`, `JOIN`, `ORDER BY` ;
- l'ordre des colonnes compte : `(etablissement_id, created_at)` sert à filtrer par école
  **puis** trier par date ;
- trop d'index ralentissent les écritures.

### L'index unique partiel : une règle métier en SQL

```sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_eleve_classe_one_active_per_eleve
ON EleveClasse(eleve_id) WHERE statut = 'ACTIF';
```

Traduction : « au plus une ligne `ACTIF` par élève ». C'est la règle du chapitre 3,
imposée par la base. Avant de créer cet index, `init_db` **normalise** les doublons :

```rust
fn normalize_active_enrollments(conn: &Connection) -> Result<(), AppError> {
    conn.execute(
        "UPDATE EleveClasse SET statut = 'TRANSFERE', date_sortie = ?
         WHERE statut = 'ACTIF'
           AND EXISTS (SELECT 1 FROM EleveClasse AS kept
                       WHERE kept.eleve_id = EleveClasse.eleve_id
                         AND kept.statut = 'ACTIF'
                         AND (kept.date_inscription > EleveClasse.date_inscription
                              OR (kept.date_inscription = EleveClasse.date_inscription
                                  AND kept.classe_id > EleveClasse.classe_id)))",
        rusqlite::params![now],
    )?;
    Ok(())
}
```

> 🧠 **Migration de données avant contrainte** : c'est un patron classique. On répare
> l'existant, puis on verrouille. Faire l'inverse échoue sur les bases déjà polluées.

## 12.4 Deux schémas qui divergent — et le code qui s'adapte

Le dépôt contient **deux** définitions :

| Fichier | Usage |
|---|---|
| `src-tauri/src/db/mod.rs` (const `SCHEMA`) | schéma réellement créé au démarrage |
| `src-tauri/src/db/schema.sql` | document de référence (lecture) |
| `supabase_schema.sql` | miroir PostgreSQL pour le cloud |

Elles ne sont pas identiques. Exemple historique : certaines bases ont
`FraisScolaire.classe_ids` (JSON), d'autres la table de liaison `FraisClasse`.

Le module `echeances.rs` a donc développé une **introspection du schéma** :

```rust
fn detect(conn: &rusqlite::Connection) -> Self {
    Self {
        frais_classe_table: table_exists(conn, "FraisClasse"),
        frais_classe_ids: column_exists(conn, "FraisScolaire", "classe_ids"),
        // …
    }
}
```

puis construit la clause SQL adaptée :

```rust
if self.frais_classe_ids {
    conditions.push("(TRIM(LOWER(COALESCE(fs.classe_ids, ''))) IN ('all', '\"all\"', '[]', '')
                     OR EXISTS (SELECT 1 FROM json_each(fs.classe_ids) je WHERE je.value = c.id))");
} else {
    conditions.push("EXISTS (SELECT 1 FROM FraisClasse fc WHERE fc.frais_scolaire_id = fs.id AND fc.classe_id = c.id)");
}
```

**Ce que cela nous apprend :**

1. une base installée chez un client est **immuable sans migration** ; le code doit gérer
   plusieurs générations de schéma ;
2. cette complexité coûte cher (le fichier `echeances.rs` fait 1 130 lignes) ;
3. la solution propre est un **système de migrations versionnées** (exercice 20.3).

> ⚠️ **Constat à corriger** : `supabase_schema.sql` et le schéma local ne sont pas
> alignés (types, colonnes, contraintes). Toute synchronisation peut échouer sur un champ
> absent. C'est la source des erreurs du chapitre 18.

## 12.5 Écrire du SQL en Rust, sans injection

### La bonne manière : les paramètres liés

```rust
conn.execute(
    "INSERT INTO Eleve (id, matricule, nom, prenom, sexe, statut, etablissement_id, annee_scolaire_id, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, 'INSCRIT', ?6, ?7, ?8, ?9)",
    params![id, matricule, data.nom, data.prenom, data.sexe,
            data.etablissement_id, data.annee_scolaire_id, now, now],
)?;
```

`?1`, `?2`… sont des **emplacements** remplis par `params!`. Le pilote échappe les
valeurs : un nom comme `Robert'); DROP TABLE Eleve; --` reste un nom.

### La mauvaise manière

```rust
// ❌ NE JAMAIS FAIRE
let sql = format!("SELECT * FROM Eleve WHERE nom = '{}'", nom_saisi);
```

### Le cas difficile : les filtres dynamiques

`list_paiements` construit sa clause `WHERE` progressivement :

```rust
let mut where_conditions = vec!["1=1".to_string()];
let mut param_values: Vec<Box<dyn rusqlite::types::ToSql>> = vec![];

if let Some(ref v) = etablissement_id {
    where_conditions.push("p.etablissement_id = ?".into());
    param_values.push(Box::new(v.clone()));
}
if let Some(ref v) = date_to {
    where_conditions.push("p.created_at < (? || 'T23:59:59.999Z')".into());
    param_values.push(Box::new(v.clone()));
}
```

Le `?` reste un emplacement : seule la **structure** de la requête est construite,
jamais les valeurs. C'est correct.

> 🧠 Le seul endroit où une chaîne entre dans le SQL, c'est un **nom de table** (dans
> `validate_sync_ready`, par exemple). D'où la nécessité d'une liste blanche
> (exercice 11.4).

## 12.6 Transactions : tout ou rien

Le projet fait souvent plusieurs écritures successives. Exemple `create_eleve` :

```text
INSERT Eleve → INSERT EleveClasse → INSERT Tuteur → INSERT TuteurEleve
```

Si la troisième requête échoue, l'élève existe sans tuteur : **données partielles**.
La solution est la transaction :

```rust
let tx = conn.transaction()?;                 // nécessite conn: &mut Connection
tx.execute("INSERT INTO Eleve …", params![…])?;
tx.execute("INSERT INTO EleveClasse …", params![…])?;
tx.commit()?;                                  // rien n'est écrit avant cette ligne
```

En cas d'erreur, `tx` est abandonné (rollback implicite).

### Adapter le projet

`DbConn` est `Mutex<Connection>`. Pour obtenir un `&mut Connection`, il faut verrouiller
en mutable :

```rust
let mut conn = db.lock()?;
let tx = conn.transaction()?;
```

> 🔧 **Exercice 13.3** — Transformez `create_eleve` et `create_paiement` en transactions.
> Testez en provoquant volontairement une erreur au milieu (par exemple un matricule
> dupliqué) : aucune ligne ne doit rester.

## 12.7 Requêtes analytiques utiles

### Compter par statut

```sql
SELECT statut, COUNT(*) FROM Echeance GROUP BY statut;
```

### Le CA par jour

```sql
SELECT date(created_at) AS jour, devise, SUM(montant) AS total
FROM Paiement
WHERE COALESCE(annule, 0) = 0
  AND etablissement_id = ?
GROUP BY jour, devise
ORDER BY jour DESC;
```

### Les élèves sans classe active

```sql
SELECT e.id, e.matricule, e.nom, e.prenom
FROM Eleve e
WHERE NOT EXISTS (
  SELECT 1 FROM EleveClasse ec
  WHERE ec.eleve_id = e.id AND ec.statut = 'ACTIF'
);
```

### Le top des impayés (avec relance)

```sql
SELECT e.nom, e.prenom, SUM(ec.montant_du - ec.montant_paye) AS reste
FROM Echeance ec
JOIN Eleve e ON e.id = ec.eleve_id
WHERE ec.montant_paye < ec.montant_du
GROUP BY e.id
ORDER BY reste DESC
LIMIT 20;
```

Entraînez-vous : ces quatre requêtes sont la base des rapports (chapitre 16).

## 12.8 Sauvegarde et intégrité

```bash
# Sauvegarde à chaud (recommandé, gère le WAL)
sqlite3 ~/SGFS-ME/data/sgfs.db ".backup '/tmp/sgfs-$(date +%F).db'"

# Vérifier l'intégrité
sqlite3 ~/SGFS-ME/data/sgfs.db "PRAGMA integrity_check;"

# Compacter
sqlite3 ~/SGFS-ME/data/sgfs.db "VACUUM;"
```

> 🧠 Le mode **WAL** crée `sgfs.db-wal` et `sgfs.db-shm`. Copier uniquement `sgfs.db`
> pendant que l'application tourne peut produire une sauvegarde incohérente : utilisez
> `.backup` ou fermez l'application.

## 12.9 Exercices

> **Exercice 12.1** — Écrivez la requête qui liste, pour chaque classe d'un établissement,
> l'effectif actif et le montant total dû. (Deux jointures, un `GROUP BY`.)

> **Exercice 12.2** — Ajoutez un index qui accélère la recherche d'élèves par matricule
> dans un établissement. Justifiez l'ordre des colonnes. Mesurez avec
> `EXPLAIN QUERY PLAN` avant/après.

> **Exercice 12.3** — Créez une table `Migration(version INTEGER PRIMARY KEY, applied_at TEXT)`
> et écrivez la fonction `run_migrations(conn)` qui applique les scripts dans l'ordre.
> C'est le début de la solution à la divergence de schéma (§12.4).

> **Exercice 12.4** — Expliquez pourquoi `UNIQUE(eleve_id, frais_scolaire_id)` **et**
> l'index partiel sur `EleveClasse` sont deux contraintes différentes, qui protègent deux
> règles différentes.

## 12.10 À retenir

- SQLite : zéro installation, hors-ligne, un fichier — idéal pour le terrain.
- Activez `PRAGMA foreign_keys=ON`, sinon les cascades sont décoratives.
- Un index unique partiel transforme une règle métier en contrainte infaillible.
- Paramètres liés obligatoires ; jamais de concaténation de valeurs.
- Une transaction protège les écritures multiples ; le projet doit encore y passer.
- Le schéma évolue : sans migrations versionnées, le code se couvre de `if column_exists`.
