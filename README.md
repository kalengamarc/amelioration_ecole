# SGFS-ME — Système de Gestion Financière et Scolaire

Application de bureau (Windows / Linux / macOS) pour gérer un complexe scolaire :
inscriptions, classes, frais, échéances, encaissements avec reçus, dépenses, rapports,
audit et synchronisation vers Supabase.

## 📘 Le livre du projet

Un manuel complet (22 chapitres, 5 annexes, exercices corrigés) pour apprendre le
développement logiciel à travers ce dépôt :

| Format | Fichier |
|---|---|
| **HTML autonome** (sommaire, impression PDF) | [`livre/SGFS-ME-livre.html`](livre/SGFS-ME-livre.html) |
| Markdown complet | [`livre/LIVRE-COMPLET.md`](livre/LIVRE-COMPLET.md) |
| Un fichier par chapitre | [`livre/README.md`](livre/README.md) |

Régénérer les versions compilées après une modification des chapitres :

```bash
node livre/build.mjs
```

## 🚀 Démarrage rapide

Prérequis : Node ≥ 18, Bun, Rust (rustup) et les outils de build de votre OS
(WebView2 + Build Tools sous Windows).

```bash
bun install
bun run dev          # interface seule (navigateur) — sans back-end
bun run tauri dev    # application de bureau complète (SQLite + Rust)
bun run tauri build  # installateur
```

Premier identifiant : `admin` / `admin123` — **à changer immédiatement**.

La base locale est créée automatiquement :

- Windows : `%APPDATA%\SGFS-ME\data\sgfs.db`
- Linux / macOS : `~/SGFS-ME/data/sgfs.db`

## 🧱 Architecture

```text
Next.js 14 + React 18 + TypeScript + Tailwind/shadcn   (src/)
        ↓ invoke()                        état : src/lib/store.ts
Rust / Tauri 2 — 57 commandes            (src-tauri/src/commands/)
        ↓ rusqlite
SQLite local (WAL, FK, 18 tables)        (src-tauri/src/db/mod.rs)
        ↓ reqwest / PostgREST
Supabase / PostgreSQL (sync bidirectionnelle)   (src-tauri/src/sync/mod.rs)
```

## 🧪 Vérifications

```bash
npx tsc --noEmit
bun run lint
cd src-tauri && cargo check && cargo clippy
```

## ⚠️ Sécurité

Ce dépôt est un support pédagogique et contient des **dettes de sécurité documentées**
dans le chapitre 21 du livre (jeton de session faible, repli d'authentification, contrôle
de rôle incomplet, mot de passe en clair dans `worklog.md`). Ne l'utilisez pas tel quel en
production avant d'avoir appliqué les correctifs P0 de la feuille de route.

## 📂 Documentation existante

- [`SYNC_GUIDE.md`](SYNC_GUIDE.md) / [`SYNC_SETUP.md`](SYNC_SETUP.md) — synchronisation Supabase
- [`supabase_schema.sql`](supabase_schema.sql) — schéma cloud
- [`worklog.md`](worklog.md) — journal des tâches
