# 17. Synchronisation « offline-first »

## 17.1 Le problème réel

Le bureau du complexe scolaire n'a pas toujours d'Internet. Pourtant, le caissier doit
encaisser. Deux jours plus tard, il faut envoyer ces paiements dans le cloud pour que le
coordonnateur les voie depuis son téléphone.

Contraintes :

- **écrire sans réseau** (SQLite local) ;
- **ne rien perdre** ;
- **éviter les doublons** ;
- **gérer les conflits** (même ligne modifiée des deux côtés) ;
- **respecter les dépendances** (un paiement a besoin de son élève, qui a besoin de son
  établissement).

## 17.2 L'architecture réelle

```text
                 ┌───────────────────────────┐
                 │ SQLite locale (source de  │
                 │ vérité opérationnelle)    │
                 └────────────┬──────────────┘
                              │  run_bidirectional_sync()
             ┌────────────────┴─────────────────┐
             │                                  │
        PHASE 1 : PULL                    PHASE 2 : PUSH
   Supabase → local (tout,              local → Supabase
   pages de 1000, upsert)               (par lots de 25,
             │                            on_conflict=PK)
             └────────────────┬─────────────────┘
                              ▼
                 ConfigSysteme.LAST_SYNC = now
```

Le moteur : `src-tauri/src/sync/mod.rs` (1 094 lignes), appelé par
`commands/sync.rs::sync_push` / `sync_pull`.

## 17.3 Le contrat de synchronisation

Chaque table est décrite par trois métadonnées essentielles :

```rust
struct TableConfig {
    name: &'static str,
    pk_cols: Vec<&'static str>,        // clé primaire (simple ou composite)
    unique_cols: Vec<&'static str>,    // contraintes d'unicité métier
    fk_deps: Vec<(&'static str, &'static str)>,  // (colonne FK, table parente)
}
```

Exemples :

```rust
TableConfig { name: "EleveClasse", pk_cols: vec!["eleve_id", "classe_id"], …,
              fk_deps: vec![("eleve_id", "Eleve"), ("classe_id", "Classe")] },

TableConfig { name: "Paiement", pk_cols: vec!["id"], unique_cols: vec!["numero_recu"],
              fk_deps: vec![("eleve_id", "Eleve"), ("echeance_id", "Echeance"),
                            ("etablissement_id", "Etablissement"),
                            ("annee_scolaire_id", "AnneeScolaire"), ("user_id", "User")] },
```

Et l'ordre du tableau **est** l'ordre de synchronisation : parents d'abord. C'est
pourquoi `Etablissement` vient avant `User`, qui vient avant `Paiement`.

> 🧠 L'ordre des dépendances est une information de conception, pas un détail
> d'implémentation. Il est aussi documenté dans `SYNC_GUIDE.md`.

## 17.4 Phase 1 — PULL (cloud → local)

### Les suppressions

On ne peut pas deviner une suppression en lisant les lignes restantes. Le projet utilise
donc l'`AuditLog` distant :

```rust
let url_del = format!("{}/rest/v1/AuditLog?action=eq.DELETE&created_at=gt.{}",
                      supabase_url, encode_param(&last_sync));
```

Toute ligne `DELETE` apparue côté cloud depuis la dernière synchronisation est appliquée
localement (`delete_composite_row`).

### Les données

**Toute la table**, par pages de 1 000 lignes, via l'en-tête `Range` de PostgREST :

```rust
let range_header = format!("{}-{}", offset, offset + page_size - 1);
let url = format!("{}/rest/v1/{}", supabase_url, t.name);
```

Puis :

```rust
for row in &remote_rows {
    if let Some(row_map) = row.as_object() {
        let _ = upsert_row(conn, t.name, &t.pk_cols, row_map);
    }
}
```

> ⚠️ **Choix coûteux** : rapatrier toute la table à chaque synchronisation ne passe pas
> l'échelle (imaginez 100 000 paiements). `LAST_SYNC` existe mais n'est **pas** utilisé
> pour filtrer le pull. Amélioration : `?updated_at=gt.<last_sync>` — à condition que
> toutes les tables aient un `updated_at` fiable. Exercice 17.2.

### Pendant le pull : les clés étrangères sont désactivées

```rust
let _ = conn.execute_batch("PRAGMA foreign_keys=OFF;");
// … tout le travail …
let _ = conn.execute_batch("PRAGMA foreign_keys=ON;");
```

Sinon, insérer un paiement avant son élève échouerait. C'est un compromis : on accepte
temporairement des références orphelines, et des fonctions dédiées les réparent
(`repair_missing_remote_parents`, `filter_orphan_rows`).

> 🧠 **Désactiver une contrainte est toujours une dette.** Notez-la, encadrez-la, et
> prévoyez un contrôle final (`PRAGMA foreign_key_check`).

## 17.5 Phase 2 — PUSH (local → cloud)

```rust
let push_batch_size = 25;
let on_conflict = format!("on_conflict={}", t.pk_cols.join(","));
let url = format!("{}/rest/v1/{}?{}", supabase_url, t.name, on_conflict);
let res = http_post_with_retry(&client, &url, &key, &format!("Bearer {}", key), &Value::Array(batch));
```

- lots de 25 : compromis entre débit et taille de requête ;
- `on_conflict=id` + en-tête `Prefer: resolution=merge-duplicates` = upsert ;
- en cas d'échec, nouvelle tentative sur `unique_cols` (par exemple `matricule`) ;
- retries exponentiels (500 ms, 1 s, 2 s, 4 s) sur 429 et 5xx.

### Réparation des parents manquants

Si un paiement local référence un élève absent du cloud, la synchronisation échoue en
violation de clé étrangère. Le moteur **pousse alors le parent** avant de réessayer
(`push_rows_with_dependencies`) :

```rust
fn dependency_configs(table_name: &str) -> Vec<(&'static str, &'static str)> {
    match table_name {
        "Paiement" => vec![("eleve_id", "Eleve"), ("echeance_id", "Echeance"),
                           ("etablissement_id", "Etablissement"),
                           ("annee_scolaire_id", "AnneeScolaire"), ("user_id", "User")],
        …
    }
}
```

> 🧠 C'est la partie la plus intéressante du moteur : elle ressemble à un **résolveur de
> dépendances** de gestionnaire de paquets.

## 17.6 Les conflits

Le projet applique une politique simple : **le dernier écrivain gagne**, avec priorité au
cloud pendant le pull (upsert), puis priorité au local pendant le push.

Conséquences :

- une modification locale non poussée peut être écrasée par le pull ;
- sur deux postes, une même école modifiée des deux côtés produit un résultat
  dépendant de l'ordre.

Politiques possibles :

| Politique | Avantage | Risque |
|---|---|---|
| dernier écrivain | simple | perte silencieuse |
| horodatage par champ | précis | complexe |
| version + verrou optimiste | détecte les conflits | nécessite `version` en base |
| file d'opérations | rejouable | lourd |

> 🔧 **Recommandation** : ajouter une colonne `version INTEGER` (incrémentée à chaque
> écriture) et refuser un push si la version distante est plus récente. Journaliser le
> conflit et laisser l'utilisateur choisir.

## 17.7 Le déclenchement côté front

```tsx
// src/app/page.tsx
const initialTimer = setTimeout(runAutoSync, 30000)
const interval = setInterval(runAutoSync, 5 * 60 * 1000)
window.addEventListener('local-data-changed', scheduleAfterChange)  // debounce 5 s
window.addEventListener('online', runAutoSync)
```

et `tauri-commands.ts` émet `local-data-changed` après toute écriture locale. Le cycle
complet :

```text
Créer un élève → dispatch 'local-data-changed'
→ 5 s plus tard : syncStatus (configuré ?)
→ syncPush (Pull + Push)
→ dispatch 'sync-completed' → les écrans rechargent
```

> 🧠 **Le debounce évite 12 synchronisations** quand un écran enregistre un élève, un
> tuteur et une inscription en trois appels.

## 17.8 Le stockage des identifiants Supabase

```sql
SELECT valeur FROM ConfigSysteme WHERE cle = 'SUPABASE_URL';
SELECT valeur FROM ConfigSysteme WHERE cle = 'SUPABASE_KEY';
```

Deux remarques :

1. la clé est stockée **en clair** dans la base locale (et synchronisée ? non : elle est
   dans `ConfigSysteme`, absent de la liste de synchronisation) ;
2. il s'agit normalement de la clé `anon` de Supabase, protégée par des politiques RLS.
   **Sans RLS, cette clé donne accès à tout.** Vérifiez vos politiques côté Supabase.

> 🔧 Meilleure pratique : une clé `service_role` ne doit jamais être dans un client.
> Une clé `anon` exige des politiques `ROW LEVEL SECURITY` strictes. Un jour, un
> utilisateur lira la base avec un simple `curl`.

## 17.9 Exercices

> **Exercice 17.1** — Tracez, pour un paiement créé hors ligne, toutes les étapes jusqu'à
> son apparition dans Supabase. Indiquez à chaque étape ce qui se passe si la connexion
> tombe.

> **Exercice 17.2** — Filtrez le pull incrémentalement :
> `?updated_at=gt.<LAST_SYNC>` sur les tables qui possèdent la colonne. Mesurez le temps
> de synchronisation avec 10 000 paiements avant/après.

> **Exercice 17.3** — Ajoutez un écran « Journal de synchronisation » lisant la table
> `SyncLog` (aujourd'hui créée mais inutilisée) : date, table, poussés, tirés, statut,
> durée.

> **Exercice 17.4** — Deux caisses hors ligne génèrent `REC-20261024-0001` le même jour.
> Décrivez le conflit à la synchronisation et proposez une stratégie de numérotation
> (préfixe par caisse + réconciliation, ou séquence centralisée).

> **Exercice 17.5** — Écrivez la politique RLS Supabase minimale : chaque utilisateur
> `authenticated` ne peut lire qu'un établissement donné. Prouvez-le avec deux comptes.

## 17.10 À retenir

- Offline-first : la base locale est la vérité de travail, le cloud est un miroir.
- L'ordre des tables suit les dépendances ; les parents partent en premier.
- `PRAGMA foreign_keys=OFF` pendant la sync est un compromis à contrôler ensuite.
- Le pull complet ne passe pas l'échelle : filtrez par date de mise à jour.
- Les conflits ne disparaissent pas : choisissez une politique et instrumentez-la.
- Une clé `anon` sans RLS est une porte ouverte.
