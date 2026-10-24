# 4. Architecture et trajet d'une requête

## 4.1 Vue d'ensemble

SGFS-ME est une application **multi-couches** classique, adaptée au bureau :

```text
┌─────────────────────────────────────────────────────────────────────┐
│  COUCHE 1 — Présentation (WebView)                                  │
│  Next.js 14 app router · React 18 · TypeScript · Tailwind · shadcn  │
│  src/app/page.tsx  →  écrans src/components/sgfs/**                 │
│  état global : src/lib/store.ts (Zustand, persist)                  │
└───────────────────────────┬─────────────────────────────────────────┘
                            │  invoke('create_paiement', {…})
                            │  (JSON sérialisé par Tauri)
┌───────────────────────────▼─────────────────────────────────────────┐
│  COUCHE 2 — Application (Rust / Tauri)                              │
│  src-tauri/src/lib.rs      catalogue des 57 commandes               │
│  src-tauri/src/commands/*  15 modules métier : validation + SQL     │
│  src-tauri/src/error.rs    AppError + enveloppe {success,data}      │
│  src-tauri/src/utils/*     ids, dates, monnaie, journal d'audit     │
└───────────────────────────┬─────────────────────────────────────────┘
                            │  rusqlite (accès direct, pas de réseau)
┌───────────────────────────▼─────────────────────────────────────────┐
│  COUCHE 3 — Persistance locale                                      │
│  SQLite en mode WAL · 18 tables · clés étrangères activées          │
└───────────────────────────┬─────────────────────────────────────────┘
                            │  HTTP + PostgREST (hors ligne possible)
┌───────────────────────────▼─────────────────────────────────────────┐
│  COUCHE 4 — Cloud (optionnel)                                       │
│  Supabase / PostgreSQL · sync bidirectionnelle Pull → Push          │
└─────────────────────────────────────────────────────────────────────┘
```

> 🧠 **Pourquoi cette architecture ?**
> Une école burundaise n'a pas toujours Internet. L'application doit encaisser un paiement
> même hors ligne, immédiatement, et synchroniser plus tard. La base **locale** est donc
> la source de vérité opérationnelle ; le cloud est un miroir de sauvegarde et de
> partage. On appelle cela *offline-first*.

## 4.2 Le trajet complet d'un encaissement

Suivons un clic réel : le caissier valide un paiement de 50 000 BIF.

### Étape 1 — L'interface capture l'intention

Dans `src/components/sgfs/encaissements/EncaissementsPage.tsx`, un formulaire collecte
l'élève, l'échéance, le montant, le mode de paiement. À la validation :

```ts
const res = await tc.createPaiement({
  eleveId, echeanceId, etablissementId, anneeScolaireId,
  userId: user.id, motif, montant, devise, modePaiement,
})
```

### Étape 2 — La passerelle traduit en appel IPC

`src/lib/tauri-commands.ts` est **la** couche de traduction. Elle :

- renomme les paramètres en `snake_case` attendu par Rust (`eleve_id`, …) ;
- appelle `invoke()` ;
- déballe la réponse et lève une erreur si `success === false` ;
- signale aux autres composants qu'une écriture a eu lieu.

```ts
function unwrap<T>(res: any): T {
  if (res && res.success === false) throw new Error(res.error || 'Erreur inconnue')
  return res as T
}

async function cmd<T = any>(command: string, params: Record<string, any> = {}): Promise<T> {
  const result = unwrap<T>(await invoke(command, params))
  const isLocalWrite = /^(create|update|delete|save|activer|annuler|clean)_/.test(command)
    && !command.startsWith('sync_') && command !== 'save_sync_config'
  if (isLocalWrite && typeof window !== 'undefined') {
    window.dispatchEvent(new Event('local-data-changed'))
  }
  return result
}
```

Ce détail est élégant : **une seule règle** suffit à déclencher la synchronisation
automatique après toute écriture locale (chapitre 17).

### Étape 3 — Rust reçoit et valide

```rust
#[tauri::command]
pub fn create_paiement(
    db: State<'_, DbConn>,
    eleve_id: String,
    echeance_id: Option<String>,
    etablissement_id: String,
    /* … */
) -> Result<serde_json::Value, AppError> {
    let conn = db.lock()?;
    // 1. l'élève existe-t-il localement ?
    // 2. l'établissement existe-t-il ? sinon repli sur le premier
    // 3. l'année est-elle valide ? sinon année active
    // 4. numéro de reçu généré
    // 5. INSERT Paiement
    // 6. UPDATE Echeance.montant_paye
    // 7. log_audit(...)
}
```

L'ordre compte. On valide **avant** d'écrire, et on écrit les deux tables dans la même
unité logique (voir exercice 13.3 : transformer cela en vraie transaction).

### Étape 4 — SQLite enregistre

```sql
INSERT INTO Paiement (id, numero_recu, eleve_id, echeance_id, etablissement_id,
                      annee_scolaire_id, user_id, motif, montant, devise,
                      montant_affecte, devise_echeance, mode_paiement,
                      reference_paiement, taux_change, montant_original,
                      annule, created_at, updated_at)
VALUES (?1, ?2, …);
```

### Étape 5 — La réponse remonte

`api_response` enveloppe systématiquement le résultat :

```rust
pub fn api_response<T: serde::Serialize>(result: Result<T, AppError>) -> Value {
    match result {
        Ok(data) => serde_json::json!({ "success": true, "data": data }),
        Err(e)   => serde_json::json!({ "success": false, "error": e.to_string() }),
    }
}
```

Pourquoi ne pas simplement renvoyer `Result<T, AppError>` ? Parce que le front-end
historique attendait cette forme (`{success, data}`) du temps où les routes API Next.js
existaient. **Le passé d'un projet laisse des traces dans son architecture** — et c'est
normal, à condition de le savoir.

### Étape 6 — L'écran se met à jour

Le composant affiche un toast (`sonner`), recharge la liste, et éventuellement ouvre
`ReceiptPOS.tsx` pour imprimer le reçu.

```text
Formulaire → tc.createPaiement → invoke → Rust → SQLite
   ↑                                                 │
   └──── toast + rechargement ← {success:true,data} ←┘
```

> 🧠 Si vous savez raconter ce trajet pour n'importe quelle fonctionnalité, vous êtes
> autonome sur le projet. Entraînez-vous avec `list_eleves`, `annuler_paiement`,
> `get_dashboard_stats`.

## 4.3 Les deux ponts : `apiFetch` et `tauri-commands`

Le dépôt contient **deux** façons d'appeler le back-end. Il faut savoir laquelle est
utilisée où.

| | `tauri-commands.ts` | `apiFetch` (dans `store.ts`) |
|---|---|---|
| Nature | fonctions explicites, typées | routeur qui imite une API REST |
| Entrée | paramètres nommés | URL + options `fetch` |
| Usage | écrans récents (`ElevesPage`, `EncaissementsPage`) | anciens écrans écrits pour Next.js |
| Avantage | lisible, sûr | compatibilité, migration progressive |
| Risque | duplication | routage implicite, erreurs silencieuses |

`apiFetch` analyse l'URL (`/api/eleves?page=2`) et appelle la bonne fonction Tauri :

```ts
const segments = parsePath(path)      // ['eleves', 'abc123']
const resource = segments[0]          // 'eleves'
const resourceId = segments[1]        // 'abc123'
const qp = parseQuery(path)           // { page: '2' }

if (resource === 'eleves') {
  if (method === 'GET' && !resourceId) {
    return tc.listEleves({
      etablissementId: qp.etablissementId || qp.etabid || undefined,
      // …
    })
  }
}
```

> ⚠️ **Dette technique assumée.** Ce routeur est un « adaptateur de transition ». À terme,
> tous les écrans devraient appeler `tc.*` directement. C'est un excellent chantier de
> refactoring (exercice 22.3), à condition de le faire écran par écran, avec des tests
> manuels après chaque migration.

## 4.4 Découpage du back-end Rust

```text
lib.rs
 ├── commands/mod.rs        déclare et ré-exporte 15 modules
 │    ├── auth.rs           login, get_me
 │    ├── etablissements.rs CRUD + contexte (établissement + paramètres)
 │    ├── annees_scolaires.rs CRUD + activation
 │    ├── classes.rs        CRUD + élèves sans classe + nettoyage doublons
 │    ├── eleves.rs         CRUD + statistiques + import par matricules
 │    ├── frais.rs          CRUD des frais et de leurs classes
 │    ├── echeances.rs      agrégation par élève (le module le plus complexe)
 │    ├── encaissements.rs  paiements + annulations
 │    ├── depenses.rs       CRUD dépenses
 │    ├── parametres.rs     paramètres d'établissement
 │    ├── utilisateurs.rs   comptes et rôles
 │    ├── dashboard.rs      KPI et séries
 │    ├── rapports.rs       financier, élèves, journalier
 │    ├── audit.rs          lecture du journal
 │    └── sync.rs          statut, validation, push, pull
 ├── db/mod.rs             schéma, initialisation, seed
 ├── db/models.rs          structures partagées
 ├── error.rs              AppError + enveloppes de réponse
 ├── sync/mod.rs           moteur de synchronisation (1 094 lignes)
 └── utils/                id, date, currency, audit_logger
```

Trois conventions à respecter si vous ajoutez un module :

1. une commande = une fonction publique `#[tauri::command]` ;
2. l'erreur est toujours `AppError`, jamais `String` (sauf conversion explicite) ;
3. l'ajout d'une commande exige **trois** modifications : le module, `commands/mod.rs`,
   et `lib.rs` (`generate_handler![…]`) — sinon le front obtient
   « command not found ».

> 🔧 **Exercice pratique immédiat** : cherchez dans `lib.rs` la commande
> `list_echeances`. Elle est enregistrée, mais savez-vous où sont `create_echeance` et
> `delete_echeance` ? Ils n'y sont **pas**, alors que `apiFetch` les appelle !
> C'est un bug latent documenté à l'exercice 11.2.

## 4.5 Le rôle de `apiFetch` côté web et l'impasse actuelle

En navigateur, `apiFetch` retombe sur `fetch('/api/...')`. Or `src/app/api/` n'existe
plus (supprimé lors de la migration Tauri). Résultat : les écrans qui utilisent encore
`apiFetch` ne fonctionnent qu'en mode bureau.

Deux options pour la suite :

- **Option A — assumer le desktop** : supprimer le chemin `fetch`, exiger Tauri partout,
  et afficher un message clair si on ouvre l'app dans un navigateur.
- **Option B — réintroduire un serveur** : recréer les routes API pour un mode web
  multi-poste (mais alors la base doit être centralisée, ce qui change tout le modèle).

> **Exercice 4.1** — Rédigez en dix lignes un argumentaire pour un directeur d'école
> expliquant pourquoi l'application fonctionne sans Internet, et ce qui se passe quand la
> connexion revient. Utilisez les mots : SQLite, file d'attente, synchronisation.

## 4.6 À retenir

- Quatre couches : UI → commandes Rust → SQLite → cloud.
- Un clic suit toujours le même trajet ; sachez le dessiner avant de coder.
- `{success, data}` est un contrat hérité : le respecter évite de casser les écrans.
- Deux ponts coexistent ; `tauri-commands.ts` est la voie recommandée.
- Ajouter une commande = module + `mod.rs` + `generate_handler!`.
