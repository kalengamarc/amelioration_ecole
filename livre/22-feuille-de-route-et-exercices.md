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
