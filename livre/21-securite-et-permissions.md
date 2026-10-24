# 21. Sécurité et permissions

Ce chapitre est une **audition de sécurité** du projet, avec les correctifs. Il est
volontairement direct : les faiblesses décrites ici existent dans le code livré.

## 21.1 Le modèle d'authentification actuel

```rust
// auth.rs — login
let valid = bcrypt::verify(&req.password, &user.password_hash)?;
// …
Ok(api_response(Ok(LoginResponse {
    token: user.id.clone(),        // ⚠️ le « jeton » EST l'identifiant utilisateur
    user: info,
})))
```

```rust
// auth.rs — get_me
let user_res = conn.query_row("SELECT … FROM User WHERE id = ?1 AND actif = 1", params![token], …);
let user = match user_res {
    Ok(u) => u,
    Err(_) => conn.query_row(
        "SELECT … FROM User WHERE (username = ?1 OR role = 'COORDINATEUR' OR role = 'ADMIN')
         AND actif = 1 ORDER BY created_at ASC LIMIT 1", params![token], …)?,
};
```

### Faiblesse critique

N'importe quelle chaîne présentée comme `token` :
1. correspond à un `id` existant → session de cet utilisateur ;
2. sinon, si elle vaut `admin` ou si un coordonnateur existe → **session administrateur**.

Autrement dit, un jeton arbitraire donne les pleins pouvoirs. Le `localStorage` du WebView
suffit à déclencher cela.

**Pourquoi ce code existe ?** Il a été écrit pour « ne jamais bloquer l'utilisateur »
après une migration de données. C'est une béquille de développement restée en production.

### Correctif minimal, sans changer l'architecture

```sql
CREATE TABLE IF NOT EXISTS Session (
    token        TEXT PRIMARY KEY,
    user_id      TEXT NOT NULL,
    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at   TEXT NOT NULL,
    revoked      INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (user_id) REFERENCES User(id) ON DELETE CASCADE
);
```

```rust
#[tauri::command]
pub fn login(db: State<'_, DbConn>, req: LoginRequest) -> Result<Value, AppError> {
    let conn = db.lock()?;
    let (id, hash, actif) = conn.query_row(
        "SELECT id, password_hash, actif FROM User WHERE username = ?1",
        params![req.username], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, i64>(2)?)),
    ).map_err(|_| AppError::AuthFailed("Identifiants incorrects".into()))?;

    if actif == 0 { return Err(AppError::AuthFailed("Compte désactivé".into())) }
    if !bcrypt::verify(&req.password, &hash).map_err(|_| AppError::AuthFailed("Identifiants incorrects".into()))? {
        return Err(AppError::AuthFailed("Identifiants incorrects".into()));
    }

    let token = generate_session_token();          // 32 octets aléatoires, hex
    let expires = (chrono::Utc::now() + chrono::Duration::hours(12)).to_rfc3339();
    conn.execute("INSERT INTO Session (token, user_id, expires_at) VALUES (?1,?2,?3)",
                 params![token, id, expires])?;
    // … renvoyer token + infos
    Ok(api_response(Ok(LoginResponse { token, user: info })))
}
```

Et `get_me` doit vérifier :

```sql
SELECT u.* FROM Session s JOIN User u ON u.id = s.user_id
WHERE s.token = ?1 AND s.revoked = 0 AND s.expires_at > datetime('now') AND u.actif = 1;
```

**Supprimez le repli** (`ORDER BY created_at ASC LIMIT 1`). Un échec doit être un échec.

## 21.2 Les mots de passe

```rust
// db/mod.rs — seed_default_admin
let hash = bcrypt::hash("admin123", 4)?;    // ⚠️ coût 4 = très rapide à casser
```

- coût **4** : environ 2^4 = 16 itérations. Un coût de **12** est aujourd'hui un minimum
  raisonnable (≈ 250 ms sur un poste courant).
- mot de passe par défaut **connu de tous** : `admin123`.

Correctif :

```rust
let hash = bcrypt::hash("admin123", 12)?;
// et en base
conn.execute("UPDATE User SET doit_changer_mdp = 1 WHERE username = 'admin'", [])?;
```

Au login, si `doit_changer_mdp = 1`, forcer un écran de changement avant tout accès.

> 🧠 **Ne testez jamais la sécurité avec des mots de passe réels de production.**
> Créez un compte de test dédié.

## 21.3 L'autorisation : le trou le plus large

Une commande Rust ne sait pas **qui** l'appelle :

```rust
#[tauri::command]
pub fn delete_utilisateur(db: State<'_, DbConn>, id: String) -> Result<Value, AppError> {
    // aucun contrôle de rôle
}
```

Toute personne devant l'ordinateur, ou tout script injecté dans la WebView, peut l'appeler.

### Trois niveaux de défense

1. **front** : masquer les menus (déjà fait dans `Sidebar.tsx`) — confort, pas sécurité ;
2. **commande** : vérifier le rôle avant l'action ;
3. **base** : contraintes et triggers pour les règles invariantes.

Implémentation pragmatique d'un contexte de session côté Rust :

```rust
pub struct SessionCourante(pub std::sync::Mutex<Option<String>>); // user_id

pub fn exiger_coordinateur(db: &Connection, user_id: &str) -> Result<(), AppError> {
    let role: String = db.query_row(
        "SELECT role FROM User WHERE id = ?1 AND actif = 1", [user_id], |r| r.get(0),
    ).map_err(|_| AppError::AuthFailed("Session expirée".into()))?;
    if !matches!(role.to_uppercase().as_str(), "COORDINATEUR" | "ADMIN" | "SUPERADMIN") {
        return Err(AppError::AuthFailed(
            "Action réservée au coordonnateur.".into()));
    }
    Ok(())
}
```

Chaque commande sensible prend `user_id` (ou lit le jeton dans l'état géré) et appelle
`exiger_coordinateur`.

> 🧠 **Défense en profondeur** : trois barrières valent mieux qu'une. Mais la seule qui
> compte vraiment est celle du back-end.

## 21.4 `isCoordinateur` : le défaut permissif

```ts
export function isCoordinateur(role: string | null | undefined): boolean {
  if (!role) return true      // ⚠️ aucun rôle ⇒ tous les droits
  // …
}
```

« Fail-open ». Correction :

```ts
export function isCoordinateur(role?: string | null): boolean {
  if (!role) return false
  const r = role.trim().toUpperCase()
  return ['COORDINATEUR', 'ADMIN', 'SUPERADMIN', 'ADMINISTRATEUR', 'COORD'].includes(r)
}
```

Vérifiez ensuite chaque écran : un utilisateur sans rôle ne doit plus rien voir.

## 21.5 Secrets dans le dépôt

Le fichier `worklog.md` contient un mot de passe en clair. `SYNC_GUIDE.md` explique où
saisir la clé Supabase (ce qui est correct : pas de clé en dur dans le code).

Checklist :

- [ ] `git log -S "motdepasse"` : rechercher les secrets dans l'historique ;
- [ ] `.gitignore` couvre `.env*` (c'est le cas) ;
- [ ] aucune clé Supabase dans le code source (`grep -ri "eyJ" .`) ;
- [ ] le mot de passe du `worklog.md` est **changé** là où il est réellement utilisé ;
- [ ] `git filter-repo` ou BFG si un secret a été poussé publiquement.

> ⚠️ Supprimer un secret dans un commit **ne le retire pas de l'historique**. Si le dépôt
> est public, considérez-le comme compromis et révoquez-le.

## 21.6 La clé Supabase et RLS

La clé est stockée dans `ConfigSysteme` (en clair, dans la base locale). C'est acceptable
pour une clé publique `anon` **à condition** que PostgreSQL applique des politiques :

```sql
ALTER TABLE "Paiement" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lecture_par_etablissement" ON "Paiement"
  FOR SELECT TO authenticated
  USING (etablissement_id = current_setting('request.jwt.claims', true)::json->>'etab_id');
```

> 🧠 Toute table accessible avec la clé `anon` est **publique** tant que RLS n'est pas
> activé. Testez avec `curl` sans `Authorization` : si vous lisez des données, c'est
> ouvert.

## 21.7 Durcissement de la WebView

```json
// tauri.conf.json
"security": {
  "csp": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' asset: data: blob:; connect-src 'self' https://*.supabase.co"
}
```

- `connect-src` limite les domaines joignables : une injection ne peut pas exfiltrer vers
  un serveur arbitraire ;
- `capabilities/default.json` doit être nettoyé (un seul bloc d'identifiant) ;
- n'activez `devtools` que dans les builds de développement :
  ```toml
  tauri = { version = "2", features = [] }          # production
  ```
- ne désactivez pas la vérification des signatures de plugins.

## 21.8 Données personnelles et conformité

Le logiciel traite des données d'enfants : noms, dates de naissance, lieux de naissance,
téléphones des parents. Traitez cela avec sérieux :

| Mesure | Pourquoi |
|---|---|
| accès nominatifs et journalisés | traçabilité |
| pas d'export massif sans contrôle | fuite de données |
| chiffrement du disque recommandé | vol d'ordinateur |
| durée de conservation définie | obligation légale |
| information des familles | confiance |
| suppression/anonymisation sur demande | droit des personnes |

> 🧠 Un logiciel qui centralise les données de 2 000 familles est une **responsabilité**
> juridique et morale. Écrivez une politique de confidentialité, même courte.

## 21.9 Exercices

> **Exercice 21.1** — Corrigez `isCoordinateur` (`return false` par défaut) et vérifiez
> qu'aucun écran ne casse pour un compte `COORDINATEUR`. Ajoutez `exiger_coordinateur`
> dans `delete_eleve`, `delete_etablissement` et `delete_utilisateur`.

> **Exercice 21.2** — Retirez le mot de passe en clair de `worklog.md`, changez-le sur
> l'installation concernée, puis vérifiez l'historique Git (`git log -p -- worklog.md`).
> Si le dépôt est public, révoquez la valeur.

> **Exercice 21.3** — Implémentez la table `Session` + un vrai jeton aléatoire + expiration
> à 12 h. Supprimez le repli de `get_me`. Testez : un jeton inventé doit être refusé.

> **Exercice 21.4** — Passez le coût bcrypt à 12 et mesurez le temps de connexion. Créez
> un écran « changer le mot de passe » utilisant la même politique.

> **Exercice 21.5** — Auditez la CSP et les capacités. Vérifiez avec `curl` que votre
> projet Supabase refuse une lecture anonyme.

## 21.10 À retenir

- Un jeton qui est l'identifiant utilisateur n'est pas un jeton.
- Un repli « vers l'admin » est une porte dérobée.
- Coût bcrypt ≥ 12, pas de mot de passe par défaut en production.
- L'autorisation se fait côté Rust, jamais uniquement dans l'interface.
- Un défaut permissif (`return true`) est une faille, pas une commodité.
- RLS d'abord : une clé `anon` sans RLS ouvre toute la base.
