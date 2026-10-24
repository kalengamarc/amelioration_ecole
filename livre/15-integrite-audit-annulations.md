# 15. Intégrité, audit et annulations

Un logiciel de gestion financière doit pouvoir répondre à trois questions, des mois plus
tard :

1. **Qui** a fait cette opération ?
2. **Quand**, et avec quelles valeurs ?
3. Comment la **corriger** sans effacer l'histoire ?

## 15.1 Le journal d'audit

```sql
CREATE TABLE AuditLog (
    id           TEXT PRIMARY KEY,
    user_id      TEXT,
    action       TEXT NOT NULL,
    entite       TEXT NOT NULL,
    entite_id    TEXT,
    details      TEXT,
    adresse_ip   TEXT,
    created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_audit_user_date   ON AuditLog(user_id, created_at);
CREATE INDEX idx_audit_entite      ON AuditLog(entite, entite_id);
CREATE INDEX idx_audit_action_date ON AuditLog(action, created_at);
```

### L'écriture

```rust
// src-tauri/src/utils/audit_logger.rs
pub fn log_audit(
    conn: &std::sync::Mutex<rusqlite::Connection>,
    user_id: Option<&str>,
    action: &str,
    entite: &str,
    entite_id: Option<&str>,
    details: Option<&str>,
) {
    let id = generate_id();
    let now = crate::db::now_iso();
    let Ok(conn) = conn.lock() else { return };
    let _ = conn.execute(
        "INSERT INTO AuditLog (id, user_id, action, entite, entite_id, details, created_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7)",
        params![id, user_id, action, entite, entite_id, details, now],
    );
    // Rétention : conserver les 200 entrées les plus récentes
    let _ = conn.execute(
        "DELETE FROM AuditLog WHERE id NOT IN
         (SELECT id FROM AuditLog ORDER BY created_at DESC LIMIT 200)", []);
}
```

### Trois problèmes à voir

1. **Rétention à 200 lignes.** Sur une école qui encaisse 100 paiements par jour, cela
   représente deux jours d'historique. Un audit financier exige des années. Il faut une
   politique de conservation par date (par exemple 5 ans) et une purge archivable.
2. **`user_id` souvent `None`.** Beaucoup d'appels passent `None` (voir `create_eleve` :
   `log_audit(&db, None, "CREATE", …)`). Résultat : impossible de savoir qui a inscrit
   l'élève. L'identité de l'appelant doit remonter, soit par paramètre, soit par un
   mécanisme de session côté Rust.
3. **`let _ =` avale les erreurs.** Si l'insertion échoue, personne ne le saura. Pour un
   journal d'audit, c'est discutable : mieux vaut tracer sur `stderr` au minimum.

> 🧠 **Un journal d'audit n'est pas un journal de débogage.** Il est immuable, horodaté,
> attribué, et ne contient aucune donnée sensible en clair (pas de mot de passe, pas de
> numéro de carte).

### La lecture

```rust
#[tauri::command]
pub fn list_audit_logs(db: State<'_, DbConn>, user_id: Option<String>, action: Option<String>,
                       entite: Option<String>, entite_id: Option<String>,
                       page: Option<i64>, page_size: Option<i64>) -> Result<Value, AppError>
```

L'écran `AuditPage.tsx` affiche ces entrées, avec les filtres. C'est le premier endroit à
consulter en cas de litige (« je n'ai jamais reçu ce reçu »).

## 15.2 L'annulation : le bon geste comptable

```text
Paiement annulé ?  →  on ne supprime pas
                   →  annule = 1, date_annulation
                   →  AnnulationRecu (motif, auteur, date)
                   →  Echeance.montant_paye -= montant_affecte
                   →  AuditLog "ANNULATION"
```

Le code de `annuler_paiement` :

```rust
if already_annule {
    return Err(AppError::BadRequest("Ce paiement est déjà annulé".into()));
}

conn.execute(
    "UPDATE Paiement SET annule = 1, date_annulation = ?, updated_at = ? WHERE id = ?",
    params![now, now, id],
)?;

if let Some(ref ech_id) = echeance_id {
    if !ech_id.trim().is_empty() {
        let m_affecte = montant_affecte_val.unwrap_or(montant);
        conn.execute(
            "UPDATE Echeance SET montant_paye = MAX(0, montant_paye - ?), updated_at = ? WHERE id = ?",
            params![m_affecte, now, ech_id],
        )?;
    }
}

conn.execute(
    "INSERT INTO AnnulationRecu (id, paiement_id, user_id, motif, date_annulation, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
    params![annulation_id, id, user_id, motif, now, now],
)?;

drop(conn);
log_audit(&db, None, "ANNULATION", "paiement", Some(&id), Some(&format!(
    "Annulation du paiement n° {}, montant={} {}", numero_recu, montant, devise)));
```

### Ce qui est exemplaire

- contrôle d'idempotence (`déjà annulé`) ;
- motif obligatoire et conservé ;
- `MAX(0, …)` contre les soldes négatifs ;
- libération du verrou avant l'audit.

### Ce qui manque

| Manque | Risque | Correction |
|---|---|---|
| pas de transaction | paiement annulé sans restauration de l'échéance | `tx.commit()` |
| `MAX(0, …)` masque une incohérence | perte silencieuse | journaliser si la valeur est bornée |
| annulation possible sans motif non vide | traçabilité faible | `if motif.trim().is_empty() { err }` |
| pas de contrôle de rôle | un secrétaire peut annuler une recette | vérifier la permission |

> ⚠️ **`MAX(0, …)` : ami ou ennemi ?** Il évite un solde négatif, mais si `montant_paye`
> était inférieur au montant annulé, il **cache** une corruption. Solution : calculer
> avant, comparer, puis décider (refuser ou journaliser une anomalie).

## 15.3 Suppression vs archivage

Le projet utilise deux approches, ce qui crée de l'incohérence :

| Entité | Commande | Comportement réel |
|---|---|---|
| Élève | `delete_eleve` | `UPDATE Eleve SET statut='TRANSFERE'` |
| Établissement | `delete_etablissement` | à vérifier (cascade possible) |
| Classe | `delete_classe` | vérifie l'effectif, puis supprime/archiver |
| Paiement | *(aucune)* | annulation uniquement |

```rust
// delete_eleve
conn.execute("UPDATE Eleve SET statut='TRANSFERE', updated_at=? WHERE id=?", …)?;
log_audit(&db, None, "DELETE", "eleve", Some(&id), None);
```

> ⚠️ **Trois défauts ici**
> 1. l'action d'audit s'appelle `DELETE` alors que rien n'est supprimé : trompeur ;
> 2. l'inscription `EleveClasse` reste `ACTIF` : l'élève « transféré » occupe encore une
>    place dans la classe et bloque une réinscription à cause de l'index unique ;
> 3. l'`annee_scolaire_id` de l'élève n'est pas mis à jour.
>
> Correction attendue :
> ```sql
> UPDATE Eleve SET statut='TRANSFERE', updated_at=? WHERE id=?;
> UPDATE EleveClasse SET statut='TRANSFERE', date_sortie=?
>   WHERE eleve_id=? AND statut='ACTIF';
> ```
> puis `log_audit(…, "ARCHIVE", "eleve", …)`.

## 15.4 Nettoyage des doublons d'inscription

Avant l'index unique, des bases ont accumulé des élèves avec plusieurs classes actives.
La commande `clean_eleve_classe_duplicates` répare :

```rust
// Conserver l'inscription active la plus récente ; en cas d'égalité, classe_id
// apporte un résultat stable et reproductible.
let keep_query = r#"
    SELECT classe_id FROM EleveClasse
    WHERE eleve_id = ? AND statut = 'ACTIF'
    ORDER BY date_inscription DESC, classe_id DESC
    LIMIT 1
"#;
```

> 🧠 **Un départage déterministe** (`classe_id DESC`) est essentiel : sans lui, deux
> exécutions pourraient conserver des lignes différentes. C'est un détail de qualité
> qu'on attend d'un développeur expérimenté.

## 15.5 Les contrôles d'intégrité avant synchronisation

`validate_sync_ready` (dans `commands/sync.rs`) est une **checklist automatique** :

```text
✓ configuration Supabase présente (URL + clé)
✓ tables locales présentes
✓ données non vides
✓ échéances sans élève ou frais inexistant    → alerte
✓ matricules dupliqués                        → alerte
✓ paiements orphelins                         → alerte
```

Exemple :

```sql
SELECT COUNT(*) FROM Echeance e
LEFT JOIN Eleve el ON el.id = e.eleve_id
LEFT JOIN FraisScolaire fs ON fs.id = e.frais_scolaire_id
WHERE e.eleve_id IS NOT NULL AND (el.id IS NULL OR fs.id IS NULL);
```

> 🧠 **Valider avant de synchroniser** évite de propager la corruption dans le cloud.
> C'est le principe du « pre-flight check ».

## 15.6 Un tableau de bord de santé des données

Proposition d'écran (exercice 15.3) : afficher en une page

| Indicateur | Requête |
|---|---|
| élèves sans classe active | `NOT EXISTS (… EleveClasse ACTIF)` |
| échéances sans paiement depuis 90 jours | `date_echeance < date('now','-90 day')` |
| paiements sans échéance | `echeance_id IS NULL` |
| montant payé > dû | `montant_paye > montant_du + 0.01` |
| inscriptions actives multiples | `GROUP BY eleve_id HAVING COUNT(*)>1` |
| dernières 24 h d'audit | `ORDER BY created_at DESC` |

Chaque ligne cliquable mène à la liste filtrée correspondante. C'est le type d'outil qui
fait la différence en exploitation.

## 15.7 Exercices

> **Exercice 15.1** — Corrigez `delete_eleve` (deux `UPDATE`, audit `ARCHIVE`). Vérifiez
> ensuite qu'un élève archivé peut être réinscrit dans une autre classe.

> **Exercice 15.2** — Transformez `annuler_paiement` en transaction et refusez un motif
> vide. Ajoutez un test manuel : annuler deux fois le même reçu doit échouer avec un
> message clair.

> **Exercice 15.3** — Implémentez la commande `get_integrity_report` et une page
> « Santé des données » accessible aux coordinateurs. Utilisez les six requêtes ci-dessus.

> **Exercice 15.4** — Remplacez la rétention de 200 lignes par une conservation de
> 5 ans : `DELETE FROM AuditLog WHERE created_at < date('now','-5 year')`. Ajoutez une
> commande d'export CSV avant purge.

> **Exercice 15.5** — Discutez : faut-il journaliser les consultations (lecture d'un
> bulletin, d'un reçu) ? Dans quel cas, et avec quelles précautions de volume et de
> confidentialité ?

## 15.8 À retenir

- On n'efface jamais une opération financière : on l'annule, avec motif et auteur.
- Le journal d'audit doit être complet, attribuable et conservé assez longtemps.
- `MAX(0, …)` protège mais peut masquer : journalisez les cas anormaux.
- Archiver = mettre à jour les statuts **et** clôturer les inscriptions.
- Validez l'intégrité avant de synchroniser.
