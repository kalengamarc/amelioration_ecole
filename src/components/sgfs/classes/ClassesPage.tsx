'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAppStore, getTypeIcon, onEtabSelect, getSchoolFilter, canManageClasses } from '@/lib/store'
import * as tc from '@/lib/tauri-commands'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { motion } from 'framer-motion'
import {
  GraduationCap, Plus, Edit, Trash2, ShieldAlert, Users, Layers,
  BarChart3, AlertTriangle, ChevronLeft, ChevronRight, Search, Loader2, // <-- AJOUTÉ
} from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────────────────────

interface Etablissement {
  id: string
  nom: string
  type?: string
}

interface AnneeScolaire {
  id: string
  libelle: string
  active?: boolean
}

interface ClasseItem {
  id: string
  nom: string
  niveau: string
  etablissementId: string
  anneeScolaireId: string
  effectifMax: number
  etablissement?: { nom: string }
  anneeScolaire?: { id: string; libelle: string }
  effectif: number
}

// ─── Constants & Helpers ─────────────────────────────────────────────────────

const NIVEAU_MAP: Record<string, { label: string; className: string }> = {
  MATERNELLE: {
    label: 'Maternelle',
    className: 'bg-pink-50 text-pink-700 border border-pink-100',
  },
  PRIMAIRE: {
    label: 'Primaire',
    className: 'bg-emerald-50 text-emerald-700 border border-emerald-100',
  },
  SECONDAIRE: {
    label: 'Secondaire',
    className: 'bg-amber-50 text-amber-700 border border-amber-100',
  },
}

const NIVEAUX = ['MATERNELLE', 'PRIMAIRE', 'SECONDAIRE'] as const

const emptyForm = {
  nom: '',
  niveau: 'PRIMAIRE',
  etablissementId: '',
  anneeScolaireId: '',
  effectifMax: '40',
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.05 } },
}

const itemVariants = {
  hidden: { opacity: 0, y: 15 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3 } },
}

function getTauxRemplissage(eleves: number, max: number): number {
  if (!max || max <= 0) return 0
  return Math.min(100, Math.round((eleves / max) * 100))
}

// Correction des classes dynamiques
function getTauxBarClass(taux: number): string {
  if (taux >= 90) return '[&>div]:bg-red-500'
  if (taux >= 70) return '[&>div]:bg-emerald-500'
  if (taux >= 50) return '[&>div]:bg-amber-500'
  return '[&>div]:bg-black'
}

function getTauxTextClass(taux: number): string {
  if (taux >= 90) return 'text-red-600 font-semibold'
  if (taux >= 70) return 'text-emerald-600'
  if (taux >= 50) return 'text-amber-600'
  return 'text-gray-400'
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function ClassesPage() {
  const { user } = useAppStore()

  // Data states
  const [classes, setClasses] = useState<ClasseItem[]>([])
  const [ecoles, setEcoles] = useState<Etablissement[]>([])
  const [annees, setAnnees] = useState<AnneeScolaire[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Filter states
  const [filterEcole, setFilterEcole] = useState('all')
  const [filterAnnee, setFilterAnnee] = useState('')
  const [filterNiveau, setFilterNiveau] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')

  // Pagination
  const [page, setPage] = useState(1)
  const pageSize = 10

  // Dialog states
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)

  // Delete dialog state
  const [deleteTarget, setDeleteTarget] = useState<ClasseItem | null>(null)
  const [deleting, setDeleting] = useState(false)

  // ─── Derived: permission ─────────────────────────────────────────────────

  const role = user?.role ?? ''
  const etabIdUser = user?.etablissementId ?? null
  const schoolFilter = getSchoolFilter(role, etabIdUser)
  const locked = !!schoolFilter

  // ─── Fetch: Établissements ───────────────────────────────────────────────

  const fetchEcoles = useCallback(async () => {
    try {
      const res = await tc.listEtablissements(locked ? schoolFilter! : undefined)
      const data = res?.etablissements ?? []
      const list: Etablissement[] = Array.isArray(data) ? data : []
      setEcoles(list)
      if (locked && schoolFilter) {
        setFilterEcole(schoolFilter)
      }
    } catch {
      // silent
    }
  }, [locked, schoolFilter])

  // ─── Fetch: Années scolaires ─────────────────────────────────────────────

  const fetchAnnees = useCallback(
    async (etablissementId: string) => {
      try {
        const res = await tc.listAnneesScolaires(etablissementId)
        const data = res?.annees_scolaires ?? []
        const list: AnneeScolaire[] = Array.isArray(data) ? data : []
        setAnnees(list)
        if (!filterAnnee && list.length > 0) {
          const active = list.find((a) => a.active)
          setFilterAnnee(active?.id ?? list[0].id)
        }
      } catch {
        setAnnees([])
      }
    },
    [filterAnnee]
  )

  // ─── Fetch: Classes ─────────────────────────────────────────────────────

  const fetchClasses = useCallback(async () => {
    if (!user) return
    setLoading(true)
    try {
      const sf = getSchoolFilter(role, etabIdUser)
      const etabId = sf || (filterEcole && filterEcole !== 'all' ? filterEcole : undefined)
      const anneeId = filterAnnee || undefined

      const res = await tc.listClasses(etabId, anneeId)
      const data = res?.classes ?? []
      const mapped: ClasseItem[] = (Array.isArray(data) ? data : []).map((c: any) => ({
        ...c,
        effectif: c.effectif ?? c._count?.eleves ?? 0,
      }))
      setClasses(mapped)
    } catch (error: any) {
      toast.error(error?.message || error?.error || 'Erreur lors du chargement des classes')
    } finally {
      setLoading(false)
    }
  }, [user, role, etabIdUser, filterEcole, filterAnnee]) // Retiré filterNiveau

  // ─── Effects ─────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!user) return
    fetchEcoles()
  }, [user, fetchEcoles])

  useEffect(() => {
    if (locked) {
      fetchAnnees(schoolFilter!)
    } else if (filterEcole && filterEcole !== 'all') {
      setFilterAnnee('')
      fetchAnnees(filterEcole)
    } else {
      setAnnees([])
      setFilterAnnee('')
    }
  }, [filterEcole, locked, schoolFilter])

  useEffect(() => {
    const timer = setTimeout(fetchClasses, 200)
    return () => clearTimeout(timer)
  }, [fetchClasses])

  useEffect(() => {
    setPage(1)
  }, [filterEcole, filterAnnee, filterNiveau, searchQuery])

  // ─── Filtering & Pagination (Côté client pour la recherche et le niveau) ──

  const filteredClasses = useMemo(() => {
    let result = classes
    
    if (filterNiveau !== 'all') {
      result = result.filter(c => c.niveau === filterNiveau)
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(c => c.nom.toLowerCase().includes(q))
    }

    return result
  }, [classes, filterNiveau, searchQuery])

  // ─── Stats ────────────────────────────────────────────────────────────────

  const stats = useMemo(() => {
    const totalClasses = filteredClasses.length
    const totalEleves = filteredClasses.reduce((sum, c) => sum + (c.effectif ?? 0), 0)
    const niveauxCouverts = new Set(filteredClasses.map((c) => c.niveau)).size
    const effectifMoyen = totalClasses > 0 ? Math.round(totalEleves / totalClasses) : 0
    return { totalClasses, totalEleves, niveauxCouverts, effectifMoyen }
  }, [filteredClasses])

  // ─── Selected year label ─────────────────────────────────────────────────

  const selectedYearLabel = useMemo(() => {
    if (!filterAnnee) return ''
    const found = annees.find((a) => a.id === filterAnnee)
    return found?.libelle ?? ''
  }, [filterAnnee, annees])

  // ─── Pagination ───────────────────────────────────────────────────────────

  const totalItems = filteredClasses.length
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))

  const paginatedClasses = useMemo(() => {
    const start = (page - 1) * pageSize
    return filteredClasses.slice(start, start + pageSize)
  }, [filteredClasses, page])

  // ─── Form: Dialog years list ─────────────────────────────────────────────

  const formAnnees = useMemo(() => {
    return annees
  }, [annees])

  // ─── Handlers ─────────────────────────────────────────────────────────────

  function openCreate() {
    setEditingId(null)
    setForm({
      ...emptyForm,
      etablissementId: locked ? schoolFilter! : filterEcole !== 'all' ? filterEcole : '',
      anneeScolaireId: filterAnnee || '',
    })
    setDialogOpen(true)
  }

  function openEdit(classe: ClasseItem) {
    setEditingId(classe.id)
    setForm({
      nom: classe.nom,
      niveau: classe.niveau,
      etablissementId: classe.etablissementId,
      anneeScolaireId: classe.anneeScolaireId,
      effectifMax: String(classe.effectifMax || 40),
    })
    setDialogOpen(true)
  }

  async function handleSave() {
    if (!form.nom.trim()) {
      toast.error('Le nom de la classe est obligatoire')
      return
    }
    if (!form.etablissementId) {
      toast.error("L'établissement est obligatoire")
      return
    }
    if (!form.anneeScolaireId) {
      toast.error("L'année scolaire est obligatoire")
      return
    }
    const effectifMax = Number(form.effectifMax)
    if (!Number.isFinite(effectifMax) || effectifMax <= 0) {
      toast.error("L'effectif maximum doit être un nombre positif")
      return
    }

    setSaving(true)
    try {
      const payload = {
        nom: form.nom.trim(),
        niveau: form.niveau,
        etablissementId: form.etablissementId,
        anneeScolaireId: form.anneeScolaireId,
        effectifMax,
      }

      if (editingId) {
        await tc.updateClasse(editingId, {
          nom: payload.nom,
          niveau: payload.niveau,
          effectifMax: payload.effectifMax,
        })
        toast.success('Classe mise à jour avec succès')
      } else {
        await tc.createClasse(payload)
        toast.success('Classe créée avec succès')
      }
      setDialogOpen(false)
      fetchClasses()
    } catch (error: any) {
      toast.error(error?.message || error?.error || "Erreur lors de l'enregistrement")
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await tc.deleteClasse(deleteTarget.id)
      const hasStudents = (deleteTarget.effectif ?? 0) > 0
      toast.success(
        hasStudents
          ? 'Classe désactivée avec succès'
          : 'Classe supprimée définitivement'
      )
      setDeleteTarget(null)
      fetchClasses()
    } catch (error: any) {
      toast.error(error?.message || error?.error || 'Erreur lors de la suppression')
    } finally {
      setDeleting(false)
    }
  }

  // ─── Permission Guard ────────────────────────────────────────────────────

  if (user && !canManageClasses(user.role)) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex min-h-[60vh] flex-col items-center justify-center gap-4"
      >
        <ShieldAlert className="h-16 w-16 text-red-400" />
        <h2 className="text-2xl font-bold">Accès réservé</h2>
        <p className="text-muted-foreground">
          La gestion des classes est réservée au coordonnateur.
        </p>
      </motion.div>
    )
  }

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-6"
    >
      {/* Header */}
      <motion.div
        variants={itemVariants}
        className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center"
      >
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">
            Gestion des Classes
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {selectedYearLabel ? (
              <>Année en cours : <span className="font-medium text-[var(--etab-color,#075e54)]">{selectedYearLabel}</span></>
            ) : (
              "Organisez vos classes par niveau et établissement."
            )}
          </p>
        </div>
        <Button
          onClick={openCreate}
          className="gap-2 bg-[var(--etab-color,#075e54)] text-white hover:bg-[var(--etab-color-hover,#064e46)] shadow-sm"
        >
          <Plus className="h-4 w-4" />
          Nouvelle classe
        </Button>
      </motion.div>

      {/* Filters Row */}
      <motion.div
        variants={itemVariants}
        className="flex flex-col gap-3 rounded-xl border border-gray-100 bg-white p-4 shadow-sm sm:flex-row sm:items-center"
      >
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            placeholder="Rechercher une classe..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-9 border-gray-200 bg-gray-50/50 focus:bg-white"
          />
        </div>

        <Select
          value={filterEcole}
          onValueChange={(v) => {
            if (!locked) { setFilterEcole(v); onEtabSelect(v, ecoles) }
          }}
          disabled={locked}
        >
          <SelectTrigger className="w-full h-9 border-gray-200 sm:w-48">
            <SelectValue placeholder="Établissement" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les établissements</SelectItem>
            {ecoles.map((e) => (
              <SelectItem key={e.id} value={e.id}>
                {`${getTypeIcon(e.type || '')} ${e.nom}`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterAnnee} onValueChange={setFilterAnnee}>
          <SelectTrigger className="w-full h-9 border-gray-200 sm:w-44">
            <SelectValue placeholder="Année scolaire" />
          </SelectTrigger>
          <SelectContent>
            {annees.length === 0 && (
              <SelectItem value="__none" disabled>
                Sélectionnez un établissement
              </SelectItem>
            )}
            {annees.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.libelle} {a.active ? '★' : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterNiveau} onValueChange={setFilterNiveau}>
          <SelectTrigger className="w-full h-9 border-gray-200 sm:w-40">
            <SelectValue placeholder="Niveau" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les niveaux</SelectItem>
            {NIVEAUX.map((n) => (
              <SelectItem key={n} value={n}>
                {NIVEAU_MAP[n]?.label ?? n}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </motion.div>

      {/* Stats Cards */}
      <motion.div
        variants={itemVariants}
        className="grid grid-cols-2 gap-4 lg:grid-cols-4"
      >
        <Card className="border-0 shadow-sm bg-white">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="rounded-lg bg-[var(--etab-color,#075e54)]/10 p-2.5">
              <GraduationCap className="h-5 w-5 text-[var(--etab-color,#075e54)]" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">Total Classes</p>
              <p className="text-xl font-bold tracking-tight">{stats.totalClasses}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm bg-white">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="rounded-lg bg-emerald-500/10 p-2.5">
              <Users className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">Élèves inscrits</p>
              <p className="text-xl font-bold tracking-tight">{stats.totalEleves}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm bg-white">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="rounded-lg bg-violet-500/10 p-2.5">
              <Layers className="h-5 w-5 text-violet-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">Niveaux couverts</p>
              <p className="text-xl font-bold tracking-tight">{stats.niveauxCouverts}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm bg-white">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="rounded-lg bg-amber-500/10 p-2.5">
              <BarChart3 className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">Effectif moyen</p>
              <p className="text-xl font-bold tracking-tight">{stats.effectifMoyen}</p>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Table */}
      <motion.div variants={itemVariants}>
        <Card className="border-0 shadow-sm bg-white overflow-hidden">
          <CardContent className="p-0">
            {loading ? (
              <div className="space-y-3 p-6">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex gap-4">
                    <Skeleton className="h-8 w-1/4" />
                    <Skeleton className="h-8 w-1/6" />
                    <Skeleton className="h-8 w-1/4" />
                    <Skeleton className="h-8 w-1/5" />
                  </div>
                ))}
              </div>
            ) : paginatedClasses.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-16 text-muted-foreground">
                <div className="rounded-full bg-gray-100 p-4 mb-4">
                  <GraduationCap className="h-8 w-8 text-gray-400" />
                </div>
                <p className="font-medium">Aucune classe trouvée</p>
                <p className="mt-1 text-sm text-center max-w-sm">
                  {filterAnnee
                    ? 'Aucune classe ne correspond à vos filtres.'
                    : "Commencez par sélectionner un établissement et une année scolaire."}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent border-b border-gray-100  bg-[var(--etab-color,#075e54)] text-white">
                      <TableHead className="text-xs font-semibold uppercase tracking-wide">Nom</TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wider">Niveau</TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wider hidden md:table-cell">Établissement</TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wider hidden lg:table-cell">Année</TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wider ">Effectif</TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wider hidden sm:table-cell text-center">Taux</TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wider text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedClasses.map((classe) => {
                      const eleves = classe.effectif ?? 0
                      const max = classe.effectifMax || 40
                      const taux = getTauxRemplissage(eleves, max)
                      const niveauInfo = NIVEAU_MAP[classe.niveau] || {
                        label: classe.niveau,
                        className: 'bg-gray-50 text-gray-600 border border-gray-100',
                      }

                      return (
                        <TableRow
                          key={classe.id}
                          className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors"
                        >
                          <TableCell className="font-medium text-gray-900">
                            {classe.nom}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="secondary"
                              className={`font-medium ${niveauInfo.className}`}
                            >
                              {niveauInfo.label}
                            </Badge>
                          </TableCell>
                          <TableCell className="hidden md:table-cell text-muted-foreground">
                            {classe.etablissement?.nom ?? '—'}
                          </TableCell>
                          <TableCell className="hidden lg:table-cell text-muted-foreground">
                            {classe.anneeScolaire?.libelle ?? '—'}
                          </TableCell>
                          <TableCell>
                            <span className="font-semibold text-gray-900">{eleves}</span>
                            <span className="text-muted-foreground text-xs"> / {max}</span>
                          </TableCell>
                          <TableCell className="hidden sm:table-cell">
                            <div className="flex items-center gap-2">
                              <div className="w-16 bg-[#a7b305] rounded-full overflow-hidden">
                                <Progress
                                  value={taux}
                                  className={`h-1.5 ${getTauxBarClass(taux)}`}
                                />
                              </div>
                              <span className={`text-xs tabular-nums w-8 text-right ${getTauxTextClass(taux)}`}>
                                {taux}%
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-gray-400 hover:text-blue-600 hover:bg-blue-50"
                                onClick={() => openEdit(classe)}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-gray-400 hover:text-red-600 hover:bg-red-50"
                                onClick={() => setDeleteTarget(classe)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            )}

            {/* Pagination */}
            {!loading && totalItems > 0 && (
              <div className="flex flex-col items-center justify-between gap-3 border-t border-gray-100 bg-gray-50/50 px-6 py-3 sm:flex-row">
                <p className="text-xs text-muted-foreground">
                  {totalItems} résultat(s) — Page {page} sur {totalPages}
                </p>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="h-8 gap-1 text-xs"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                    Préc
                  </Button>
                  
                  {/* Page Numbers */}
                  <div className="hidden sm:flex items-center gap-1 mx-2">
                    {Array.from({ length: totalPages }, (_, i) => i + 1)
                      .filter(p => p === 1 || p === totalPages || (p >= page - 1 && p <= page + 1))
                      .map((p, idx, arr) => (
                        <span key={p} className="contents">
                          {idx > 0 && arr[idx - 1] !== p - 1 && <span className="text-xs text-muted-foreground px-1">...</span>}
                          <Button
                            variant={page === p ? "default" : "ghost"}
                            size="sm"
                            onClick={() => setPage(p)}
                            className={`h-8 w-8 p-0 text-xs ${page === p ? 'bg-[var(--etab-color,#075e54)] hover:bg-[var(--etab-color-hover,#064e46)]' : ''}`}
                          >
                            {p}
                          </Button>
                        </span>
                      ))
                    }
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    className="h-8 gap-1 text-xs"
                  >
                    Suiv
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

            {/* ─── Create / Edit Dialog ─────────────────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-xl gap-0 p-0 overflow-hidden rounded-xl border-0 shadow-2xl">
          
          {/* Header moderne avec dégradé */}
          <div className="relative px-6 py-6 bg-gradient-to-br from-[var(--etab-color,#075e54)] to-[var(--etab-color-hover,#064e46)]">
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/40 rounded-full -translate-y-1/2 translate-x-1/2" />
            <div className="absolute bottom-0 left-0 w-20 h-20 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2" />
            
            <DialogHeader className="relative z-10">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-white/10 border border-white/20">
                  <GraduationCap className="h-5 w-5 text-white" />
                </div>
                <div>
                  <DialogTitle className="text-lg font-bold text-white">
                    {editingId ? 'Modifier la classe' : 'Nouvelle classe'}
                  </DialogTitle>
                  <p className="text-sm text-white/60 mt-0.5">
                    {editingId ? 'Mettez à jour les informations' : 'Remplissez les informations pour créer une classe'}
                  </p>
                </div>
              </div>
            </DialogHeader>
          </div>

          <div className="p-6 space-y-6 max-h-[65vh] overflow-y-auto bg-white">
            
            {/* Nom de la classe */}
            <div className="space-y-2">
              <Label htmlFor="classe-nom" className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Nom de la classe</Label>
              <Input
                id="classe-nom"
                placeholder="Ex: 1ère année A, 6ème Primaire..."
                value={form.nom}
                onChange={(e) => setForm({ ...form, nom: e.target.value })}
                className="h-11 border-gray-200 bg-white focus:bg-white text-[15px] text-black-200 font-medium"
                autoFocus
              />
            </div>

            {/* Sélecteur de niveau visuel (Cards) */}
            <div className="space-y-2.5">
              <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Niveau d'enseignement</Label>
              <div className="grid grid-cols-3 gap-3">
                {NIVEAUX.map((n) => {
                  const info = NIVEAU_MAP[n]
                  const isSelected = form.niveau === n
                  const colorMap: Record<string, string> = {
                    MATERNELLE: 'border-pink-300 bg-pink-50 shadow-pink-100',
                    PRIMAIRE: 'border-emerald-300 bg-emerald-50 shadow-emerald-100',
                    SECONDAIRE: 'border-amber-300 bg-amber-50 shadow-amber-100',
                  }
                  const activeColorMap: Record<string, string> = {
                    MATERNELLE: 'border-pink-500 bg-pink-100 ring-2 ring-pink-500/20 shadow-md',
                    PRIMAIRE: 'border-emerald-500 bg-emerald-100 ring-2 ring-emerald-500/20 shadow-md',
                    SECONDAIRE: 'border-amber-500 bg-amber-100 ring-2 ring-amber-500/20 shadow-md',
                  }
                  const iconMap: Record<string, string> = {
                    MATERNELLE: '🧸',
                    PRIMAIRE: '📚',
                    SECONDAIRE: '🎒',
                  }

                  return (
                    <button
                      type="button"
                      key={n}
                      onClick={() => setForm({ ...form, niveau: n })}
                      className={`relative flex flex-col items-center justify-center gap-2 p-4 rounded-xl border-2 transition-all duration-200 cursor-pointer ${isSelected ? activeColorMap[n] : colorMap[n] + ' hover:scale-[1.02]'}`}
                    >
                      {isSelected && (
                        <div className="absolute top-2 right-2">
                          <div className={`h-5 w-5 rounded-full flex items-center justify-center text-white text-[10px] font-bold ${n === 'MATERNELLE' ? 'bg-pink-500' : n === 'PRIMAIRE' ? 'bg-emerald-500' : 'bg-amber-500'}`}>
                            ✓
                          </div>
                        </div>
                      )}
                      <span className="text-2xl">{iconMap[n]}</span>
                      <span className={`text-xs font-bold ${isSelected ? 'text-gray-800' : 'text-gray-600'}`}>
                        {info?.label ?? n}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Sélection Établissement & Année */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Établissement</Label>
                <Select
                  value={form.etablissementId}
                  onValueChange={(v) =>
                    setForm({ ...form, etablissementId: v, anneeScolaireId: '' })
                  }
                  disabled={locked || !!editingId}
                >
                  <SelectTrigger className="h-11 border-gray-200 bg-gray-50/50 focus:bg-white">
                    <SelectValue placeholder="Sélectionner" />
                  </SelectTrigger>
                  <SelectContent>
                    {ecoles.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.nom}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {locked && (
                  <p className="text-[11px] text-gray-400 flex items-center gap-1">
                    <ShieldAlert className="h-3 w-3" />
                    Établissement lié à votre compte.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Année scolaire</Label>
                <Select
                  value={form.anneeScolaireId}
                  onValueChange={(v) => setForm({ ...form, anneeScolaireId: v })}
                  disabled={!!editingId}
                >
                  <SelectTrigger className="h-11 border-gray-200 bg-gray-50/50 focus:bg-white">
                    <SelectValue placeholder="Sélectionner" />
                  </SelectTrigger>
                  <SelectContent>
                    {formAnnees.length === 0 && (
                      <SelectItem value="__none" disabled>
                        {form.etablissementId ? 'Chargement...' : 'Sélectionnez un établissement'}
                      </SelectItem>
                    )}
                    {formAnnees.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.libelle} {a.active ? '★' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {editingId && (
                  <p className="text-[11px] text-gray-400 flex items-center gap-1">
                    <ShieldAlert className="h-3 w-3" />
                    Non modifiable après création.
                  </p>
                )}
              </div>
            </div>

            {/* Effectif Maximum avec indicateur visuel */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="effectif-max" className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Effectif maximum</Label>
                <span className="text-sm font-bold text-gray-700 tabular-nums">
                  {form.effectifMax || '0'} élèves
                </span>
              </div>
              <div className="relative">
                <Input
                  id="effectif-max"
                  type="range"
                  min="4"
                  max="250"
                  step="1"
                  value={form.effectifMax}
                  onChange={(e) =>
                    setForm({ ...form, effectifMax: e.target.value })
                  }
                  className="w-full h-2 bg-gray-200 accent-[var(--etab-color,#075e54)] cursor-pointer border-0 p-0 focus:ring-0"
                />
                <div className="flex justify-between mt-1">
                  <span className="text-[10px] text-gray-400">4</span>
                  <span className="text-[10px] text-gray-400">250</span>
                </div>
              </div>
            </div>
          </div>
          
          {/* Footer moderne */}
          <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50/80">
            <Button 
              variant="ghost" 
              onClick={() => setDialogOpen(false)} 
              className="text-gray-500 hover:text-gray-700 hover:bg-gray-100"
            >
              Annuler
            </Button>
            <Button
              disabled={saving || !form.nom.trim() || !form.etablissementId || !form.anneeScolaireId}
              className="bg-[var(--etab-color,#075e54)] text-white hover:bg-[var(--etab-color-hover,#064e46)] shadow-sm shadow-[var(--etab-color,#075e54)]/20 px-6 h-10 font-semibold"
              onClick={handleSave}
            >
              {saving ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Enregistrement...
                </span>
              ) : editingId ? (
                'Mettre à jour'
              ) : (
                'Créer la classe'
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      {/* ─── Delete Confirmation Dialog ───────────────────────────────────── */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-gray-900">
              {(deleteTarget?.effectif ?? 0) > 0 ? (
                <AlertTriangle className="h-5 w-5 text-amber-500" />
              ) : (
                <Trash2 className="h-5 w-5 text-red-500" />
              )}
              {(deleteTarget?.effectif ?? 0) > 0
                ? 'Désactiver la classe'
                : 'Supprimer la classe'}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 pt-2 text-gray-600">
                {(deleteTarget?.effectif ?? 0) > 0 ? (
                  <>
                    <p className="font-medium text-amber-700 bg-amber-50 p-3 rounded-lg border border-amber-100">
                      ⚠️ Cette classe contient {deleteTarget!.effectif} élève(s).
                    </p>
                    <p>
                      La désactivation retirera les élèves de cette classe.
                      Voulez-vous continuer ?
                    </p>
                  </>
                ) : (
                  <p>
                    Supprimer définitivement la classe{' '}
                    <span className="font-semibold text-gray-900">{deleteTarget?.nom}</span> ?<br />
                    Cette action est irréversible.
                  </p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel disabled={deleting} className="text-gray-600">Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              {deleting
                ? 'Suppression...'
                : (deleteTarget?.effectif ?? 0) > 0
                  ? 'Désactiver'
                  : 'Supprimer définitivement'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  )
}