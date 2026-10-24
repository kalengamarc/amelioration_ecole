# Construire SGFS-ME — Le livre du projet

**Apprendre le développement logiciel à travers une vraie application de gestion scolaire**

*Édition 1 — octobre 2026*

> Ce fichier est généré automatiquement par `node livre/build.mjs`.
> Les sources se trouvent dans les fichiers numérotés de ce dossier.
> La version HTML autonome est `SGFS-ME-livre.html`.

## Sommaire

- 1. Avant-propos : apprendre par projet — `01-avant-propos-et-methode.md`
- 2. Installer, lancer, explorer — `02-installer-et-lancer.md`
- 3. Le domaine métier : une école, des élèves, de l'argent — `03-le-domaine-metier.md`
- 4. Architecture et trajet d'une requête — `04-architecture-et-trajet-dune-requete.md`
- 5. React et Next.js dans ce projet — `05-react-et-nextjs.md`
- 6. TypeScript solide — `06-typescript-solide.md`
- 7. État global avec Zustand — `07-zustand-etat-global.md`
- 8. Construire un écran CRUD complet — `08-ecran-crud-eleves.md`
- 9. UI, Tailwind et shadcn/Radix — `09-ui-tailwind-shadcn.md`
- 10. Rust pour développeurs JavaScript — `10-rust-pour-developpeurs-js.md`
- 11. Tauri : commandes, IPC, permissions — `11-tauri-commandes-et-ipc.md`
- 12. SQLite : schéma, SQL, transactions — `12-sqlite-sql-et-schema.md`
- 13. Une commande de bout en bout — `13-une-commande-de-bout-en-bout.md`
- 14. Argent, devises et arrondis — `14-argent-devises-et-arrondis.md`
- 15. Intégrité, audit et annulations — `15-integrite-audit-annulations.md`
- 16. Tableau de bord et rapports — `16-dashboard-et-rapports.md`
- 17. Synchronisation « offline-first » — `17-synchronisation-offline-first.md`
- 18. Déboguer la synchronisation — `18-deboguer-la-sync.md`
- 19. Tests et qualité — `19-tests-et-qualite.md`
- 20. Build, distribution et mises à jour — `20-build-distribution-mise-a-jour.md`
- 21. Sécurité et permissions — `21-securite-et-permissions.md`
- 22. Feuille de route et projet final — `22-feuille-de-route-et-exercices.md`
- Annexe A — Glossaire — `23-annexe-a-glossaire.md`
- Annexe B — Aide-mémoire — `24-annexe-b-aide-memoire.md`
- Annexe C — Checklist de revue de code — `25-annexe-c-checklist-revue.md`
- Annexe D — Corrigés des exercices — `26-annexe-d-corriges.md`
- Annexe E — Plan d'apprentissage sur 8 semaines — `27-annexe-e-plan-8-semaines.md`


---

# 1. Avant-propos : apprendre par projet

## 1.1 Pourquoi ce livre existe

On apprend à nager dans l'eau, pas dans un manuel. En programmation, la piscine s'appelle
**un projet réel** : du code imparfait, des contraintes de terrain, des choix à assumer,
des bugs à traquer. SGFS-ME est exactement cela : une application utilisée par un complexe
scolaire à Bujumbura pour encaisser des minervals, suivre des échéances et produire des
reçus. Ce n'est pas un exercice de style.

Ce livre a donc une promesse simple : **à la fin, vous serez capable de lire, modifier,
déboguer et étendre cette application**, et vous aurez acquis les gestes qui se
transposent à n'importe quel logiciel de gestion.

## 1.2 Ce que « apprendre correctement » veut dire

Beaucoup de tutoriels apprennent à *recopier*. Nous visons autre chose, organisé en
quatre niveaux :

1. **Lire** — comprendre un fichier que vous n'avez pas écrit.
2. **Expliquer** — dire pourquoi ce code est là, et ce qui casserait sans lui.
3. **Modifier** — ajouter une fonctionnalité sans effet de bord.
4. **Concevoir** — prendre une décision d'architecture et l'assumer.

Chaque chapitre travaille au moins deux de ces niveaux. Les exercices montent
progressivement du niveau 1 au niveau 4.

> 🧠 **La règle d'or du projet réel**
> Ne demandez jamais « comment on écrit ça en React ? » avant de vous demander
> « que doit-il se passer métier ? ». Le code n'est que la conséquence d'une règle.

Exemple concret tiré du projet : *un élève ne peut avoir qu'une seule inscription
active*. Cette phrase métier devient, au chapitre 12, un index SQL partiel :

```sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_eleve_classe_one_active_per_eleve
ON EleveClasse(eleve_id) WHERE statut = 'ACTIF';
```

La base de données **refuse** une deuxième inscription active, même si un bug du
front-end essaie d'en créer une. C'est ainsi qu'on écrit un logiciel fiable : la règle est
inscrite au niveau le plus bas possible.

## 1.3 La méthode en cinq gestes

Pour chaque fonctionnalité du projet, appliquez cette séquence. Elle reviendra dans tous
les chapitres.

### Geste 1 — Nommer les objets du métier

Un logiciel de scolarité manipule : `Etablissement`, `AnneeScolaire`, `Classe`, `Eleve`,
`Tuteur`, `FraisScolaire`, `Echeance`, `Paiement`, `Depense`, `User`, `AuditLog`.
Ces noms sont ceux du code, du SQL et de l'interface. Cette homogénéité n'est pas un
détail : elle réduit la charge mentale et évite les traductions approximatives.

### Geste 2 — Dessiner le trajet de la donnée

Avant d'écrire une ligne :

```text
Formulaire React → fonction tauri-commands → invoke('create_paiement')
→ commande Rust → validation → INSERT SQL → réponse JSON → toast + rafraîchissement
```

Si vous ne savez pas dessiner ce chemin, vous ne savez pas encore ce que vous codez.

### Geste 3 — Écrire le plus petit code qui marche

Dans ce projet, chaque écran est un assemblage de briques existantes :
un état local (`useState`), un appel de commande (`tc.listEleves`), une table, une
boîte de dialogue. On n'invente une brique que lorsqu'aucune ne convient.

### Geste 4 — Vérifier par l'observation

Lancez l'application, faites l'action, regardez la base :

```bash
# La base de développement sous Linux/macOS
ls ~/SGFS-ME/data/sgfs.db          # chemin réel utilisé par le code
```

Puis, avec `sqlite3` (ou un outil graphique comme DB Browser for SQLite) :

```sql
SELECT numero_recu, montant, devise, annule FROM Paiement ORDER BY created_at DESC LIMIT 5;
```

Une base de données ne ment pas. C'est votre premier outil de débogage.

### Geste 5 — Consigner ce qu'on a appris

Le dépôt contient `worklog.md` : un journal des tâches réalisées. Tenez le vôtre.
Dans trois mois, vous aurez oublié pourquoi cette condition existe ; le journal, non.

> ⚠️ **Piège réel du dépôt**
> `worklog.md` contient actuellement un mot de passe en clair. Nous y revenons au
> chapitre 21 (exercice 21.2) : un secret ne doit jamais entrer dans un dépôt Git.
> Prenez l'habitude de relire vos journaux avant de committer.

## 1.4 Prérequis et charge de travail

| Notion | Niveau attendu |
|---|---|
| HTML / CSS | savoir ce qu'est une boîte, une classe CSS |
| JavaScript | variables, fonctions, tableaux, objets |
| Ligne de commande | `cd`, `ls`, `git status`, `git commit` |
| Anglais technique | lecture de messages d'erreur |

Rust, React, SQL et Tauri sont enseignés dans le livre. Comptez **30 à 45 heures** pour
lire et faire les exercices, réparties selon le plan de l'annexe E.

## 1.5 Le contrat de lecture

Ce livre assume trois choses, et vous demande de les accepter :

1. **Le code du dépôt est la référence.** Si le livre et le code divergent, le code gagne.
   Le livre explique *pourquoi*, le code dit *comment*.
2. **Tout n'est pas parfait.** Le projet contient des dettes techniques assumées
   (sessions par identifiant, `any` par endroits, absence de tests automatisés).
   Les signaler et les corriger fait partie de l'apprentissage — c'est même le sujet des
   chapitres 19 à 22.
3. **On ne saute pas les erreurs.** Les chapitres 2, 18 et 20 contiennent des listes
   d'incidents réels. Les lire vous fera gagner des heures.

## 1.6 Premier contact avec le code

Avant le chapitre 2, faites ce mini-exercice d'observation (aucune installation).

> **Exercice 1.1 — Cartographier le dépôt**
> Ouvrez le dépôt et notez, sans chercher à comprendre :
> 1. le nombre de fichiers dans `src/components/sgfs/` ;
> 2. le nombre de fichiers `*.rs` dans `src-tauri/src/` ;
> 3. le nombre de composants dans `src/components/ui/`.
> Puis répondez : quelle partie du projet est « écrite à la main » et quelle partie est
> « du matériel standard » ?
>
> **Corrigé (annexe D)** : 14 écrans métier, 28 fichiers Rust, 48 composants UI.
> Les composants `ui/` sont des briques génériques générées par shadcn/ui : on les
> utilise, on ne les réécrit pas. Le code vraiment spécifique, celui qui porte la valeur,
> est ailleurs — et c'est là que vous allez travailler.

## 1.7 Ce que vous saurez faire à la fin

- Installer et lancer une application Tauri complète sur votre machine.
- Expliquer chaque étape entre un clic et un enregistrement SQLite.
- Écrire une commande Rust sécurisée (validation, transaction, audit).
- Ajouter un écran CRUD en React/TypeScript en respectant le style du projet.
- Diagnostiquer une synchronisation bloquée.
- Construire un installateur et poser un plan de mise à jour des données.

Passons à l'installation.


---

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


---

# 3. Le domaine métier : une école, des élèves, de l'argent

Avant le code, il faut comprendre le métier. Ce chapitre est le plus important du livre :
tout le reste en découle. Prenez le temps de dessiner.

## 3.1 Le décor : un complexe scolaire, plusieurs écoles

SGFS-ME gère un **réseau d'établissements**. Un établissement possède un type :

| Type | Signification |
|---|---|
| `MATERNELLE` | petite enfance |
| `PRIMAIRE` | école primaire |
| `SECONDAIRE` | école secondaire |
| `COMPLEXE` | regroupe plusieurs niveaux |

Chaque établissement a une **devise** (`CDF`, `BIF`, `USD`), une **couleur principale**
(utilisée dynamiquement dans l'interface), un RCCM et un identifiant national. Ces deux
derniers apparaissent sur les reçus officiels : ce ne sont pas des détails décoratifs.

> 🧠 **Règle de conception n° 1**
> Un établissement n'est pas une « école » abstraite : c'est une **unité comptable**.
> Les paiements, les dépenses et les rapports sont toujours cloisonnés par établissement.

## 3.2 La chaîne de la scolarité

```text
Etablissement
   └── AnneeScolaire  (« 2025-2026 », dates de début/fin, une seule active)
         └── Classe   (« 4e A », niveau, effectif max)
               └── EleveClasse  (l'élève X est inscrit dans la classe Y)
Eleve  ── TuteurEleve ──  Tuteur  (père, mère, tuteur légal)
```

### L'année scolaire

L'année porte un libellé (`2025-2026`) et deux dates. Une seule année est `active` à la
fois — c'est elle qui sert par défaut pour les nouvelles inscriptions.

> ⚠️ **Piège vécu** : si l'année active change en cours d'année, les frais et échéances
> déjà créés restent rattachés à l'ancienne année. C'est voulu : l'historique est immuable.
> Toutes les requêtes du projet filtrent donc **explicitement** par
> `annee_scolaire_id` (ou par `active = 1` selon le contexte).

### L'élève

| Champ | Remarque métier |
|---|---|
| `matricule` | unique, généré automatiquement (`ELV-2026-0001`) — il identifie l'élève à vie |
| `nom`, `prenom` | le nom de famille d'abord, usage local |
| `sexe` | `M` / `F`, sert aux statistiques |
| `date_naissance` | sert au calcul de l'âge, contrôles d'admission |
| `statut` | `INSCRIT`, `ACTIF`, `SUSPENDU`, `TRANSFERE`, `DIPLOME` |
| `etablissement_id` | **obligatoire** : un élève appartient à un établissement |
| `annee_scolaire_id` | année de première inscription |

### L'inscription à une classe

`EleveClasse` est une table de liaison enrichie : `date_inscription`, `date_sortie`,
`statut`. Elle permet de garder **l'historique** des passages d'un élève dans les classes.

> 🧠 **Règle de conception n° 2 — une seule inscription active par élève**
> Un élève redoublant change de classe : on n'efface pas l'ancienne ligne, on la clôture
> (`statut = 'TRANSFERE'`, `date_sortie` renseignée) et on en crée une nouvelle.
> La base l'impose par un index unique partiel (chapitre 12).

### Les tuteurs

`Tuteur` est autonome (nom, prénom, téléphones, profession, relation). `TuteurEleve` lie
un tuteur à un élève avec un drapeau `is_principal`. Le téléphone du tuteur est ce qu'on
appelle lors d'un impayé : c'est une donnée **critique** dans la vraie vie. Le projet
prévoit d'ailleurs des fonctions qui remontent le premier téléphone disponible
(`tuteur_phone_expr` dans `echeances.rs`).

## 3.3 La chaîne financière : le cœur du logiciel

C'est ici que se joue la réputation du logiciel. Une école qui perd la trace d'un paiement
perd la confiance des parents.

```text
FraisScolaire  (Minerval T1 = 150 000 BIF, type SCOLARITE, pour la classe « 4e A »)
      │
      ├── FraisClasse   (quelles classes sont concernées)
      │
      ▼
Echeance  (1 par élève et par frais : montant_du, montant_paye, statut)
      ▲
      │  montant_affecte
Paiement  (reçu n° REC-20261024-0001, mode ESPECES, caisse de l'utilisateur)
      │
      └── AnnulationRecu  (si le reçu est annulé : motif, auteur, date)
```

### Les frais

Un `FraisScolaire` a :

- un `libelle` (« Minerval 1ère tranche »),
- un `type` : `SCOLARITE`, `INSCRIPTION`, `ANNEXE`,
- un `montant` et une `devise` (**indépendante** de celle de l'établissement !),
- une `annee_scolaire_id`,
- éventuellement une `tranche` et une `date_echeance`,
- une liste de classes concernées (`FraisClasse`).

> ⚠️ **Notion avancée mais essentielle**
> Un frais peut être libellé en USD alors que l'école tient sa caisse en BIF. Le projet
> gère cela avec, sur le paiement, quatre champs : `montant`, `devise`,
> `montant_affecte`, `devise_echeance`, plus `taux_change` et `montant_original`.
> Autrement dit : **le montant encaissé et le montant imputé à l'échéance ne sont pas
> forcément la même chose**. Chapitre 14.

### Les échéances

L'échéance matérialise « ce que cet élève doit pour ce frais ». Elle naît de la
rencontre entre un frais et un élève. L'écran Échéances (`echeances.rs`) va plus loin : il
**agrège** les échéances par élève, calcule le dû, le payé, le reste, le retard en jours,
et produit un message de relance lisible (« Minerval T1 : 50 000 BIF restant »).

Statuts calculés :

| Condition | Statut affiché |
|---|---|
| `total_paye >= total_du` | `PAYE` |
| `0 < total_paye < total_du` | `PARTIELLEMENT_PAYE` |
| `total_paye <= 0` | `EN_ATTENTE` (ou `EN_RETARD` si date dépassée) |

> 🧠 **Règle de conception n° 3 — l'échéance est un solde, pas un reçu**
> Un paiement partiel ne crée pas une nouvelle échéance : il **incrémente**
> `montant_paye`. L'historique financier est porté par `Paiement`, l'état courant par
> `Echeance`. Ne mélangez jamais les deux rôles.

### Les paiements

Champs à connaître par cœur :

```
id, numero_recu (unique), eleve_id, echeance_id (nullable),
etablissement_id, annee_scolaire_id, user_id (le caissier),
motif, montant, devise, montant_affecte, devise_echeance,
mode_paiement, reference_paiement, taux_change, montant_original,
annule, date_annulation, created_at, updated_at
```

Deux points de vigilance :

1. **`echeance_id` est nullable** : on peut encaisser un paiement « global » (plusieurs
   frais d'un coup). L'imputation se fait alors dans le calcul (voir `LigneFrais`).
2. **`annule` remplace la suppression** : on n'efface jamais un reçu (obligation
   comptable). On l'annule, avec un motif conservé dans `AnnulationRecu`.

### Les dépenses

`Depense` enregistre les sorties : salaires, fournitures, loyer, entretien…
Champs : `categorie`, `libelle`, `montant`, `devise`, `beneficiaire`, `date_depense`,
`reference_piece`, `justificatif_url`, `statut` (`VALIDE` par défaut).

> 🧠 **Règle de conception n° 4 — recettes et dépenses ne se mélangent pas**
> Le bénéfice est calculé **devise par devise** (`dashboard.rs`), jamais en additionnant
> des francs congolais et des dollars. Le code construit un `BTreeMap<String, f64>`
> par devise, puis soustrait. C'est une décision de comptabilité, pas de programmation.

## 3.4 Les acteurs : rôles et permissions

| Rôle | Portée |
|---|---|
| `COORDINATEUR` | établissements, classes, frais, utilisateurs, audit, paramètres — toutes écoles |
| `SECRETAIRE_MATERNELLE` | son établissement : élèves, échéances, encaissements, dépenses |
| `SECRETAIRE_PRIMAIRE` | idem, école primaire |
| `SECRETAIRE_SECONDAIRE` | idem, école secondaire |

Le front applique ces règles à deux endroits :

```ts
// src/lib/store.ts
export function isCoordinateur(role: string | null | undefined): boolean {
  if (!role) return true            // ⚠️ permissif par défaut
  const r = role.toUpperCase()
  return r === 'COORDINATEUR' || r === 'ADMIN' || r === 'SUPERADMIN'
      || r === 'ADMINISTRATEUR' || r === 'COORD'
}

export function getSchoolFilter(role: string, etablissementId: string | null) {
  if (role === 'COORDINATEUR') return null   // null = toutes les écoles
  return etablissementId                      // sinon, une seule école
}
```

et dans la barre latérale (`Sidebar.tsx`), qui masque les entrées non autorisées :

```ts
{ key: 'frais', label: 'Frais scolaires', icon: Banknote, roles: ['COORDINATEUR'] }
```

> ⚠️ **Leçon de sécurité** : masquer un bouton n'est pas protéger une fonction. Les
> commandes Rust ne vérifient pas le rôle de l'appelant. Une personne qui connaît l'IPC
> pourrait appeler `delete_etablissement`. C'est l'exercice 21.1.

## 3.5 Les règles métier à ne jamais violer

Voici la « constitution » du projet. Affichez-la au-dessus de votre écran.

1. Un paiement n'est **jamais supprimé**, seulement annulé, avec motif et auteur.
2. Le montant payé d'une échéance ne peut pas être négatif (`MAX(0, …)` dans le code).
3. Un élève n'a qu'une inscription active.
4. Un matricule est unique et ne change pas.
5. Les totaux ne s'additionnent jamais entre devises.
6. Toute opération sensible est journalisée dans `AuditLog`.
7. Un reçu porte un numéro unique et séquentiel par jour (`REC-AAAAMMJJ-0001`).
8. Les données ne sont jamais perdues en cas de coupure réseau : SQLite d'abord, cloud
   ensuite (chapitre 17).

## 3.6 Exercices de compréhension

> **Exercice 3.1** — Un parent paie 100 000 BIF sur un minerval de 150 000 BIF.
> Décrivez précisément ce qui change dans les tables `Paiement` et `Echeance`, puis
> l'état affiché à l'écran Échéances. Que se passe-t-il si le caissier annule ce reçu
> le lendemain ?

> **Exercice 3.2** — Une école fixe les frais d'inscription en USD (25 $) et le minerval
> en BIF. Sans écrire de code, proposez la manière de stocker un paiement de 25 $ fait en
> francs burundais au taux de 2 900. Quels champs utilisez-vous ?

> **Exercice 3.3** — Le proviseur veut ajouter les « frais de bibliothèque » pour
> seulement deux classes. Faut-il créer une nouvelle table ? Expliquez en vous appuyant
> sur `FraisScolaire` et `FraisClasse`.

> **Exercice 3.4** — Un élève quitte l'école en cours d'année. Énumérez les écritures à
> faire pour préserver l'historique financier et ne pas fausser les effectifs.

Les corrigés sont en [annexe D](26-annexe-d-corriges.md).

## 3.7 À retenir

- Le logiciel est un **modèle** du monde réel : identifier les entités, puis les règles.
- La chaîne `Etablissement → Année → Classe → Élève` est la colonne vertébrale.
- La chaîne `Frais → Échéance → Paiement → Annulation` est le cœur financier.
- Les règles métier s'inscrivent dans la base (contraintes), dans le code (validation)
  et dans l'interface (guidage). Les trois niveaux se renforcent.


---

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


---

# 5. React et Next.js dans ce projet

## 5.1 Next.js 14, mais seulement le routeur

Le dépôt utilise Next.js en **export statique** :

```js
// next.config.mjs
const nextConfig = {
  output: 'export',
  images: { unoptimized: true },
  reactStrictMode: true,
}
```

Conséquence : pas de serveur Node en production. Le build produit un dossier `out/`
de fichiers HTML/CSS/JS que Tauri embarque. Next.js n'est donc utilisé que pour :

- structurer l'application (`src/app/layout.tsx`, `src/app/page.tsx`) ;
- compiler JSX/TypeScript ;
- optimiser le CSS et les bundles.

> 🧠 **À retenir** : dans un projet Tauri, Next.js n'est pas un serveur, c'est un
> **compilateur de front-end**. Toute la logique serveur vit en Rust.

## 5.2 `layout.tsx` : le squelette

```tsx
// src/app/layout.tsx
import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "SGFS-ME",
  description: "Système de Gestion Financière et Scolaire",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="min-h-screen bg-black font-poppins text-gray-900 antialiased">
        {children}
      </body>
    </html>
  )
}
```

Points à observer :

- `lang="fr"` : accessibilité et césure correcte ;
- `children` : React injecte ici le contenu de `page.tsx` ;
- `antialiased` : rendu de police plus net (Tailwind) ;
- `font-poppins` : police déclarée dans `tailwind.config.js`.

## 5.3 `page.tsx` : le chef d'orchestre

`src/app/page.tsx` est un composant **client** (`'use client'`) qui décide de tout :
accueil, connexion, ou application. Sa logique tient en quatre blocs.

### Bloc 1 — session au démarrage

```tsx
useEffect(() => {
  async function checkSession() {
    try {
      const token = getStoredAuthToken()
      if (!token) { useAppStore.getState().logout(); setLoading(false); return }
      const data = await tc.getMe(token)
      if (data.success && data.data) useAppStore.getState().login(data.data, token)
      else useAppStore.getState().logout()
    } catch {
      useAppStore.getState().logout()
    } finally {
      setLoading(false)
    }
  }
  checkSession()
}, [])
```

Trois principes ici :

1. `useEffect(…, [])` = « au montage seulement ».
2. On **vérifie** le jeton auprès du back-end : un localStorage peut être périmé.
3. `finally` garantit que l'écran de chargement disparaît, même en cas d'erreur.

> ⚠️ `data.success && data.data` — le back-end renvoie `{success:true, data:{…}}`.
> Si vous changez ce contrat côté Rust, **tous** les écrans se cassent silencieusement.
> C'est le type de couplage qu'il faut documenter (voir chapitre 11).

### Bloc 2 — contexte de l'établissement

```tsx
useEffect(() => {
  if (!isAuthenticated || !user || etablissements.length === 0) return

  let targetId: string | undefined
  if (user.role === 'COORDINATEUR') {
    targetId = etablissements.find((e: any) => e.actif !== false)?.id
  } else {
    targetId = user.etablissementId || undefined
  }
  if (!targetId) return

  tc.getEtablissementContext(targetId)
    .then((data: any) => {
      if (data.success && data.data) {
        setCurrentEtablissement(data.data.etablissement)
        setEtabParams(data.data.parametres ?? null)
      }
    })
    .catch(() => {})
}, [isAuthenticated, user, etablissements])
```

Ici se joue une règle métier : le coordonnateur voit toutes les écoles, un secrétaire
est **verrouillé** sur la sienne. On retrouve cette logique dans chaque écran via
`getSchoolFilter`.

### Bloc 3 — synchronisation automatique

```tsx
const initialTimer = setTimeout(runAutoSync, 30000)          // 30 s après connexion
const interval = setInterval(runAutoSync, 5 * 60 * 1000)     // toutes les 5 min
window.addEventListener('local-data-changed', scheduleAfterChange) // 5 s après écriture
window.addEventListener('online', runAutoSync)

return () => {
  clearTimeout(initialTimer)
  clearInterval(interval)
  if (changeTimer) clearTimeout(changeTimer)
  window.removeEventListener('local-data-changed', scheduleAfterChange)
  window.removeEventListener('online', runAutoSync)
}
```

> 🧠 **Le nettoyage d'effet n'est pas optionnel.** Sans le `return`, chaque
> re-connexion empile un nouvel intervalle : la synchronisation partirait 5, 10, 15 fois
> par minute. C'est le bug React le plus courant en production.

Le « debounce » de 5 secondes est une décision produit : trois écritures rapides
(élève + tuteur + inscription) ne déclenchent qu'une synchronisation.

### Bloc 4 — rendu conditionnel

```tsx
if (loading) return <ÉcranDeChargement />
if (!isAuthenticated) return showLogin ? <LoginPage /> : <Accueil />

const renderPage = () => {
  switch (currentPage) {
    case 'dashboard':     return <DashboardPage />
    case 'eleves':        return <ElevesPage />
    case 'encaissements': return <EncaissementsPage />
    // …
    default:              return <DashboardPage />
  }
}
```

Deux styles de navigation coexistent : un **switch** sur `currentPage` (état Zustand)
et un routage Next.js absent. C'est un choix : une application de bureau à fenêtre unique
n'a pas besoin d'URL. Avantage : simplicité et état conservé. Inconvénient : pas de lien
profond, pas de bouton « retour ».

## 5.4 Les hooks utilisés dans le projet

| Hook | Usage réel dans SGFS-ME |
|---|---|
| `useState` | filtres, formulaires, données chargées, dialogues |
| `useEffect` | chargement initial, réactions aux dépendances, abonnements |
| `useCallback` | stabiliser `fetchStudents`, évitant une boucle infinie d'effets |
| `useMemo` | variables CSS dérivées de la couleur d'établissement |
| `useRef` | (rare) références DOM pour impression |
| hooks shadcn | `use-toast`, `use-mobile` |

### Le duo `useCallback` + `useEffect`

```tsx
const fetchStudents = useCallback(async () => { /* … */ },
  [user, role, userEtabId, school, year, classe, search, page, filterNoClass])

useEffect(() => { fetchStudents() }, [fetchStudents])
```

Si `fetchStudents` n'était pas mémorisée, elle serait recréée à chaque rendu ; l'effet
la verrait « changer » et rechargerait… à l'infini. Retenez la règle :
**fonction utilisée comme dépendance ⇒ `useCallback`**.

### Dériver plutôt que stocker

```tsx
const cssVars = useMemo(() => {
  const color = currentEtablissement?.couleurPrincipale || DEFAULT_COLOR
  return {
    '--etab-color': color,
    '--etab-color-hover': darkenHex(color),
    '--etab-color-light': color + '10',
  } as React.CSSProperties
}, [currentEtablissement?.couleurPrincipale])
```

On ne stocke pas `couleurHover` dans l'état : on la calcule. Moins d'état = moins de bugs.

## 5.5 Le rendu des listes

```tsx
students.map((s) => (
  <TableRow key={s.id}>
    <TableCell>{s.matricule}</TableCell>
    <TableCell>{s.nom} {s.prenom}</TableCell>
    <TableCell>{s.inscriptions?.[0]?.classe?.nom ?? '—'}</TableCell>
  </TableRow>
))
```

- `key={s.id}` : identifiant stable. Ne mettez **jamais** l'index du tableau quand la
  liste peut être filtrée ou triée.
- `?? '—'` : un trou dans la donnée n'est pas une erreur, c'est un cas d'affichage.

## 5.6 Les événements personnalisés (`CustomEvent`)

Le projet communique entre composants éloignés via `window` :

```ts
window.dispatchEvent(new Event('go-to-login'))
window.dispatchEvent(new Event('go-to-accueil'))
window.dispatchEvent(new Event('local-data-changed'))
window.dispatchEvent(new Event('sync-completed'))
```

et côté écoute :

```tsx
useEffect(() => {
  const goToLogin = () => setShowLogin(true)
  window.addEventListener('go-to-login', goToLogin)
  return () => window.removeEventListener('go-to-login', goToLogin)
}, [])
```

C'est un **bus d'événements minimal**. Très pratique ; à réserver aux événements
transverses (session, synchronisation). Pour de la donnée applicative, préférez Zustand.

> 🔧 **Exercice 5.1** — Le composant `Sidebar` déclenche `local-data-changed` ? Vérifiez.
> Puis listez tous les endroits du dépôt qui écoutent cet événement :
> ```bash
> grep -rn "local-data-changed" src/
> ```
> Combien d'écrans se rafraîchissent après une synchronisation ? Que manque-t-il ?

## 5.7 `'use client'` : pourquoi partout ?

En Next.js 14, les composants sont des *Server Components* par défaut. Comme l'export est
statique et que tout tourne dans la WebView, chaque composant qui utilise un état, un
effet ou un gestionnaire d'événement doit déclarer :

```tsx
'use client'
```

Symptômes d'un oubli :

- `useState is not a function` ou erreur « You're importing a component that needs useState » ;
- écran vide lors du build statique.

## 5.8 Structure d'un écran métier

Tous les écrans de `src/components/sgfs/` suivent la même ossature. Apprenez-la, vous
pourrez créer le prochain en une heure.

```text
1. imports (UI, icônes, tc, store, toast)
2. types locaux (School, Year, Classe, Student)
3. constantes (empty, STATUS_LABEL, couleurs)
4. composant :
   a. hooks du store (user, role, permissions)
   b. useState (données, filtres, pagination, formulaires, dialogues)
   c. useCallback de chargement (fetchSchools, fetchYears, fetchClasses, fetchStudents)
   d. useEffect de déclenchement
   e. handlers (openCreate, openEdit, handleSave, handleDelete, showDetail)
   f. rendu : header, filtres, tableau, dialogues, pagination
```

> **Exercice 5.2** — Ouvrez `UtilisateursPage.tsx` et `DepensesPage.tsx`. Vérifiez que
> ces huit sections s'y retrouvent. Notez les écarts (ordre, hooks supplémentaires) :
> un projet vivant n'est jamais parfaitement uniforme.

> **Exercice 5.3** — Dans `page.tsx`, remplacez le délai initial de synchronisation de
> 30 s par 10 s, puis observez les logs. Pourquoi un délai trop court au démarrage est-il
> problématique ? (Indice : que fait `sync_push` au premier lancement ?)

## 5.9 À retenir

- Next.js sert uniquement à compiler et structurer ; il n'y a pas de serveur.
- Un composant par écran, une ossature répétée, des hooks standards.
- `useEffect` + `useCallback` : la dépendance est la clé de la stabilité.
- Les événements `window` servent aux signaux transverses.
- Toujours nettoyer les abonnements et les minuteurs.


---

# 6. TypeScript solide

TypeScript n'est pas là pour « faire joli ». Dans un projet qui manipule de l'argent,
c'est un garde-fou. Ce chapitre montre comment le dépôt l'utilise — et où il cède du
terrain.

## 6.1 Configuration

```json
// tsconfig.json (extrait)
{
  "compilerOptions": {
    "strict": true,
    "noEmit": true,
    "jsx": "preserve",
    "moduleResolution": "bundler",
    "paths": { "@/*": ["./src/*"] }
  }
}
```

- `strict` active `strictNullChecks`, `noImplicitAny`, etc. : indispensable.
- `@/…` évite les `../../..` illisibles : `@/lib/tauri-commands`.

## 6.2 Typer les objets du métier

```ts
// src/components/sgfs/eleves/ElevesPage.tsx
type Student = {
  id: string
  matricule: string
  nom: string
  prenom: string
  sexe: string
  statut: string
  dateNaissance?: string
  lieuNaissance?: string
  etablissementId: string
  etablissement?: { nom: string }
  inscriptions?: any[]
  classes?: any[]
  tuteurs?: any[]
  echeances?: any[]
  paiements?: any[]
}
```

> 🧠 `?` signale un champ **facultatif** (« peut être absent »). Il ne dit pas
> « peut être null ». Pour cela, écrivez `dateNaissance?: string | null`. Le back-end
> Rust renvoie souvent `null` pour les colonnes SQL vides : la nuance compte.

## 6.3 Unions, littéraux et objets de correspondance

Le projet préfère `as const` + objet de correspondance aux `enum` :

```ts
export const ETAB_TYPES = ['MATERNELLE', 'PRIMAIRE', 'SECONDAIRE', 'COMPLEXE'] as const
export type EtabType = (typeof ETAB_TYPES)[number]   // 'MATERN…' | 'PRIMAIRE' | …

export function getTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    MATERNELLE: 'Maternelle',
    PRIMAIRE: 'Primaire',
    SECONDAIRE: 'Secondaire',
    COMPLEXE: 'Complexe',
  }
  return labels[type] || type
}
```

`Record<string, string>` = « dictionnaire clé/texte ». Pour un libellé de statut on
préfère stocker le style avec le texte :

```ts
const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  ACTIF:     { label: 'Actif',     className: 'bg-emerald-100 text-emerald-800 …' },
  INSCRIT:   { label: 'Inscrit',   className: 'bg-sky-100 text-sky-800 …' },
  SUSPENDU:  { label: 'Suspendu',  className: 'bg-amber-100 text-amber-800 …' },
  TRANSFERE: { label: 'Transféré', className: 'bg-stone-100 text-stone-700 …' },
}
```

Ainsi, ajouter un statut = ajouter une ligne, sans toucher au rendu. C'est un petit
patron de conception : **données plutôt que conditions**.

## 6.4 Génériques : `apiFetch<T>`

```ts
export async function apiFetch<T = any>(
  path: string,
  options: RequestInit = {}
): Promise<T> { … }
```

L'appelant choisit la forme attendue :

```ts
const data = await apiFetch<{ eleves: Student[]; total: number }>('/api/eleves')
```

C'est le bon usage : le générique décrit ce que **vous** attendez. ⚠️ Le défaut
`T = any` est un aveu : sans paramètre explicite, aucune vérification. Dans le code
actuel, la plupart des appels utilisent `tc.*` (typés par `Promise<any>`, hélas) puis
`res?.data`. Une amélioration à fort rendement serait de typer `tauri-commands.ts`
(chapitre 22, exercice 22.2).

## 6.5 Le pattern défensif des réponses

Le back-end n'a pas toujours renvoyé la même forme. Résultat, les écrans pratiquent :

```ts
const res = await tc.listClasses(etabId, year)
const data = res?.classes ?? res?.data ?? []
setClasses(Array.isArray(data) ? data : [])
```

Décortiquons :

| Élément | Sens |
|---|---|
| `res?.classes` | forme `{classes:[…]}` (list_response) |
| `?? res?.data` | forme `{data:[…]}` (api_response) |
| `?? []` | aucune des deux : on affiche une liste vide |
| `Array.isArray` | ce n'est pas un tableau ? on évite le crash |

> 🧠 C'est **de la programmation défensive sur un contrat instable**. Utile, mais ce n'est
> pas une solution : la vraie correction est d'uniformiser les réponses côté Rust
> (exercice 6.2).

## 6.6 Narrowing et garde-fous

```ts
// src/lib/store.ts
export function isCoordinateur(role: string | null | undefined): boolean {
  if (!role) return true
  const r = role.toUpperCase()
  return r === 'COORDINATEUR' || r === 'ADMIN' || r === 'SUPERADMIN'
      || r === 'ADMINISTRATEUR' || r === 'COORD'
}
```

TypeScript apprend ici que `role` est une `string` après le `if (!role) return`.
C'est le *narrowing* (rétrécissement de type).

```ts
// Extraction d'un objet imbriqué, avec repli
const t = s.tuteurs?.find((x: any) => x.tuteur?.isPrincipal)?.tuteur
       ?? s.tuteurs?.[0]?.tuteur
```

Chaque `?.` évite un `Cannot read properties of undefined`.

> ⚠️ **Piège de logique** : `isCoordinateur` renvoie `true` quand `role` est vide.
> « Pas d'information » devient « tous les droits ». C'est une faille par défaut
> permissif (fail-open). Un système financier doit échouer **fermé** (`return false`).
> Notez-le pour l'exercice 21.1.

## 6.7 Typer une commande Tauri

```ts
export async function login(username: string, password: string) {
  return cmd<{ token: string; user: any }>('login', { req: { username, password } })
}
```

Le paramètre `req` est un objet imbriqué : la commande Rust attend
`req: LoginRequest`, avec `username` / `password` en snake_case-compatible (pas de
renommage ici). Voir `tauri-commands.ts` pour les variantes (`etablissementId` **et**
`etablissement_id` envoyés ensemble — un bricolage de compatibilité assumé).

## 6.8 `any` : où il se cache et comment le réduire

Comptons honnêtement :

```bash
grep -rn ": any" src/lib src/components/sgfs | wc -l
```

Les zones à `any` du projet :

| Zone | Raison historique | Coût |
|---|---|---|
| réponses des commandes | `cmd<T = any>` | aucune vérification de forme |
| objets imbriqués (`inscriptions`, `tuteurs`) | structures SQL plates remodelées | bug si le champ change |
| `catch (e: any)` | `unknown` est plus sûr | message d'erreur potentiellement vide |

Amélioration progressive (sans tout casser) :

```ts
// 1. une fonction de normalisation, testable
function unwrapList<T>(res: any, key: string): T[] {
  const v = res?.[key] ?? res?.data
  return Array.isArray(v) ? (v as T[]) : []
}

// 2. des types de réponse explicites
type ListResponse<T> = { success?: boolean; data?: T[]; pagination?: { total: number; totalPages: number } }

// 3. et une seule implémentation par écran
const students = unwrapList<Student>(res, 'eleves')
```

> **Exercice 6.1** — Écrivez `src/lib/types.ts` contenant `Eleve`, `Classe`,
> `AnneeScolaire`, `Paiement`, `Echeance`, `Depense`. Importez-les dans deux écrans.
> Combien d'erreurs TypeScript apparaissent ? Que révèlent-elles sur les données réelles ?

> **Exercice 6.2** — Choisissez `list_classes` et `list_eleves` dans
> `src-tauri/src/commands/`. Uniformisez leur réponse (`{data, pagination}` pour les deux),
> adaptez `tauri-commands.ts` et **un** écran. Vérifiez à la main. (Corrigé partiel en
> annexe D.)

> **Exercice 6.3** — Remplacez `catch (e: any)` par `catch (e: unknown)` dans
> `ElevesPage.tsx` et écrivez :

```ts
function messageOf(e: unknown): string {
  if (typeof e === 'string') return e
  if (e instanceof Error) return e.message
  return 'Erreur inconnue'
}
```

## 6.9 À retenir

- `strict: true` n'est pas négociable ; `any` se justifie, il ne se subit pas.
- Typer les réponses est le meilleur investissement pour réduire les bugs d'écran.
- Un type décrit la réalité : `?` ≠ `| null`.
- Un défaut permissif (`return true`) est un choix de sécurité, pas un détail.


---

# 7. État global avec Zustand

## 7.1 Pourquoi un état global ?

Une application de bureau a besoin de données partagées par tous les écrans :

- l'utilisateur connecté et son jeton ;
- la page courante ;
- l'établissement sélectionné (sa couleur, sa devise, son nom) ;
- les paramètres de cet établissement (pied de page des reçus, imprimante).

Les faire descendre de composant en composant (« prop drilling ») serait pénible.
Zustand offre un **magasin** simple, sans `Provider`, avec persistance intégrée.

## 7.2 Le magasin du projet

```ts
// src/lib/store.ts
interface AppState {
  // Auth
  user: UserInfo | null
  token: string | null
  isAuthenticated: boolean
  login: (user: UserInfo, token: string) => void
  logout: () => void

  // Navigation
  currentPage: PageName
  setPage: (page: PageName) => void
  sidebarOpen: boolean
  setSidebarOpen: (open: boolean) => void
  toggleSidebar: () => void

  // Contexte établissement
  currentEtablissement: EtablissementContext | null
  setCurrentEtablissement: (etab: EtablissementContext | null) => void
  etabParams: EtabParams | null
  setEtabParams: (params: EtabParams | null) => void
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      login: (user, token) => set({ user, token, isAuthenticated: true }),
      logout: () => set({
        user: null, token: null, isAuthenticated: false,
        currentEtablissement: null, etabParams: null,
      }),

      currentPage: 'dashboard',
      setPage: (page) => set({ currentPage: page }),
      sidebarOpen: true,
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),

      currentEtablissement: null,
      setCurrentEtablissement: (etab) => set({ currentEtablissement: etab }),
      etabParams: null,
      setEtabParams: (params) => set({ etabParams: params }),
    }),
    {
      name: 'sgfs-storage',
      partialize: (state) => ({
        token: state.token,
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
)
```

### Trois détails qui comptent

1. **`partialize`** : seule la session est persistée. On ne veut pas retrouver la page
   « paramètres » ou une sidebar fermée au prochain démarrage — et surtout pas des
   données métier périmées.
2. **Le nom `sgfs-storage`** est le contrat avec le passé : le changer déconnecte tous
   les utilisateurs existants.
3. `set((s) => ({...}))` : forme fonctionnelle quand la nouvelle valeur dépend de
   l'ancienne.

> 🧠 **Sécurité** : `persist` écrit le jeton dans `localStorage` de la WebView. C'est
> acceptable pour une application locale mono-utilisateur, pas pour un site public
> (vulnérable au XSS). Le chapitre 21 en reparle.

## 7.3 Lire le magasin dans un composant

```tsx
const { user, currentPage } = useAppStore()
```

Attention : cette écriture **s'abonne à tout le magasin**. Chaque changement de
`sidebarOpen` re-rend l'écran. La forme recommandée est le sélecteur :

```tsx
const user = useAppStore((s) => s.user)
const setPage = useAppStore((s) => s.setPage)
```

> 🔧 **Exercice 7.1** — Transformez l'abonnement global de `DepensesPage.tsx` en
> sélecteurs. Mesurez (console React DevTools, option « Highlight updates ») le nombre de
> rendus avant/après en ouvrant puis fermant la sidebar.

## 7.4 Lire le magasin hors de React

Dans `page.tsx` (vérification de session) ou dans `apiFetch` :

```ts
useAppStore.getState().logout()
useAppStore.getState().login(data.data, token)
```

`getState()` donne la valeur courante **sans s'abonner**. C'est l'équivalent d'un accès
impératif — parfait pour un test, un gestionnaire d'événement ou une fonction utilitaire.

## 7.5 Des helpers métier autour du magasin

Le magasin n'est pas qu'un seau de valeurs ; il porte aussi les règles d'affichage :

```ts
export function isCoordinateur(role: string | null | undefined): boolean { … }
export function canManageFees(role: string): boolean { … }
export function canManageUsers(role: string): boolean { … }
export function canViewAudit(role: string): boolean { … }
export function canManageSettings(role: string): boolean { … }
export function getSchoolFilter(role: string, etablissementId: string | null): string | null
export function getRoleLabel(role: string): string
```

`getSchoolFilter` est le plus utilisé : il renvoie `null` pour « toutes les écoles » ou
l'identifiant unique. Les écrans s'en servent ainsi :

```tsx
const schoolFilter = getSchoolFilter(role, userEtabId)
const locked = !!schoolFilter
// …
<Select value={school || 'all'} disabled={locked} …>
```

> 🧠 **Un seul endroit pour une règle.** Si demain un rôle « CAISSIER » apparaît, vous
> modifiez `isCoordinateur` et `getSchoolFilter` — pas les douze écrans.

## 7.6 Changer de contexte sans perdre la cohérence

Le projet définit `onEtabSelect` pour que le changement d'établissement mette à jour
toute l'interface :

```ts
export function onEtabSelect(etabId: string, ecoles: Ecole[]) {
  const etab = ecoles.find((e) => e.id === etabId)
  if (!etab) return
  useAppStore.getState().setCurrentEtablissement({
    id: etab.id,
    nom: etab.nom,
    type: etab.type || 'PRIMAIRE',
    couleurPrincipale: etab.couleurPrincipale || DEFAULT_COLOR,
    devise: etab.devise || 'BIF',
    adresse: etab.adresse ?? null,
    telephone: etab.telephone ?? null,
    email: etab.email ?? null,
    logoUrl: etab.logoUrl ?? null,
    rccm: etab.rccm ?? null,
    idNat: etab.idNat ?? null,
  })
}
```

La couleur choisie remonte ensuite jusqu'au CSS :

```tsx
// page.tsx
const cssVars = useMemo(() => {
  const color = currentEtablissement?.couleurPrincipale || DEFAULT_COLOR
  return {
    '--etab-color': color,
    '--etab-color-hover': darkenHex(color),
    '--etab-color-light': color + '10',
  } as React.CSSProperties
}, [currentEtablissement?.couleurPrincipale])

return <div style={cssVars}> … </div>
```

et les composants consomment :

```tsx
<button className="bg-[var(--etab-color)] hover:bg-[var(--etab-color-hover)]">
```

> 🧠 **Le thème par variable CSS** est une technique précieuse : changer une valeur en
> un point met à jour toute l'application, sans re-rendre React.

## 7.7 Ce qu'il ne faut PAS mettre dans le magasin

| À éviter | Pourquoi | Où le mettre |
|---|---|---|
| listes d'élèves/paiements | volumineuses, propres à un écran | `useState` local |
| état de formulaire | éphémère | `useState` local |
| résultat de requête avec filtres | duplication, péremption | état local + rechargement |
| objets dérivés | inutile | `useMemo` / calcul |

Le magasin global ne doit contenir que ce qui est **vraiment transverse et durable**.

## 7.8 Persistance, versionnage et migration

Aujourd'hui, `persist` n'a pas de `version`. Si la forme de `UserInfo` change (par
exemple `etablissementId` devient `etablissements: string[]`), les anciennes sessions
seront désérialisées dans une forme incompatible.

Solution robuste :

```ts
persist(store, {
  name: 'sgfs-storage',
  version: 2,
  migrate: (persisted: any, version) => {
    if (version < 2) {
      persisted.user = { ...persisted.user, etablissements: persisted.user.etablissementId ? [persisted.user.etablissementId] : [] }
    }
    return persisted
  },
  partialize: (s) => ({ token: s.token, user: s.user, isAuthenticated: s.isAuthenticated }),
})
```

> **Exercice 7.2** — Ajoutez `version: 1` puis simulez un changement de forme de
> `UserInfo` et écrivez la migration correspondante. Testez en modifiant à la main le
> localStorage (`sgfs-storage`) dans la console du WebView.

> **Exercice 7.3** — Ajoutez au magasin `anneeScolaireCourante` et son setter, puis
> utilisez-la dans `ElevesPage` comme valeur initiale du filtre `year`. Attention à ne
> pas casser la logique `locked` des secrétaires.

## 7.9 À retenir

- Zustand : simple, sans Provider, persistance intégrée.
- `partialize` limite ce qui est stocké ; `version` + `migrate` préparent l'avenir.
- `getState()` pour agir hors React, sélecteurs pour limiter les rendus.
- Les règles de rôle et de périmètre vivent dans `store.ts`, pas dans chaque écran.
- État local pour l'éphémère, magasin pour le transverse.


---

# 8. Construire un écran CRUD complet

Ce chapitre est un atelier. Nous allons décortiquer `ElevesPage.tsx` — l'écran le plus
représentatif du projet — puis vous construirez votre propre écran selon la même recette.

**CRUD** = Create, Read, Update, Delete. Un écran de gestion doit savoir lister, filtrer,
créer, consulter, modifier et archiver.

## 8.1 Le contrat de l'écran

L'écran Élèves doit permettre de :

| Besoin | Élément d'interface | Commande appelée |
|---|---|---|
| voir les élèves | tableau paginé | `list_eleves` |
| filtrer | recherche + établissement + année + classe | paramètres de `list_eleves` |
| repérer les cas problématiques | bouton « Sans classe » | filtre côté client |
| inscrire | dialogue « Nouvel élève » | `create_eleve` |
| consulter | fiche détaillée | `get_eleve` |
| modifier | même dialogue, pré-rempli | `update_eleve` |
| archiver | dialogue de confirmation | `delete_eleve` |

> 🧠 **Règle d'or** : l'écran ne décide pas des règles métier. Il collecte, affiche,
> transmet. Les contrôles réels (établissement actif, année active, classe cohérente)
> sont dans `create_eleve` côté Rust.

## 8.2 Étape 1 — L'état

```tsx
const [students, setStudents]   = useState<Student[]>([])
const [schools, setSchools]     = useState<School[]>([])
const [years, setYears]         = useState<Year[]>([])
const [classes, setClasses]     = useState<Classe[]>([])

const [school, setSchool]       = useState(locked ? schoolFilter! : '')
const [year, setYear]           = useState('')
const [classe, setClasse]       = useState('')
const [search, setSearch]       = useState('')
const [filterNoClass, setFilterNoClass] = useState(false)
const [page, setPage]           = useState(1)
const [totalPages, setTotalPages] = useState(1)
const [total, setTotal]         = useState(0)
const [loading, setLoading]     = useState(true)

const [form, setForm]           = useState(empty)
const [formOpen, setFormOpen]   = useState(false)
const [editingId, setEditingId] = useState<string | null>(null)
const [busy, setBusy]           = useState(false)
const [detail, setDetail]       = useState<Student | null>(null)
const [deleteTarget, setDeleteTarget] = useState<Student | null>(null)
```

### Découpage mental

```text
données serveur   : students, schools, years, classes
filtres           : school, year, classe, search, filterNoClass, page
état d'interface  : loading, busy, formOpen, detail, deleteTarget
formulaire        : form, editingId
```

Un écran lisible est un écran dont **chaque `useState` appartient clairement à une de ces
quatre familles**. Si vous ne savez pas où ranger un état, c'est souvent qu'il est dérivable.

## 8.3 Étape 2 — Le chargement

```tsx
const fetchStudents = useCallback(async () => {
  if (!user) return
  setLoading(true)
  try {
    const sf = getSchoolFilter(role, userEtabId)
    const etabId = sf || school || undefined

    const res = await tc.listEleves({
      etablissementId: etabId,
      anneeScolaireId: year || undefined,
      classeId: classe || undefined,
      search: search || undefined,
      page,
      pageSize: 15,
    })

    let students = res?.data ?? []
    if (filterNoClass) {
      students = students.filter((s: Student) => {
        const inscriptions = s.inscriptions || s.classes || []
        return !inscriptions.some((x: any) =>
          x.statut === 'ACTIF' && (x.classe_id || x.classe?.id))
      })
    }
    setStudents(students)
    setTotal(filterNoClass ? students.length : (res?.pagination?.total ?? 0))
    setTotalPages(filterNoClass ? Math.ceil(students.length / 15) : (res?.pagination?.totalPages ?? 1))
  } catch (e: any) {
    toast.error(e?.message || 'Erreur chargement')
  } finally {
    setLoading(false)
  }
}, [user, role, userEtabId, school, year, classe, search, page, filterNoClass])
```

À observer :

- **un seul point d'entrée réseau** par liste (pas d'appel dispersé dans le JSX) ;
- `setLoading(true)` avant, `false` dans `finally` : jamais de spinner bloqué ;
- les filtres vides deviennent `undefined`, pas `''` (côté Rust, `''` est une valeur, pas
  une absence) ;
- le filtre « sans classe » est appliqué **côté client** — acceptable car la page ne
  contient que 15 lignes, mais faux sur une grosse pagination (exercice 8.2).

> ⚠️ **Défaut réel** : quand `filterNoClass` est actif, on filtre *après* pagination. Les
> compteurs deviennent approximatifs. La bonne solution est un paramètre
> `sansClasse=true` traité par `list_eleves` en SQL.

## 8.4 Étape 3 — Déclencher sans boucler

```tsx
useEffect(() => { if (user) fetchSchools() }, [user, fetchSchools])
useEffect(() => { fetchYears() }, [fetchYears])
useEffect(() => { fetchClasses() }, [fetchClasses])
useEffect(() => { fetchStudents() }, [fetchStudents])

useEffect(() => {
  const handleSync = () => { fetchStudents(); fetchClasses() }
  window.addEventListener('sync-completed', handleSync)
  return () => window.removeEventListener('sync-completed', handleSync)
}, [fetchStudents, fetchClasses])
```

Chaque fonction de chargement a **un** effet qui la déclenche. Quand un filtre change,
la fonction change (nouvelle identité `useCallback`), l'effet se relance : le rechargement
est automatique, sans écrire `onChange={… fetch()}` partout.

> 🧠 Pensez « l'état pilote, l'effet suit ». C'est le renversement qui rend React
> prévisible.

## 8.5 Étape 4 — Le formulaire

```tsx
const empty = {
  nom: '', prenom: '', sexe: 'M', dateNaissance: '', lieuNaissance: '',
  etablissementId: '', anneeScolaireId: '', classeId: '',
  tuteurNom: '', tuteurPrenom: '', tuteurTelephone: '', tuteurTelephone2: '',
  tuteurRelation: 'Père', tuteurAdresse: '', tuteurProfession: '',
}
```

Ouverture en création :

```tsx
function openCreate() {
  setEditingId(null)
  setForm({ ...empty, etablissementId: school || (locked ? schoolFilter! : ''), anneeScolaireId: year })
  setClassSearch('')
  setShowClassDropdown(false)
  setFormOpen(true)
}
```

Ouverture en modification — le vrai travail est de **retrouver les valeurs** dans une
réponse imbriquée :

```tsx
const ins = (s.inscriptions || s.classes || []).find((x: any) => x.statut === 'ACTIF')
         ?? (s.inscriptions || s.classes || [])[0]
const t = s.tuteurs?.find((x: any) => x.tuteur?.isPrincipal)?.tuteur
       ?? s.tuteurs?.[0]?.tuteur

setForm({
  ...empty,
  nom: s.nom, prenom: s.prenom, sexe: s.sexe,
  dateNaissance: s.dateNaissance ?? (s as any).date_naissance ?? '',
  etablissementId: etabId,
  anneeScolaireId: ins?.classe?.anneeScolaire?.id ?? (s as any).anneeScolaireId ?? '',
  classeId: ins?.classeId ?? ins?.classe_id ?? ins?.classe?.id ?? '',
  tuteurNom: t?.nom ?? '', tuteurPrenom: t?.prenom ?? '',
  tuteurTelephone: t?.telephone ?? '',
  // …
})
setEditingId(s.id)
setFormOpen(true)
```

> ⚠️ Cette cascade de `??` montre que **le format de réponse n'est pas stable** entre
> endpoints (`camelCase` ici, `snake_case` là). Un travail utile : créer un
> `normalizeEleve()` unique et testé (exercice 8.4).

Validation minimale côté client :

```tsx
if (!form.nom.trim() || !form.prenom.trim() || !form.etablissementId
    || !form.anneeScolaireId || !form.classeId) {
  toast.error('Veuillez remplir tous les champs obligatoires (*)')
  return
}
```

## 8.6 Étape 5 — Enregistrer

```tsx
async function handleSave() {
  // validation…
  setBusy(true)
  const payload = {
    nom: form.nom.trim(), prenom: form.prenom.trim(), sexe: form.sexe,
    dateNaissance: form.dateNaissance || undefined,
    lieuNaissance: form.lieuNaissance || undefined,
    etablissementId: form.etablissementId,
    anneeScolaireId: form.anneeScolaireId,
    classeId: form.classeId,
    tuteurs: form.tuteurNom.trim() && form.tuteurPrenom.trim() ? [{
      nom: form.tuteurNom.trim(), prenom: form.tuteurPrenom.trim(),
      telephone: form.tuteurTelephone.trim() || 'Non renseigné',
      relation: form.tuteurRelation,
      profession: form.tuteurProfession || undefined,
      isPrincipal: true,
    }] : [],
  }

  try {
    if (editingId) {
      await tc.updateEleve(editingId, payload)
      toast.success('Élève modifié avec succès')
    } else {
      await tc.createEleve(payload)
      toast.success('Élève inscrit avec succès')
    }
    setFormOpen(false)
    fetchStudents()
  } catch (e: any) {
    toast.error(typeof e === 'string' ? e : e?.message || 'Erreur inconnue')
  } finally {
    setBusy(false)
  }
}
```

Les cinq gestes du « save » réussi :

1. désactiver le bouton (`busy`) pour éviter le double envoi ;
2. envoyer des données **nettoyées** (`trim()`, vides → `undefined`) ;
3. fermer le dialogue **après** le succès seulement ;
4. recharger la liste (ou insérer le résultat dans l'état) ;
5. notifier l'utilisateur.

> 🧠 Pourquoi recharger plutôt qu'insérer localement ? Parce que le back-end enrichit la
> réponse (matricule généré, classe jointe, statut). Recharger garantit la cohérence,
> au prix d'un aller-retour local — négligeable en SQLite.

## 8.7 Étape 6 — Supprimer (archiver)

```tsx
async function handleDelete() {
  if (!isCoordinateur(role)) {
    toast.error("Seul l'Administrateur / Coordonnateur peut archiver un élève.")
    return
  }
  if (!deleteTarget) return
  setBusy(true)
  try {
    await tc.deleteEleve(deleteTarget.id)
    toast.success('Élève archivé avec succès')
    setDeleteTarget(null)
    fetchStudents()
  } catch (e: any) {
    toast.error(typeof e === 'string' ? e : e?.message || 'Erreur')
  } finally {
    setBusy(false)
  }
}
```

Deux principes :

- **confirmation obligatoire** via un dialogue dédié, jamais `window.confirm` ;
- côté Rust, la suppression est en réalité une **archivation** (l'élève garde son
  historique financier). Un logiciel de gestion ne supprime pas des gens.

## 8.8 Étape 7 — Les états d'écran

Un écran professionnel gère **quatre** états, pas deux :

```tsx
{loading ? (
  <TableRow><TableCell colSpan={6}>Chargement du répertoire…</TableCell></TableRow>
) : students.length === 0 ? (
  <TableRow><TableCell colSpan={6}>Aucun élève trouvé.</TableCell></TableRow>
) : (
  students.map(/* … */)
)}
```

| État | Question de l'utilisateur | Réponse de l'interface |
|---|---|---|
| chargement | « ça marche ? » | indicateur explicite |
| vide | « pourquoi rien ? » | message + action suggérée |
| erreur | « qu'est-ce que je fais ? » | toast avec cause |
| plein | « où est ce que je cherche ? » | filtres + pagination |

> 🔧 Le cas « erreur » est aujourd'hui un toast fugace. Amélioration : un bandeau
> persistant avec bouton « Réessayer » (exercice 8.3).

## 8.9 La pagination

```tsx
<Button variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>Précédent</Button>
<span>Page {page} / {totalPages}</span>
<Button variant="outline" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Suivant</Button>
```

Deux règles :

1. **remettre `page` à 1** quand un filtre change, sinon on peut demander la page 5 d'un
   résultat qui n'en compte plus qu'une ;
2. refléter `total` à l'utilisateur : sans cela, aucune confiance dans la recherche.

## 8.10 Atelier : votre propre écran

> **Exercice 8.1 (guidé, ~45 min)** — Créez `src/components/sgfs/eleves/ElevesSansClassePage.tsx`
> qui affiche uniquement les élèves sans inscription active, avec un bouton
> « Affecter à une classe » ouvrant un dialogue (classe + année).
>
> Indications :
> - commande existante : `list_eleves_sans_classe` (déjà dans `lib.rs`) ;
> - réutilisez `Table`, `Dialog`, `Select`, `toast` ;
> - n'ajoutez **aucun** appel réseau nouveau : réutilisez `tc.*` ;
> - pour affecter, il n'existe pas de commande dédiée : passez par `update_eleve` avec un
>   `classeId`, ou écrivez la commande manquante (chapitre 11).
>
> Grille d'auto-évaluation :
> - [ ] l'écran s'affiche sans erreur en mode Tauri ;
> - [ ] les quatre états (chargement / vide / erreur / plein) sont visibles ;
> - [ ] un changement de filtre remet la page à 1 ;
> - [ ] aucune boucle de requêtes dans la console ;
> - [ ] le code respecte l'ordre des sections de la §5.8.

> **Exercice 8.2** — Ajoutez `sans_classe: bool` à `list_eleves` (Rust) et filtrez en SQL
> avec `NOT EXISTS (SELECT 1 FROM EleveClasse ec WHERE ec.eleve_id = e.id AND ec.statut='ACTIF')`.
> Puis retirez le filtrage client. Vérifiez la cohérence de `total`.

> **Exercice 8.3** — Remplacez le toast d'erreur par un bandeau persistant :
> nouvel état `error: string | null`, affiché au-dessus du tableau, avec bouton
> « Réessayer » appelant `fetchStudents()`.

> **Exercice 8.4** — Écrivez `normalizeEleve(raw: any): Student` et utilisez-la dans
> `openEdit` et `showDetail`. Objectif : plus aucun `??` dans le JSX.

## 8.11 À retenir

- Un écran = quatre familles d'état, une fonction de chargement, des effets pilotés.
- Les filtres vides deviennent `undefined` ; la page revient à 1 à chaque changement.
- Sauvegarder : valider, désactiver, envoyer proprement, fermer après succès, recharger.
- Supprimer = archiver ; toujours avec confirmation et droits.
- Quatre états d'écran : chargement, vide, erreur, plein.


---

# 9. UI, Tailwind et shadcn/Radix

## 9.1 Trois briques, trois rôles

| Brique | Rôle | Dans le dépôt |
|---|---|---|
| **Tailwind CSS** | styles utilitaires (`p-4`, `rounded-xl`, `bg-[#0c241f]`) | `tailwind.config.js`, `globals.css` |
| **shadcn/ui** | composants copiés dans le projet, adaptables | `src/components/ui/` (48 fichiers) |
| **Radix UI** | comportements accessibles (dialog, select, tabs…) | dépendances `@radix-ui/*` |

Le point clé de shadcn/ui : **ce n'est pas une bibliothèque installée**. Les composants
sont du code source dans votre dépôt. Vous pouvez — et devez — les modifier.

## 9.2 L'état réel de la configuration

```js
// tailwind.config.js
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: { extend: {} },
  plugins: [],
}
```

```css
/* src/app/globals.css */
@tailwind base;
@tailwind components;
@tailwind utilities;
```

Deux constats importants :

1. **Aucun jeton de thème n'est défini.** C'est pourquoi le code utilise massivement des
   valeurs arbitraires : `bg-[#0c241f]`, `text-amber-400`, `border-stone-200`.
2. `package.json` déclare à la fois `tailwindcss@3` (avec `postcss.config.js` →
   plugin `tailwindcss`) et `@tailwindcss/postcss@4` en devDependency. Cette
   coexistence est une dette : il faut choisir une version et une configuration.

> 🧠 **Ce que cela coûte** : impossible de changer la charte graphique en un point ;
> incohérences de gris (`stone`, `slate`, `gray`) ; refonte difficile. C'est exactement le
> genre d'observation qu'un développeur senior formule en revue de code.

### Correction proposée (exercice 9.1)

```js
// tailwind.config.js
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: 'var(--etab-color, #0c241f)',
          hover:   'var(--etab-color-hover, #071916)',
          light:   'var(--etab-color-light, #0c241f10)',
        },
        accent: { DEFAULT: '#d97706', hover: '#b45309' },
        surface: '#f8faf9',
      },
      fontFamily: { poppins: ['Poppins', 'system-ui', 'sans-serif'] },
      borderRadius: { xl2: '1rem' },
    },
  },
  plugins: [],
}
```

Puis : `<Button className="bg-brand hover:bg-brand-hover">`. Un seul endroit à changer.

## 9.3 Lire une classe Tailwind sans paniquer

```tsx
<Card className="rounded-2xl border border-stone-200/80 shadow-sm overflow-hidden">
```

| Fragment | Signification |
|---|---|
| `rounded-2xl` | coins arrondis (1rem) |
| `border` + `border-stone-200/80` | bordure 1px, couleur `stone-200` à 80 % d'opacité |
| `shadow-sm` | ombre discrète |
| `overflow-hidden` | coupe le contenu qui dépasse (utile pour un tableau aux coins arrondis) |

```tsx
<div className="grid gap-3 p-4 md:grid-cols-5">
```

- `grid` + `md:grid-cols-5` : 1 colonne par défaut, 5 à partir du breakpoint `md` ;
- `gap-3` : espacement entre cellules ;
- `p-4` : padding intérieur.

Préfixes responsives : `sm:` (640px), `md:` (768px), `lg:` (1024px), `xl:` (1280px).
Le projet cible une fenêtre 1250×700 (`tauri.conf.json`) : `sm` et `md` sont les plus
utiles.

## 9.4 `cn()` : fusionner des classes sans conflit

```ts
// src/lib/utils.ts
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

- `clsx` accepte chaînes, tableaux, objets conditionnels ;
- `twMerge` résout les conflits : `cn('p-2', 'p-4')` → `'p-4'`.

C'est ce qui permet aux composants d'accepter un `className` personnalisé :

```tsx
<Button className="bg-[#0c241f] hover:bg-[#071916] text-white font-bold px-5 py-2.5 rounded-xl">
```

## 9.5 Variantes avec `cva`

```tsx
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm …",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive: "bg-destructive text-white hover:bg-destructive/90",
        outline: "border bg-background hover:bg-accent",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 px-3",
        lg: "h-10 px-6",
        icon: "size-9",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
)
```

Usage : `<Button variant="destructive" size="sm">Supprimer</Button>`.

> 🧠 `cva` (class-variance-authority) = « variantes déclaratives ». L'alternative est un
> enchevêtrement de ternaires dans `className`. Pour un design system, `cva` gagne.

## 9.6 Accessibilité : ce que Radix apporte gratuitement

Les composants `ui/` enveloppent Radix : `Dialog`, `Select`, `Tabs`, `Tooltip`,
`DropdownMenu`, `Accordion`, `Checkbox`, `Switch`, `Popover`, `Sheet`…

Ils fournissent :

- la gestion du focus (piège de focus dans un dialogue) ;
- la fermeture par `Échap` et par clic extérieur ;
- les attributs ARIA (`role="dialog"`, `aria-expanded`, `aria-labelledby`) ;
- la navigation clavier dans les listes.

À condition de **bien les utiliser** :

```tsx
<Dialog open={formOpen} onOpenChange={setFormOpen}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>{editingId ? 'Modifier l’élève' : 'Nouvel élève'}</DialogTitle>
    </DialogHeader>
    <Label htmlFor="nom">Nom *</Label>
    <Input id="nom" value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} />
  </DialogContent>
</Dialog>
```

> ⚠️ **Erreurs fréquentes** : `DialogTitle` absent (le lecteur d'écran annonce un dialogue
> sans nom) ; `Label` sans `htmlFor` ; bouton icône sans `aria-label`.

## 9.7 Le tableau : le composant le plus utilisé

```tsx
<Table>
  <TableHeader className="bg-[#0c241f] text-white">
    <TableRow>
      <TableHead className="text-amber-300 font-bold">Matricule</TableHead>
      <TableHead>Élève</TableHead>
      <TableHead>Classe</TableHead>
      <TableHead className="text-right">Actions</TableHead>
    </TableRow>
  </TableHeader>
  <TableBody>
    {students.map((s) => (
      <TableRow key={s.id}>
        <TableCell className="font-mono text-xs">{s.matricule}</TableCell>
        <TableCell>{s.nom} {s.prenom}</TableCell>
        <TableCell>{s.inscriptions?.[0]?.classe?.nom ?? '—'}</TableCell>
        <TableCell className="text-right">
          <Button size="icon" variant="ghost" aria-label="Voir" onClick={() => showDetail(s)}>
            <Eye className="h-4 w-4" />
          </Button>
        </TableCell>
      </TableRow>
    ))}
  </TableBody>
</Table>
```

Bonnes pratiques visibles ici :

- colonnes **alignées à droite** pour les actions et les nombres ;
- `font-mono` pour les identifiants (matricules, reçus) : lisibilité ;
- `colSpan` correct pour les lignes d'état ;
- `aria-label` sur les boutons icônes.

## 9.8 Identité visuelle dynamique

Chaque établissement a une couleur (`couleur_principale`, défaut `#075e54`). Elle est
injectée en variables CSS et utilisée partout :

```tsx
style={{
  '--etab-color': color,
  '--etab-color-hover': darkenHex(color),
  '--etab-color-light': color + '10',
} as React.CSSProperties}
```

```tsx
<div className="bg-[var(--etab-color)] text-white">…</div>
```

Deux couleurs de la charte sont, elles, fixes : le vert profond `#0c241f` (navigation) et
l'ambre `#d97706` (action principale), héritées des couleurs du complexe scolaire.

> 🧠 **Contraste** : `#d97706` sur blanc a un ratio d'environ 3:1 — insuffisant pour du
> texte normal (WCAG AA exige 4.5:1). Utilisez-le en fond avec du texte blanc, ou
> assombrissez-le (`#b45309`). L'accessibilité est une exigence, pas un supplément.

## 9.9 Impression des reçus

L'écran `ReceiptPOS.tsx` produit un reçu destiné à une imprimante thermique ou A4.
Techniques à connaître :

```css
@media print {
  .no-print { display: none !important; }
  .receipt { width: 80mm; font-size: 11px; }
  @page { margin: 5mm; }
}
```

Si le projet n'a pas encore de feuille d'impression dédiée (`globals.css` ne contient que
trois directives), c'est un excellent exercice concret :

> **Exercice 9.2** — Ajoutez une section `@media print` dans `globals.css` :
> masquez `Sidebar`, `header` et les boutons ; forcez le reçu en noir sur blanc ;
> définissez un format 80 mm. Imprimez en PDF depuis la WebView et vérifiez.

## 9.10 Formulaires : shadcn `form` ou `useState` ?

Le dépôt utilise `useState` simple (voir chapitre 8). Pourtant `react-hook-form`, `zod`
et `@hookform/resolvers` sont présents, et `src/components/ui/form.tsx` existe.

| Approche | Avantages | Inconvénients |
|---|---|---|
| `useState` | lisible pour 5 champs, aucune dépendance | répétitif, validation manuelle |
| `react-hook-form` + `zod` | validation schéma, erreurs par champ, perf sur grands formulaires | courbe d'apprentissage, boilerplate |

Recommandation : gardez `useState` pour les petits dialogues ; passez à
`react-hook-form + zod` pour les formulaires longs (élève + tuteur, frais) lors d'une
refonte planifiée. Ne mélangez pas les deux dans un même écran.

## 9.11 Exercices

> **Exercice 9.1** — Introduisez les jetons `brand` / `accent` dans `tailwind.config.js`,
> puis remplacez dans **un** écran (`ElevesPage.tsx`) toutes les occurrences
> `bg-[#0c241f]` et `bg-amber-500` par ces jetons. Vérifiez le rendu.

> **Exercice 9.3** — Créez un composant `StatCard` réutilisable (titre, valeur, icône,
> couleur) et remplacez les cartes dupliquées du tableau de bord. Objectif : une seule
> définition pour six cartes.

> **Exercice 9.4** — Auditez l'accessibilité de l'écran de connexion : tabulation
> complète, `Échap` sur les dialogues, `aria-label` sur les boutons icônes, contraste des
> textes secondaires. Listez trois améliorations concrètes.

## 9.12 À retenir

- Tailwind = utilitaires ; shadcn = code source que vous possédez ; Radix = accessibilité.
- Le projet n'a pas de jetons de thème : c'est une dette à corriger en priorité.
- `cn()` + `cva` = design system cohérent sans CSS global.
- Un bouton icône sans `aria-label` et un dialogue sans titre sont des bugs.
- L'impression d'un reçu se prépare en CSS (`@media print`), pas en JavaScript.


---

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


---

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


---

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


---

# 13. Une commande de bout en bout

Ce chapitre est un guide de réalisation. Objectif : écrire (ou réécrire proprement) une
commande complète, depuis le bouton jusqu'à la ligne SQLite.

Nous prenons `create_paiement`, la commande la plus sensible du projet.

## 13.1 Le cahier des charges

> **Encaisser un paiement** : étant donné un élève, éventuellement une échéance, un
> montant, une devise et un caissier, créer un reçu numéroté, mettre à jour l'échéance,
> journaliser l'opération, renvoyer le reçu complet.

Contraintes métier :

1. l'élève doit exister et être actif dans un établissement actif ;
2. le montant doit être strictement positif ;
3. le reçu doit porter un numéro unique ;
4. l'échéance, si fournie, doit appartenir au même élève ;
5. le montant payé de l'échéance ne doit pas dépasser le dû (ou l'excédent doit être
   signalé) ;
6. l'opération doit être atomique ;
7. elle doit être auditée.

## 13.2 Ce que fait le code actuel

Résumé fidèle de `create_paiement` (`commands/encaissements.rs`) :

```rust
let conn = db.lock()?;
let now = now_iso();
let id = generate_id();
let numero_recu = generate_receipt_number(&conn);

// 1. l'élève existe-t-il ?
if !eleve_exists { return Err(AppError::Validation("L'élève sélectionné n'existe pas…")) }

// 2. établissement valide, sinon repli sur le premier
let etab_id = if etab_existe { etablissement_id } else { premier_etablissement() };

// 3. année valide, sinon année active, sinon n'importe quelle année, sinon création
//    d'une année 2026-2027 codée en dur (!)

// 4. l'élève peut-il payer ? (ACTIF/INSCRIT + établissement actif)
if !peut_payer { return Err(AppError::Validation("Paiement impossible : …")) }

// 5. utilisateur valide, sinon premier utilisateur, sinon "admin"
// 6. échéance valide, sinon None
// 7. INSERT Paiement
// 8. UPDATE Echeance SET montant_paye = montant_paye + montant_affecte
// 9. drop(conn); log_audit(...)
// 10. relecture complète avec jointures → réponse JSON
```

### Ce qui est bien

- les messages d'erreur sont en français et **actionnables** ;
- la validation de l'éligibilité au paiement est faite en SQL ;
- l'audit est écrit après libération du verrou (pas de deadlock) ;
- la réponse renvoie l'objet complet joint (élève, classe, caissier) : le front n'a pas
  besoin d'un second appel.

### Ce qui doit être corrigé

| Problème | Risque | Correction |
|---|---|---|
| pas de transaction | reçu sans mise à jour d'échéance si crash | `conn.transaction()` |
| `montant` non validé (> 0) | reçu de 0 ou négatif | `AppError::Validation` |
| année codée en dur `2026-09-01` | données fausses | refuser l'encaissement sans année |
| repli silencieux sur un autre établissement | paiement imputé au mauvais établissement | erreur explicite |
| échéance non vérifiée comme appartenant à l'élève | imputation croisée | `WHERE id=? AND eleve_id=?` |
| dépassement non contrôlé | solde négatif | comparer `montant_paye + affecte <= du` |
| numéro de reçu non atomique | collision `UNIQUE` | séquence + transaction |

> 🧠 **Repli silencieux = bug garanti.** Quand une donnée obligatoire est invalide,
> l'application doit s'arrêter avec un message clair, pas deviner. Le repli est
> éventuellement acceptable pour l'affichage, jamais pour l'écriture comptable.

## 13.3 La version cible, pas à pas

### Étape 1 — Signature et validation d'entrée

```rust
#[tauri::command]
pub fn create_paiement(
    db: State<'_, DbConn>,
    eleve_id: String,
    echeance_id: Option<String>,
    etablissement_id: String,
    annee_scolaire_id: Option<String>,
    user_id: String,
    motif: String,
    montant: f64,
    devise: String,
    montant_affecte: Option<f64>,
    devise_echeance: Option<String>,
    mode_paiement: String,
    reference_paiement: Option<String>,
    taux_change: Option<f64>,
    montant_original: Option<f64>,
) -> Result<serde_json::Value, AppError> {
    // ── Validation pure (aucune I/O) ──────────────────────────────
    if montant <= 0.0 || !montant.is_finite() {
        return Err(AppError::Validation("Le montant doit être supérieur à zéro.".into()));
    }
    if !["ESPECES", "MOBILE_MONEY", "BANQUE", "CHEQUE"].contains(&mode_paiement.as_str()) {
        return Err(AppError::Validation("Mode de paiement inconnu.".into()));
    }
    let affecte = montant_affecte.unwrap_or(montant);
    if affecte < 0.0 || !affecte.is_finite() {
        return Err(AppError::Validation("Montant affecté invalide.".into()));
    }
    // …
}
```

> 🧠 **Validez d'abord, interrogez ensuite.** Les règles pures (signe, liste de valeurs,
> longueur) ne nécessitent pas la base : elles échouent vite et se testent sans SQLite.

### Étape 2 — Ouvrir une transaction et vérifier les références

```rust
    let mut conn = db.lock()?;
    let tx = conn.transaction()?;
    let now = now_iso();

    let (statut_eleve, etab_eleve): (String, String) = tx.query_row(
        "SELECT e.statut, e.etablissement_id FROM Eleve e WHERE e.id = ?1",
        params![eleve_id], |r| Ok((r.get(0)?, r.get(1)?)),
    ).map_err(|_| AppError::NotFound("Élève introuvable en base locale.".into()))?;

    if !["ACTIF", "INSCRIT"].contains(&statut_eleve.as_str()) {
        return Err(AppError::Validation(format!(
            "L'élève est « {} » : aucun encaissement possible.", statut_eleve)));
    }
    if etab_eleve != etablissement_id {
        return Err(AppError::Validation(
            "L'établissement du paiement ne correspond pas à celui de l'élève.".into()));
    }
```

### Étape 3 — Échéance et contrôle de dépassement

```rust
    let mut echeance: Option<(String, f64, f64)> = None;   // (id, dû, payé)
    if let Some(ref eid) = echeance_id {
        echeance = Some(tx.query_row(
            "SELECT id, montant_du, montant_paye FROM Echeance
             WHERE id = ?1 AND eleve_id = ?2",
            params![eid, eleve_id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        ).map_err(|_| AppError::Validation(
            "Échéance introuvable ou n'appartenant pas à cet élève.".into()))?);
    }

    if let Some((_, du, paye)) = &echeance {
        let nouveau = paye + affecte;
        if nouveau > du + 0.01 {
            return Err(AppError::Validation(format!(
                "Le paiement dépasse le solde : dû {:.0}, déjà payé {:.0}, reste {:.0}.",
                du, paye, du - paye)));
        }
    }
```

### Étape 4 — Numéro de reçu sous transaction

```rust
    let jour = chrono::Local::now().format("%Y%m%d").to_string();
    let seq: i64 = tx.query_row(
        "SELECT COALESCE(MAX(CAST(substr(numero_recu, -4) AS INTEGER)), 0) + 1
         FROM Paiement WHERE numero_recu LIKE ?1",
        params![format!("REC-{}-%", jour)], |r| r.get(0),
    )?;
    let numero_recu = format!("REC-{}-{:04}", jour, seq);
```

Sous transaction, deux caissiers sur la même installation ne peuvent pas obtenir le même
numéro. (Sur deux installations distinctes, la synchronisation devra réconcilier :
exercice 17.4.)

### Étape 5 — Écritures

```rust
    let id = generate_id();
    tx.execute(
        "INSERT INTO Paiement (id, numero_recu, eleve_id, echeance_id, etablissement_id,
                               annee_scolaire_id, user_id, motif, montant, devise,
                               montant_affecte, devise_echeance, mode_paiement,
                               reference_paiement, taux_change, montant_original,
                               annule, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, 0, ?17, ?17)",
        params![id, numero_recu, eleve_id, echeance.as_ref().map(|e| &e.0),
                etablissement_id, annee_scolaire_id, user_id, motif, montant, devise,
                affecte, devise_echeance.unwrap_or_else(|| devise.clone()),
                mode_paiement, reference_paiement, taux_change, montant_original, now],
    )?;

    if let Some((eid, du, paye)) = &echeance {
        let nouveau = paye + affecte;
        let (statut, date_complete) = if nouveau >= du - 0.01 {
            ("PAYE", Some(now.clone()))
        } else {
            ("PARTIELLEMENT_PAYE", None)
        };
        tx.execute(
            "UPDATE Echeance SET montant_paye = ?1, statut = ?2,
                    date_paiement_complet = COALESCE(?3, date_paiement_complet),
                    updated_at = ?4
             WHERE id = ?5",
            params![nouveau, statut, date_complete, now, eid],
        )?;
    }

    tx.commit()?;
```

> 🧠 **Pourquoi `>= du - 0.01` ?** Parce que les montants sont des `f64` : `0.1 + 0.2`
> ne vaut pas exactement `0.3`. Une tolérance de un centième évite les faux « partiel ».
> Le chapitre 14 traite ce sujet à fond.

### Étape 6 — Audit et réponse

```rust
    drop(conn);
    log_audit(&db, Some(&user_id), "CREATE", "paiement", Some(&id),
              Some(&format!("reçu={}, montant={} {}", numero_recu, montant, devise)));

    let conn = db.lock()?;
    let recu = fetch_recu_json(&conn, &id)?;
    Ok(api_response(Ok(recu)))
```

## 13.4 Côté front

```ts
// src/lib/tauri-commands.ts
export async function createPaiement(data: {
  eleveId: string; echeanceId?: string; etablissementId: string
  anneeScolaireId?: string; userId: string; motif: string
  montant: number; devise: string; montantAffecte?: number
  deviseEcheance?: string; modePaiement: string
  referencePaiement?: string; tauxChange?: number; montantOriginal?: number
}) {
  return cmd('create_paiement', {
    eleveId: data.eleveId,
    echeanceId: data.echeanceId ?? null,
    etablissementId: data.etablissementId,
    anneeScolaireId: data.anneeScolaireId ?? null,
    userId: data.userId,
    motif: data.motif,
    montant: data.montant,
    devise: data.devise,
    montantAffecte: data.montantAffecte ?? null,
    deviseEcheance: data.deviseEcheance ?? null,
    modePaiement: data.modePaiement,
    referencePaiement: data.referencePaiement ?? null,
    tauxChange: data.tauxChange ?? null,
    montantOriginal: data.montantOriginal ?? null,
  })
}
```

Dans l'écran : désactiver le bouton, appeler, afficher le reçu, vider le formulaire,
recharger la liste. En cas d'erreur : conserver la saisie (ne jamais vider un formulaire
sur échec — le caissier devrait tout retaper).

## 13.5 Tester la commande à la main

```bash
# 1. lancer en mode bureau
bun run tauri dev

# 2. dans la console du WebView (Ctrl+Shift+I)
await window.__TAURI_INTERNALS__.invoke('create_paiement', {
  eleveId: 'ID-EXISTANT', echeanceId: null, etablissementId: 'ID-ETAB',
  anneeScolaireId: null, userId: 'ID-USER', motif: 'Test manuel',
  montant: 1000, devise: 'BIF', montantAffecte: null, deviseEcheance: null,
  modePaiement: 'ESPECES', referencePaiement: null, tauxChange: null, montantOriginal: null
})
```

Puis vérifier en base :

```sql
SELECT numero_recu, montant, montant_affecte, devise, annule FROM Paiement ORDER BY created_at DESC LIMIT 1;
SELECT montant_du, montant_paye, statut FROM Echeance WHERE id = '…';
SELECT action, entite, details FROM AuditLog ORDER BY created_at DESC LIMIT 3;
```

> 🧠 **Test en trois temps** : réponse API, ligne métier, journal d'audit. Si les trois
> concordent, la commande est réellement correcte.

## 13.6 Exercices

> **Exercice 13.1** — Implémentez la commande manquante `create_echeances_bulk(frais_scolaire_id, annee_scolaire_id, eleve_ids)`
> qui crée une échéance pour chaque élève d'une classe concernée par le frais.
> Contraintes : transaction, `INSERT OR IGNORE` (à cause de `UNIQUE`), audit, retour du
> nombre créé. Enregistrez-la dans `lib.rs` et testez depuis `FraisPage.tsx`.

> **Exercice 13.2** — Ajoutez la validation du mode de paiement côté Rust **et** un
> `Select` fermé côté front. Pourquoi les deux sont-ils nécessaires ?

> **Exercice 13.3** — Transformez `create_eleve` en transaction. Provoquez une erreur au
> milieu (tuteur sans nom) et vérifiez qu'aucun élève n'est créé.

> **Exercice 13.4** — Remplacez `generate_receipt_number` par la version transactionnelle
> du §13.3, et ajoutez un test unitaire qui simule 100 encaissements et vérifie l'unicité.

> **Exercice 13.5** — Refusez un paiement sur une échéance déjà `PAYE`. Rédigez le message
> d'erreur en français, avec le reste à payer. Testez le cas « paiement partiel puis
> second paiement soldant ».

## 13.7 À retenir

- Valider d'abord les règles pures, puis interroger la base.
- Jamais de repli silencieux sur une écriture comptable.
- Une transaction pour le reçu + l'échéance + la séquence de numérotation.
- L'audit se fait **après** `drop(conn)`.
- Une réponse riche (jointures) évite un second aller-retour au front.
- Testez trois niveaux : réponse, base, audit.


---

# 14. Argent, devises et arrondis

C'est le chapitre qui distingue un logiciel amateur d'un logiciel professionnel. Une école
burundaise encaisse en francs burundais (BIF), parfois en francs congolais (CDF), parfois
en dollars (USD). Les frais peuvent être libellés dans une devise et payés dans une autre.

## 14.1 Le piège des nombres à virgule flottante

En JavaScript **et** en Rust, `f64` est un binaire à virgule flottante :

```js
0.1 + 0.2            // 0.30000000000000004
(1.005).toFixed(2)   // "1.00"  ← arrondi faux
0.1 * 3 === 0.3      // false
```

En comptabilité, ces écarts s'accumulent et deviennent visibles sur un reçu.

Trois stratégies :

| Stratégie | Précision | Effort | Usage |
|---|---|---|---|
| `f64` + tolérance (0,01) | acceptable | faible | état actuel du projet |
| entiers (centimes) | exacte | moyen | recommandé à terme |
| `decimal` (bigdecimal) | exacte | élevé | banques |

> 🧠 **Le BIF n'a pas de centimes** en pratique : les montants sont des entiers. Cette
> particularité sauve le projet… tant que personne ne saisit de décimales.

## 14.2 L'état actuel du code

### Côté Rust

```rust
// src-tauri/src/utils/currency.rs
pub fn format_money(amount: f64, devise: &str) -> String {
    match devise {
        "BIF" => format!("{} FBu", fmt_fr(amount as i64)),
        "CDF" => format!("{} CDF", fmt_fr(amount as i64)),
        "USD" | _ => format!("${:.2}", amount),
    }
}
```

### Côté TypeScript

```ts
// src/lib/utils.ts
export function formatMoney(amount: number | string | null | undefined, devise = 'CDF'): string {
  const value = Number(amount || 0)
  if (devise === 'BIF') return `${value.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} FBu`
  if (devise === 'CDF') return `${value.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} CDF`
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: devise === 'USD' ? 'USD' : devise,
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(value)
}
```

> ⚠️ **Deux implémentations = deux vérités.** Le reçu imprimé (Rust ou JS ?) et l'écran
> peuvent diverger. En pratique le projet a surtout besoin de la version TypeScript pour
> l'affichage, la version Rust servant aux rapports texte. Décidez **une** source de
> vérité : le front pour l'affichage, le back pour les calculs.

### Les entiers trompeurs

```rust
amount as i64
```

Un montant de `150000.75` BIF devient `150000` (troncature, pas arrondi). Un montant
négatif `-0.4` devient `0`. Pour des francs entiers, c'est acceptable ; documentez-le.

## 14.3 Le modèle multi-devises du projet

Quatre montants coexistent sur un paiement :

| Champ | Sens | Exemple |
|---|---|---|
| `montant` | ce qui est physiquement remis | 72 500 BIF |
| `devise` | la devise remise | BIF |
| `montant_affecte` | ce qui est imputé à l'échéance | 25 USD |
| `devise_echeance` | devise de l'échéance | USD |
| `taux_change` | taux appliqué | 2 900 |
| `montant_original` | montant d'origine saisi | 25 |

```text
Parent paie 25 USD en francs burundais au taux de 2 900 :
  montant = 72 500 BIF          (ce qui entre en caisse)
  devise  = BIF
  montant_affecte = 25          (ce qui solde l'échéance)
  devise_echeance = USD
  taux_change = 2900
  montant_original = 25
```

> 🧠 **Deux questions différentes** : « combien d'argent est entré dans la caisse ? » et
> « combien de dette est éteinte ? ». Un bon logiciel de caisse répond aux deux, séparément.

### Calculer un montant affecté

```rust
fn convertir(montant: f64, taux: f64) -> Result<f64, AppError> {
    if !taux.is_finite() || taux <= 0.0 {
        return Err(AppError::Validation("Taux de change invalide.".into()));
    }
    // Arrondi métier : 2 décimales pour les devises fractionnaires
    Ok((montant / taux * 100.0).round() / 100.0)
}
```

Et côté saisie : afficher le taux utilisé, le montant converti, et demander confirmation.
Un caissier doit voir ce qu'il valide.

## 14.4 Ne jamais additionner des devises différentes

Le tableau de bord et les rapports sont exemplaires sur ce point :

```rust
/* ── Bénéfice par devise ────────────────────────────────────────
 * Soustraction faite devise par devise : jamais entre devises.
 * ─────────────────────────────────────────────────────────────*/
let mut benefice_par_devise: BTreeMap<String, (f64, i64)> = BTreeMap::new();
```

et dans les rapports :

```rust
/* ── Soldes : soustraction faite DANS chaque devise ────────────────── */
for m in &encaissements { acc.entry(m.devise.clone()).or_insert((0.0, 0.0)).0 += m.total; }
for m in &depenses     { acc.entry(m.devise.clone()).or_insert((0.0, 0.0)).1 += m.total; }
```

> ⚠️ **Anti-patron à bannir** : `total = sum(encaissements) - sum(depenses)` toutes
> devises confondues. Cela revient à additionner des mètres et des kilogrammes.

Si un total consolidé est indispensable à l'affichage, convertissez **explicitement** avec
un taux daté et affichez la mention « équivalent USD au taux du … ».

## 14.5 Arrondis : où et comment

Trois moments d'arrondi :

1. **à la saisie** — on accepte ce que le caissier tape, avec deux décimales maximum ;
2. **au calcul** (conversion) — arrondi au centime ;
3. **à l'affichage** — `maximumFractionDigits` selon la devise.

Règles pratiques :

```ts
// Arrondi « banquier » évite les biais statistiques sur de gros volumes
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}
```

et en Rust :

```rust
let arrondi = (montant * 100.0).round() / 100.0;
```

> 🧠 Gardez **toujours** la valeur non arrondie en base et arrondissez à l'affichage :
> arrondir puis re-arrondir crée des écarts de caisse.

### La tolérance du projet

```rust
let nouveau = paye + affecte;
if nouveau > du + 0.01 { /* dépassement */ }
```

`0.01` est une tolérance, pas une égalité. Justifiez-la en commentaire.

## 14.6 Cas pratiques à traiter correctement

### Cas 1 — Paiement partiel

Dû 150 000, payé 50 000 → `montant_paye = 50000`, statut `PARTIELLEMENT_PAYE`.
Le reçu indique « Reste à payer : 100 000 BIF ». **Le reçu doit porter cette mention** :
c'est ce qui évite les contestations.

### Cas 2 — Trop-perçu

Un parent paie 160 000 pour 150 000. Deux politiques possibles :

- **refuser** (le plus simple, le plus sûr) ;
- **accepter et créditer** (nécessite un champ d'avoir ou de crédit élève).

Le code actuel ne contrôle pas : c'est un bug (exercice 14.3). Si vous choisissez le
crédit, créez une table `CreditEleve` et imputez-le lors du prochain frais.

### Cas 3 — Annulation

Annuler un paiement doit **décrémenter** l'échéance :

```rust
"UPDATE Echeance SET montant_paye = MAX(0, montant_paye - ?), updated_at = ? WHERE id = ?"
```

Le `MAX(0, …)` protège contre un solde négatif si les données sont incohérentes.

### Cas 4 — Changement de taux en cours d'année

Le taux `ParametreEtablissement.taux_change_usd_bif` peut évoluer. Ne recalculez pas les
paiements passés : chaque paiement stocke **son** taux (`taux_change`). C'est la bonne
pratique comptable : un historique ne se réécrit pas.

## 14.7 Exercices

> **Exercice 14.1** — Écrivez `src/lib/money.ts` avec `toMinorUnits(amount, devise)` et
> `fromMinorUnits(minor, devise)`, puis testez :
> `toMinorUnits(150000.75, 'BIF') === 150001` (arrondi, pas troncature).

> **Exercice 14.2** — Le tableau de bord affiche-t-il un « bénéfice total » toutes devises
> confondues ? Vérifiez dans `dashboard.rs`. Si oui, corrigez en affichant une ligne par
> devise (le code semble déjà correct : prouvez-le par lecture).

> **Exercice 14.3** — Ajoutez dans `create_paiement` le contrôle de dépassement du §13.3,
> avec un message indiquant le reste exact. Testez : dû 150 000, paiement 160 000 →
> refus ; puis dû 150 000, paiements 100 000 + 50 000 → succès.

> **Exercice 14.4** — Un frais est en USD, l'école tient sa caisse en BIF. Écrivez la
> procédure (3 étapes) qu'un caissier doit suivre, puis implémentez l'affichage du reçu :
> montant remis, taux, montant imputé. Faites valider par un test manuel.

> **Exercice 14.5** — Refactorisez `formatMoney` pour accepter `Intl.NumberFormat` avec
> un cache (`Map<devise, Intl.NumberFormat>`). Pourquoi est-ce important dans un tableau
> de 200 lignes ? (Indice : coût de construction d'un formateur.)

## 14.8 À retenir

- `f64` ne représente pas exactement les décimales : tolérance et arrondis explicites.
- Le montant **encaissé** et le montant **imputé** sont deux informations distinctes.
- On ne soustrait jamais des devises différentes.
- Chaque paiement conserve son taux de change : l'historique est immuable.
- Une seule implémentation de formatage par couche, et des tests sur les cas limites.


---

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


---

# 16. Tableau de bord et rapports

## 16.1 À quoi sert un tableau de bord ?

Un directeur ne lit pas des tables. Il veut trois réponses en dix secondes :

1. **Combien d'élèves** ai-je cette année ?
2. **Combien d'argent** est entré, combien est sorti ?
3. **Qui doit payer**, et depuis quand ?

Le tableau de bord est donc une **traduction** de la base en indicateurs. Chaque chiffre
doit être défendable : si le directeur conteste, vous devez savoir quelle requête l'a
produit.

## 16.2 Les indicateurs du projet

`get_dashboard_stats(etablissement_id, annee_scolaire_id)` renvoie notamment :

| Indicateur | Source SQL |
|---|---|
| encaissements par devise | `SUM(Paiement.montant)` où `annule = 0` |
| dépenses par devise | `SUM(Depense.montant)` |
| bénéfice par devise | encaissements − dépenses **par devise** |
| nombre d'élèves | `COUNT(Eleve)` sur la population payeuse active |
| répartition par école | `GROUP BY etablissement_id` |
| dette par devise | échéances (dû − payé), avec repli sur les frais |
| top des retardataires | `reste_par_eleve` trié |

### Un exemple de requête

```sql
SELECT COALESCE(p.devise, 'CDF') AS dev, COALESCE(SUM(p.montant), 0), COUNT(*)
FROM Paiement p
WHERE p.etablissement_id = ?1 AND p.annee_scolaire_id = ?2
  AND COALESCE(p.annule, 0) = 0
GROUP BY dev
ORDER BY 2 DESC;
```

Trois finesses :

- `COALESCE(p.devise, 'CDF')` : une ancienne ligne sans devise ne casse pas le groupe ;
- `COALESCE(p.annule, 0) = 0` : robuste aux `NULL` historiques ;
- `COUNT(*)` : le nombre de reçus, utile pour calculer un panier moyen.

## 16.3 La dette : le calcul le plus délicat

Le commentaire du code est explicite :

```text
/* ── Dette par devise ───────────────────────────────────────────
 * Agrégation en trois passes :
 *   A. échéances matérialisées, devise du frais
 *   B. repli FraisScolaire pour les élèves sans échéance
 *   C. correction si Paiement montre plus que Echeance.montant_paye
 * ─────────────────────────────────────────────────────────────*/
```

Pourquoi trois passes ?

- **A** — normalement, chaque élève a une échéance par frais. On somme `du - paye`.
- **B** — certains élèves n'ont pas d'échéance (frais créé après leur inscription). Sans
  repli, ils apparaîtraient comme « à jour » alors qu'ils doivent de l'argent.
- **C** — des paiements globaux (sans `echeance_id`) ne sont pas reflétés dans
  `Echeance.montant_paye`. Il faut les imputer pour ne pas surestimer la dette.

> 🧠 **Un indicateur faux est pire qu'un indicateur absent.** Si le tableau de bord
> annonce 4 000 000 BIF de dette alors que la réalité est 6 000 000, le directeur prend de
> mauvaises décisions. Documentez toujours la méthode de calcul à l'écran (petit « i »).

## 16.4 Une écriture dans une lecture

Voici un fait à connaître :

```rust
// list_echeances (lecture !)
let _ = conn.execute(
    "UPDATE Echeance SET montant_paye = COALESCE((SELECT SUM(COALESCE(p.montant_affecte, p.montant))
     FROM Paiement p WHERE p.echeance_id = Echeance.id AND COALESCE(p.annule, 0) = 0), 0)
     WHERE EXISTS (SELECT 1 FROM Paiement p WHERE p.echeance_id = Echeance.id)",
    [],
);
```

À chaque affichage de la liste des échéances, le code **recalcule** `montant_paye` à
partir des paiements réels. C'est une « auto-réparation ».

| Avantage | Inconvénient |
|---|---|
| corrige les dérives d'écriture | une lecture modifie la base (surprise) |
| pas de migration nécessaire | coût à chaque affichage |
| | masque la cause réelle des dérives |

> 🔧 **Meilleure solution** : recalculer dans une commande dédiée
> (`recalculate_echeances`), l'appeler après une synchronisation, et rendre la lecture
> pure. Les bugs d'écriture doivent être corrigés, pas compensés.

## 16.5 Les rapports

Trois commandes, trois usages :

### `get_rapport_financier(etablissement_id, annee_scolaire_id)`

Séries mensuelles :

```sql
SELECT strftime('%Y-%m', p.created_at) AS mois, {devise} AS devise, SUM(p.montant)
FROM Paiement p
LEFT JOIN AnneeScolaire ans ON ans.id = p.annee_scolaire_id
WHERE (?1 = 'ALL' OR p.etablissement_id = ?1)
  AND (p.annee_scolaire_id = ?2 OR ans.libelle = ?2)
  AND COALESCE(p.annule, 0) = 0
GROUP BY mois, devise
ORDER BY mois, devise;
```

Noter le `?1 = 'ALL'` : une **pseudo-valeur** conventionnelle pour « toutes les écoles ».
C'est pratique mais fragile (que faire si un identifiant vaut `ALL` ?). Préférez
`Option<String>`.

Noter aussi `p.annee_scolaire_id = ?2 OR ans.libelle = ?2` : l'utilisateur peut filtrer
par identifiant **ou** par libellé (« 2025-2026 »). Souplesse utile en pratique.

### `get_rapport_eleves(...)`

Que des comptages : effectifs par classe, par sexe, par statut. Aucune devise. C'est ce
qui permet de produire un état « statistiques scolaires » officiel.

### `get_rapport_journalier(...)`

La caisse du jour : reçus, montants, modes de paiement, caissier. C'est le document de
clôture.

> 🧠 **Un rapport doit être reproductible** : mêmes filtres, mêmes chiffres, même
> résultat demain. Évitez `NOW()` dans un calcul métier, préférez une date passée en
> paramètre.

## 16.6 Afficher : graphiques et exports

Le projet embarque `recharts` (graphiques) et `xlsx` (export tableur).

```tsx
<ResponsiveContainer width="100%" height={300}>
  <BarChart data={data}>
    <CartesianGrid strokeDasharray="3 3" />
    <XAxis dataKey="mois" />
    <YAxis />
    <Tooltip formatter={(v: number) => formatMoney(v, devise)} />
    <Bar dataKey="total" fill="var(--etab-color)" radius={[6, 6, 0, 0]} />
  </BarChart>
</ResponsiveContainer>
```

Bonnes pratiques de visualisation :

1. **toujours nommer la devise** dans le titre ou l'axe ;
2. pas plus de 2 séries par graphique ;
3. une table de données sous le graphique pour les utilisateurs qui impriment ;
4. jamais de camembert à 12 parts.

Export Excel :

```ts
import * as XLSX from 'xlsx'

const feuille = XLSX.utils.json_to_sheet(lignes)
const classeur = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(classeur, feuille, 'Rapport')
XLSX.writeFile(classeur, `rapport-${annee}.xlsx`)
```

> ⚠️ Dans une WebView Tauri, le téléchargement de fichier peut être bloqué selon la
> plateforme. Vérifiez sur Windows **et** Linux, ou écrivez le fichier via une commande
> Rust (`std::fs::write`) dans `Documents`.

## 16.7 Performance : quand le tableau de bord ralentit

Avec 2 000 élèves et 20 000 paiements, les agrégations restent rapides **si** les index
existent. Sinon :

```sql
EXPLAIN QUERY PLAN
SELECT SUM(montant) FROM Paiement WHERE etablissement_id = 'x' AND annee_scolaire_id = 'y';
-- SCAN Paiement  ← mauvais signe
-- SEARCH Paiement USING INDEX idx_paiement_etab_date  ← bon
```

Trois leviers :

1. **index composites** adaptés aux filtres réels ;
2. **requêtes pré-agrégées** (table `StatistiqueMensuelle` recalculée la nuit) ;
3. **limiter le calcul** à l'année sélectionnée (jamais « tout l'historique » par défaut).

> **Exercice 16.4** — Mesurez le temps de `get_dashboard_stats` avec 50 000 paiements
> générés par script. Identifiez la requête la plus lente, ajoutez l'index, re-mesurez.

## 16.8 Exercices

> **Exercice 16.1** — Ajoutez au tableau de bord un indicateur « taux de recouvrement »
> = encaissé / dû, par devise. Affichez-le en pourcentage avec une couleur
> (rouge < 50 %, orange < 80 %, vert sinon). Documentez la formule dans une infobulle.

> **Exercice 16.2** — Rendez la lecture d'échéances pure : créez
> `recalculate_echeances(etablissement_id, annee_scolaire_id)`, appelez-la après
> `sync_pull` et après `annuler_paiement`, retirez l'`UPDATE` de `list_echeances`.

> **Exercice 16.3** — Dans `get_rapport_financier`, remplacez la pseudo-valeur `'ALL'`
> par un `Option<String>` et adaptez le front. Justifiez en trois lignes.

> **Exercice 16.5** — Ajoutez un rapport « élèves à risque » : élèves dont le reste dû
> dépasse 50 % du total et dont la dernière échéance est dépassée depuis plus de 30 jours.
> Exportez-le en Excel.

## 16.9 À retenir

- Un indicateur doit être explicable ; documentez la formule à l'écran.
- Les agrégations se font par devise, jamais toutes devises confondues.
- La dette nécessite plusieurs passes : échéances, repli sur les frais, correction des
  paiements globaux.
- Une lecture ne doit pas écrire ; isolez les recalculs.
- Index composites et filtrage par année sont les deux clés de la performance.


---

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


---

# 18. Déboguer la synchronisation

La synchronisation est la partie du logiciel qui échoue le plus souvent — et la plus
difficile à diagnostiquer, parce qu'elle mêle réseau, base locale, cloud, dépendances et
droits. Ce chapitre est un **manuel d'intervention**, à garder ouvert.

## 18.1 La méthode en cinq minutes

```text
1. Le statut      → Paramètres → Synchronisation → « Vérifier le statut »
2. La validation  → validate_sync_ready : quelles alertes ?
3. Le réseau      → la machine atteint-elle Supabase ?
4. La dernière erreur → logs (stderr) + message affiché
5. La donnée      → la ligne est-elle vraiment là, en local ? dans le cloud ?
```

> 🧠 **Ne relancez jamais une synchronisation en boucle sans avoir lu l'erreur.** Vous
> risquez de créer des doublons ou de saturer l'API (429).

## 18.2 Étape 1 — Le statut

```rust
#[tauri::command]
pub fn sync_status(db: State<'_, DbConn>) -> Result<Value, AppError> {
    // configured = URL non vide ET clé non vide
    // last_sync  = ConfigSysteme['LAST_SYNC']
}
```

Interprétation :

| Affichage | Signification | Action |
|---|---|---|
| `configured: false` | URL ou clé absente | Paramètres → Synchronisation |
| `last_sync: null` / « Jamais » | jamais synchronisé | première sync, prévoir du temps |
| `last_sync` très ancien | sync interrompue | lire les logs, valider |

## 18.3 Étape 2 — La validation préalable

`validate_sync_ready` produit une liste `issues`. Chaque message est une piste :

| Message | Cause | Correction |
|---|---|---|
| « Configuration Supabase incomplète » | URL/clé vide | ressaisir |
| « Table manquante : X » | base locale ancienne | relancer l'appli (le schéma se crée), sinon restaurer |
| « Aucune donnée locale » | base vide | créer école + année + élève |
| « échéances référencent des élèves ou frais inexistants » | orphelins | `clean` / réparation |
| « matricules dupliqués » | import sauvage | fusionner avant de pousser |
| « paiements orphelins » | suppression incohérente | annuler plutôt que supprimer |

> 🔧 Exécutez ces vérifications **avant** chaque synchronisation automatique : un
> `validate_sync_ready` en amont éviterait bien des erreurs 409.

## 18.4 Étape 3 — Tester le réseau sans l'application

```bash
# 1. la résolution et le certificat
curl -sS -o /dev/null -w "%{http_code}\n" https://xxxxx.supabase.co/rest/v1/

# 2. l'authentification et la table
curl -sS "https://xxxxx.supabase.co/rest/v1/Etablissement?select=id&limit=1" \
  -H "apikey: VOTRE_CLE" -H "Authorization: Bearer VOTRE_CLE"

# 3. l'écriture (test isolé, à supprimer ensuite)
curl -sS -X POST "https://xxxxx.supabase.co/rest/v1/ConfigSysteme?on_conflict=id" \
  -H "apikey: VOTRE_CLE" -H "Authorization: Bearer VOTRE_CLE" \
  -H "Content-Type: application/json" -H "Prefer: resolution=merge-duplicates" \
  -d '[{"id":"test-1","cle":"TEST","valeur":"ok"}]'
```

Codes HTTP et significations :

| Code | Signification | Piste |
|---|---|---|
| `200` / `206` | OK | — |
| `401` | clé invalide/expirée | régénérer la clé |
| `403` | RLS refuse | politique Supabase |
| `404` | table absente | exécuter `supabase_schema.sql` |
| `406` | `Accept`/colonnes incompatibles | vérifier les colonnes |
| `409` | conflit d'unicité | `on_conflict` incorrect |
| `413` | lot trop gros | réduire `push_batch_size` |
| `416` | plage `Range` invalide | normal : fin de pagination |
| `429` | trop de requêtes | attendre ; le code retente |
| `500+` | erreur serveur | retenter, consulter les logs Supabase |

## 18.5 Étape 4 — Lire les logs

Le moteur écrit sur `stderr` :

```rust
eprintln!("[SYNC] Récupéré {} élèves depuis le serveur", total_pulled);
eprintln!("[SYNC] Corrigé {} AuditLog avec user_id invalide", count);
```

Ils apparaissent dans le terminal qui a lancé `bun run tauri dev`. En production, ces
messages sont perdus : **ajoutez une journalisation persistante** (table `SyncLog` déjà
présente dans le schéma, exercice 17.3).

## 18.6 Les incidents typiques

### « Foreign key constraint violated »

```text
Cause : une ligne enfant (Paiement) référence un parent (Eleve) absent du cloud.
```

Le moteur tente de pousser le parent (`repair_missing_remote_parents`). Si cela échoue :

```sql
-- identifier les orphelins locaux
SELECT p.id, p.eleve_id FROM Paiement p
LEFT JOIN Eleve e ON e.id = p.eleve_id WHERE e.id IS NULL;
```

Correction : soit créer/synchroniser l'élève, soit réaffecter le paiement, soit archiver
la ligne.

### « UNIQUE constraint failed: Paiement.numero_recu »

```text
Cause : deux caisses ont produit le même numéro de reçu.
```

Vérifier :

```sql
SELECT numero_recu, COUNT(*) FROM Paiement GROUP BY numero_recu HAVING COUNT(*) > 1;
```

Correction : renommer le doublon local (avec audit) ou centraliser la numérotation.

### « Sync réussie mais rien n'est poussé »

Trois causes possibles :

1. `LAST_SYNC` est à jour et le pull ramène les mêmes lignes (normal) ;
2. les lignes sont **filtrées comme orphelines** (`filter_orphan_rows`) ;
3. les écritures ont eu lieu **après** le démarrage de la synchronisation.

Diagnostic :

```sql
SELECT cle, valeur FROM ConfigSysteme WHERE cle = 'LAST_SYNC';
```

et dans Supabase : `SELECT count(*) FROM "Paiement";`

### « La synchronisation prend 10 minutes »

Le pull rapatrie **toutes** les tables, page par page. Avec 50 000 paiements, cela fait
50 requêtes rien que pour cette table. Solutions : filtre `updated_at`, index côté
Supabase, et une politique de purge des vieilles années.

### « Hors ligne — données en attente » persistant

L'indicateur (`syncState === 'offline'`) reste affiché après une erreur. Vérifiez
`navigator.onLine`, puis le statut réel. L'erreur est volontairement silencieuse côté
interface : bonne idée pour ne pas inquiéter, mauvaise idée pour diagnostiquer.

## 18.7 Réinitialiser la synchronisation

Quand tout est bloqué et que vous avez une sauvegarde :

```sql
-- ⚠️ À faire uniquement sur une copie de sauvegarde
DELETE FROM ConfigSysteme WHERE cle = 'LAST_SYNC';
```

La prochaine synchronisation repart de `1970-01-01` : **tout** sera re-téléchargé et
re-poussé. Sur une grosse base, prévoyez plusieurs minutes et surveillez les doublons.

> ⚠️ **Avant toute manipulation** :
> ```bash
> sqlite3 ~/SGFS-ME/data/sgfs.db ".backup '/tmp/avant-reset.db'"
> ```

## 18.8 Un mode « simulation » utile

Pour tester sans réseau réel, ajoutez un drapeau dans `ConfigSysteme` :

```rust
let dry_run = conn.query_row(
    "SELECT valeur FROM ConfigSysteme WHERE cle = 'SYNC_DRY_RUN'", [],
    |r| r.get::<_, String>(0)).unwrap_or_else(|_| "false".into()) == "true";
```

Le moteur compte les lignes à envoyer sans les envoyer. Indispensable pour valider un
correctif sur une base de production **sans** écrire dans le cloud.

## 18.9 Exercices

> **Exercice 18.1** — Reproduisez un échec contrôlé : mettez une clé Supabase invalide,
> lancez la synchronisation, notez le message exact affiché et le code HTTP observé. Puis
> corrigez et documentez la procédure en cinq lignes.

> **Exercice 18.2** — Ajoutez une écriture dans `SyncLog` au début et à la fin de
> `run_bidirectional_sync` (table, poussés, tirés, durée, statut). Affichez les 20
> dernières entrées dans un panneau « Diagnostic ».

> **Exercice 18.3** — Implémentez le mode `SYNC_DRY_RUN`. Comparez le rapport simulé et
> le rapport réel sur la même base : quelles différences ? Pourquoi ?

> **Exercice 18.4** — Écrivez un script `tools/check_sync_rows.py` (le dépôt en contient
> un exemple) qui compare les compteurs locaux et distants table par table, et affiche un
> tableau. C'est l'outil que vous voudrez avoir le jour de l'incident.

## 18.10 À retenir

- Statut → validation → réseau → logs → données : toujours dans cet ordre.
- Les codes HTTP racontent l'histoire mieux que les messages de l'interface.
- Sauvegarder avant toute manipulation de `LAST_SYNC`.
- Un mode simulation est un investissement, pas un luxe.
- Persistez les logs de synchronisation : en production, le terminal n'existe plus.


---

# 19. Tests et qualité

## 19.1 Le constat honnête

Le dépôt ne contient **aucun test automatisé**. Pas de `#[cfg(test)]`, pas de
`*.test.ts`, pas de dossier `e2e/`. La commande `bun run lint` existe, mais elle ne
vérifie ni les types ni le comportement.

Conséquence directe : chaque modification d'une commande Rust (par exemple
`create_paiement`) nécessite un test manuel complet — et l'oubli d'un cas limite se paie
en production.

Ce chapitre donne un plan de tests **réaliste**, réalisable en quelques heures, qui
apporte 80 % de la valeur.

## 19.2 La pyramide adaptée au projet

```text
                 ▲  Tests manuels structurés (checklists)
                ╱ ╲
               ╱   ╲  Tests d'intégration Rust (SQLite en mémoire)
              ╱─────╲
             ╱       ╲ Tests unitaires (validation, monnaie, dates, ids)
            ╱─────────╲
```

Pour un logiciel de bureau mono-utilisateur, l'effort optimal est :

1. beaucoup de tests unitaires **purs** (rapides, sans base) ;
2. une dizaine de tests d'intégration SQLite (schéma réel, `:memory:`) ;
3. une checklist manuelle pour les parcours complets (encaissement, impression, sync).

## 19.3 Tests unitaires Rust

### Structure

```rust
// à la fin d'un fichier, ou dans tests/ pour l'intégration
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn montant_negatif_refuse() {
        let err = valider_montant(-100.0).unwrap_err();
        assert!(err.to_string().contains("supérieur à zéro"));
    }

    #[test]
    fn conversion_usd_bif_arrondit_au_centieme() {
        assert_eq!(convertir(72_500.0, 2_900.0), 25.0);
        assert_eq!(convertir(72_499.0, 2_900.0), 25.0);   // arrondi
    }
}
```

Lancement :

```bash
cd src-tauri
cargo test
```

### Que tester en priorité ?

| Cible | Exemples de cas |
|---|---|
| `format_money` / `fmt_fr` | 0, 999, 1 000, 1 234 567, négatif |
| `parse_date` | ISO, RFC3339, `24/10/2026`, chaîne invalide |
| `generate_matricule` | premier élève, dixième, changement d'année |
| validation de paiement | montant 0, négatif, NaN, `f64::INFINITY` |
| statut d'échéance | 0 payé, partiel, exact, trop-perçu |
| `isCoordinateur` | `null`, `''`, `'admin'`, `'SECRETAIRE_PRIMAIRE'` |

> 🧠 Testez **les cas limites, pas les cas nominaux**. Un test qui vérifie que 2 + 2 = 4
> ne protège de rien ; un test qui vérifie qu'un montant nul est refusé protège de la
> perte de recette.

### Exemple complet : statut d'échéance

```rust
#[derive(Debug, PartialEq)]
enum Etat { Paye, Partiel, EnAttente }

fn etat(du: f64, paye: f64) -> Etat {
    if du <= 0.0 { return Etat::Paye }
    if paye >= du - 0.01 { Etat::Paye }
    else if paye <= 0.0 { Etat::EnAttente }
    else { Etat::Partiel }
}

#[cfg(test)]
mod tests_etat {
    use super::*;

    #[test] fn soldé() { assert_eq!(etat(150_000.0, 150_000.0), Etat::Paye); }
    #[test] fn partiel() { assert_eq!(etat(150_000.0, 50_000.0), Etat::Partiel); }
    #[test] fn rien() { assert_eq!(etat(150_000.0, 0.0), Etat::EnAttente); }
    #[test] fn depassement_tolere() { assert_eq!(etat(150_000.0, 150_000.005), Etat::Paye); }
    #[test] fn frais_nul() { assert_eq!(etat(0.0, 0.0), Etat::Paye); }
}
```

## 19.4 Tests d'intégration avec SQLite en mémoire

`rusqlite` permet une base `:memory:` : rapide, jetable, isolée.

```rust
#[cfg(test)]
mod integration {
    use rusqlite::Connection;
    use super::*;

    fn base() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(crate::db::SCHEMA).unwrap();
        conn.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
        conn
    }

    #[test]
    fn une_seule_inscription_active_par_eleve() {
        let conn = base();
        // insérer établissement, année, 2 classes, 1 élève
        // insérer EleveClasse ACTIF
        // tenter une 2e inscription ACTIVE → doit échouer
        let err = conn.execute(
            "INSERT INTO EleveClasse (eleve_id, classe_id, statut) VALUES (?1, ?2, 'ACTIF')",
            rusqlite::params!["e1", "c2"],
        ).unwrap_err();
        assert!(err.to_string().contains("UNIQUE"));
    }

    #[test]
    fn cascade_supprime_les_echeances_du_frais() {
        // DELETE FraisScolaire → Echeance disparaît (PRAGMA activé)
    }
}
```

> 🧠 Rendez `SCHEMA` accessible au module de test (`pub const SCHEMA`). Ce seul
> changement débloque toute la stratégie de test.

## 19.5 Le typage comme test

```bash
npx tsc --noEmit      # vérifie sans produire de fichiers
bun run lint          # ESLint (config Next)
```

Ajoutez ces deux commandes dans un script :

```json
{
  "scripts": {
    "check": "tsc --noEmit && eslint . && cargo check --manifest-path src-tauri/Cargo.toml"
  }
}
```

> ⚠️ `eslint.config.mjs` utilise `eslint-config-next` : vérifiez qu'il est bien résolu
> (une version incomplète produit un avertissement silencieux et aucune règle appliquée).

## 19.6 Tests manuels structurés

Faute d'E2E, écrivez une **matrice** et cochez-la avant chaque livraison.

| # | Parcours | Étapes | Attendu |
|---|---|---|---|
| 1 | Connexion | admin / mot de passe | tableau de bord |
| 2 | Mauvais mot de passe | admin / faux | message, aucune session |
| 3 | Créer une école | formulaire complet | apparaît dans la liste, couleur appliquée |
| 4 | Créer une année | libellé + dates | une seule active |
| 5 | Créer une classe | nom + niveau | effectif 0 |
| 6 | Inscrire un élève | nom, classe, tuteur | matricule généré, inscription ACTIF |
| 7 | Inscrire sans classe | — | refus avec message |
| 8 | Reinscrire dans une autre classe | modifier | ancienne inscription TRANSFERE |
| 9 | Créer un frais | montant + classes | visible dans la liste |
| 10 | Générer les échéances | — | 1 par élève, statut EN_ATTENTE |
| 11 | Payer partiellement | 50 % | PARTIELLEMENT_PAYE |
| 12 | Payer le solde | — | PAYE |
| 13 | Payer en trop | > dû | refus (après exercice 14.3) |
| 14 | Annuler un reçu | motif | échéance décrémentée, audit |
| 15 | Reçu imprimable | Ctrl+P | lisible, numéro présent |
| 16 | Dépense | catégorie + montant | dashboard mis à jour |
| 17 | Rapport financier | mois | totaux par devise |
| 18 | Sync hors ligne | couper le réseau | bandeau « hors ligne » |
| 19 | Sync retour en ligne | rebrancher | synchronisation, bandeau vert |
| 20 | Audit | action récente | entrée avec date et détail |

> 🧠 **Automatisez le maximum de ces 20 lignes** quand vous en aurez les moyens. En
> attendant, la matrice est un contrat : personne ne livre sans l'avoir exécutée.

## 19.7 Intégration continue

Un workflow GitHub Actions minimal :

```yaml
name: check
on: [push, pull_request]
jobs:
  web:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install --frozen-lockfile
      - run: npx tsc --noEmit
      - run: bun run lint
      - run: bun run build          # vérifie l'export Next.js
  rust:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: sudo apt-get update && sudo apt-get install -y libwebkit2gtk-4.1-dev \
               libappindicator3-dev librsvg2-dev patchelf
      - uses: dtolnay/rust-toolchain@stable
      - run: cargo test --manifest-path src-tauri/Cargo.toml
      - run: cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings
```

> 🧠 Le jour où la CI est verte sur `main`, vous pouvez livrer sans stress. Tant qu'elle
> n'existe pas, chaque livraison est un pari.

## 19.8 Qualité du code : les règles du projet

1. Une commande = une responsabilité, un message d'erreur explicite en français.
2. Pas de `unwrap()` sur une entrée utilisateur (uniquement sur des invariants prouvés).
3. Pas de `eprintln!("DEBUG: …")` en livraison.
4. Pas de requête SQL construite avec une valeur concaténée.
5. Pas de `any` nouveau sans commentaire.
6. Toute écriture financière : transaction + audit.
7. Tout nouveau composant : quatre états (chargement, vide, erreur, plein).

## 19.9 Exercices

> **Exercice 19.1** — Rendez `SCHEMA` public et écrivez trois tests d'intégration :
> unicité de l'inscription active, cascade des échéances, refus d'un matricule dupliqué.
> Lancez `cargo test`.

> **Exercice 19.2** — Écrivez cinq tests unitaires pour `format_money` (Rust) et cinq
> pour `formatMoney` (JS, avec `vitest` ou `node:test`). Comparez les sorties : trouvez
> au moins une divergence.

> **Exercice 19.3** — Ajoutez le workflow GitHub Actions ci-dessus. Faites-le échouer
> volontairement (ESLint), puis corriger.

> **Exercice 19.4** — Transformez la matrice manuelle en fichier
> `livre/checklist-livraison.md` cochable, et exécutez-la intégralement sur une base
> neuve. Chronométrez-vous.

## 19.10 À retenir

- Zéro test aujourd'hui : le premier test est le plus rentable.
- Priorité : validation, monnaie, statuts, contraintes SQL.
- `:memory:` + `SCHEMA` = tests d'intégration rapides et réalistes.
- `tsc --noEmit`, `eslint`, `cargo check`/`clippy` : le minimum avant chaque commit.
- La checklist manuelle est un contrat de livraison, pas une formalité.


---

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


---

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


---

# 22. Feuille de route et projet final

## 22.1 Où en est le projet ?

**Ce qui fonctionne** : inscription, classes, frais, échéances, encaissements avec reçus,
dépenses, tableau de bord, rapports, audit, synchronisation, installateur Windows.

**Ce qui manque ou doit être consolidé** :

| Domaine | État | Risque |
|---|---|---|
| Authentification | jeton = id + repli admin | **critique** |
| Autorisation | contrôles côté front seulement | **élevé** |
| Transactions | écritures multiples non atomiques | **élevé** |
| Migrations de schéma | pas de versionnement | **élevé** |
| Tests | aucun | **élevé** |
| Numérotation des reçus | non atomique | moyen |
| Contrôle de dépassement | absent | moyen |
| Journal d'audit | rétention 200, `user_id` souvent nul | moyen |
| Synchronisation | pull complet, conflits non résolus | moyen |
| Thème / design system | pas de jetons | faible |
| Tests d'installation | manuels | faible |

## 22.2 Le backlog priorisé

Les estimations sont en « demi-journées » pour une personne qui connaît le projet.

### P0 — avant toute utilisation sérieuse

| # | Tâche | Est. | Chapitre |
|---|---|---|---|
| 1 | Vrais jetons de session + suppression du repli admin | 2 | 21 |
| 2 | Contrôle de rôle dans les commandes sensibles | 2 | 21 |
| 3 | Coût bcrypt 12 + changement de mot de passe obligatoire | 1 | 21 |
| 4 | Transactions sur `create_paiement`, `create_eleve`, `annuler_paiement` | 1 | 13, 15 |
| 5 | Retrait des secrets du dépôt | 0,5 | 21 |
| 6 | Sauvegarde automatique quotidienne | 1 | 20 |

### P1 — fiabilité et maintenance

| # | Tâche | Est. |
|---|---|---|
| 7 | `run_migrations` + versionnement du schéma | 2 |
| 8 | Tests unitaires monnaie/dates/validation | 2 |
| 9 | Tests d'intégration `:memory:` sur les contraintes | 2 |
| 10 | Numérotation atomique des reçus | 1 |
| 11 | Contrôle de dépassement + politique de trop-perçu | 1 |
| 12 | Archivage correct des élèves (clôture d'inscription) | 0,5 |
| 13 | Audit complet (`user_id`, rétention 5 ans, export) | 1,5 |
| 14 | Panneau « Santé des données » | 1,5 |

### P2 — qualité et performance

| # | Tâche | Est. |
|---|---|---|
| 15 | Pull incrémental (`updated_at`) | 2 |
| 16 | Journal de synchronisation (`SyncLog`) + mode simulation | 1,5 |
| 17 | Jetons de thème Tailwind + suppression des couleurs en dur | 2 |
| 18 | Typage de `tauri-commands.ts` + suppression progressive des `any` | 3 |
| 19 | `recalculate_echeances` séparé de la lecture | 1 |
| 20 | CI (lint + types + tests + build) | 1 |

### P3 — fonctionnalités

- module **Caisse** (ouverture/clôture, fond de caisse, écart) ;
- **cartes scolaires** et photos d'élèves ;
- **bulletins** et notes ;
- **SMS** de relance aux tuteurs ;
- **portail parent** en lecture seule ;
- import Excel des inscriptions existantes ;
- statistiques pluriannuelles.

## 22.3 Projet final : le module « Caisse »

Voici le projet qui synthétise tout le livre. Comptez 15 à 25 heures.

### Cahier des charges

1. **Ouverture de caisse** : un caissier ouvre sa journée avec un fond de caisse
   (`montant_initial`), par établissement.
2. **Encaissements liés** : chaque paiement de la journée référence la caisse ouverte.
3. **Dépenses de caisse** : possibilité de payer une petite dépense depuis la caisse.
4. **Clôture** : montant théorique = fond + encaissements − dépenses ; le caissier saisit
   le montant compté ; l'écart est enregistré et justifié.
5. **Rapport Z** : document imprimable récapitulant la journée.
6. **Interdictions** : pas deux caisses ouvertes par établissement ; pas d'encaissement
   sans caisse ouverte (ou règle explicite) ; pas de clôture deux fois.

### Livrables attendus

```text
src-tauri/src/db/mod.rs            + tables Caisse, MouvementCaisse (migration v4)
src-tauri/src/commands/caisse.rs   ouvrir_caisse, clôturer_caisse, caisse_du_jour, rapport_z
src-tauri/src/lib.rs               enregistrement des 4 commandes
src/lib/tauri-commands.ts          fonctions typées
src/components/sgfs/caisse/CaissePage.tsx
supabase_schema.sql                tables miroir + ordre de synchronisation
```

### Contraintes de qualité

- [ ] transaction sur ouverture et clôture ;
- [ ] audit de chaque opération avec `user_id` ;
- [ ] un index unique partiel interdisant deux caisses ouvertes par établissement :

```sql
CREATE UNIQUE INDEX idx_caisse_ouverte_unique
ON Caisse(etablissement_id) WHERE statut = 'OUVERTE';
```

- [ ] trois tests d'intégration (double ouverture refusée, clôture, écart calculé) ;
- [ ] quatre états d'écran ;
- [ ] document d'une page pour le caissier.

### Grille d'évaluation

| Critère | Points |
|---|---|
| Le modèle de données respecte les règles métier | 3 |
| Les écritures sont transactionnelles et auditées | 3 |
| La synchronisation est prise en compte (ordre, dépendances) | 2 |
| Les tests couvrent les cas limites | 3 |
| L'interface gère les quatre états et les erreurs | 3 |
| La documentation utilisateur existe | 2 |
| Aucune régression sur les parcours existants | 4 |

## 22.4 Comment contribuer proprement

```bash
# 1. une branche par sujet
git checkout -b feat/caisse

# 2. commits petits, au message utile
git commit -m "caisse: ajoute l'ouverture avec fond initial"

# 3. vérifications avant de pousser
npx tsc --noEmit && bun run lint && (cd src-tauri && cargo test)

# 4. description de PR : quoi, pourquoi, comment tester, captures
gh pr create --fill
```

### Convention de commit du projet (proposition)

```text
<module>: <verbe à l'impératif> <objet>

paiement: ajoute le contrôle de dépassement du solde
sync: filtre le pull par updated_at
ui: remplace les couleurs en dur par des jetons de thème
```

> 🧠 **Un bon commit raconte une intention**, pas une suite de fichiers modifiés.

## 22.5 Continuer à apprendre

Après ce livre, quatre chemins naturels :

1. **Rust sérieux** — *The Rust Book* (gratuit), puis `rustlings`, puis lire
   `sync/mod.rs` en entier : c'est du vrai code de production.
2. **SQL avancé** — fenêtres (`OVER`), CTE récursives, plans d'exécution.
3. **Architecture** — *Designing Data-Intensive Applications* (chapitres sur la
   réplication et les conflits) : vous comprendrez pourquoi la synchronisation est dure.
4. **Produit** — observez un caissier pendant une journée. Vos meilleures idées de
   fonctionnalités viendront de là, pas d'un tutoriel.

## 22.6 Auto-évaluation finale

Répondez sans regarder le code. Moins de 12 bonnes réponses : relisez les chapitres
correspondants.

1. Que se passe-t-il exactement entre un clic sur « Enregistrer » et la ligne dans
   SQLite ? (4)
2. Pourquoi la base est-elle dans `%APPDATA%` et non dans le dossier d'installation ? (2)
3. Différence entre `api_response` et `list_response` ? (4)
4. Pourquoi `PRAGMA foreign_keys=ON` est-il indispensable ? (12)
5. Qu'est-ce qu'un index unique partiel, et à quoi sert-il ici ? (12)
6. Pourquoi ne jamais additionner deux devises ? (14)
7. Quels sont les trois manques de `annuler_paiement` ? (15)
8. Comment fonctionne le pull de la synchronisation ? (17)
9. Quelles sont les deux failles d'authentification majeures ? (21)
10. Pourquoi `useCallback` est-il nécessaire avec `useEffect` ? (5)
11. Que fait `unwrap()` dans `tauri-commands.ts` ? (11)
12. Comment ajouter une commande Tauri, de bout en bout ? (11)
13. Pourquoi une mise à jour de l'application doit-elle migrer la base ? (20)
14. Quel est le risque d'un `SELECT *` dans un code qui doit survivre aux schémas
    anciens ? (12)
15. Décrivez un test que vous écririez immédiatement sur `create_paiement`. (19)

## 22.7 Le mot de la fin

Vous avez parcouru un vrai logiciel : ses forces (séparation claire, audit, gestion
multi-devises, synchronisation hors ligne) et ses dettes (sécurité, tests, migrations).
C'est cela, le métier : **un équilibre permanent entre ce qui marche aujourd'hui et ce qui
tiendra demain**.

La prochaine étape n'est pas de lire un autre tutoriel, mais d'ouvrir un fichier et de
changer une ligne. Puis de la tester. Puis de recommencer.

Bon code.


---

# Annexe A — Glossaire

## A.1 Métier

**Année scolaire** — Période d'enseignement (ex. 2025-2026). Une seule est active par
établissement ; les données financières y sont rattachées.

**Échéance** — Montant qu'un élève donné doit pour un frais donné. Porte `montant_du`,
`montant_paye` et un statut calculé.

**Encaissement / Paiement** — Reçu enregistré pour un élève. Ne se supprime jamais ; peut
être annulé.

**Frais scolaire** — Montant à payer (minerval, inscription, annexe), éventuellement
limité à certaines classes.

**Imputation (montant affecté)** — Partie d'un paiement affectée à une échéance, dans la
devise de celle-ci.

**Minerval** — Frais de scolarité principal, souvent payé par tranches.

**Recouvrement** — Part du dû effectivement encaissé.

**Tuteur** — Responsable légal de l'élève, joignable en cas d'impayé.

**Trop-perçu** — Montant payé supérieur au dû ; doit être refusé ou crédité selon la
politique de l'école.

## A.2 Web et front-end

**Composant** — Fonction React retournant du JSX, réutilisable et paramétrable.

**État (state)** — Donnée qui, lorsqu'elle change, provoque un nouveau rendu.

**Hook** — Fonction React (`useState`, `useEffect`, `useMemo`, `useCallback`) qui ajoute
un comportement à un composant.

**Hydratation** — Processus par lequel React attache ses événements au HTML rendu. Absente
en export statique côté Tauri (tout est client).

**JSX / TSX** — Syntaxe mêlant balisage et JavaScript/TypeScript.

**Props** — Paramètres reçus par un composant.

**Rendu conditionnel** — Affichage selon une condition (`loading ? … : …`).

**shadcn/ui** — Collection de composants copiés dans le dépôt, basés sur Radix et
Tailwind.

**Tailwind CSS** — Framework de classes utilitaires ; chaque classe applique un style.

**Zustand** — Bibliothèque d'état global, simple et persistable.

## A.3 Desktop, Rust, Tauri

**Cargo** — Gestionnaire de paquets et compilateur de Rust.

**Clé étrangère (FK)** — Contrainte garantissant qu'une référence pointe vers une ligne
existante.

**Commande Tauri** — Fonction Rust annotée `#[tauri::command]`, appelable depuis la
WebView via `invoke`.

**IPC** — Communication entre la WebView et le cœur Rust.

**Mutex** — Verrou garantissant un accès exclusif (ici à la connexion SQLite).

**`Option<T>`** — Type représentant une valeur présente (`Some`) ou absente (`None`).

**`Result<T, E>`** — Type représentant un succès (`Ok`) ou une erreur (`Err`).

**`?`** — Opérateur propageant une erreur.

**`serde`** — Bibliothèque de sérialisation/désérialisation (JSON).

**`State`** — Accès, dans une commande, aux données gérées par l'application
(`app.manage`).

**Tauri** — Cadre d'application de bureau utilisant la WebView du système et un cœur Rust.

**WebView** — Moteur de rendu HTML du système (WebView2, WebKitGTK, WKWebView).

## A.4 Données et synchronisation

**Clé primaire** — Identifiant unique d'une ligne.

**Index** — Structure accélérant les recherches, au prix de l'espace et des écritures.

**Index unique partiel** — Index unique ne s'appliquant qu'aux lignes respectant une
condition (`WHERE statut='ACTIF'`).

**Migration** — Script transformant un schéma d'une version à la suivante.

**Offline-first** — Conception où l'application fonctionne sans réseau et synchronise
ensuite.

**PostgREST** — Couche REST automatique au-dessus de PostgreSQL (utilisée par Supabase).

**Pull / Push** — Rapatriement depuis le cloud / envoi vers le cloud.

**RLS (Row Level Security)** — Politiques PostgreSQL restreignant les lignes accessibles
par utilisateur.

**Upsert** — Insertion ou mise à jour si la ligne existe déjà.

**WAL** — *Write-Ahead Logging* : mode SQLite plus performant, produisant des fichiers
`-wal` et `-shm`.

## A.5 Qualité et production

**Audit log** — Journal horodaté des actions sensibles, attribuées à un utilisateur.

**CI (intégration continue)** — Exécution automatique des vérifications à chaque
modification.

**Debounce** — Retarder une action jusqu'à ce qu'un délai se soit écoulé sans nouvel
événement.

**Dette technique** — Coût futur d'un raccourci pris aujourd'hui.

**Fail-open / fail-closed** — Comportement par défaut en cas d'absence d'information
(permissif / restrictif).

**Idempotence** — Propriété d'une opération qui, répétée, produit le même résultat.

**Race condition** — Bug dû à l'ordre imprévisible d'opérations concurrentes.

**Transaction** — Groupe d'écritures appliquées entièrement ou pas du tout.


---

# Annexe B — Aide-mémoire

## B.1 Commandes du projet

```bash
bun install                 # dépendances
bun run dev                 # Next.js seul (UI)
bun run tauri dev           # application de bureau
bun run build               # export statique → out/
bun run tauri build         # installateur
bun run lint                # ESLint
npx tsc --noEmit            # vérification des types
cd src-tauri && cargo check # compilation rapide Rust
cd src-tauri && cargo test  # tests
cd src-tauri && cargo clippy
```

## B.2 TypeScript / React

```ts
// état
const [x, setX] = useState<T>(initial)
const memo = useMemo(() => calcul(a), [a])
const cb = useCallback(() => faire(a), [a])
useEffect(() => { … ; return cleanup }, [deps])

// asynchrone
const res = await tc.listEleves({ page: 1 })
if (res?.success === false) throw new Error(res.error)

// types utiles
type Statut = 'ACTIF' | 'INSCRIT' | 'SUSPENDU' | 'TRANSFERE'
type Option = { id: string; nom: string }
Record<string, number>
Partial<T>, Pick<T, 'id'>, Omit<T, 'id'>

// narrowing
function f(x?: string | null) {
  if (!x) return        // x est string après
}

// liste
items.map((i) => <Row key={i.id} item={i} />)
```

## B.3 Rust (l'essentiel du projet)

```rust
// types
let n: i64 = 0;
let mut s = String::from("x");
let opt: Option<String> = None;
let res: Result<Value, AppError> = Ok(json!({"a": 1}));

// ? propage l'erreur
let conn = db.lock()?;

// Option
if let Some(v) = opt { … }
let n = opt.map(|v| v.len()).unwrap_or(0);

// Result
match res { Ok(v) => v, Err(e) => return Err(e) }

// struct sérialisée en camelCase
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Foo { pub etablissement_id: String }

// requête
let total: i64 = conn.query_row("SELECT COUNT(*) FROM Eleve WHERE statut = ?1",
                                params!["ACTIF"], |r| r.get(0))?;

// plusieurs lignes
let mut stmt = conn.prepare("SELECT id, nom FROM Classe")?;
let rows = stmt.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))?;
for row in rows { let (id, nom) = row?; }

// écriture
conn.execute("INSERT INTO X (id) VALUES (?1)", params![id])?;

// transaction
let mut conn = db.lock()?;
let tx = conn.transaction()?;
tx.execute("…", params![…])?;
tx.commit()?;

// itérateurs
let total: f64 = montants.iter().sum();
let ids: Vec<String> = eleves.iter().filter(|e| e.actif).map(|e| e.id.clone()).collect();
```

## B.4 SQL utile (SQLite)

```sql
-- créer / indexer
CREATE TABLE IF NOT EXISTS T (id TEXT PRIMARY KEY, ...);
CREATE INDEX IF NOT EXISTS idx_t_champ ON T(champ);
CREATE UNIQUE INDEX IF NOT EXISTS idx_t_actif ON T(ref) WHERE statut = 'ACTIF';

-- lire
SELECT * FROM Eleve WHERE nom LIKE '%ali%' ORDER BY nom LIMIT 20 OFFSET 0;
SELECT COUNT(*) FROM Echeance WHERE statut = 'EN_ATTENTE';

-- joindre / agréger
SELECT e.nom, SUM(ec.montant_du - ec.montant_paye) AS reste
FROM Echeance ec JOIN Eleve e ON e.id = ec.eleve_id
GROUP BY e.id HAVING reste > 0 ORDER BY reste DESC;

-- dates
SELECT date('now'), strftime('%Y-%m', created_at), date('now','-30 day');

-- upsert
INSERT INTO T (id, x) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET x = excluded.x;

-- maintenance
PRAGMA foreign_keys = ON;
PRAGMA integrity_check;
VACUUM;
VACUUM INTO '/tmp/sauvegarde.db';
.backup '/tmp/sauvegarde.db'
```

## B.5 Tauri : les deux sens

```rust
// Rust
#[tauri::command]
pub fn ma_commande(db: State<'_, DbConn>, id: String) -> Result<Value, AppError> { … }
```

```rust
// lib.rs
commands::mon_module::ma_commande,
```

```ts
// TypeScript
export async function maCommande(id: string) {
  return cmd('ma_commande', { id })
}
```

Correspondance des noms : `etablissement_id` (Rust) ⇄ `etablissementId` (argument JS).
Les clés d'objets **retournés** ne sont pas converties : utilisez
`#[serde(rename_all = "camelCase")]`.

## B.6 Git minimal

```bash
git status
git add -p
git commit -m "module: action"
git push origin arena/5c231ded-amelioration-ecole
git log --oneline -10
git diff
git checkout -b feat/x
```

## B.7 Diagnostiquer vite

| Symptôme | Première commande |
|---|---|
| écran vide | console WebView (`Ctrl+Shift+I`) |
| commande inconnue | `grep commande src-tauri/src/lib.rs` |
| données absentes | `sqlite3 sgfs.db "SELECT COUNT(*) FROM …"` |
| appli figée | chercher un `Mutex` verrouillé (deadlock) |
| sync échoue | `curl` sur l'endpoint + `validate_sync_ready` |
| build échoue | lire la **première** erreur, pas la dernière |
| types cassés | `npx tsc --noEmit` puis aller à la première ligne |


---

# Annexe C — Checklist de revue de code

À utiliser pour toute contribution, sur soi-même (avant de pousser) ou sur la pull request
d'un collègue. Cochez honnêtement.

## C.1 Lecture du besoin

- [ ] La modification répond à un besoin métier **formulé** (ticket, message, journal).
- [ ] Les règles métier touchées sont identifiées (voir chapitre 3).
- [ ] Le périmètre est limité : une PR = un sujet.
- [ ] Les cas limites sont listés (vide, zéro, négatif, doublon, hors ligne).

## C.2 Front-end

- [ ] Le composant est `'use client'` s'il utilise un état, un effet ou un événement.
- [ ] Les effets nettoient leurs abonnements et minuteurs.
- [ ] Aucune fonction non mémorisée dans les dépendances d'un effet (`useCallback`).
- [ ] Les quatre états sont gérés : chargement, vide, erreur, plein.
- [ ] Les filtres vides deviennent `undefined` ; la page revient à 1 au changement.
- [ ] Les boutons critiques sont désactivés pendant l'envoi (`busy`).
- [ ] Le formulaire n'est pas vidé en cas d'échec.
- [ ] Les listes ont une `key` stable (identifiant, pas index).
- [ ] Les boutons icônes ont un `aria-label` ; les dialogues un `DialogTitle`.
- [ ] Aucun `dangerouslySetInnerHTML`.

## C.3 Passerelle Tauri

- [ ] Les paramètres envoyés correspondent aux noms attendus par Rust.
- [ ] La réponse est déballée (`unwrap` / `res.data`) sans double `success`.
- [ ] La fonction est ajoutée à `tauri-commands.ts` si nécessaire.
- [ ] Le nom de la commande respecte la convention (`create_`, `update_`, `delete_`,
      `list_`, `get_`) pour la synchronisation automatique.

## C.4 Rust / back-end

- [ ] La commande est enregistrée dans `lib.rs` (`generate_handler!`).
- [ ] Les paramètres sont validés **avant** toute écriture.
- [ ] Aucune valeur concaténée dans une requête SQL (paramètres liés uniquement).
- [ ] Les noms de table/colonne dynamiques viennent d'une liste blanche.
- [ ] Les règles pures (signe, longueur, énumération) sont testées.
- [ ] Les erreurs sont des `AppError` avec un message **en français et actionnable**.
- [ ] Pas de `unwrap()` sur une entrée utilisateur ; pas de `panic!`.
- [ ] Le verrou (`Mutex`) est libéré avant tout appel réseau ou audit.
- [ ] Les écritures multiples sont dans une transaction.
- [ ] Un `log_audit` accompagne toute opération sensible, avec `user_id`.
- [ ] Aucun `eprintln!("DEBUG: …")` restant.
- [ ] Aucune donnée de test ou année codée en dur.

## C.5 Base de données

- [ ] Les nouvelles tables ont une clé primaire, des clés étrangères et des index.
- [ ] Les contraintes d'unicité métier sont exprimées (index unique partiel si besoin).
- [ ] Une migration versionnée est fournie (pas seulement `CREATE TABLE IF NOT EXISTS`).
- [ ] La migration a été testée sur une copie d'une base **réelle**.
- [ ] Les horodatages utilisent le même format que le reste du projet.
- [ ] La table est ajoutée au miroir `supabase_schema.sql`.

## C.6 Synchronisation

- [ ] La nouvelle table est placée **après** ses parents dans `TableConfig`.
- [ ] `fk_deps` et `dependency_configs` sont renseignés.
- [ ] Les colonnes `updated_at` sont maintenues à chaque écriture.
- [ ] Un test manuel pull/push a été fait, hors ligne puis en ligne.
- [ ] Les conflits possibles sont décrits dans la PR.

## C.7 Sécurité

- [ ] Aucun secret, mot de passe, clé ou jeton dans le code, les logs ou le dépôt.
- [ ] L'action sensible vérifie le rôle **côté Rust**.
- [ ] La permission par défaut n'est pas permissive (`return false` si rôle inconnu).
- [ ] Aucune donnée personnelle affichée à un utilisateur non autorisé.
- [ ] Les nouvelles dépendances sont vérifiées (licence, maintenance, popularité).

## C.8 Qualité et livraison

- [ ] `npx tsc --noEmit` passe.
- [ ] `bun run lint` passe (sans nouveau `any` non justifié).
- [ ] `cargo check` et `cargo clippy` passent.
- [ ] Les tests existants passent ; de nouveaux tests couvrent le changement.
- [ ] La matrice manuelle du chapitre 19 (parcours concernés) a été exécutée.
- [ ] La documentation est mise à jour (`README`, guide, `worklog.md`).
- [ ] Le message de commit est explicite.
- [ ] La PR décrit : quoi, pourquoi, comment tester, captures d'écran.

## C.9 Grille de sévérité

| Sévérité | Définition | Action |
|---|---|---|
| **Bloquant** | perte de données, faille, argent faux | refus immédiat |
| **Majeur** | fonctionnalité cassée, mauvaise règle métier | à corriger avant merge |
| **Mineur** | lisibilité, cohérence, style | peut suivre dans une autre PR |
| **Suggestion** | alternative, apprentissage | libre |

> 🧠 En revue, distinguez toujours **le fait** (« le montant peut être négatif ») de
> **l'opinion** (« je préfère `map` à `for` »). Les deux sont utiles, mais pas au même
> niveau.


---

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


---

# Annexe E — Plan d'apprentissage sur 8 semaines

Rythme conseillé : **4 à 6 heures par semaine**, dont au moins la moitié les mains dans le
code. Chaque semaine se termine par un livrable vérifiable.

## Semaine 1 — Comprendre et installer

**Lecture** : chapitres 1, 2, 3.
**Ateliers** : installer Node, Bun, Rust ; lancer `bun run dev` puis `bun run tauri dev` ;
s'inscrire comme élève dans une école de test ; regarder la base avec `sqlite3`.
**Livrable** : une école, une année active, une classe, un élève, un frais, une échéance,
un paiement — et une capture du tableau de bord.
**Auto-contrôle** : savez-vous expliquer la différence entre `Echeance` et `Paiement` ?

## Semaine 2 — Lire une architecture

**Lecture** : chapitres 4, 5.
**Ateliers** : tracer le trajet d'un clic dans `EncaissementsPage` ; dessiner les quatre
couches ; lister les 12 pages dans `Sidebar` et leurs permissions.
**Livrable** : un schéma personnel du trajet d'une requête (papier ou image), avec les
noms de fichiers exacts.

## Semaine 3 — Front-end sérieux

**Lecture** : chapitres 6, 7, 8.
**Ateliers** : exercices 6.3, 7.1, 8.2.
**Livrable** : une PR locale contenant `messageOf`, des sélecteurs Zustand et le filtre
`sans_classe` côté SQL (ou un rapport expliquant le blocage rencontré).

## Semaine 4 — Interface

**Lecture** : chapitre 9.
**Ateliers** : exercices 9.1 et 9.2 ; ajouter les jetons de thème et l'impression du reçu.
**Livrable** : impression PDF d'un reçu lisible en 80 mm, sans sidebar ni boutons.

## Semaine 5 — Rust et Tauri

**Lecture** : chapitres 10, 11.
**Ateliers** : commande `ping` (exercice 11.1), inventaire des commandes manquantes
(exercice 11.2), nettoyage des capacités (11.3).
**Livrable** : une commande nouvelle fonctionnelle + un tableau « front vs lib.rs ».

## Semaine 6 — Données et argent

**Lecture** : chapitres 12, 13, 14.
**Ateliers** : exercices 12.1, 12.3, 13.3, 13.4, 14.3.
**Livrable** : `create_paiement` transactionnel avec contrôle de dépassement et numéro de
reçu atomique ; tests unitaires de monnaie.

## Semaine 7 — Fiabilité et synchronisation

**Lecture** : chapitres 15, 16, 17, 18.
**Ateliers** : exercices 15.1, 15.3, 17.3, 18.2.
**Livrable** : élève archivé proprement + panneau de synchronisation lisant `SyncLog` +
un test hors ligne / retour en ligne documenté.

## Semaine 8 — Production et sécurité

**Lecture** : chapitres 19, 20, 21, 22.
**Ateliers** : exercices 19.1, 20.1, 21.1, 21.3 ; commencer le projet final « Caisse ».
**Livrable** : installateur testé sur machine vierge ; jetons de session réels ; première
version du module Caisse ; checklist de livraison exécutée.

---

## Après les 8 semaines

| Objectif | Indicateur de réussite |
|---|---|
| Terminer le module Caisse | 4 commandes + écran + tests |
| Mettre en place la CI | verte sur `main` |
| Migrer toutes les données de schéma | `Migration` jusqu'à v5, zéro `if column_exists` nouveau |
| Typage complet de `tauri-commands.ts` | plus de `any` sur les réponses |
| Former un utilisateur | un caissier autonome, avec sa procédure d'une page |

## Conseils de méthode

1. **Un objectif par séance.** Écrivez-le en haut d'un fichier avant de commencer.
2. **Testez après chaque petite modification.** Deux minutes de test valent une heure de
   débogage.
3. **Notez vos blocages** dans un fichier `journal.md`. Relisez-le chaque vendredi : c'est
   votre programme de progression.
4. **Expliquez à voix haute.** Si vous ne pouvez pas expliquer un mécanisme en trois
   phrases, vous ne le maîtrisez pas encore.
5. **Ne copiez jamais un bloc sans l'avoir lu.** Le code de ce dépôt contient des erreurs
   volontairement laissées : les recopier telles quelles vous apprendrait le contraire.
