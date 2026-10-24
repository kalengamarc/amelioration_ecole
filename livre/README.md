# Construire SGFS-ME — Le livre du projet

**Apprendre le développement logiciel à travers une vraie application de gestion scolaire**

> Édition 1 — octobre 2026
> Dépôt : `amelioration_ecole` (branche de travail `arena/5c231ded-amelioration-ecole`)
> Application : **SGFS-ME** — Système de Gestion Financière et Scolaire Multi-Établissements

---

## À qui s'adresse ce livre

Ce livre n'est pas un cours théorique. C'est une **visite guidée d'un projet réel**, écrit
ligne de code en ligne de code, pour trois publics :

| Profil | Ce que vous allez apprendre |
|---|---|
| **Débutant motivé** | lire du code professionnel, comprendre une architecture, faire vos premières modifications sans casser le projet |
| **Développeur web** | comment on passe de Next.js/React au bureau avec Tauri 2, Rust et SQLite embarqué |
| **Développeur confirmé** | concevoir un logiciel métier (finances scolaires), gérer l'argent, la synchronisation hors-ligne, l'audit et la distribution |

Aucune connaissance préalable de Rust n'est nécessaire : le chapitre 10 part de zéro et
s'appuie uniquement sur du code présent dans le dépôt.

---

## Ce que contient le livre

**Partie I — Comprendre avant de coder**
1. [Avant-propos : apprendre par projet](01-avant-propos-et-methode.md)
2. [Installer, lancer, explorer](02-installer-et-lancer.md)
3. [Le domaine métier : une école, des élèves, de l'argent](03-le-domaine-metier.md)
4. [Architecture et trajet d'une requête](04-architecture-et-trajet-dune-requete.md)

**Partie II — Le socle front-end**
5. [React et Next.js dans ce projet](05-react-et-nextjs.md)
6. [TypeScript solide](06-typescript-solide.md)
7. [État global avec Zustand](07-zustand-etat-global.md)
8. [Construire un écran CRUD complet](08-ecran-crud-eleves.md)
9. [UI, Tailwind et shadcn/Radix](09-ui-tailwind-shadcn.md)

**Partie III — Le back-end Rust / Tauri**
10. [Rust pour développeurs JavaScript](10-rust-pour-developpeurs-js.md)
11. [Tauri : commandes, IPC, permissions](11-tauri-commandes-et-ipc.md)
12. [SQLite : schéma, SQL, transactions](12-sqlite-sql-et-schema.md)
13. [Une commande de bout en bout](13-une-commande-de-bout-en-bout.md)

**Partie IV — Le métier et la fiabilité**
14. [Argent, devises et arrondis](14-argent-devises-et-arrondis.md)
15. [Intégrité, audit, annulations](15-integrite-audit-annulations.md)
16. [Tableau de bord et rapports](16-dashboard-et-rapports.md)

**Partie V — Le hors-ligne et le cloud**
17. [Synchronisation « offline-first »](17-synchronisation-offline-first.md)
18. [Déboguer la synchronisation](18-deboguer-la-sync.md)

**Partie VI — Vers la production**
19. [Tests et qualité](19-tests-et-qualite.md)
20. [Build, distribution et mises à jour](20-build-distribution-mise-a-jour.md)
21. [Sécurité et permissions](21-securite-et-permissions.md)
22. [Feuille de route et projet final](22-feuille-de-route-et-exercices.md)

**Annexes**
- [A — Glossaire](23-annexe-a-glossaire.md)
- [B — Aide-mémoire TypeScript / Rust / SQL](24-annexe-b-aide-memoire.md)
- [C — Checklist de revue de code](25-annexe-c-checklist-revue.md)
- [D — Corrigés des exercices](26-annexe-d-corriges.md)
- [E — Plan d'apprentissage sur 8 semaines](27-annexe-e-plan-8-semaines.md)

---

## Comment lire ce livre

1. **Ouvrez le projet dans votre éditeur en même temps.** Chaque chapitre cite des
   fichiers réels (`src/app/page.tsx`, `src-tauri/src/commands/encaissements.rs`, …).
   Lisez le code à côté du texte : c'est là que l'apprentissage se fait.
2. **Faites les exercices.** Ils sont balisés ainsi :

   > **Exercice 8.1** — Ajouter un filtre « sexe » à la liste des élèves.
   > *Indication :* partez de `ElevesPage.tsx`, filtrez dans `fetchStudents`.

   Les corrigés détaillés sont en [annexe D](26-annexe-d-corriges.md).
3. **Une notion à la fois.** Les chapitres 1 à 4 se lisent sans écrire de code. Ne sautez
   pas le chapitre 3 : on ne code bien que ce qu'on comprend.
4. **Committez vos exercices.** `git checkout -b mes-exercices`, puis un commit par exercice.
   C'est aussi une compétence du métier.

> **Convention de lecture**
> - `→` indique un cheminement (clic → commande → SQL → écran).
> - 🧠 signale une notion de fond à retenir.
> - ⚠️ signale un piège présent dans le code actuel.
> - 🔧 signale une amélioration à réaliser en exercice.

---

## Le projet en une page

SGFS-ME gère plusieurs établissements scolaires (maternelle, primaire, secondaire,
complexe). Il permet d'inscrire des élèves, de définir des frais par classe et par année,
de suivre les échéances, d'encaisser des paiements avec impression de reçu, d'enregistrer
des dépenses, de produire des rapports et de synchroniser les données avec le cloud
Supabase.

Techniquement, c'est une application **de bureau** construite avec :

```text
Next.js 14 (export statique) + React 18 + TypeScript + Tailwind + shadcn/ui
                        ↓  invoke() (IPC Tauri)
Rust : 57 commandes #[tauri::command] réparties en 15 modules
                        ↓  rusqlite
SQLite locale (WAL, clés étrangères, 18 tables)
                        ↓  reqwest + PostgREST
Supabase / PostgreSQL (synchronisation bidirectionnelle)
```

Le tout est empaqueté avec **Tauri 2** en installateur Windows (NSIS), pour un usage sur
le terrain, parfois sans connexion Internet.

---

## Générer la version HTML

Un script de construction est fourni :

```bash
node livre/build.mjs
```

Il produit :

- `livre/LIVRE-COMPLET.md` — tout le livre concaténé, dans l'ordre ;
- `livre/SGFS-ME-livre.html` — version HTML autonome (sommaire, navigation, impression PDF
  via Ctrl+P), sans dépendance externe.

---

*Bonne lecture, et surtout : bonne construction.*
