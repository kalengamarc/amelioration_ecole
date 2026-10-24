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
