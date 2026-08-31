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
  GraduationCap, Plus, Edit, Trash2, ShieldAlert, Users, UserX, Layers,
  BarChart3, AlertTriangle, ChevronLeft, ChevronRight, Search, Loader2,
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

interface EleveSansClasse {
  id: string
  matricule: string
  nom: string
  prenom: string
  etablissementId: string
  anneeScolaireId?: string | null
  statut: string
}

// ─── Constants & Helpers ─────────────────────────────────────────────────────

const NIVEAU_MAP: Record<string, { label: string; className: string }> = {
  MATERNELLE: {
    label: 'Maternelle',
    className: 'bg-amber-100 text-amber-900 border border-amber-200 font-semibold',
  },
  PRIMAIRE: {
    label: 'Primaire',
    className: 'bg-emerald-100 text-emerald-900 border border-emerald-200 font-semibold',
  },
  SECONDAIRE: {
    label: 'Secondaire',
    className: 'bg-sky-100 text-sky-900 border border-sky-200 font-semibold',
  },
  HUMANITE: {
    label: 'Humanités',
    className: 'bg-violet-100 text-violet-900 border border-violet-200 font-semibold',
  },
}

const NIVEAUX = ['MATERNELLE', 'PRIMAIRE', 'SECONDAIRE', 'HUMANITE'] as const

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

function getTauxBarClass(taux: number): string {
  if (taux >= 90) return '[&>div]:bg-rose-600'
  if (taux >= 70) return '[&>div]:bg-emerald-600'
  if (taux >= 50) return '[&>div]:bg-amber-600'
  return '[&>div]:bg-stone-700'
}

function getTauxTextClass(taux: number): string {
  if (taux >= 90) return 'text-rose-600 font-bold'
  if (taux >= 70) return 'text-emerald-700 font-bold'
  if (taux >= 50) return 'text-amber-700 font-bold'
  return 'text-stone-500 font-bold'
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function ClassesPage() {
  const { user } = useAppStore()

  const [classes, setClasses] = useState<ClasseItem[]>([])
  const [ecoles, setEcoles] = useState<Etablissement[]>([])
  const [annees, setAnnees] = useState<AnneeScolaire[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [filterEcole, setFilterEcole] = useState('all')
  const [filterAnnee, setFilterAnnee] = useState('')
  const [filterNiveau, setFilterNiveau] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')

  const [page, setPage] = useState(1)
  const pageSize = 10

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)

  const [deleteTarget, setDeleteTarget] = useState<ClasseItem | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [cleaningDuplicates, setCleaningDuplicates] = useState(false)
  const [checkingNoClass, setCheckingNoClass] = useState(false)
  const [orphanDialogOpen, setOrphanDialogOpen] = useState(false)
  const [orphanStudents, setOrphanStudents] = useState<EleveSansClasse[]>([])

  const role = user?.role ?? ''
  const etabIdUser = user?.etablissementId ?? null
  const schoolFilter = getSchoolFilter(role, etabIdUser)
  const locked = !!schoolFilter

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
  }, [user, role, etabIdUser, filterEcole, filterAnnee])

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

  const stats = useMemo(() => {
    const totalClasses = filteredClasses.length
    const totalEleves = filteredClasses.reduce((sum, c) => sum + (c.effectif ?? 0), 0)
    const niveauxCouverts = new Set(filteredClasses.map((c) => c.niveau)).size
    const effectifMoyen = totalClasses > 0 ? Math.round(totalEleves / totalClasses) : 0
    return { totalClasses, totalEleves, niveauxCouverts, effectifMoyen }
  }, [filteredClasses])

  const selectedYearLabel = useMemo(() => {
    if (!filterAnnee) return ''
    const found = annees.find((a) => a.id === filterAnnee)
    return found?.libelle ?? ''
  }, [filterAnnee, annees])

  const totalItems = filteredClasses.length
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))

  const paginatedClasses = useMemo(() => {
    const start = (page - 1) * pageSize
    return filteredClasses.slice(start, start + pageSize)
  }, [filteredClasses, page])

  const formAnnees = useMemo(() => {
    return annees
  }, [annees])

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
      toast.error('Le nom de la classe est obligatoire (*)')
      return
    }
    if (!form.etablissementId) {
      toast.error("L'établissement est obligatoire (*)")
      return
    }
    if (!form.anneeScolaireId) {
      toast.error("L'année scolaire est obligatoire (*)")
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
      toast.success('Classe supprimée avec succès')
      setDeleteTarget(null)
      fetchClasses()
    } catch (e: any) {
      toast.error(e?.message || 'Erreur lors de la suppression')
    } finally {
      setDeleting(false)
    }
  }


const handleCleanDuplicates = async () => {
  setCleaningDuplicates(true)
  try {
    const result = await tc.cleanEleveClasseDuplicates()
    const data = result?.data
    toast.success(
      `Nettoyage terminé: ${data?.cleaned_students || 0} élèves concernés, ${data?.total_duplicates_cleaned || 0} doublons supprimés`
    )
    fetchClasses()
  } catch (e: any) {
    toast.error(e?.message || 'Erreur lors du nettoyage')
  } finally {
    setCleaningDuplicates(false)
  }
}

  async function handleCheckNoClass() {
    setCheckingNoClass(true)
    try {
      const etablissementId = locked
        ? schoolFilter ?? undefined
        : filterEcole !== 'all'
          ? filterEcole
          : undefined
      const result = await tc.listElevesSansClasse(etablissementId, filterAnnee || undefined)
      const data = result?.data ?? result
      const list = Array.isArray(data?.eleves) ? data.eleves : []
      setOrphanStudents(list)
      setOrphanDialogOpen(true)
      if (list.length === 0) {
        toast.success('Aucun élève sans classe active.')
      }
    } catch (e: any) {
      const message = typeof e === 'string'
        ? e
        : e?.message || e?.error || 'Erreur lors de la vérification des élèves sans classe'
      console.error('Vérification élèves sans classe:', e)
      toast.error(message)
    } finally {
      setCheckingNoClass(false)
    }
  }

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-6 p-2 sm:p-4 md:p-6"
    >
      {/* Banner Header */}
      <motion.div
        variants={itemVariants}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-stone-200/80 shadow-sm"
      >
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 text-amber-700 text-xs font-bold border border-amber-500/20 mb-2">
            <GraduationCap className="h-3.5 w-3.5" /> Structure Pédagogique
          </div>
          <h1 className="text-2xl font-extrabold text-stone-900 tracking-tight">
            Gestion des Classes
          </h1>
          <p className="text-xs sm:text-sm text-stone-500 mt-1">
            {selectedYearLabel ? (
              <>Année en cours : <span className="font-bold text-[#0c241f]">{selectedYearLabel}</span></>
            ) : (
              "Organisez vos classes par niveau, effectif et établissement."
            )}
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            onClick={handleCheckNoClass}
            disabled={checkingNoClass}
            variant="outline"
            className="border-amber-200 text-amber-800 hover:bg-amber-50 font-bold px-4 py-2.5 rounded-xl gap-2"
          >
            <UserX className="h-4 w-4" />
            {checkingNoClass ? 'Vérification...' : 'Élèves sans classe'}
          </Button>
          <Button
            onClick={handleCleanDuplicates}
            disabled={cleaningDuplicates}
            variant="outline"
            className="border-rose-200 text-rose-700 hover:bg-rose-50 font-bold px-4 py-2.5 rounded-xl gap-2"
          >
            <ShieldAlert className="h-4 w-4" />
            {cleaningDuplicates ? 'Nettoyage...' : 'Nettoyer doublons'}
          </Button>
          <Button
            onClick={openCreate}
            className="bg-[#0c241f] hover:bg-[#071916] text-white font-bold px-5 py-2.5 rounded-xl shadow-md gap-2"
          >
            <Plus className="h-4 w-4 text-amber-400" />
            Nouvelle classe
          </Button>
        </div>
      </motion.div>

      {/* Filters Row */}
      <motion.div
        variants={itemVariants}
        className="flex flex-col gap-3 rounded-2xl border border-stone-200/80 bg-white p-4 shadow-sm sm:flex-row sm:items-center"
      >
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
          <Input
            placeholder="Rechercher une classe..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 rounded-xl border-stone-200 font-medium"
          />
        </div>

        <Select
          value={filterEcole}
          onValueChange={(v) => {
            if (!locked) { setFilterEcole(v); onEtabSelect(v, ecoles) }
          }}
          disabled={locked}
        >
          <SelectTrigger className="w-full sm:w-52 rounded-xl border-stone-200 font-medium">
            <SelectValue placeholder="Établissement" />
          </SelectTrigger>
          <SelectContent className="rounded-xl">
            <SelectItem value="all">Tous les établissements</SelectItem>
            {ecoles.map((e) => (
              <SelectItem key={e.id} value={e.id}>
                {`${getTypeIcon(e.type || '')} ${e.nom}`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterAnnee} onValueChange={setFilterAnnee}>
          <SelectTrigger className="w-full sm:w-48 rounded-xl border-stone-200 font-medium">
            <SelectValue placeholder="Année scolaire" />
          </SelectTrigger>
          <SelectContent className="rounded-xl">
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
          <SelectTrigger className="w-full sm:w-44 rounded-xl border-stone-200 font-medium">
            <SelectValue placeholder="Niveau" />
          </SelectTrigger>
          <SelectContent className="rounded-xl">
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
        <Card className="rounded-2xl border-stone-200/80 bg-white shadow-sm border-l-4 border-l-[#0c241f]">
          <CardContent className="flex items-center gap-4 p-5">
            <div className="rounded-2xl bg-[#0c241f]/10 p-3.5 border border-[#0c241f]/20">
              <GraduationCap className="h-6 w-6 text-[#0c241f]" />
            </div>
            <div>
              <p className="text-xs font-semibold text-stone-500">Total Classes</p>
              <p className="text-2xl font-extrabold text-stone-900">{stats.totalClasses}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-stone-200/80 bg-white shadow-sm border-l-4 border-l-emerald-600">
          <CardContent className="flex items-center gap-4 p-5">
            <div className="rounded-2xl bg-emerald-500/10 p-3.5 border border-emerald-500/20">
              <Users className="h-6 w-6 text-emerald-600" />
            </div>
            <div>
              <p className="text-xs font-semibold text-stone-500">Élèves Inscrits</p>
              <p className="text-2xl font-extrabold text-stone-900">{stats.totalEleves}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-stone-200/80 bg-white shadow-sm border-l-4 border-l-amber-500">
          <CardContent className="flex items-center gap-4 p-5">
            <div className="rounded-2xl bg-amber-500/10 p-3.5 border border-amber-500/20">
              <Layers className="h-6 w-6 text-amber-600" />
            </div>
            <div>
              <p className="text-xs font-semibold text-stone-500">Niveaux Couverts</p>
              <p className="text-2xl font-extrabold text-stone-900">{stats.niveauxCouverts}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-stone-200/80 bg-white shadow-sm border-l-4 border-l-sky-600">
          <CardContent className="flex items-center gap-4 p-5">
            <div className="rounded-2xl bg-sky-500/10 p-3.5 border border-sky-500/20">
              <BarChart3 className="h-6 w-6 text-sky-600" />
            </div>
            <div>
              <p className="text-xs font-semibold text-stone-500">Effectif Moyen</p>
              <p className="text-2xl font-extrabold text-stone-900">{stats.effectifMoyen}</p>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Table */}
      <motion.div variants={itemVariants}>
        <Card className="rounded-2xl border-stone-200/80 shadow-sm overflow-hidden">
          <CardContent className="p-0">
            {loading ? (
              <div className="space-y-4 p-8">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full rounded-xl" />
                ))}
              </div>
            ) : paginatedClasses.length === 0 ? (
              <div className="p-12 text-center text-stone-400">
                <GraduationCap className="mx-auto mb-3 h-12 w-12 opacity-30" />
                <p className="text-base font-bold text-stone-700">Aucune classe trouvée</p>
                <p className="mt-1 text-xs">
                  {filterAnnee
                    ? 'Aucune classe ne correspond à vos filtres.'
                    : "Commencez par sélectionner un établissement et une année scolaire."}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-[#0c241f] text-white">
                    <TableRow className="hover:bg-[#0c241f]">
                      <TableHead className="text-amber-300 font-bold">Nom de la Classe</TableHead>
                      <TableHead className="text-white font-bold">Niveau</TableHead>
                      <TableHead className="hidden md:table-cell text-white font-bold">Établissement</TableHead>
                      <TableHead className="hidden lg:table-cell text-white font-bold">Année Scolaire</TableHead>
                      <TableHead className="text-white font-bold">Effectif</TableHead>
                      <TableHead className="hidden sm:table-cell text-center text-white font-bold">Remplissage</TableHead>
                      <TableHead className="text-right text-white font-bold">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedClasses.map((classe) => {
                      const eleves = classe.effectif ?? 0
                      const max = classe.effectifMax || 40
                      const taux = getTauxRemplissage(eleves, max)
                      const niveauInfo = NIVEAU_MAP[classe.niveau] || {
                        label: classe.niveau,
                        className: 'bg-stone-100 text-stone-800',
                      }

                      return (
                        <TableRow
                          key={classe.id}
                          className="hover:bg-amber-500/5 transition-colors"
                        >
                          <TableCell className="font-bold text-stone-900 break-words">
                            {classe.nom}
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary" className={niveauInfo.className}>
                              {niveauInfo.label}
                            </Badge>
                          </TableCell>
                          <TableCell className="hidden md:table-cell font-medium text-stone-700 break-words">
                            {classe.etablissement?.nom ?? '—'}
                          </TableCell>
                          <TableCell className="hidden lg:table-cell font-medium text-stone-600 text-xs">
                            {classe.anneeScolaire?.libelle ?? '—'}
                          </TableCell>
                          <TableCell className="font-bold text-stone-900">
                            {eleves} <span className="text-stone-400 font-medium text-xs">/ {max}</span>
                          </TableCell>
                          <TableCell className="hidden sm:table-cell">
                            <div className="flex items-center gap-2 justify-center">
                              <div className="w-16 bg-stone-200 rounded-full overflow-hidden">
                                <Progress
                                  value={taux}
                                  className={`h-2 ${getTauxBarClass(taux)}`}
                                />
                              </div>
                              <span className={`text-xs font-bold tabular-nums ${getTauxTextClass(taux)}`}>
                                {taux}%
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-amber-700 hover:bg-amber-50"
                                onClick={() => openEdit(classe)}
                                title="Modifier"
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-rose-600 hover:bg-rose-50"
                                onClick={() => setDeleteTarget(classe)}
                                title="Supprimer"
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
              <div className="flex flex-col items-center justify-between gap-3 border-t border-stone-100 bg-stone-50/50 px-6 py-4 text-sm font-medium text-stone-600 sm:flex-row">
                <p className="text-xs">
                  {totalItems} classe(s) — Page <b>{page}</b> sur <b>{totalPages}</b>
                </p>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="rounded-xl border-stone-200 text-xs font-semibold"
                  >
                    <ChevronLeft className="h-3.5 w-3.5 mr-1" />
                    Précédent
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    className="rounded-xl border-stone-200 text-xs font-semibold"
                  >
                    Suivant
                    <ChevronRight className="h-3.5 w-3.5 ml-1" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* ─── Create / Edit Dialog ─────────────────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto bg-white p-6 sm:p-8 rounded-3xl border border-stone-200 shadow-2xl">
          <DialogHeader className="border-b border-stone-100 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-2xl bg-[#0c241f] text-amber-400">
                <GraduationCap className="h-6 w-6" />
              </div>
              <div>
                <DialogTitle className="text-xl font-extrabold text-[#0c241f]">
                  {editingId ? 'Modifier la classe' : 'Nouvelle classe'}
                </DialogTitle>
                <p className="text-xs text-stone-500 font-medium">Saisissez les caractéristiques de la classe.</p>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-4 pt-4">
            <div>
              <Label htmlFor="classe-nom" className="text-xs font-semibold text-stone-600">Nom de la classe *</Label>
              <Input
                id="classe-nom"
                placeholder="Ex: 1ère Année A, 6ème Primaire..."
                value={form.nom}
                onChange={(e) => setForm({ ...form, nom: e.target.value })}
                className="rounded-xl border-stone-200 bg-white font-medium mt-1"
                autoFocus
              />
            </div>

            <div>
              <Label className="text-xs font-semibold text-stone-600">Niveau d&apos;enseignement *</Label>
              <Select value={form.niveau} onValueChange={(n) => setForm({ ...form, niveau: n })}>
                <SelectTrigger className="rounded-xl border-stone-200 bg-white font-medium mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  {NIVEAUX.map((n) => (
                    <SelectItem key={n} value={n}>
                      {NIVEAU_MAP[n]?.label ?? n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label className="text-xs font-semibold text-stone-600">Établissement *</Label>
                <Select
                  value={form.etablissementId}
                  onValueChange={(v) => setForm({ ...form, etablissementId: v, anneeScolaireId: '' })}
                  disabled={locked || !!editingId}
                >
                  <SelectTrigger className="rounded-xl border-stone-200 bg-white font-medium mt-1">
                    <SelectValue placeholder="Sélectionner" />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    {ecoles.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.nom}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs font-semibold text-stone-600">Année scolaire *</Label>
                <Select
                  value={form.anneeScolaireId}
                  onValueChange={(v) => setForm({ ...form, anneeScolaireId: v })}
                  disabled={!!editingId}
                >
                  <SelectTrigger className="rounded-xl border-stone-200 bg-white font-medium mt-1">
                    <SelectValue placeholder="Sélectionner" />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
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
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <Label htmlFor="effectif-max" className="text-xs font-semibold text-stone-600">Effectif maximum *</Label>
                <span className="text-xs font-bold text-[#0c241f] bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                  {form.effectifMax || '0'} élèves
                </span>
              </div>
              <Input
                id="effectif-max"
                type="number"
                min="1"
                max="250"
                value={form.effectifMax}
                onChange={(e) => setForm({ ...form, effectifMax: e.target.value })}
                className="rounded-xl border-stone-200 bg-white font-medium mt-1"
              />
            </div>

            <div className="flex justify-end gap-3 border-t border-stone-100 pt-4">
              <Button 
                variant="outline" 
                onClick={() => setDialogOpen(false)} 
                className="rounded-xl border-stone-200"
              >
                Annuler
              </Button>
              <Button
                disabled={saving || !form.nom.trim() || !form.etablissementId || !form.anneeScolaireId}
                className="bg-[#0c241f] hover:bg-[#071916] text-white font-bold rounded-xl px-6 shadow-md"
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
        <AlertDialogContent className="rounded-3xl border border-stone-200 p-6 shadow-2xl max-w-md bg-white">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-stone-900 font-extrabold text-lg">
              {(deleteTarget?.effectif ?? 0) > 0 ? (
                <AlertTriangle className="h-5 w-5 text-amber-600" />
              ) : (
                <Trash2 className="h-5 w-5 text-rose-600" />
              )}
              {(deleteTarget?.effectif ?? 0) > 0
                ? 'Désactiver la classe ?'
                : 'Supprimer la classe ?'}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 pt-2 text-stone-600 text-sm font-medium">
                {(deleteTarget?.effectif ?? 0) > 0 ? (
                  <>
                    <p className="font-bold text-amber-800 bg-amber-50 p-3 rounded-xl border border-amber-200">
                      ⚠️ Cette classe contient {deleteTarget!.effectif} élève(s).
                    </p>
                    <p>
                      La désactivation masquera la classe. Voulez-vous continuer ?
                    </p>
                  </>
                ) : (
                  <p>
                    Supprimer définitivement la classe{' '}
                    <b className="text-stone-900">{deleteTarget?.nom}</b> ?
                    Cette action est irréversible.
                  </p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="pt-4">
            <AlertDialogCancel disabled={deleting} className="rounded-xl border-stone-200 font-semibold">Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold"
            >
              {deleting
                ? 'Traitement...'
                : (deleteTarget?.effectif ?? 0) > 0
                  ? 'Désactiver'
                  : 'Supprimer définitivement'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
            </AlertDialog>

      {/* ─── Élèves sans classe active ─────────────────────────────────────── */}
      <Dialog open={orphanDialogOpen} onOpenChange={setOrphanDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto bg-white p-6 sm:p-8 rounded-3xl border border-stone-200 shadow-2xl">
          <DialogHeader className="border-b border-stone-100 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-2xl bg-amber-100 text-amber-700">
                <UserX className="h-6 w-6" />
              </div>
              <div>
                <DialogTitle className="text-xl font-extrabold text-[#0c241f]">
                  Élèves sans classe active
                </DialogTitle>
                <p className="text-xs text-stone-500 font-medium">
                  {orphanStudents.length} élève(s) trouvé(s) avec les filtres actuels.
                </p>
              </div>
            </div>
          </DialogHeader>

          {orphanStudents.length === 0 ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-center text-sm font-semibold text-emerald-800">
              Tous les élèves non transférés ont une classe active.
            </div>
          ) : (
            <>
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-medium text-amber-900">
                Ces fiches ne sont pas supprimées. Ouvrez <b>Gestion des Élèves</b>, modifiez chaque fiche et attribuez-lui la classe correcte.
              </div>
              <div className="max-h-80 overflow-y-auto rounded-2xl border border-stone-200">
                <div className="grid grid-cols-[1fr_auto] gap-3 border-b border-stone-200 bg-stone-50 px-4 py-3 text-xs font-bold text-stone-600">
                  <span>Élève</span>
                  <span>Matricule</span>
                </div>
                {orphanStudents.map((student) => (
                  <div key={student.id} className="grid grid-cols-[1fr_auto] gap-3 border-b border-stone-100 px-4 py-3 text-sm last:border-0">
                    <span className="font-semibold text-stone-800">{student.nom} {student.prenom}</span>
                    <span className="font-mono text-xs font-bold text-stone-500">{student.matricule}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          <div className="flex justify-end border-t border-stone-100 pt-4">
            <Button onClick={() => setOrphanDialogOpen(false)} className="rounded-xl bg-[#0c241f] px-6 font-bold text-white hover:bg-[#071916]">
              Fermer
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </motion.div>
  )
}
