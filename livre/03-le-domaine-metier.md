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
