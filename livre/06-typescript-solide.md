# 6. TypeScript solide

TypeScript n'est pas là pour « faire joli ». Dans un projet qui manipule de l'argent,
c'est un garde-fou. Ce chapitre montre comment le dépôt l'utilise — et où il cède du
terrain.

## 6.1 Configuration

```json
// tsconfig.json (extrait)
{
  "compilerOptions": {
    "strict": true,
    "noEmit": true,
    "jsx": "preserve",
    "moduleResolution": "bundler",
    "paths": { "@/*": ["./src/*"] }
  }
}
```

- `strict` active `strictNullChecks`, `noImplicitAny`, etc. : indispensable.
- `@/…` évite les `../../..` illisibles : `@/lib/tauri-commands`.

## 6.2 Typer les objets du métier

```ts
// src/components/sgfs/eleves/ElevesPage.tsx
type Student = {
  id: string
  matricule: string
  nom: string
  prenom: string
  sexe: string
  statut: string
  dateNaissance?: string
  lieuNaissance?: string
  etablissementId: string
  etablissement?: { nom: string }
  inscriptions?: any[]
  classes?: any[]
  tuteurs?: any[]
  echeances?: any[]
  paiements?: any[]
}
```

> 🧠 `?` signale un champ **facultatif** (« peut être absent »). Il ne dit pas
> « peut être null ». Pour cela, écrivez `dateNaissance?: string | null`. Le back-end
> Rust renvoie souvent `null` pour les colonnes SQL vides : la nuance compte.

## 6.3 Unions, littéraux et objets de correspondance

Le projet préfère `as const` + objet de correspondance aux `enum` :

```ts
export const ETAB_TYPES = ['MATERNELLE', 'PRIMAIRE', 'SECONDAIRE', 'COMPLEXE'] as const
export type EtabType = (typeof ETAB_TYPES)[number]   // 'MATERN…' | 'PRIMAIRE' | …

export function getTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    MATERNELLE: 'Maternelle',
    PRIMAIRE: 'Primaire',
    SECONDAIRE: 'Secondaire',
    COMPLEXE: 'Complexe',
  }
  return labels[type] || type
}
```

`Record<string, string>` = « dictionnaire clé/texte ». Pour un libellé de statut on
préfère stocker le style avec le texte :

```ts
const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  ACTIF:     { label: 'Actif',     className: 'bg-emerald-100 text-emerald-800 …' },
  INSCRIT:   { label: 'Inscrit',   className: 'bg-sky-100 text-sky-800 …' },
  SUSPENDU:  { label: 'Suspendu',  className: 'bg-amber-100 text-amber-800 …' },
  TRANSFERE: { label: 'Transféré', className: 'bg-stone-100 text-stone-700 …' },
}
```

Ainsi, ajouter un statut = ajouter une ligne, sans toucher au rendu. C'est un petit
patron de conception : **données plutôt que conditions**.

## 6.4 Génériques : `apiFetch<T>`

```ts
export async function apiFetch<T = any>(
  path: string,
  options: RequestInit = {}
): Promise<T> { … }
```

L'appelant choisit la forme attendue :

```ts
const data = await apiFetch<{ eleves: Student[]; total: number }>('/api/eleves')
```

C'est le bon usage : le générique décrit ce que **vous** attendez. ⚠️ Le défaut
`T = any` est un aveu : sans paramètre explicite, aucune vérification. Dans le code
actuel, la plupart des appels utilisent `tc.*` (typés par `Promise<any>`, hélas) puis
`res?.data`. Une amélioration à fort rendement serait de typer `tauri-commands.ts`
(chapitre 22, exercice 22.2).

## 6.5 Le pattern défensif des réponses

Le back-end n'a pas toujours renvoyé la même forme. Résultat, les écrans pratiquent :

```ts
const res = await tc.listClasses(etabId, year)
const data = res?.classes ?? res?.data ?? []
setClasses(Array.isArray(data) ? data : [])
```

Décortiquons :

| Élément | Sens |
|---|---|
| `res?.classes` | forme `{classes:[…]}` (list_response) |
| `?? res?.data` | forme `{data:[…]}` (api_response) |
| `?? []` | aucune des deux : on affiche une liste vide |
| `Array.isArray` | ce n'est pas un tableau ? on évite le crash |

> 🧠 C'est **de la programmation défensive sur un contrat instable**. Utile, mais ce n'est
> pas une solution : la vraie correction est d'uniformiser les réponses côté Rust
> (exercice 6.2).

## 6.6 Narrowing et garde-fous

```ts
// src/lib/store.ts
export function isCoordinateur(role: string | null | undefined): boolean {
  if (!role) return true
  const r = role.toUpperCase()
  return r === 'COORDINATEUR' || r === 'ADMIN' || r === 'SUPERADMIN'
      || r === 'ADMINISTRATEUR' || r === 'COORD'
}
```

TypeScript apprend ici que `role` est une `string` après le `if (!role) return`.
C'est le *narrowing* (rétrécissement de type).

```ts
// Extraction d'un objet imbriqué, avec repli
const t = s.tuteurs?.find((x: any) => x.tuteur?.isPrincipal)?.tuteur
       ?? s.tuteurs?.[0]?.tuteur
```

Chaque `?.` évite un `Cannot read properties of undefined`.

> ⚠️ **Piège de logique** : `isCoordinateur` renvoie `true` quand `role` est vide.
> « Pas d'information » devient « tous les droits ». C'est une faille par défaut
> permissif (fail-open). Un système financier doit échouer **fermé** (`return false`).
> Notez-le pour l'exercice 21.1.

## 6.7 Typer une commande Tauri

```ts
export async function login(username: string, password: string) {
  return cmd<{ token: string; user: any }>('login', { req: { username, password } })
}
```

Le paramètre `req` est un objet imbriqué : la commande Rust attend
`req: LoginRequest`, avec `username` / `password` en snake_case-compatible (pas de
renommage ici). Voir `tauri-commands.ts` pour les variantes (`etablissementId` **et**
`etablissement_id` envoyés ensemble — un bricolage de compatibilité assumé).

## 6.8 `any` : où il se cache et comment le réduire

Comptons honnêtement :

```bash
grep -rn ": any" src/lib src/components/sgfs | wc -l
```

Les zones à `any` du projet :

| Zone | Raison historique | Coût |
|---|---|---|
| réponses des commandes | `cmd<T = any>` | aucune vérification de forme |
| objets imbriqués (`inscriptions`, `tuteurs`) | structures SQL plates remodelées | bug si le champ change |
| `catch (e: any)` | `unknown` est plus sûr | message d'erreur potentiellement vide |

Amélioration progressive (sans tout casser) :

```ts
// 1. une fonction de normalisation, testable
function unwrapList<T>(res: any, key: string): T[] {
  const v = res?.[key] ?? res?.data
  return Array.isArray(v) ? (v as T[]) : []
}

// 2. des types de réponse explicites
type ListResponse<T> = { success?: boolean; data?: T[]; pagination?: { total: number; totalPages: number } }

// 3. et une seule implémentation par écran
const students = unwrapList<Student>(res, 'eleves')
```

> **Exercice 6.1** — Écrivez `src/lib/types.ts` contenant `Eleve`, `Classe`,
> `AnneeScolaire`, `Paiement`, `Echeance`, `Depense`. Importez-les dans deux écrans.
> Combien d'erreurs TypeScript apparaissent ? Que révèlent-elles sur les données réelles ?

> **Exercice 6.2** — Choisissez `list_classes` et `list_eleves` dans
> `src-tauri/src/commands/`. Uniformisez leur réponse (`{data, pagination}` pour les deux),
> adaptez `tauri-commands.ts` et **un** écran. Vérifiez à la main. (Corrigé partiel en
> annexe D.)

> **Exercice 6.3** — Remplacez `catch (e: any)` par `catch (e: unknown)` dans
> `ElevesPage.tsx` et écrivez :

```ts
function messageOf(e: unknown): string {
  if (typeof e === 'string') return e
  if (e instanceof Error) return e.message
  return 'Erreur inconnue'
}
```

## 6.9 À retenir

- `strict: true` n'est pas négociable ; `any` se justifie, il ne se subit pas.
- Typer les réponses est le meilleur investissement pour réduire les bugs d'écran.
- Un type décrit la réalité : `?` ≠ `| null`.
- Un défaut permissif (`return true`) est un choix de sécurité, pas un détail.
