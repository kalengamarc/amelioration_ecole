# 10. Rust pour développeurs JavaScript

Vous n'avez pas besoin de devenir expert Rust pour ce projet. Vous devez savoir **lire**
et **modifier** les fichiers de `src-tauri/src/`. Ce chapitre part de JavaScript et
signale les différences qui comptent.

## 10.1 Le choc des cultures

```js
// JavaScript
function total(paiements) {
  return paiements.reduce((s, p) => s + p.montant, 0)
}
```

```rust
// Rust
fn total(paiements: &[Paiement]) -> f64 {
    paiements.iter().map(|p| p.montant).sum()
}
```

Trois nouveautés :

1. **types explicites** dans la signature (`&[Paiement]`, `-> f64`) ;
2. **référence** `&` : on emprunte les données au lieu de les copier ;
3. **itérateur** au lieu de `map/reduce` de tableau : `.iter().map(…).sum()`.

## 10.2 Variables, mutabilité, types

```rust
let nom = "Aline";        // immuable par défaut
let mut total = 0.0;      // explicite : cette variable changera
total += 5000.0;

let devise: String = "BIF".to_string();
let optionnel: Option<String> = None;
```

- `String` = chaîne possédée, modifiable, allouée ;
- `&str` = vue empruntée sur du texte ;
- en pratique dans le projet : les champs venant de SQLite sont `String`,
  les paramètres de commande aussi (Tauri désérialise en `String`).

> 🧠 **Immuable par défaut** signifie que le compilateur vous protège : une valeur qui
> change sans que ce soit prévu est une erreur. En JavaScript, c'est un bug silencieux.

## 10.3 `Option` et `Result` : les deux types qui changent tout

### `Option<T>` remplace `null`

```rust
pub struct User {
    pub id: String,
    pub etablissement_id: Option<String>,   // peut être absent
    pub dernier_login: Option<String>,
}
```

Utilisation :

```rust
if let Some(ref id) = user.etablissement_id {
    println!("École : {}", id);
}

let longueur = nom_ecole.map(|n| n.len()).unwrap_or(0);
```

Équivalent JS : `user.etablissementId ?? null`. La différence : **le compilateur vous
force** à traiter le cas `None`.

### `Result<T, E>` remplace les exceptions

```rust
#[tauri::command]
pub fn get_eleve(db: State<'_, DbConn>, id: String) -> Result<serde_json::Value, AppError> {
    let conn = db.lock()?;              // le ? remonte l'erreur
    let eleve = conn.query_row("SELECT … WHERE id = ?", params![id], |r| { … })?;
    Ok(api_response(Ok(eleve)))
}
```

`?` = « si erreur, retourne-la immédiatement ; sinon, récupère la valeur ». C'est un
`try/catch` mais **visible dans la signature**. Le front reçoit alors le message d'erreur.

### Le type d'erreur du projet

```rust
// src-tauri/src/error.rs
#[derive(Error, Debug)]
pub enum AppError {
    #[error("{0}")] Database(String),
    #[error("{0}")] NotFound(String),
    #[error("{0}")] AuthFailed(String),
    #[error("{0}")] Validation(String),
    #[error("{0}")] Sync(String),
    #[error("{0}")] Internal(String),
    #[error("{0}")] BadRequest(String),
}
```

et les conversions automatiques :

```rust
impl From<rusqlite::Error> for AppError {
    fn from(e: rusqlite::Error) -> Self { AppError::Database(e.to_string()) }
}
impl From<reqwest::Error> for AppError {
    fn from(e: reqwest::Error) -> Self { AppError::Sync(e.to_string()) }
}
```

Grâce à ces `From`, un `?` sur une requête SQL produit directement une `AppError::Database`.

> 🧠 Les variantes ne sont pas décoratives : elles disent **de quel type d'échec il
> s'agit**, ce qui permet à l'interface de réagir différemment (mode hors ligne vs erreur
> de validation).

## 10.4 Structures et `serde`

```rust
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct FraisResponse {
    pub id: String,
    pub libelle: String,
    #[serde(rename = "type")]
    pub type_: String,           // "type" est un mot réservé → type_
    pub montant: f64,
    pub devise: String,
    pub etablissement_id: String,
    pub annee_scolaire_id: Option<String>,
    pub classes_ids: Vec<String>,
}
```

- `derive(...)` génère automatiquement le code (sérialisation, copie, débogage) ;
- `rename_all = "camelCase"` transforme `etablissement_id` → `etablissementId` en JSON ;
- `rename = "type"` traite un mot réservé.

> ⚠️ **Incohérence réelle du projet** : certains modèles utilisent
> `rename_all = "camelCase"`, d'autres pas (`Etablissement` garde `logo_url`). D'où le
> double envoi dans `tauri-commands.ts` (`logoUrl` **et** `logo_url`). Choisir une
> convention unique et s'y tenir est un chantier structurant (exercice 22.2).

## 10.5 Le `State` et le verrou

```rust
pub type DbConn = Mutex<Connection>;

#[tauri::command]
pub fn list_etablissements(db: State<'_, DbConn>, id: Option<String>) -> Result<…> {
    let conn = db.lock()?;     // accès exclusif à la connexion
    …
}   // le verrou est libéré ici
```

- `Mutex` : un seul accès à la fois, indispensable car SQLite n'aime pas les écritures
  concurrentes depuis la même connexion ;
- `State<'_, DbConn>` : Tauri injecte la connexion gérée par `app.manage(db::init_db()?)` ;
- **ne gardez pas le verrou trop longtemps** : aucune requête réseau sous verrou.

> ⚠️ **Piège mortel** : appeler `log_audit(&db, …)` alors que `conn` est encore verrouillé
> provoque un **interblocage** (deadlock) — la fonction essaie de re-verrouiller le même
> mutex. Le projet évite cela avec `drop(conn);` avant l'audit (voir
> `annuler_paiement`). Les endroits où `conn` reste en portée sont des candidats au gel
> de l'application : exercice 15.2.

## 10.6 Les modules

```rust
// src-tauri/src/lib.rs
mod db;
mod error;
mod commands;
mod utils;
mod services;
mod sync;
```

- `mod` déclare un module (fichier ou dossier) ;
- `pub` rend visible depuis l'extérieur ;
- `use crate::db::DbConn;` importe un élément du crate courant.

Le projet ré-exporte tout depuis `commands/mod.rs` (`pub use auth::*;`), ce qui permet
d'écrire `commands::login` dans `lib.rs`.

## 10.7 Lire une fonction réelle : `generate_receipt_number`

```rust
// src-tauri/src/utils/id.rs
pub fn generate_receipt_number(conn: &Connection) -> String {
    let date = chrono::Local::now().format("%Y%m%d").to_string();
    let count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM Paiement WHERE date(created_at) = date('now')",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);
    format!("REC-{}-{:04}", date, count + 1)
}
```

Décryptage :

| Élément | Sens |
|---|---|
| `chrono::Local::now().format("%Y%m%d")` | date locale `20261024` |
| `query_row(..., [], |row| row.get(0))` | exécute et lit la 1re colonne |
| `.unwrap_or(0)` | en cas d'erreur, compte 0 plutôt que de planter |
| `format!("REC-{}-{:04}", date, count + 1)` | `REC-20261024-0001` |

> ⚠️ **Faille de conception** : deux paiements simultanés peuvent calculer le même
> compteur, et l'`UNIQUE` sur `numero_recu` fera échouer le second. La correction :
> table de séquence ou `MAX(substr(...))` sous transaction (exercice 13.4).

## 10.8 Les itérateurs en dix lignes

```rust
let montants = vec![1000.0, 2500.0, 500.0];

let total: f64 = montants.iter().sum();
let gros: Vec<&f64> = montants.iter().filter(|m| **m > 1000.0).collect();
let doubles: Vec<f64> = montants.iter().map(|m| m * 2.0).collect();

let mut par_devise: std::collections::BTreeMap<String, f64> = Default::default();
par_devise.entry("BIF".to_string()).or_insert(0.0); // puis += …
```

C'est le style utilisé dans `dashboard.rs` pour agréger par devise.

## 10.9 Le compilateur comme professeur

Messages fréquents et leur traduction :

| Message | Traduction | Correction |
|---|---|---|
| `cannot borrow X as mutable` | deux accès incompatibles | restreindre la portée (`{ }`), cloner |
| `value moved here` | valeur déplacée | passer `&` ou `.clone()` |
| `no method named … found` | type inattendu (souvent `Option`) | `if let Some(…)` |
| `expected &str, found String` | référence vs possession | `&chaine` |
| `unused Result` | erreur ignorée | `?` ou `let _ =` |
| `cannot find command` (front) | commande non enregistrée | `generate_handler!` |

> 🧠 Ne combattez pas le compilateur : lisez-le. 80 % des messages indiquent précisément
> la ligne et la solution.

## 10.10 Exercices

> **Exercice 10.1** — Dans `src-tauri/src/utils/currency.rs`, ajoutez la devise `EUR`
> (`1 234,56 €`). Écrivez la branche, compilez (`cargo check` dans `src-tauri/`).

> **Exercice 10.2** — Ajoutez une fonction `pub fn total_par_devise(paiements: &[(f64, String)]) -> std::collections::BTreeMap<String, f64>`
> et un test unitaire `#[cfg(test)]`. Lancez `cargo test`.

> **Exercice 10.3** — Trouvez dans `commands/` une fonction qui garde `conn` verrouillé
> en appelant `log_audit(&db, …)`. Corrigez avec `drop(conn);`. Vérifiez que
> l'application ne se fige plus lors de l'action concernée.

> **Exercice 10.4** — Expliquez, en commentaire dans le code, pourquoi
> `generate_receipt_number` utilise `chrono::Local` et `date('now')` (SQLite UTC) dans la
> même requête. Quel risque si le serveur est à minuit ? Proposez une correction.

## 10.11 À retenir

- Types explicites, immuabilité, `Option` et `Result` : la sécurité vient du compilateur.
- `?` propage l'erreur ; `AppError` la catégorise.
- `serde` fait le pont JSON ; `camelCase` doit être décidé et respecté partout.
- `Mutex<Connection>` : verrou court, jamais pendant un appel réseau.
- Les itérateurs remplacent `map/filter/reduce` avec moins d'allocations.
