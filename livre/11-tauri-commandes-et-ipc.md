# 11. Tauri : commandes, IPC, permissions

## 11.1 Qu'est-ce que Tauri ?

Tauri assemble trois choses :

1. une **WebView** (le navigateur du système) qui affiche le front-end ;
2. un **cœur Rust** compilé, qui possède les fichiers, la base, le réseau ;
3. un **pont IPC** (appels de procédure inter-processus) entre les deux.

Comparé à Electron, Tauri n'embarque pas Chromium : l'application pèse quelques mégaoctets
et non 150. Le prix : les WebView diffèrent selon l'OS (WebView2 sur Windows,
WebKitGTK sur Linux), donc testez sur chaque cible.

## 11.2 Anatomie d'une commande

```rust
#[tauri::command]
pub fn get_eleve(
    db: State<'_, DbConn>,
    id: String,
) -> Result<serde_json::Value, AppError> { … }
```

Règles :

- `#[tauri::command]` génère le code d'exposition IPC ;
- les paramètres doivent être **désérialisables** (types simples ou `struct` `Deserialize`) ;
- le nom des paramètres est celui attendu côté JS en `camelCase` par défaut
  (`eleve_id` côté Rust ⇒ `eleveId` côté JS) ;
- le type de retour doit être `Serialize` (ou `Result<_, E>` avec `E: Serialize`).

Côté JavaScript :

```ts
import { invoke } from '@tauri-apps/api/core'
await invoke('get_eleve', { id: 'abc-123' })
```

## 11.3 Le pont du projet : `tauri-commands.ts`

Le fichier compte 707 lignes et 57 fonctions. Il joue trois rôles.

### Rôle 1 — Déballer la réponse

```ts
function unwrap<T>(res: any): T {
  if (res && res.success === false) throw new Error(res.error || 'Erreur inconnue')
  return res as T
}
```

Le back-end renvoie toujours `{success, data|error}` ; sans `unwrap`, chaque écran devrait
tester `success`. Une fois, au bon endroit.

### Rôle 2 — Traduire les noms

```ts
export async function createFrais(data: Record<string, any>) {
  return cmd('create_frais', { …data })
}
```

Les fonctions explicites documentent les paramètres réellement attendus. Certaines
envoient **deux orthographes** :

```ts
export async function listAnneesScolaires(etablissementId?: string) {
  const etabId = etablissementId || null
  return cmd('list_annees_scolaires', {
    etablissementId: etabId,
    etablissement_id: etabId,   // compatibilité ascendante
  })
}
```

C'est un pansement : Tauri convertit automatiquement `camelCase` → `snake_case`, donc un
seul nom suffit normalement. On garde les deux par prudence historique.

### Rôle 3 — Signaler les écritures

```ts
const isLocalWrite = /^(create|update|delete|save|activer|annuler|clean)_/.test(command)
  && !command.startsWith('sync_') && command !== 'save_sync_config'

if (isLocalWrite && typeof window !== 'undefined') {
  window.dispatchEvent(new Event('local-data-changed'))
}
```

**Une convention de nommage devient un comportement applicatif.** Conséquence : nommer
une commande `set_something` casserait la synchronisation automatique. Documentez ce
genre de règle implicite.

## 11.4 Le catalogue `lib.rs`

```rust
.invoke_handler(tauri::generate_handler![
    commands::auth::login,
    commands::auth::get_me,
    commands::etablissements::list_etablissements,
    // … 57 entrées
])
```

Ajouter une commande demande **trois** gestes :

```rust
// 1. src-tauri/src/commands/classes.rs
#[tauri::command]
pub fn list_eleves_sans_classe(db: State<'_, DbConn>) -> Result<…> { … }

// 2. src-tauri/src/commands/mod.rs  (rien à faire si pub use classes::* existe déjà)

// 3. src-tauri/src/lib.rs
commands::classes::list_eleves_sans_classe,
```

Oubli du point 3 ⇒ erreur côté front : `Command list_eleves_sans_classe not found`.

> 🔧 **Exercice 11.2** — Vérifiez systématiquement l'inventaire :
> ```bash
> # commandes appelées depuis le front
> grep -oE "cmd\('[a-z_]+'" src/lib/tauri-commands.ts | sort -u
> # commandes enregistrées dans lib.rs
> grep -oE "commands::[a-z_]+::[a-z_]+" src-tauri/src/lib.rs | sort -u
> ```
> Comparez. Vous trouverez des appels à `create_echeance`, `update_echeance`,
> `delete_echeance`, `get_depenses_stats`, `create_echeances_bulk` qui **n'existent pas**
> dans `generate_handler!`. Les écrans qui les utilisent échoueront. C'est le premier
> bug à corriger du projet (exercice 13.1).

## 11.5 Les permissions de la fenêtre

```json
// src-tauri/capabilities/default.json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "windows": ["main"],
  "permissions": ["core:default", "shell:allow-open"]
}
```

Tauri 2 utilise un système de capacités : par défaut, la WebView **n'a accès à rien**
hors `core:default`. Chaque plugin doit être autorisé (`shell:allow-open` autorise
l'ouverture d'URL/fichiers via le plugin shell).

> ⚠️ **Deux anomalies à connaître**
> 1. Le JSON contient **deux blocs `identifier`/`permissions`** dans le même objet : les
>    clés dupliquées sont écrasées silencieusement par le parseur. Résultat fragile.
> 2. La CSP est désactivée (`"csp": null`) dans `tauri.conf.json`. Acceptable en
>    développement, à durcir en production.
>
> Correction : un seul bloc, et une CSP minimale :
> ```json
> "security": {
>   "csp": "default-src 'self'; img-src 'self' asset: data: blob:; style-src 'self' 'unsafe-inline'; connect-src 'self' https://*.supabase.co"
> }
> ```

## 11.6 `invoke` est-il sûr ?

Les commandes sont accessibles à **tout code JavaScript** exécuté dans la WebView. Si une
faille XSS existe (par exemple un nom d'élève injecté dans le DOM), un attaquant pourrait
appeler `delete_etablissement`. Conséquences :

- toute validation critique doit être **côté Rust** ;
- ne jamais construire de SQL par concaténation de chaînes (voir chapitre 12) ;
- assainir les contenus affichés (`React` échappe par défaut : n'utilisez pas
  `dangerouslySetInnerHTML`) ;
- vérifier l'identité de l'appelant sur les commandes sensibles (chapitre 21).

## 11.7 Un aller-retour complet, à la main

Le meilleur exercice d'apprentissage du projet : créer une commande `ping` et l'appeler.

```rust
// src-tauri/src/commands/mod.rs ou un module dédié
#[tauri::command]
pub fn ping(message: String) -> Result<serde_json::Value, AppError> {
    Ok(crate::error::api_response(Ok(serde_json::json!({
        "echo": message,
        "server_time": crate::db::now_iso(),
    }))))
}
```

```rust
// lib.rs
commands::ping,
```

```ts
// src/lib/tauri-commands.ts
export async function ping(message: string) {
  return cmd<{ success: boolean; data: { echo: string; serverTime: string } }>('ping', { message })
}
```

```tsx
const res = await tc.ping('bonjour')
console.log(res.data.echo, res.data.serverTime)
```

> 🧠 Notez la conversion : Rust renvoie la clé `server_time`, mais Tauri ne convertit
> **que les arguments entrants**, pas les clés des objets sérialisés. Le front doit donc
> lire `server_time`… ce qui explique pourquoi la plupart des structures du projet
> utilisent `#[serde(rename_all = "camelCase")]`. Retenez : **décidez la convention une
> fois, appliquez-la partout**.

## 11.8 Journalisation et diagnostic

```rust
eprintln!("DEBUG: Nombre de tuteurs: {}", data.tuteurs.len());
```

Rust `eprintln!` écrit sur la sortie d'erreur, visible dans le terminal qui a lancé
`bun run tauri dev`. Il reste des traces de `DEBUG` dans `create_eleve` : à supprimer
avant livraison, ou à remplacer par un vrai `log`.

Côté front, `console.log` s'affiche dans la console de la WebView : clic droit →
Inspecter (ou `Ctrl+Shift+I`, disponible car la feature `devtools` est activée dans
`Cargo.toml`).

## 11.9 Exercices

> **Exercice 11.1** — Réalisez la commande `ping` ci-dessus de bout en bout et affichez
> son résultat dans l'écran Paramètres.

> **Exercice 11.2** — Établissez la liste exacte des commandes manquantes (front vs
> `lib.rs`) et corrigez-en **une** :
> - soit en enregistrant la commande existante (si elle existe dans le module) ;
> - soit en l'implémentant ;
> - soit en supprimant l'appel côté front.
> Justifiez votre choix en trois lignes.

> **Exercice 11.3** — Nettoyez `capabilities/default.json` (un seul bloc) et ajoutez une
> CSP minimale. Vérifiez que l'application démarre encore et que l'ouverture d'URL
> fonctionne.

> **Exercice 11.4** — Ajoutez une commande `count_rows(table: String)` **sécurisée** :
> n'acceptez que les noms présents dans une liste blanche, sinon `AppError::Validation`.
> Pourquoi une liste blanche est-elle indispensable ici ?

## 11.10 À retenir

- Une commande Tauri = une fonction Rust publique annotée, enregistrée dans `lib.rs`.
- Le pont `tauri-commands.ts` déballe, traduit et signale les écritures.
- Le nom d'une commande influence le comportement (synchronisation automatique).
- Les capacités contrôlent ce que la WebView peut faire ; la CSP protège le chargement.
- La sécurité réelle est côté Rust : ne faites jamais confiance au front.
