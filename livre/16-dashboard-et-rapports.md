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
