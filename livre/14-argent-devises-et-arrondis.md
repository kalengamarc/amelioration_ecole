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
