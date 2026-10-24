# 8. Construire un écran CRUD complet

Ce chapitre est un atelier. Nous allons décortiquer `ElevesPage.tsx` — l'écran le plus
représentatif du projet — puis vous construirez votre propre écran selon la même recette.

**CRUD** = Create, Read, Update, Delete. Un écran de gestion doit savoir lister, filtrer,
créer, consulter, modifier et archiver.

## 8.1 Le contrat de l'écran

L'écran Élèves doit permettre de :

| Besoin | Élément d'interface | Commande appelée |
|---|---|---|
| voir les élèves | tableau paginé | `list_eleves` |
| filtrer | recherche + établissement + année + classe | paramètres de `list_eleves` |
| repérer les cas problématiques | bouton « Sans classe » | filtre côté client |
| inscrire | dialogue « Nouvel élève » | `create_eleve` |
| consulter | fiche détaillée | `get_eleve` |
| modifier | même dialogue, pré-rempli | `update_eleve` |
| archiver | dialogue de confirmation | `delete_eleve` |

> 🧠 **Règle d'or** : l'écran ne décide pas des règles métier. Il collecte, affiche,
> transmet. Les contrôles réels (établissement actif, année active, classe cohérente)
> sont dans `create_eleve` côté Rust.

## 8.2 Étape 1 — L'état

```tsx
const [students, setStudents]   = useState<Student[]>([])
const [schools, setSchools]     = useState<School[]>([])
const [years, setYears]         = useState<Year[]>([])
const [classes, setClasses]     = useState<Classe[]>([])

const [school, setSchool]       = useState(locked ? schoolFilter! : '')
const [year, setYear]           = useState('')
const [classe, setClasse]       = useState('')
const [search, setSearch]       = useState('')
const [filterNoClass, setFilterNoClass] = useState(false)
const [page, setPage]           = useState(1)
const [totalPages, setTotalPages] = useState(1)
const [total, setTotal]         = useState(0)
const [loading, setLoading]     = useState(true)

const [form, setForm]           = useState(empty)
const [formOpen, setFormOpen]   = useState(false)
const [editingId, setEditingId] = useState<string | null>(null)
const [busy, setBusy]           = useState(false)
const [detail, setDetail]       = useState<Student | null>(null)
const [deleteTarget, setDeleteTarget] = useState<Student | null>(null)
```

### Découpage mental

```text
données serveur   : students, schools, years, classes
filtres           : school, year, classe, search, filterNoClass, page
état d'interface  : loading, busy, formOpen, detail, deleteTarget
formulaire        : form, editingId
```

Un écran lisible est un écran dont **chaque `useState` appartient clairement à une de ces
quatre familles**. Si vous ne savez pas où ranger un état, c'est souvent qu'il est dérivable.

## 8.3 Étape 2 — Le chargement

```tsx
const fetchStudents = useCallback(async () => {
  if (!user) return
  setLoading(true)
  try {
    const sf = getSchoolFilter(role, userEtabId)
    const etabId = sf || school || undefined

    const res = await tc.listEleves({
      etablissementId: etabId,
      anneeScolaireId: year || undefined,
      classeId: classe || undefined,
      search: search || undefined,
      page,
      pageSize: 15,
    })

    let students = res?.data ?? []
    if (filterNoClass) {
      students = students.filter((s: Student) => {
        const inscriptions = s.inscriptions || s.classes || []
        return !inscriptions.some((x: any) =>
          x.statut === 'ACTIF' && (x.classe_id || x.classe?.id))
      })
    }
    setStudents(students)
    setTotal(filterNoClass ? students.length : (res?.pagination?.total ?? 0))
    setTotalPages(filterNoClass ? Math.ceil(students.length / 15) : (res?.pagination?.totalPages ?? 1))
  } catch (e: any) {
    toast.error(e?.message || 'Erreur chargement')
  } finally {
    setLoading(false)
  }
}, [user, role, userEtabId, school, year, classe, search, page, filterNoClass])
```

À observer :

- **un seul point d'entrée réseau** par liste (pas d'appel dispersé dans le JSX) ;
- `setLoading(true)` avant, `false` dans `finally` : jamais de spinner bloqué ;
- les filtres vides deviennent `undefined`, pas `''` (côté Rust, `''` est une valeur, pas
  une absence) ;
- le filtre « sans classe » est appliqué **côté client** — acceptable car la page ne
  contient que 15 lignes, mais faux sur une grosse pagination (exercice 8.2).

> ⚠️ **Défaut réel** : quand `filterNoClass` est actif, on filtre *après* pagination. Les
> compteurs deviennent approximatifs. La bonne solution est un paramètre
> `sansClasse=true` traité par `list_eleves` en SQL.

## 8.4 Étape 3 — Déclencher sans boucler

```tsx
useEffect(() => { if (user) fetchSchools() }, [user, fetchSchools])
useEffect(() => { fetchYears() }, [fetchYears])
useEffect(() => { fetchClasses() }, [fetchClasses])
useEffect(() => { fetchStudents() }, [fetchStudents])

useEffect(() => {
  const handleSync = () => { fetchStudents(); fetchClasses() }
  window.addEventListener('sync-completed', handleSync)
  return () => window.removeEventListener('sync-completed', handleSync)
}, [fetchStudents, fetchClasses])
```

Chaque fonction de chargement a **un** effet qui la déclenche. Quand un filtre change,
la fonction change (nouvelle identité `useCallback`), l'effet se relance : le rechargement
est automatique, sans écrire `onChange={… fetch()}` partout.

> 🧠 Pensez « l'état pilote, l'effet suit ». C'est le renversement qui rend React
> prévisible.

## 8.5 Étape 4 — Le formulaire

```tsx
const empty = {
  nom: '', prenom: '', sexe: 'M', dateNaissance: '', lieuNaissance: '',
  etablissementId: '', anneeScolaireId: '', classeId: '',
  tuteurNom: '', tuteurPrenom: '', tuteurTelephone: '', tuteurTelephone2: '',
  tuteurRelation: 'Père', tuteurAdresse: '', tuteurProfession: '',
}
```

Ouverture en création :

```tsx
function openCreate() {
  setEditingId(null)
  setForm({ ...empty, etablissementId: school || (locked ? schoolFilter! : ''), anneeScolaireId: year })
  setClassSearch('')
  setShowClassDropdown(false)
  setFormOpen(true)
}
```

Ouverture en modification — le vrai travail est de **retrouver les valeurs** dans une
réponse imbriquée :

```tsx
const ins = (s.inscriptions || s.classes || []).find((x: any) => x.statut === 'ACTIF')
         ?? (s.inscriptions || s.classes || [])[0]
const t = s.tuteurs?.find((x: any) => x.tuteur?.isPrincipal)?.tuteur
       ?? s.tuteurs?.[0]?.tuteur

setForm({
  ...empty,
  nom: s.nom, prenom: s.prenom, sexe: s.sexe,
  dateNaissance: s.dateNaissance ?? (s as any).date_naissance ?? '',
  etablissementId: etabId,
  anneeScolaireId: ins?.classe?.anneeScolaire?.id ?? (s as any).anneeScolaireId ?? '',
  classeId: ins?.classeId ?? ins?.classe_id ?? ins?.classe?.id ?? '',
  tuteurNom: t?.nom ?? '', tuteurPrenom: t?.prenom ?? '',
  tuteurTelephone: t?.telephone ?? '',
  // …
})
setEditingId(s.id)
setFormOpen(true)
```

> ⚠️ Cette cascade de `??` montre que **le format de réponse n'est pas stable** entre
> endpoints (`camelCase` ici, `snake_case` là). Un travail utile : créer un
> `normalizeEleve()` unique et testé (exercice 8.4).

Validation minimale côté client :

```tsx
if (!form.nom.trim() || !form.prenom.trim() || !form.etablissementId
    || !form.anneeScolaireId || !form.classeId) {
  toast.error('Veuillez remplir tous les champs obligatoires (*)')
  return
}
```

## 8.6 Étape 5 — Enregistrer

```tsx
async function handleSave() {
  // validation…
  setBusy(true)
  const payload = {
    nom: form.nom.trim(), prenom: form.prenom.trim(), sexe: form.sexe,
    dateNaissance: form.dateNaissance || undefined,
    lieuNaissance: form.lieuNaissance || undefined,
    etablissementId: form.etablissementId,
    anneeScolaireId: form.anneeScolaireId,
    classeId: form.classeId,
    tuteurs: form.tuteurNom.trim() && form.tuteurPrenom.trim() ? [{
      nom: form.tuteurNom.trim(), prenom: form.tuteurPrenom.trim(),
      telephone: form.tuteurTelephone.trim() || 'Non renseigné',
      relation: form.tuteurRelation,
      profession: form.tuteurProfession || undefined,
      isPrincipal: true,
    }] : [],
  }

  try {
    if (editingId) {
      await tc.updateEleve(editingId, payload)
      toast.success('Élève modifié avec succès')
    } else {
      await tc.createEleve(payload)
      toast.success('Élève inscrit avec succès')
    }
    setFormOpen(false)
    fetchStudents()
  } catch (e: any) {
    toast.error(typeof e === 'string' ? e : e?.message || 'Erreur inconnue')
  } finally {
    setBusy(false)
  }
}
```

Les cinq gestes du « save » réussi :

1. désactiver le bouton (`busy`) pour éviter le double envoi ;
2. envoyer des données **nettoyées** (`trim()`, vides → `undefined`) ;
3. fermer le dialogue **après** le succès seulement ;
4. recharger la liste (ou insérer le résultat dans l'état) ;
5. notifier l'utilisateur.

> 🧠 Pourquoi recharger plutôt qu'insérer localement ? Parce que le back-end enrichit la
> réponse (matricule généré, classe jointe, statut). Recharger garantit la cohérence,
> au prix d'un aller-retour local — négligeable en SQLite.

## 8.7 Étape 6 — Supprimer (archiver)

```tsx
async function handleDelete() {
  if (!isCoordinateur(role)) {
    toast.error("Seul l'Administrateur / Coordonnateur peut archiver un élève.")
    return
  }
  if (!deleteTarget) return
  setBusy(true)
  try {
    await tc.deleteEleve(deleteTarget.id)
    toast.success('Élève archivé avec succès')
    setDeleteTarget(null)
    fetchStudents()
  } catch (e: any) {
    toast.error(typeof e === 'string' ? e : e?.message || 'Erreur')
  } finally {
    setBusy(false)
  }
}
```

Deux principes :

- **confirmation obligatoire** via un dialogue dédié, jamais `window.confirm` ;
- côté Rust, la suppression est en réalité une **archivation** (l'élève garde son
  historique financier). Un logiciel de gestion ne supprime pas des gens.

## 8.8 Étape 7 — Les états d'écran

Un écran professionnel gère **quatre** états, pas deux :

```tsx
{loading ? (
  <TableRow><TableCell colSpan={6}>Chargement du répertoire…</TableCell></TableRow>
) : students.length === 0 ? (
  <TableRow><TableCell colSpan={6}>Aucun élève trouvé.</TableCell></TableRow>
) : (
  students.map(/* … */)
)}
```

| État | Question de l'utilisateur | Réponse de l'interface |
|---|---|---|
| chargement | « ça marche ? » | indicateur explicite |
| vide | « pourquoi rien ? » | message + action suggérée |
| erreur | « qu'est-ce que je fais ? » | toast avec cause |
| plein | « où est ce que je cherche ? » | filtres + pagination |

> 🔧 Le cas « erreur » est aujourd'hui un toast fugace. Amélioration : un bandeau
> persistant avec bouton « Réessayer » (exercice 8.3).

## 8.9 La pagination

```tsx
<Button variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>Précédent</Button>
<span>Page {page} / {totalPages}</span>
<Button variant="outline" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Suivant</Button>
```

Deux règles :

1. **remettre `page` à 1** quand un filtre change, sinon on peut demander la page 5 d'un
   résultat qui n'en compte plus qu'une ;
2. refléter `total` à l'utilisateur : sans cela, aucune confiance dans la recherche.

## 8.10 Atelier : votre propre écran

> **Exercice 8.1 (guidé, ~45 min)** — Créez `src/components/sgfs/eleves/ElevesSansClassePage.tsx`
> qui affiche uniquement les élèves sans inscription active, avec un bouton
> « Affecter à une classe » ouvrant un dialogue (classe + année).
>
> Indications :
> - commande existante : `list_eleves_sans_classe` (déjà dans `lib.rs`) ;
> - réutilisez `Table`, `Dialog`, `Select`, `toast` ;
> - n'ajoutez **aucun** appel réseau nouveau : réutilisez `tc.*` ;
> - pour affecter, il n'existe pas de commande dédiée : passez par `update_eleve` avec un
>   `classeId`, ou écrivez la commande manquante (chapitre 11).
>
> Grille d'auto-évaluation :
> - [ ] l'écran s'affiche sans erreur en mode Tauri ;
> - [ ] les quatre états (chargement / vide / erreur / plein) sont visibles ;
> - [ ] un changement de filtre remet la page à 1 ;
> - [ ] aucune boucle de requêtes dans la console ;
> - [ ] le code respecte l'ordre des sections de la §5.8.

> **Exercice 8.2** — Ajoutez `sans_classe: bool` à `list_eleves` (Rust) et filtrez en SQL
> avec `NOT EXISTS (SELECT 1 FROM EleveClasse ec WHERE ec.eleve_id = e.id AND ec.statut='ACTIF')`.
> Puis retirez le filtrage client. Vérifiez la cohérence de `total`.

> **Exercice 8.3** — Remplacez le toast d'erreur par un bandeau persistant :
> nouvel état `error: string | null`, affiché au-dessus du tableau, avec bouton
> « Réessayer » appelant `fetchStudents()`.

> **Exercice 8.4** — Écrivez `normalizeEleve(raw: any): Student` et utilisez-la dans
> `openEdit` et `showDetail`. Objectif : plus aucun `??` dans le JSX.

## 8.11 À retenir

- Un écran = quatre familles d'état, une fonction de chargement, des effets pilotés.
- Les filtres vides deviennent `undefined` ; la page revient à 1 à chaque changement.
- Sauvegarder : valider, désactiver, envoyer proprement, fermer après succès, recharger.
- Supprimer = archiver ; toujours avec confirmation et droits.
- Quatre états d'écran : chargement, vide, erreur, plein.
