# 2. Installer, lancer, explorer

Objectif : faire tourner le projet et comprendre **les deux modes d'exécution**
(navigateur et application de bureau), car cette dualité explique une grande partie du code.

## 2.1 Les outils à installer

| Outil | Version conseillée | Rôle |
|---|---|---|
| Node.js | ≥ 18 (20 recommandé) | exécuter Next.js |
| Bun | ≥ 1.1 | gestionnaire de paquets et exécuteur (le dépôt contient `bun.lock`) |
| Rust (rustup) | stable récent | compiler le back-end |
| Tauri CLI | fourni par le projet (`@tauri-apps/cli`) | empaqueter l'application |
| Build Tools Windows | Visual Studio Build Tools + WebView2 | requis sous Windows pour Tauri |

Installation de Rust :

```bash
# Linux / macOS
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
rustc --version && cargo --version

# Windows : https://rustup.rs puis installer
# « Desktop development with C++ » via Visual Studio Build Tools
```

Installation de Bun : voir <https://bun.sh>. Si vous préférez npm, tous les scripts
fonctionnent aussi avec `npm run …` — mais le dépôt est verrouillé avec `bun.lock`,
donc utilisez Bun pour rester cohérent avec l'équipe.

## 2.2 Installer les dépendances

```bash
git clone <url-du-depot> amelioration_ecole
cd amelioration_ecole
bun install
```

Ce que fait `bun install` : il lit `package.json`, résout les versions, écrit
`node_modules/`. Les dépendances lourdes du projet, à connaître :

- `next`, `react`, `react-dom` — le socle applicatif ;
- `zustand` — l'état global ;
- `@tauri-apps/api` — la passerelle IPC côté front ;
- `tailwindcss`, `class-variance-authority`, `@radix-ui/*` — le design system ;
- `recharts`, `xlsx`, `react-barcode`, `jsbarcode` — graphiques, exports, reçus ;
- `sonner` — notifications.

Côté Rust, les caisses sont déclarées dans `src-tauri/Cargo.toml` et récupérées au premier
build par Cargo (quelques minutes, puis mis en cache).

## 2.3 Mode 1 : navigateur (`bun run dev`)

```bash
bun run dev      # next dev -p 3000
```

Next.js sert l'interface sur <http://localhost:3000>. Vous voyez la page d'accueil
(`src/components/page.tsx`) puis l'écran de connexion.

> ⚠️ **Ce mode n'a plus de back-end.**
> L'historique du projet (`worklog.md`) indique que les routes `src/app/api/*` ont été
> supprimées lors de la migration vers Tauri. En navigateur, les appels passent par
> `apiFetch`, qui utilise `fetch('/api/...')`… et reçoit donc une 404.
> **Enseignement** : un front-end sans serveur ne peut pas lire une base locale. C'est
> précisément le problème que Tauri résout (chapitre 11).
> Le mode navigateur reste néanmoins utile pour **travailler le CSS, la mise en page et
> les composants** sans recompiler Rust.

## 2.4 Mode 2 : application de bureau (`bun run tauri dev`)

```bash
bun run tauri dev
```

Déroulement (défini dans `src-tauri/tauri.conf.json`) :

1. Tauri lance `npm run dev` (`beforeDevCommand`) ;
2. attend `http://localhost:3000` (`devUrl`) ;
3. compile le crate Rust (`cargo build`) ;
4. ouvre une fenêtre WebView2 (Windows) / WebKitGTK (Linux) / WKWebView (macOS)
   qui charge cette URL ;
5. dans cette WebView, `window.__TAURI_INTERNALS__` existe → `isTauri()` renvoie `true` →
   `apiFetch` route vers `invoke()` au lieu de `fetch()`.

```ts
// src/lib/store.ts
export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}
```

C'est **la** ligne qui sépare les deux mondes. Retenez-la.

## 2.5 Premier lancement : la base se crée toute seule

Au démarrage, `lib.rs` appelle `db::init_db()` :

```rust
.manage(db::init_db().expect("Failed to init database"))
```

`init_db()` (dans `src-tauri/src/db/mod.rs`) :

1. ouvre (ou crée) le fichier `sgfs.db` dans le dossier de données utilisateur ;
2. active `journal_mode=WAL`, `busy_timeout=5000`, `foreign_keys=ON` ;
3. exécute le schéma `SCHEMA` (toutes les tables en `CREATE TABLE IF NOT EXISTS`) ;
4. normalise les inscriptions actives, puis crée l'index unique partiel ;
5. crée un administrateur par défaut **si la table `User` est vide**.

> 🔑 **Premier identifiant** : `admin` / `admin123` (rôle `COORDINATEUR`).
> Changez-le immédiatement. Le chapitre 21 explique pourquoi ce mot de passe est un
> problème de sécurité en production.

Emplacement de la base (fonction `get_db_path()`) :

| Système | Chemin |
|---|---|
| Windows | `%APPDATA%\SGFS-ME\data\sgfs.db` |
| Linux / macOS | `~/SGFS-ME/data/sgfs.db` |

> 🧠 Pourquoi pas le dossier de l'application ? Parce qu'un programme installé dans
> `C:\Program Files` n'a pas le droit d'écrire à côté de son exécutable. Les données
> utilisateur vont dans le profil de l'utilisateur. C'est une règle des systèmes
> d'exploitation modernes.

## 2.6 Explorer le dépôt en dix minutes

```text
amelioration_ecole/
├── src/                        # front-end Next.js
│   ├── app/                    # layout.tsx, page.tsx, globals.css
│   ├── components/
│   │   ├── page.tsx            # page d'accueil publique (Jésus, logo, CTA)
│   │   ├── sgfs/               # 14 écrans métier
│   │   └── ui/                 # 48 briques shadcn/ui
│   ├── lib/
│   │   ├── store.ts            # Zustand + apiFetch + permissions
│   │   └── tauri-commands.ts   # 57 fonctions typées qui appellent invoke()
│   └── assets/                 # logo, images
├── src-tauri/                  # back-end Rust
│   ├── src/
│   │   ├── lib.rs              # enregistrement des commandes
│   │   ├── db/mod.rs           # schéma + init + seed
│   │   ├── commands/*.rs       # 15 modules métier
│   │   ├── sync/mod.rs         # moteur de synchronisation
│   │   └── utils/              # id, dates, monnaie, audit
│   ├── tauri.conf.json         # fenêtre, CSP, bundle
│   └── Cargo.toml
├── supabase_schema.sql         # miroir PostgreSQL du schéma
├── SYNC_GUIDE.md               # mode d'emploi de la synchronisation
└── livre/                      # ce livre
```

Trois fichiers à ouvrir en premier : `src/app/page.tsx` (le chef d'orchestre de l'UI),
`src/lib/store.ts` (le pont), `src-tauri/src/lib.rs` (le catalogue des commandes).

## 2.7 Vérifier que tout fonctionne

Checklist du premier lancement :

- [ ] `bun install` termine sans erreur ;
- [ ] `bun run dev` affiche « Ready » et la page d'accueil s'ouvre ;
- [ ] `bun run tauri dev` ouvre une fenêtre native ;
- [ ] la connexion `admin` / `admin123` affiche le tableau de bord ;
- [ ] le fichier `sgfs.db` existe et contient les tables :

```bash
sqlite3 ~/SGFS-ME/data/sgfs.db ".tables"
# AnnulationRecu  AuditLog  Classe  ConfigSysteme  Depense  Echeance  Eleve
# EleveClasse  Etablissement  FraisClasse  FraisScolaire  ParametreEtablissement
# Paiement  SyncLog  Tuteur  TuteurEleve  User  AnneeScolaire
```

## 2.8 Les erreurs de démarrage les plus fréquentes

| Symptôme | Cause probable | Solution |
|---|---|---|
| `error: linker 'cc' not found` | toolchain C++ absente | installer Build Tools (Windows) / `build-essential` (Linux) |
| fenêtre blanche dans Tauri | Next.js pas encore prêt | augmenter l'attente, vérifier que le port 3000 est libre |
| `Failed to init database` | dossier de données non inscriptible | vérifier les droits, supprimer un verrou WAL résiduel |
| `database is locked` | deux instances de l'appli | fermer l'autre instance ; le `busy_timeout` aide mais ne fait pas de miracle |
| écran de connexion en boucle | `get_me` échoue | inspecter `sgfs-storage` dans le localStorage du WebView |
| `invoke` introuvable | exécution en navigateur | lancer via `bun run tauri dev` |

> > **Exercice 2.1** — Lancez l'application, connectez-vous, puis modifiez le mot de passe
> > de `admin` depuis l'écran Utilisateurs. Vérifiez en base que `password_hash` a changé :
> >
> > ```sql
> > SELECT username, substr(password_hash,1,10) FROM User;
> > ```
> >
> > Que constatez-vous sur la longueur du hash ? (Réponse en annexe D.)

> **Exercice 2.2** — Ouvrez `src-tauri/src/db/mod.rs`, trouvez `seed_default_admin`.
> Expliquez en deux phrases pourquoi la fonction vérifie `COUNT(*) FROM User` avant
> d'insérer. Que se passerait-il sans cette vérification au deuxième démarrage ?

## 2.9 À retenir

- Deux modes : navigateur (UI seulement) et Tauri (UI + Rust + SQLite).
- `isTauri()` est l'aiguillage ; `__TAURI_INTERNALS__` est le drapeau.
- La base est créée automatiquement dans le dossier utilisateur, avec un admin par défaut.
- Une base de données est un objet observable : apprenez à la regarder.
