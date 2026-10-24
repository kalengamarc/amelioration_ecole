# Annexe D — Corrigés des exercices

Les corrigés sont des **pistes de solution commentées**, pas du code à copier aveuglément.
Plusieurs exercices n'ont pas de solution unique : la justification compte autant que le
résultat.

---

## Chapitre 1

**1.1 — Cartographie.** 14 écrans métier dans `src/components/sgfs/`
(audit, classes, dashboard, depenses, echeances, eleves, encaissements, ReceiptPOS,
etablissements, frais, login, parametres, rapports, utilisateurs), plus la mise en page
`layout/Sidebar.tsx` ; **28 fichiers `*.rs`** dans `src-tauri/src/` (dont 15 modules de
commandes + `mod.rs`) ; **48 composants** dans `src/components/ui/`.
Le code « écrit à la main » est `sgfs/`, `lib/`, `commands/`, `db/`, `sync/`. Le code
« standard » est `ui/` (shadcn) : on le paramètre, on ne le réécrit pas.

---

## Chapitre 2

**2.1 — Hash bcrypt.** Un hash bcrypt fait **60 caractères** et commence par
`$2b$04$…` : `04` est le **coût**. Le coût 4 (celui du seed) est très faible ; un coût 12
est recommandé. Le hash ne contient pas le mot de passe, mais son empreinte salée : deux
utilisateurs avec le même mot de passe ont des hash différents.

**2.2 — `seed_default_admin`.** Le test `SELECT COUNT(*) FROM User` évite de créer un
second administrateur à chaque démarrage. Sans lui, chaque lancement ajouterait
`admin`… et échouerait de toute façon sur la contrainte `UNIQUE(username)`, bloquant
l'application au démarrage.

---

## Chapitre 3

**3.1 — Paiement partiel.** Insertion dans `Paiement` (`montant=100000`,
`montant_affecte=100000`, `annule=0`) et `UPDATE Echeance SET montant_paye = 100000`.
L'écran affiche `PARTIELLEMENT_PAYE`, reste 50 000. L'annulation met `annule=1`, crée une
`AnnulationRecu` avec motif et ramène `montant_paye` à 0 (`MAX(0, …)`), de sorte que
l'échéance redevient `EN_ATTENTE`.

**3.2 — Paiement multi-devises.** Champs à renseigner :
`montant=72500`, `devise='BIF'`, `montant_affecte=25`, `devise_echeance='USD'`,
`taux_change=2900`, `montant_original=25`. Le frais reste libellé en USD ; l'échéance
augmente de 25 USD ; la caisse enregistre 72 500 BIF.

**3.3 — Frais de bibliothèque.** Aucune nouvelle table : un `FraisScolaire`
(`type='ANNEXE'`, `libelle='Bibliothèque'`) et deux lignes `FraisClasse` pour les classes
concernées. C'est précisément le rôle de la table de liaison.

**3.4 — Départ d'un élève.** (1) `Eleve.statut='TRANSFERE'` ; (2) clôturer l'inscription
`EleveClasse` (`statut='TRANSFERE'`, `date_sortie`) ; (3) ne jamais supprimer paiements ni
échéances ; (4) journaliser l'archivage. Sans l'étape 2, l'index unique partiel empêche
une future réinscription et l'élève reste compté dans l'effectif de la classe.

---

## Chapitre 4

**4.1 — Argumentaire (exemple).** « L'application enregistre chaque opération dans une
base SQLite installée sur l'ordinateur de l'école : elle fonctionne donc sans connexion.
Les écritures sont conservées localement dans l'ordre où elles ont eu lieu. Dès que la
connexion revient, une synchronisation envoie ces opérations vers le serveur cloud
(Supabase) et récupère les modifications faites ailleurs. En cas de coupure, rien n'est
perdu : la file d'attente est la base elle-même, et l'opération sera rejouée. »

---

## Chapitre 5

**5.1 — `local-data-changed`.** Émetteur : `tauri-commands.ts` (une seule fois, dans
`cmd`). Écouteurs : `src/app/page.tsx` (debounce 5 s → `runAutoSync`). Les écrans
n'écoutent pas cet événement : ils écoutent `sync-completed` (Élèves, Classes…). Il manque
donc un rafraîchissement cohérent pour les autres écrans (Dépenses, Encaissements,
Rapports) après synchronisation : à ajouter.

**5.2 — Ossature des écrans.** `UtilisateursPage` et `DepensesPage` suivent la même
structure ; les écarts portent surtout sur les hooks de données (un seul `useEffect`
regroupé) et sur l'absence de filtre « année » pour les utilisateurs. Conclusion : la
convention est réelle mais non mécanique ; documentez les exceptions.

**5.3 — Délai initial.** À 10 s, la synchronisation peut démarrer avant la fin du chargement
du tableau de bord et des listes (compétition pour le verrou SQLite), provoquant des
attentes ou des états « chargement » prolongés. 30 s laisse le temps à l'interface de
s'afficher. La bonne pratique serait de déclencher la première synchronisation **après**
le premier rendu utile, voire après une période d'inactivité.

---

## Chapitre 6

**6.1 — Types.** Créer `src/lib/types.ts` fait apparaître : des champs retournés en
`snake_case`, des `null` là où le type attendait `string`, des objets imbriqués
(`inscriptions[].classe`) absents de certains endpoints. C'est la preuve que le contrat
n'est pas stable : le typage révèle la dette, il ne la crée pas.

**6.2 — Uniformisation.** Exemple :

```rust
// list_classes
Ok(json!({ "success": true, "data": classes, "pagination": { "total": total, "page": page, "pageSize": limit } }))
```

```ts
const list = unwrapList<Classe>(res, 'data')
```

Adapter **un** écran, tester, puis généraliser. Ne changez jamais deux endpoints à la fois.

**6.3 — `messageOf`.**

```ts
export function messageOf(e: unknown): string {
  if (typeof e === 'string') return e
  if (e instanceof Error) return e.message
  if (e && typeof e === 'object' && 'error' in e) return String((e as any).error)
  return 'Erreur inconnue'
}
```

---

## Chapitre 7

**7.1 — Sélecteurs.**

```tsx
const user = useAppStore((s) => s.user)
const currentEtablissement = useAppStore((s) => s.currentEtablissement)
```

Avant : chaque changement de `sidebarOpen` re-rendait l'écran complet (tableau inclus).
Après : seuls les composants abonnés aux champs modifiés se re-rendent.

**7.2 — Migration de persistance.**

```ts
persist(store, {
  name: 'sgfs-storage',
  version: 2,
  migrate: (persisted: any, version: number) => {
    if (version < 2 && persisted?.user) {
      persisted.user = {
        ...persisted.user,
        etablissements: persisted.user.etablissementId ? [persisted.user.etablissementId] : [],
      }
    }
    return persisted
  },
  partialize: (s) => ({ token: s.token, user: s.user, isAuthenticated: s.isAuthenticated }),
})
```

**7.3 — Année courante.** Ajouter `anneeScolaireCourante` et l'alimenter depuis
`get_etablissement_context` (qui connaît l'année active). Dans `ElevesPage`, initialiser
`year` avec cette valeur **uniquement si** `!locked` ; sinon le filtre verrouillé de la
secrétaire doit rester prioritaire.

---

## Chapitre 8

**8.1 — Écran « sans classe ».** Squelette :

```tsx
const [rows, setRows] = useState<any[]>([])
useEffect(() => { tc.listElevesSansClasse({ etablissementId: school || undefined })
  .then((r: any) => setRows(r?.data ?? r?.eleves ?? [])) }, [school])
```

Le bouton « Affecter » appelle `tc.updateEleve(id, { classeId, anneeScolaireId })`.
Si l'API ne permet pas de changer la classe seule, créez une commande dédiée
`affecter_eleve_classe(eleve_id, classe_id, annee_scolaire_id)` qui : clôture
l'inscription active, insère la nouvelle, journalise, et s'exécute en transaction.

**8.2 — Filtre SQL.**

```rust
if sans_classe.unwrap_or(false) {
    conditions.push("NOT EXISTS (SELECT 1 FROM EleveClasse ec WHERE ec.eleve_id = e.id AND ec.statut = 'ACTIF')".into());
}
```

Ajouter le paramètre à la commande, à `tauri-commands.ts`, et adapter
`total`/`totalPages` (le filtre ne s'applique plus côté client).

**8.3 — Bandeau d'erreur.**

```tsx
const [error, setError] = useState<string | null>(null)
// dans fetchStudents : catch (e) { setError(messageOf(e)) }
{error && (
  <div role="alert" className="flex items-center justify-between rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-800">
    <span>{error}</span>
    <Button size="sm" variant="outline" onClick={() => { setError(null); fetchStudents() }}>Réessayer</Button>
  </div>
)}
```

**8.4 — `normalizeEleve`.**

```ts
export function normalizeEleve(raw: any): Student {
  const inscriptions = raw.inscriptions ?? raw.classes ?? []
  const active = inscriptions.find((i: any) => i.statut === 'ACTIF') ?? inscriptions[0]
  const tuteur = raw.tuteurs?.find((t: any) => t.tuteur?.isPrincipal)?.tuteur ?? raw.tuteurs?.[0]?.tuteur
  return {
    id: raw.id,
    matricule: raw.matricule,
    nom: raw.nom, prenom: raw.prenom,
    sexe: raw.sexe, statut: raw.statut,
    dateNaissance: raw.dateNaissance ?? raw.date_naissance ?? undefined,
    lieuNaissance: raw.lieuNaissance ?? raw.lieu_naissance ?? undefined,
    etablissementId: raw.etablissementId ?? raw.etablissement_id,
    inscriptions,
    tuteurs: raw.tuteurs ?? [],
    tuteurPrincipalNom: tuteur ? `${tuteur.nom} ${tuteur.prenom}` : undefined,
    classeNom: active?.classe?.nom ?? active?.classe_nom ?? '—',
  }
}
```

---

## Chapitre 9

**9.1 — Jetons.** Ajouter `brand`/`accent` dans `tailwind.config.js`, puis remplacer
`bg-[#0c241f]` par `bg-brand`, `hover:bg-[#071916]` par `hover:bg-brand-hover`,
`bg-amber-500` par `bg-accent`. Vérifiez avec la couleur dynamique d'un établissement.

**9.2 — Impression.**

```css
@media print {
  .no-print, aside, header, button { display: none !important; }
  body { background: #fff !important; color: #000 !important; }
  .receipt { width: 80mm; margin: 0; font-size: 11px; box-shadow: none; }
  @page { margin: 5mm; }
}
```

Ajoutez `className="no-print"` sur la sidebar et les actions.

**9.3 — `StatCard`.**

```tsx
function StatCard({ label, value, icon: Icon, tone = 'text-brand' }: {
  label: string; value: string; icon: LucideIcon; tone?: string
}) {
  return (
    <Card className="rounded-2xl">
      <CardContent className="flex items-center gap-3 p-4">
        <span className={`rounded-xl bg-stone-100 p-2 ${tone}`}><Icon className="h-5 w-5" /></span>
        <div>
          <p className="text-xs text-stone-500">{label}</p>
          <p className="text-lg font-extrabold">{value}</p>
        </div>
      </CardContent>
    </Card>
  )
}
```

**9.4 — Accessibilité.** Trois constats typiques : contraste insuffisant du texte
secondaire (`text-stone-400` sur blanc), champs sans `htmlFor`, boutons icônes sans
`aria-label`. Corriger suffit souvent de trois lignes.

---

## Chapitre 10

**10.1 — EUR.**

```rust
"EUR" => format!("{:.2} €", amount),
```

Placez la branche **avant** `"USD" | _`, sinon `_` la capture.

**10.2 — Somme par devise + test.**

```rust
use std::collections::BTreeMap;

pub fn total_par_devise(items: &[(f64, String)]) -> BTreeMap<String, f64> {
    let mut acc = BTreeMap::new();
    for (montant, devise) in items {
        *acc.entry(devise.clone()).or_insert(0.0) += montant;
    }
    acc
}

#[cfg(test)]
mod t {
    use super::*;
    #[test]
    fn separe_les_devises() {
        let r = total_par_devise(&[(1000.0, "BIF".into()), (5.0, "USD".into()), (500.0, "BIF".into())]);
        assert_eq!(r["BIF"], 1500.0);
        assert_eq!(r["USD"], 5.0);
    }
}
```

**10.3 — Verrou.** Cherchez les `log_audit(&db, …)` dont la variable `conn` est encore en
portée (non `drop`). Le symptôme est un gel au moment de l'action. Correction :
`drop(conn);` avant l'appel.

**10.4 — Local vs UTC.** `chrono::Local` produit la date locale, `date('now')` celle du
serveur SQLite en **UTC**. Vers minuit, un paiement de 23 h 30 locale peut compter dans le
jour UTC suivant : le numéro de reçu repart à `0001` alors que la date affichée est
différente (risque de collision). Correction : calculer la date en Rust et la passer en
paramètre des deux côtés.

---

## Chapitre 11

**11.1 — `ping`.** Voir §11.7. Erreur fréquente : oublier l'enregistrement dans
`lib.rs`, ou lire `data.serverTime` au lieu de `data.server_time`.

**11.2 — Commandes manquantes.** L'inventaire révèle des appels à `create_echeance`,
`update_echeance`, `delete_echeance`, `create_echeances_bulk`, `get_depenses_stats` sans
équivalent dans `generate_handler!`. Choisissez la correction la moins risquée :
1. si la fonction existe dans un module, l'enregistrer ;
2. sinon l'implémenter (exercice 13.1) ;
3. sinon retirer l'appel côté front et adapter l'écran.
Documentez le choix dans la PR.

**11.3 — Capacités.** Un seul bloc, sans doublon ; CSP minimale avec
`connect-src 'self' https://*.supabase.co`. Testez ensuite l'application (ouverture de
liens via `shell:allow-open`).

**11.4 — `count_rows`.** Sans liste blanche, un appelant pourrait passer
`Paiement; DROP TABLE …` ou lire `User` (hash de mots de passe). Liste blanche :

```rust
const TABLES: [&str; 6] = ["Etablissement", "Classe", "Eleve", "Paiement", "Echeance", "Depense"];
if !TABLES.contains(&table.as_str()) {
    return Err(AppError::Validation("Table non autorisée".into()));
}
```

---

## Chapitre 12

**12.1 — Effectif et dû par classe.**

```sql
SELECT c.nom AS classe,
       COUNT(DISTINCT ec.eleve_id) AS effectif,
       COALESCE(SUM(ech.montant_du), 0) AS total_du
FROM Classe c
LEFT JOIN EleveClasse ec ON ec.classe_id = c.id AND ec.statut = 'ACTIF'
LEFT JOIN Eleve e ON e.id = ec.eleve_id AND e.statut IN ('ACTIF','INSCRIT')
LEFT JOIN Echeance ech ON ech.eleve_id = e.id AND ech.annee_scolaire_id = c.annee_scolaire_id
WHERE c.etablissement_id = ?1 AND c.annee_scolaire_id = ?2
GROUP BY c.id, c.nom
ORDER BY c.nom;
```

**12.2 — Index matricule.** `CREATE INDEX idx_eleve_etab_matricule ON Eleve(etablissement_id, matricule);`
L'ordre place d'abord le filtre d'égalité le plus sélectif, puis la recherche. Vérifiez
avec `EXPLAIN QUERY PLAN` : doit passer de `SCAN` à `SEARCH … USING INDEX`.

**12.3 — Migrations.** Voir §20.4 (patron complet). L'essentiel : table `Migration`,
liste ordonnée `(version, sql)`, transaction par version, rollback en cas d'échec.

**12.4 — Deux contraintes.** `UNIQUE(eleve_id, frais_scolaire_id)` interdit **deux
échéances pour le même frais et le même élève**. L'index partiel sur `EleveClasse`
interdit **deux classes actives pour le même élève**. L'une protège la facturation,
l'autre la scolarité.

---

## Chapitre 13

**13.1 — `create_echeances_bulk`.**

```rust
#[tauri::command]
pub fn create_echeances_bulk(db: State<'_, DbConn>, frais_scolaire_id: String,
                             annee_scolaire_id: String, eleve_ids: Vec<String>) -> Result<Value, AppError> {
    let mut conn = db.lock()?;
    let tx = conn.transaction()?;
    let mut crees = 0usize;

    let (montant, devise, etab, date_ech): (f64, String, String, Option<String>) = tx.query_row(
        "SELECT montant, devise, etablissement_id, date_echeance FROM FraisScolaire WHERE id = ?1",
        params![frais_scolaire_id], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
    )?;

    for eleve_id in &eleve_ids {
        crees += tx.execute(
            "INSERT OR IGNORE INTO Echeance
             (id, eleve_id, frais_scolaire_id, etablissement_id, annee_scolaire_id,
              montant_du, montant_paye, statut, date_echeance, created_at, updated_at)
             VALUES (?1,?2,?3,?4,?5,?6,0,'EN_ATTENTE',?7,?8,?8)",
            params![generate_id(), eleve_id, frais_scolaire_id, etab, annee_scolaire_id,
                    montant, date_ech, now_iso()],
        )?;
    }
    tx.commit()?;
    log_audit(&db, None, "CREATE", "echeance", Some(&frais_scolaire_id),
              Some(&format!("{} échéances générées", crees)));
    Ok(api_response(Ok(json!({ "created": crees }))))
}
```

**13.2 — Double validation.** Le `Select` fermé évite l'erreur utilisateur ; la validation
Rust empêche un appel direct (console, script) de contourner la règle. L'un est de
l'ergonomie, l'autre de la sécurité.

**13.3 — `create_eleve` transactionnel.** Remplacer les `conn.execute` par `tx.execute`
et terminer par `tx.commit()`. Pour tester l'échec, forcez un tuteur avec un `nom` vide
soumis à une contrainte `NOT NULL`/`CHECK` : aucune ligne `Eleve` ne doit subsister.

**13.4 — Numérotation.** Reprendre le code du §13.3 (étape 4) ; test :

```rust
#[test]
fn numeros_uniques() {
    let conn = base();
    let mut vus = std::collections::HashSet::new();
    for _ in 0..100 { assert!(vus.insert(numero_suivant(&conn, "20261024").unwrap())); }
}
```

**13.5 — Refus sur échéance soldée.**

```rust
if let Some((_, du, paye)) = &echeance {
    if paye >= du - 0.01 {
        return Err(AppError::Validation(format!("Cette échéance est déjà soldée (reste {:.0}).", (du - paye).max(0.0))));
    }
}
```

---

## Chapitre 14

**14.1 — Unités mineures.**

```ts
export function toMinorUnits(amount: number, devise: string): number {
  const facteur = ['BIF', 'CDF'].includes(devise) ? 1 : 100
  return Math.round((amount + Number.EPSILON) * facteur)
}
export function fromMinorUnits(minor: number, devise: string): number {
  const facteur = ['BIF', 'CDF'].includes(devise) ? 1 : 100
  return minor / facteur
}
```

**14.2 — Preuve par lecture.** `dashboard.rs` construit
`BTreeMap<String, (f64, i64)>` par devise et soustrait devise par devise ; aucune somme
inter-devises n'existe. Le champ affiché `beneficeParDevise` est une liste. C'est correct.

**14.3 — Contrôle.** Voir §13.3 étape 3. Attention : le calcul utilise
`montant_affecte` (devise de l'échéance), pas `montant` (devise de caisse).

**14.4 — Procédure caissier.** (1) choisir l'échéance en USD ; (2) saisir le taux du jour
et le montant remis en BIF ; (3) vérifier l'équivalent affiché avant validation. Le reçu
doit indiquer : montant remis, taux, montant imputé.

**14.5 — Cache `Intl`.** Construire un `Intl.NumberFormat` coûte cher ; dans un tableau de
200 lignes × 3 colonnes, cela représente 600 constructions par rendu. Un cache
`Map<string, Intl.NumberFormat>` divisie ce coût par 200.

---

## Chapitre 15

**15.1 — Archivage.**

```rust
conn.execute("UPDATE Eleve SET statut='TRANSFERE', updated_at=? WHERE id=?", params![now, id])?;
conn.execute("UPDATE EleveClasse SET statut='TRANSFERE', date_sortie=? WHERE eleve_id=? AND statut='ACTIF'", params![now, id])?;
log_audit(&db, None, "ARCHIVE", "eleve", Some(&id), None);
```

**15.2 — Transaction + motif.** Envelopper dans `tx`, et :

```rust
if motif.trim().is_empty() {
    return Err(AppError::Validation("Le motif d'annulation est obligatoire.".into()));
}
```

Un second appel doit renvoyer « Ce paiement est déjà annulé ».

**15.3 — Santé des données.** Six requêtes du §15.6. Exemple de sortie :
`{ eleves_sans_classe: 3, echeances_en_retard_90j: 12, paiements_sans_echeance: 40, … }`.
Chaque compteur doit être cliquable vers la liste filtrée.

**15.4 — Rétention.**

```sql
DELETE FROM AuditLog WHERE created_at < date('now','-5 year');
```

Exportez d'abord en CSV (`sqlite3 -csv -header … "SELECT * FROM AuditLog"`), archivez le
fichier, puis purgez.

**15.5 — Journaliser les consultations ?** Oui pour les données sensibles (bulletins,
exports massifs, modification de notes), avec un volume maîtrisé (échantillonnage ou
durée courte). Non pour chaque affichage de liste : le bruit rendrait l'audit inutile.

---

## Chapitre 16

**16.1 — Taux de recouvrement.**

```text
taux = encaissé / dû (même devise, même période)
```

Afficher une info-bulle : « encaissements valides / montants dus, par devise ; les
paiements globaux sont imputés au prorata ». Seuils : rouge < 50 %, orange < 80 %, vert.

**16.2 — Recalcul séparé.** Créer `recalculate_echeances(...)` contenant l'`UPDATE`
actuellement dans `list_echeances`. L'appeler dans `sync_pull` (fin de pull) et dans
`annuler_paiement`. La lecture devient pure et rapide.

**16.3 — `Option` plutôt que `'ALL'`.** Signature
`etablissement_id: Option<String>`, puis dans le SQL construire la clause
(`?1 IS NULL OR p.etablissement_id = ?1`). Évite qu'un identifiant valant `ALL` soit
interprété comme un filtre global.

**16.5 — Élèves à risque.**

```sql
SELECT e.id, e.nom, e.prenom, c.nom AS classe,
       SUM(ech.montant_du) AS du, SUM(ech.montant_paye) AS paye,
       SUM(ech.montant_du - ech.montant_paye) AS reste
FROM Echeance ech
JOIN Eleve e ON e.id = ech.eleve_id
LEFT JOIN EleveClasse ec ON ec.eleve_id = e.id AND ec.statut='ACTIF'
LEFT JOIN Classe c ON c.id = ec.classe_id
WHERE ech.annee_scolaire_id = ?1
  AND date(ech.date_echeance) < date('now','-30 day')
GROUP BY e.id
HAVING SUM(ech.montant_du - ech.montant_paye) > 0.5 * SUM(ech.montant_du);
```

---

## Chapitre 17

**17.1 — Trace hors ligne.** Écriture SQLite → `local-data-changed` → debounce 5 s →
`syncStatus` (configured) → `syncPush` → requêtes HTTP. Si la connexion tombe à l'étape
HTTP : le paiement reste en base, l'état passe « hors ligne », un nouvel essai a lieu au
prochain événement `online` ou dans 5 minutes. Aucune perte.

**17.2 — Pull incrémental.** `GET /rest/v1/Paiement?updated_at=gt.<last_sync>&limit=1000`
avec pagination `Range`. Il faut que la colonne `updated_at` soit maintenue **à chaque**
`UPDATE` (le projet le fait pour la plupart des tables).

**17.3 — `SyncLog`.** Écrire une ligne par table et par sens à la fin de chaque phase :
`table_name`, `last_sync_at`, `direction`, `status`, `details` (JSON : poussés, tirés,
durée, erreurs). Afficher les 20 dernières dans un panneau.

**17.4 — Numéros de reçu.** Conflit garanti si deux caisses génèrent le même numéro.
Stratégies : (a) préfixe par caisse `REC-C2-20261024-0001` ; (b) séquence centralisée
(impossible hors ligne) ; (c) réconciliation à la synchronisation avec renommage et audit.
Le préfixe est la solution la plus simple et la plus robuste hors ligne.

**17.5 — RLS.** Activer RLS sur chaque table, créer une politique par établissement, et
tester avec deux comptes distincts. Sans policy, `anon` ne doit rien lire.

---

## Chapitre 18

**18.1 — Échec contrôlé.** Clé invalide → `401`. Message du moteur : erreur Supabase remontée
dans le résumé. Procédure : sauvegarder, corriger la clé, valider via `curl`, relancer.

**18.2 — Journal.** Insérer `SyncLog` au début (status `RUNNING`) et à la fin
(`SUCCESS`/`PARTIAL`/`FAILED`), avec la durée. Afficher dans un panneau « Diagnostic ».

**18.3 — `SYNC_DRY_RUN`.** Le rapport simulé compte les lignes ; le rapport réel peut
différer (les lignes déjà présentes ne sont pas « poussées » au sens strict, et les
orphelins sont filtrés). Justifiez ces écarts dans l'écran.

**18.4 — Script de contrôle.** Comparer `COUNT(*)` local et distant par table ; afficher
`local / distant / écart` et le code HTTP. C'est le premier outil à lancer en cas de doute.

---

## Chapitre 19

**19.1 — Trois tests d'intégration.** Rendre `pub const SCHEMA`. Puis :

```rust
#[test]
fn une_inscription_active_max() {
    let conn = base_avec_ecole();
    conn.execute("INSERT INTO EleveClasse (eleve_id, classe_id, statut) VALUES ('e1','c1','ACTIF')", []).unwrap();
    let err = conn.execute("INSERT INTO EleveClasse (eleve_id, classe_id, statut) VALUES ('e1','c2','ACTIF')", []).unwrap_err();
    assert!(err.to_string().to_lowercase().contains("unique"));
}
```

**19.2 — Divergence JS/Rust.** Pour `1500.7` BIF : JavaScript `toLocaleString(fr-FR,
{maximumFractionDigits:0})` **arrondit** à `1 501` ; Rust `amount as i64` **tronque** à
`1500`. Deux affichages différents pour le même montant : corrigez Rust avec
`amount.round() as i64`.

**19.3 — CI.** Le workflow doit aussi installer les dépendances système de WebKit sur
Ubuntu, sinon `cargo check` échoue.

**19.4 — Checklist.** Le fichier `livre/checklist-livraison.md` peut être généré à partir
de la matrice du §19.6.

---

## Chapitre 20

**20.1 — Installation.** Points à noter : SmartScreen, dossier d'installation, création du
dossier `%APPDATA%\SGFS-ME`, première ouverture, présence du fichier `sgfs.db`.

**20.2 — Migration `Caisse`.** Voir §20.4. Ne modifiez jamais `SCHEMA` en espérant qu'une
table existante change : ajoutez une migration.

**20.3 — Migration intégrée.** `run_migrations(&conn)?;` après `execute_batch(SCHEMA)` et
avant `seed_default_admin`.

**20.4 — Sauvegarde.** `VACUUM INTO`, puis rotation (conserver 30 jours). Afficher le
chemin du dossier dans Paramètres, avec un bouton « Ouvrir le dossier » (plugin opener).

**20.5 — Procédure utilisateur.** Une page : installer, première connexion, changer le mot
de passe, sauvegarder, que faire si « hors ligne », contacter qui.

---

## Chapitre 21

**21.1 — Permissions.** `isCoordinateur` renvoie `false` par défaut. Ajouter
`exiger_coordinateur(&conn, &user_id)?` dans les commandes destructives. Vérifier qu'un
compte `COORDINATEUR` conserve tous ses accès.

**21.2 — Secret.** Retirer la ligne, changer le mot de passe concerné, puis vérifier
l'historique : si le dépôt est public, considérez la valeur comme compromise et révoquez-la.

**21.3 — Sessions.** Table `Session`, jeton aléatoire (`uuid` ×2 ou `rand`), expiration
12 h, révocation à la déconnexion, suppression du repli de `get_me`. Test : un jeton
inventé doit produire `AuthFailed`.

**21.4 — bcrypt 12.** Le temps de connexion passe de quelques millisecondes à ~250 ms.
Ajouter un écran de changement de mot de passe avec confirmation et politique minimale
(12 caractères, pas de mot de passe courant).

**21.5 — Audit CSP/RLS.** `curl` sans en-tête d'autorisation sur `/rest/v1/Paiement` doit
renvoyer `401` ou un tableau vide — jamais des données.

---

## Chapitre 22

Les exercices du chapitre 22 sont le projet final lui-même. Utilisez la grille
d'évaluation du §22.3 comme corrigé : chaque case cochée est une preuve de maîtrise.
