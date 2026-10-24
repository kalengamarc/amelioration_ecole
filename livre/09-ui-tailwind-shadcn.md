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
