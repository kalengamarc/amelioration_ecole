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
