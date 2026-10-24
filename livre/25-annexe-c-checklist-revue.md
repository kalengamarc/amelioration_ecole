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
