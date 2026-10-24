# 5. React et Next.js dans ce projet

## 5.1 Next.js 14, mais seulement le routeur

Le dépôt utilise Next.js en **export statique** :

```js
// next.config.mjs
const nextConfig = {
  output: 'export',
  images: { unoptimized: true },
  reactStrictMode: true,
}
```

Conséquence : pas de serveur Node en production. Le build produit un dossier `out/`
de fichiers HTML/CSS/JS que Tauri embarque. Next.js n'est donc utilisé que pour :

- structurer l'application (`src/app/layout.tsx`, `src/app/page.tsx`) ;
- compiler JSX/TypeScript ;
- optimiser le CSS et les bundles.

> 🧠 **À retenir** : dans un projet Tauri, Next.js n'est pas un serveur, c'est un
> **compilateur de front-end**. Toute la logique serveur vit en Rust.

## 5.2 `layout.tsx` : le squelette

```tsx
// src/app/layout.tsx
import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "SGFS-ME",
  description: "Système de Gestion Financière et Scolaire",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="min-h-screen bg-black font-poppins text-gray-900 antialiased">
        {children}
      </body>
    </html>
  )
}
```

Points à observer :

- `lang="fr"` : accessibilité et césure correcte ;
- `children` : React injecte ici le contenu de `page.tsx` ;
- `antialiased` : rendu de police plus net (Tailwind) ;
- `font-poppins` : police déclarée dans `tailwind.config.js`.

## 5.3 `page.tsx` : le chef d'orchestre

`src/app/page.tsx` est un composant **client** (`'use client'`) qui décide de tout :
accueil, connexion, ou application. Sa logique tient en quatre blocs.

### Bloc 1 — session au démarrage

```tsx
useEffect(() => {
  async function checkSession() {
    try {
      const token = getStoredAuthToken()
      if (!token) { useAppStore.getState().logout(); setLoading(false); return }
      const data = await tc.getMe(token)
      if (data.success && data.data) useAppStore.getState().login(data.data, token)
      else useAppStore.getState().logout()
    } catch {
      useAppStore.getState().logout()
    } finally {
      setLoading(false)
    }
  }
  checkSession()
}, [])
```

Trois principes ici :

1. `useEffect(…, [])` = « au montage seulement ».
2. On **vérifie** le jeton auprès du back-end : un localStorage peut être périmé.
3. `finally` garantit que l'écran de chargement disparaît, même en cas d'erreur.

> ⚠️ `data.success && data.data` — le back-end renvoie `{success:true, data:{…}}`.
> Si vous changez ce contrat côté Rust, **tous** les écrans se cassent silencieusement.
> C'est le type de couplage qu'il faut documenter (voir chapitre 11).

### Bloc 2 — contexte de l'établissement

```tsx
useEffect(() => {
  if (!isAuthenticated || !user || etablissements.length === 0) return

  let targetId: string | undefined
  if (user.role === 'COORDINATEUR') {
    targetId = etablissements.find((e: any) => e.actif !== false)?.id
  } else {
    targetId = user.etablissementId || undefined
  }
  if (!targetId) return

  tc.getEtablissementContext(targetId)
    .then((data: any) => {
      if (data.success && data.data) {
        setCurrentEtablissement(data.data.etablissement)
        setEtabParams(data.data.parametres ?? null)
      }
    })
    .catch(() => {})
}, [isAuthenticated, user, etablissements])
```

Ici se joue une règle métier : le coordonnateur voit toutes les écoles, un secrétaire
est **verrouillé** sur la sienne. On retrouve cette logique dans chaque écran via
`getSchoolFilter`.

### Bloc 3 — synchronisation automatique

```tsx
const initialTimer = setTimeout(runAutoSync, 30000)          // 30 s après connexion
const interval = setInterval(runAutoSync, 5 * 60 * 1000)     // toutes les 5 min
window.addEventListener('local-data-changed', scheduleAfterChange) // 5 s après écriture
window.addEventListener('online', runAutoSync)

return () => {
  clearTimeout(initialTimer)
  clearInterval(interval)
  if (changeTimer) clearTimeout(changeTimer)
  window.removeEventListener('local-data-changed', scheduleAfterChange)
  window.removeEventListener('online', runAutoSync)
}
```

> 🧠 **Le nettoyage d'effet n'est pas optionnel.** Sans le `return`, chaque
> re-connexion empile un nouvel intervalle : la synchronisation partirait 5, 10, 15 fois
> par minute. C'est le bug React le plus courant en production.

Le « debounce » de 5 secondes est une décision produit : trois écritures rapides
(élève + tuteur + inscription) ne déclenchent qu'une synchronisation.

### Bloc 4 — rendu conditionnel

```tsx
if (loading) return <ÉcranDeChargement />
if (!isAuthenticated) return showLogin ? <LoginPage /> : <Accueil />

const renderPage = () => {
  switch (currentPage) {
    case 'dashboard':     return <DashboardPage />
    case 'eleves':        return <ElevesPage />
    case 'encaissements': return <EncaissementsPage />
    // …
    default:              return <DashboardPage />
  }
}
```

Deux styles de navigation coexistent : un **switch** sur `currentPage` (état Zustand)
et un routage Next.js absent. C'est un choix : une application de bureau à fenêtre unique
n'a pas besoin d'URL. Avantage : simplicité et état conservé. Inconvénient : pas de lien
profond, pas de bouton « retour ».

## 5.4 Les hooks utilisés dans le projet

| Hook | Usage réel dans SGFS-ME |
|---|---|
| `useState` | filtres, formulaires, données chargées, dialogues |
| `useEffect` | chargement initial, réactions aux dépendances, abonnements |
| `useCallback` | stabiliser `fetchStudents`, évitant une boucle infinie d'effets |
| `useMemo` | variables CSS dérivées de la couleur d'établissement |
| `useRef` | (rare) références DOM pour impression |
| hooks shadcn | `use-toast`, `use-mobile` |

### Le duo `useCallback` + `useEffect`

```tsx
const fetchStudents = useCallback(async () => { /* … */ },
  [user, role, userEtabId, school, year, classe, search, page, filterNoClass])

useEffect(() => { fetchStudents() }, [fetchStudents])
```

Si `fetchStudents` n'était pas mémorisée, elle serait recréée à chaque rendu ; l'effet
la verrait « changer » et rechargerait… à l'infini. Retenez la règle :
**fonction utilisée comme dépendance ⇒ `useCallback`**.

### Dériver plutôt que stocker

```tsx
const cssVars = useMemo(() => {
  const color = currentEtablissement?.couleurPrincipale || DEFAULT_COLOR
  return {
    '--etab-color': color,
    '--etab-color-hover': darkenHex(color),
    '--etab-color-light': color + '10',
  } as React.CSSProperties
}, [currentEtablissement?.couleurPrincipale])
```

On ne stocke pas `couleurHover` dans l'état : on la calcule. Moins d'état = moins de bugs.

## 5.5 Le rendu des listes

```tsx
students.map((s) => (
  <TableRow key={s.id}>
    <TableCell>{s.matricule}</TableCell>
    <TableCell>{s.nom} {s.prenom}</TableCell>
    <TableCell>{s.inscriptions?.[0]?.classe?.nom ?? '—'}</TableCell>
  </TableRow>
))
```

- `key={s.id}` : identifiant stable. Ne mettez **jamais** l'index du tableau quand la
  liste peut être filtrée ou triée.
- `?? '—'` : un trou dans la donnée n'est pas une erreur, c'est un cas d'affichage.

## 5.6 Les événements personnalisés (`CustomEvent`)

Le projet communique entre composants éloignés via `window` :

```ts
window.dispatchEvent(new Event('go-to-login'))
window.dispatchEvent(new Event('go-to-accueil'))
window.dispatchEvent(new Event('local-data-changed'))
window.dispatchEvent(new Event('sync-completed'))
```

et côté écoute :

```tsx
useEffect(() => {
  const goToLogin = () => setShowLogin(true)
  window.addEventListener('go-to-login', goToLogin)
  return () => window.removeEventListener('go-to-login', goToLogin)
}, [])
```

C'est un **bus d'événements minimal**. Très pratique ; à réserver aux événements
transverses (session, synchronisation). Pour de la donnée applicative, préférez Zustand.

> 🔧 **Exercice 5.1** — Le composant `Sidebar` déclenche `local-data-changed` ? Vérifiez.
> Puis listez tous les endroits du dépôt qui écoutent cet événement :
> ```bash
> grep -rn "local-data-changed" src/
> ```
> Combien d'écrans se rafraîchissent après une synchronisation ? Que manque-t-il ?

## 5.7 `'use client'` : pourquoi partout ?

En Next.js 14, les composants sont des *Server Components* par défaut. Comme l'export est
statique et que tout tourne dans la WebView, chaque composant qui utilise un état, un
effet ou un gestionnaire d'événement doit déclarer :

```tsx
'use client'
```

Symptômes d'un oubli :

- `useState is not a function` ou erreur « You're importing a component that needs useState » ;
- écran vide lors du build statique.

## 5.8 Structure d'un écran métier

Tous les écrans de `src/components/sgfs/` suivent la même ossature. Apprenez-la, vous
pourrez créer le prochain en une heure.

```text
1. imports (UI, icônes, tc, store, toast)
2. types locaux (School, Year, Classe, Student)
3. constantes (empty, STATUS_LABEL, couleurs)
4. composant :
   a. hooks du store (user, role, permissions)
   b. useState (données, filtres, pagination, formulaires, dialogues)
   c. useCallback de chargement (fetchSchools, fetchYears, fetchClasses, fetchStudents)
   d. useEffect de déclenchement
   e. handlers (openCreate, openEdit, handleSave, handleDelete, showDetail)
   f. rendu : header, filtres, tableau, dialogues, pagination
```

> **Exercice 5.2** — Ouvrez `UtilisateursPage.tsx` et `DepensesPage.tsx`. Vérifiez que
> ces huit sections s'y retrouvent. Notez les écarts (ordre, hooks supplémentaires) :
> un projet vivant n'est jamais parfaitement uniforme.

> **Exercice 5.3** — Dans `page.tsx`, remplacez le délai initial de synchronisation de
> 30 s par 10 s, puis observez les logs. Pourquoi un délai trop court au démarrage est-il
> problématique ? (Indice : que fait `sync_push` au premier lancement ?)

## 5.9 À retenir

- Next.js sert uniquement à compiler et structurer ; il n'y a pas de serveur.
- Un composant par écran, une ossature répétée, des hooks standards.
- `useEffect` + `useCallback` : la dépendance est la clé de la stabilité.
- Les événements `window` servent aux signaux transverses.
- Toujours nettoyer les abonnements et les minuteurs.
