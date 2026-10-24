# 20. Build, distribution et mises à jour

## 20.1 Les deux builds

```bash
# 1) Front-end statique → dossier out/
bun run build            # next build (output: 'export')

# 2) Application de bureau complète → installateur
bun run tauri build
```

`tauri build` exécute `beforeBuildCommand` (`npm run build`), compile Rust en mode
`release`, puis empaquette ce que dit `tauri.conf.json` :

```json
{
  "productName": "bon berger Kahinda Dav",
  "version": "1.0.0",
  "identifier": "com.sgfs.me",
  "build": {
    "beforeDevCommand": "npm run dev",
    "devUrl": "http://localhost:3000",
    "beforeBuildCommand": "npm run build",
    "frontendDist": "../out"
  },
  "bundle": { "active": true, "targets": "nsis", "icon": [ … ] }
}
```

Sorties typiques (Windows) :

```text
src-tauri/target/release/sgfs-me.exe
src-tauri/target/release/bundle/nsis/<nom>_1.0.0_x64-setup.exe
```

## 20.2 Trois réglages avant la première livraison

### 1 — Le nom du produit

`productName` et le titre de fenêtre valent « bon berger Kahinda Dav ». Ce nom apparaît
dans le menu Démarrer, les propriétés du fichier, l'installateur. Décidez d'un nom
**officiel** et cohérent avec l'identifiant (`com.sgfs.me`). Un changement de nom après
installation crée deux applications distinctes.

### 2 — Les cibles

`"targets": "nsis"` ne produit que pour Windows. Selon vos besoins :

```json
"targets": ["nsis", "msi"]          // Windows : installateur + MSI (GPO)
"targets": ["deb", "appimage"]      // Linux
"targets": ["dmg", "app"]           // macOS
"targets": "all"                    // tout ce que la plateforme permet
```

Un build macOS doit être fait **sur** macOS ; un build Windows sur Windows (ou via
GitHub Actions avec `windows-latest`).

### 3 — Les icônes

Le dossier `src-tauri/icons/` contient un jeu complet. Pour changer le logo :

```bash
bun run tauri icon chemin/vers/logo-1024.png
```

Cela régénère `.ico`, `.icns`, les tailles PNG et les icônes Android/iOS.

> ⚠️ `bundle.icon` référence encore `icon.icns`, `Square*Logo.png`, etc. Si vous
> supprimez ces fichiers (comme le suggérait `worklog.md`), le build échoue. Vérifiez
> toujours la cohérence entre la liste d'icônes et les fichiers présents.

## 20.3 Signature et réputation (Windows)

Sans signature de code, Windows SmartScreen affiche « Éditeur inconnu ». Pour une école,
c'est un frein psychologique réel.

Options :

1. certificat **EV** (le plus fiable, coûteux) ;
2. certificat **OV** standard (moins cher, réputation à construire) ;
3. distribution interne + notice d'installation avec capture d'écran (« Informations
   complémentaires → Exécuter quand même »).

Configuration Tauri (extrait) :

```json
"bundle": {
  "windows": {
    "certificateThumbprint": "…",
    "digestAlgorithm": "sha256",
    "timestampUrl": "http://timestamp.digicert.com"
  }
}
```

> 🧠 Ne stockez **jamais** le mot de passe du certificat dans le dépôt. Utilisez les
> secrets de la CI.

## 20.4 Les données de l'utilisateur et les mises à jour

C'est le point le plus critique d'une application de bureau : **la base existe déjà chez
le client**, avec ses données. Une mise à jour ne doit jamais les perdre.

```text
Installation 1.0 : SGFS-ME/data/sgfs.db (schéma v1)
Installation 1.1 : même chemin  →  il faut MIGRER, pas recréer
```

Le schéma actuel utilise `CREATE TABLE IF NOT EXISTS` : il **ne modifie pas** une table
existante. Ajouter une colonne exige une migration explicite.

### Patron de migration simple et sûr

```rust
pub fn run_migrations(conn: &Connection) -> Result<(), AppError> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS Migration (
            version    INTEGER PRIMARY KEY,
            applied_at TEXT NOT NULL DEFAULT (datetime('now'))
        );")?;

    let current: i64 = conn.query_row(
        "SELECT COALESCE(MAX(version), 0) FROM Migration", [], |r| r.get(0))?;

    let migrations: &[(i64, &str)] = &[
        (1, "ALTER TABLE Depense ADD COLUMN justificatif_url TEXT;"),
        (2, "CREATE INDEX IF NOT EXISTS idx_paiement_mode ON Paiement(mode_paiement);"),
        (3, "ALTER TABLE User ADD COLUMN doit_changer_mdp INTEGER NOT NULL DEFAULT 0;"),
    ];

    for (version, sql) in migrations {
        if *version > current {
            conn.execute_batch("BEGIN;")?;
            match conn.execute_batch(sql) {
                Ok(_) => {
                    conn.execute("INSERT INTO Migration (version) VALUES (?1)", [version])?;
                    conn.execute_batch("COMMIT;")?;
                    eprintln!("[MIGRATION] v{} appliquée", version);
                }
                Err(e) => {
                    conn.execute_batch("ROLLBACK;")?;
                    return Err(AppError::Database(format!("Migration v{} échouée : {}", version, e)));
                }
            }
        }
    }
    Ok(())
}
```

Appel dans `init_db()`, juste après l'exécution du schéma de base.

> 🧠 **Règle d'or** : une migration est irréversible en production. Sauvegardez la base
> **avant** d'appliquer, et rendez la sauvegarde accessible à l'utilisateur.

## 20.5 Sauvegarde automatique

Intégrez une sauvegarde quotidienne dans l'application :

```rust
fn backup_db(conn: &Connection) -> Result<(), AppError> {
    let dir = std::path::Path::new(&crate::db::get_db_path())
        .parent().unwrap().join("backups");
    std::fs::create_dir_all(&dir).ok();
    let cible = dir.join(format!("sgfs-{}.db", chrono::Local::now().format("%Y%m%d")));
    conn.execute("VACUUM INTO ?1", [cible.to_string_lossy().to_string()])?;
    Ok(())
}
```

`VACUUM INTO` produit une copie cohérente même avec le WAL actif. Puis purgez les
sauvegardes de plus de 30 jours.

> ⚠️ Une sauvegarde qui reste sur le même disque ne protège pas d'une panne matérielle.
> Proposez un export vers une clé USB ou le cloud.

## 20.6 Checklist de livraison

- [ ] `bun run lint`, `npx tsc --noEmit`, `cargo clippy` sans erreur
- [ ] `cargo test` vert
- [ ] version incrémentée dans `package.json`, `Cargo.toml`, `tauri.conf.json`
- [ ] migrations écrites et **testées sur une copie de base réelle**
- [ ] sauvegarde automatique active
- [ ] mots de passe par défaut neutralisés (`admin123` → changement obligatoire)
- [ ] aucune clé, aucun secret dans le dépôt
- [ ] `eprintln!("DEBUG` absent
- [ ] nom de produit, icônes, identifiant cohérents
- [ ] installation testée sur une machine **vierge** (pas votre poste de dev)
- [ ] parcours 1 à 20 du chapitre 19 exécutés
- [ ] données conservées après mise à jour
- [ ] désinstallation propre (les données utilisateur restent, volontairement)

## 20.7 Distribution

| Canal | Avantage | Inconvénient |
|---|---|---|
| Clé USB + `.exe` | universel, hors ligne | pas de mise à jour |
| Partage réseau / OneDrive | simple | versioning manuel |
| GitHub Releases | historique, checksum | nécessite Internet |
| Serveur interne + `updater` Tauri | mises à jour automatiques | configuration et signature |

Tauri propose un plugin `updater` : l'application vérifie une URL, télécharge et installe
— à condition que les binaires soient signés. À mettre en place au chapitre 2 du projet,
pas au chapitre 1.

## 20.8 Exercices

> **Exercice 20.1** — Produisez un installateur NSIS et installez-le sur une machine
> virtuelle Windows propre. Notez chaque écran, chaque avertissement SmartScreen.

> **Exercice 20.2** — Ajoutez une migration v1 qui crée la table `Caisse` (id, nom,
> etablissement_id, active) et une commande CRUD minimale. Vérifiez sur une base déjà
> remplie : aucune donnée perdue.

> **Exercice 20.3** — Intégrez `run_migrations` dans `init_db` et transformez la
> divergence de schéma du chapitre 12 en migration explicite.

> **Exercice 20.4** — Ajoutez `backup_db` au démarrage et un bouton « Sauvegarder
> maintenant » dans Paramètres, avec affichage du dossier cible.

> **Exercice 20.5** — Rédigez une procédure d'une page pour le personnel : installer,
> se connecter, sauvegarder, restaurer, que faire en cas d'erreur de synchronisation.
> C'est un livrable aussi important que le logiciel.

## 20.9 À retenir

- `next build` produit le front, `tauri build` produit l'application.
- Le nom, l'identifiant et les icônes sont des décisions durables.
- Une mise à jour ne remplace pas les données : elle les migre.
- Une sauvegarde automatique et testée vaut mieux qu'une promesse.
- Testez l'installation sur une machine vierge, chaque fois.
