# 7. État global avec Zustand

## 7.1 Pourquoi un état global ?

Une application de bureau a besoin de données partagées par tous les écrans :

- l'utilisateur connecté et son jeton ;
- la page courante ;
- l'établissement sélectionné (sa couleur, sa devise, son nom) ;
- les paramètres de cet établissement (pied de page des reçus, imprimante).

Les faire descendre de composant en composant (« prop drilling ») serait pénible.
Zustand offre un **magasin** simple, sans `Provider`, avec persistance intégrée.

## 7.2 Le magasin du projet

```ts
// src/lib/store.ts
interface AppState {
  // Auth
  user: UserInfo | null
  token: string | null
  isAuthenticated: boolean
  login: (user: UserInfo, token: string) => void
  logout: () => void

  // Navigation
  currentPage: PageName
  setPage: (page: PageName) => void
  sidebarOpen: boolean
  setSidebarOpen: (open: boolean) => void
  toggleSidebar: () => void

  // Contexte établissement
  currentEtablissement: EtablissementContext | null
  setCurrentEtablissement: (etab: EtablissementContext | null) => void
  etabParams: EtabParams | null
  setEtabParams: (params: EtabParams | null) => void
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      login: (user, token) => set({ user, token, isAuthenticated: true }),
      logout: () => set({
        user: null, token: null, isAuthenticated: false,
        currentEtablissement: null, etabParams: null,
      }),

      currentPage: 'dashboard',
      setPage: (page) => set({ currentPage: page }),
      sidebarOpen: true,
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),

      currentEtablissement: null,
      setCurrentEtablissement: (etab) => set({ currentEtablissement: etab }),
      etabParams: null,
      setEtabParams: (params) => set({ etabParams: params }),
    }),
    {
      name: 'sgfs-storage',
      partialize: (state) => ({
        token: state.token,
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
)
```

### Trois détails qui comptent

1. **`partialize`** : seule la session est persistée. On ne veut pas retrouver la page
   « paramètres » ou une sidebar fermée au prochain démarrage — et surtout pas des
   données métier périmées.
2. **Le nom `sgfs-storage`** est le contrat avec le passé : le changer déconnecte tous
   les utilisateurs existants.
3. `set((s) => ({...}))` : forme fonctionnelle quand la nouvelle valeur dépend de
   l'ancienne.

> 🧠 **Sécurité** : `persist` écrit le jeton dans `localStorage` de la WebView. C'est
> acceptable pour une application locale mono-utilisateur, pas pour un site public
> (vulnérable au XSS). Le chapitre 21 en reparle.

## 7.3 Lire le magasin dans un composant

```tsx
const { user, currentPage } = useAppStore()
```

Attention : cette écriture **s'abonne à tout le magasin**. Chaque changement de
`sidebarOpen` re-rend l'écran. La forme recommandée est le sélecteur :

```tsx
const user = useAppStore((s) => s.user)
const setPage = useAppStore((s) => s.setPage)
```

> 🔧 **Exercice 7.1** — Transformez l'abonnement global de `DepensesPage.tsx` en
> sélecteurs. Mesurez (console React DevTools, option « Highlight updates ») le nombre de
> rendus avant/après en ouvrant puis fermant la sidebar.

## 7.4 Lire le magasin hors de React

Dans `page.tsx` (vérification de session) ou dans `apiFetch` :

```ts
useAppStore.getState().logout()
useAppStore.getState().login(data.data, token)
```

`getState()` donne la valeur courante **sans s'abonner**. C'est l'équivalent d'un accès
impératif — parfait pour un test, un gestionnaire d'événement ou une fonction utilitaire.

## 7.5 Des helpers métier autour du magasin

Le magasin n'est pas qu'un seau de valeurs ; il porte aussi les règles d'affichage :

```ts
export function isCoordinateur(role: string | null | undefined): boolean { … }
export function canManageFees(role: string): boolean { … }
export function canManageUsers(role: string): boolean { … }
export function canViewAudit(role: string): boolean { … }
export function canManageSettings(role: string): boolean { … }
export function getSchoolFilter(role: string, etablissementId: string | null): string | null
export function getRoleLabel(role: string): string
```

`getSchoolFilter` est le plus utilisé : il renvoie `null` pour « toutes les écoles » ou
l'identifiant unique. Les écrans s'en servent ainsi :

```tsx
const schoolFilter = getSchoolFilter(role, userEtabId)
const locked = !!schoolFilter
// …
<Select value={school || 'all'} disabled={locked} …>
```

> 🧠 **Un seul endroit pour une règle.** Si demain un rôle « CAISSIER » apparaît, vous
> modifiez `isCoordinateur` et `getSchoolFilter` — pas les douze écrans.

## 7.6 Changer de contexte sans perdre la cohérence

Le projet définit `onEtabSelect` pour que le changement d'établissement mette à jour
toute l'interface :

```ts
export function onEtabSelect(etabId: string, ecoles: Ecole[]) {
  const etab = ecoles.find((e) => e.id === etabId)
  if (!etab) return
  useAppStore.getState().setCurrentEtablissement({
    id: etab.id,
    nom: etab.nom,
    type: etab.type || 'PRIMAIRE',
    couleurPrincipale: etab.couleurPrincipale || DEFAULT_COLOR,
    devise: etab.devise || 'BIF',
    adresse: etab.adresse ?? null,
    telephone: etab.telephone ?? null,
    email: etab.email ?? null,
    logoUrl: etab.logoUrl ?? null,
    rccm: etab.rccm ?? null,
    idNat: etab.idNat ?? null,
  })
}
```

La couleur choisie remonte ensuite jusqu'au CSS :

```tsx
// page.tsx
const cssVars = useMemo(() => {
  const color = currentEtablissement?.couleurPrincipale || DEFAULT_COLOR
  return {
    '--etab-color': color,
    '--etab-color-hover': darkenHex(color),
    '--etab-color-light': color + '10',
  } as React.CSSProperties
}, [currentEtablissement?.couleurPrincipale])

return <div style={cssVars}> … </div>
```

et les composants consomment :

```tsx
<button className="bg-[var(--etab-color)] hover:bg-[var(--etab-color-hover)]">
```

> 🧠 **Le thème par variable CSS** est une technique précieuse : changer une valeur en
> un point met à jour toute l'application, sans re-rendre React.

## 7.7 Ce qu'il ne faut PAS mettre dans le magasin

| À éviter | Pourquoi | Où le mettre |
|---|---|---|
| listes d'élèves/paiements | volumineuses, propres à un écran | `useState` local |
| état de formulaire | éphémère | `useState` local |
| résultat de requête avec filtres | duplication, péremption | état local + rechargement |
| objets dérivés | inutile | `useMemo` / calcul |

Le magasin global ne doit contenir que ce qui est **vraiment transverse et durable**.

## 7.8 Persistance, versionnage et migration

Aujourd'hui, `persist` n'a pas de `version`. Si la forme de `UserInfo` change (par
exemple `etablissementId` devient `etablissements: string[]`), les anciennes sessions
seront désérialisées dans une forme incompatible.

Solution robuste :

```ts
persist(store, {
  name: 'sgfs-storage',
  version: 2,
  migrate: (persisted: any, version) => {
    if (version < 2) {
      persisted.user = { ...persisted.user, etablissements: persisted.user.etablissementId ? [persisted.user.etablissementId] : [] }
    }
    return persisted
  },
  partialize: (s) => ({ token: s.token, user: s.user, isAuthenticated: s.isAuthenticated }),
})
```

> **Exercice 7.2** — Ajoutez `version: 1` puis simulez un changement de forme de
> `UserInfo` et écrivez la migration correspondante. Testez en modifiant à la main le
> localStorage (`sgfs-storage`) dans la console du WebView.

> **Exercice 7.3** — Ajoutez au magasin `anneeScolaireCourante` et son setter, puis
> utilisez-la dans `ElevesPage` comme valeur initiale du filtre `year`. Attention à ne
> pas casser la logique `locked` des secrétaires.

## 7.9 À retenir

- Zustand : simple, sans Provider, persistance intégrée.
- `partialize` limite ce qui est stocké ; `version` + `migrate` préparent l'avenir.
- `getState()` pour agir hors React, sélecteurs pour limiter les rendus.
- Les règles de rôle et de périmètre vivent dans `store.ts`, pas dans chaque écran.
- État local pour l'éphémère, magasin pour le transverse.
