'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAppStore, getSchoolFilter, canManageFees, getTypeIcon, onEtabSelect } from '@/lib/store'
import * as tc from '@/lib/tauri-commands'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import { motion } from 'framer-motion'
import { Coins, DollarSign, Edit, Plus, Search, ShieldAlert, Trash2, TrendingUp, ChevronLeft, ChevronRight, Banknote, Sparkles } from 'lucide-react'
import { formatMoney } from '@/lib/utils'

// ─── Types ───────────────────────────────────────────────────────────────────
interface Frais {
  id: string
  libelle: string
  type: string
  montant: number
  devise: string
  etablissementId: string
  etablissementNom?: string
  anneeScolaireId?: string
  tranche?: number | null
  dateEcheance?: string | null
  actif: boolean
  classesIds: string[]
}

interface Etablissement {
  id: string
  nom: string
  type?: string
}

interface ClasseItem {
  id: string
  nom: string
}

// ─── Constants & Helpers ─────────────────────────────────────────────────────
const TYPE_MAP: Record<string, { label: string; className: string }> = {
  SCOLARITE: { label: 'Scolarité', className: 'bg-emerald-100 text-emerald-800 border border-emerald-200 font-semibold' },
  INSCRIPTION: { label: 'Inscription', className: 'bg-sky-100 text-sky-800 border border-sky-200 font-semibold' },
  ANNEXE: { label: 'Annexe', className: 'bg-amber-100 text-amber-800 border border-amber-200 font-semibold' },
}

function formatDate(date?: string | null) {
  return date ? new Date(date).toLocaleDateString('fr-FR') : '—'
}

const emptyForm = {
  libelle: '',
  type: 'SCOLARITE',
  montant: '',
  devise: 'CDF',
  etablissementId: '',
  tranche: '',
  dateEcheance: '',
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.07 } },
}

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35 } },
}

// ─── Component ───────────────────────────────────────────────────────────────
export default function FraisPage() {
  const { user } = useAppStore()

  const [fraisList, setFraisList] = useState<Frais[]>([])
  const [ecoles, setEcoles] = useState<Etablissement[]>([])
  const [classesDisponibles, setClassesDisponibles] = useState<ClasseItem[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [page, setPage] = useState(1)
  const limit = 8

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [selectedClasseIds, setSelectedClasseIds] = useState<string[]>([])

  const [search, setSearch] = useState('')
  const [filterEcole, setFilterEcole] = useState('all')
  const [filterType, setFilterType] = useState('all')

  const fetchEcoles = useCallback(async () => {
    try {
      const res = await tc.listEtablissements()
      setEcoles(res?.etablissements ?? [])
    } catch (error) {
      console.error('Erreur établissements:', error)
    }
  }, [])

  const fetchClasses = useCallback(async (etablissementId: string) => {
    try {
      const res = await tc.listClasses(etablissementId)
      setClassesDisponibles(res?.classes ?? [])
    } catch (error) {
      console.error('Erreur chargement classes:', error)
      setClassesDisponibles([])
    }
  }, [])

  const fetchFrais = useCallback(async () => {
    if (!user || !canManageFees(user.role)) return
    setLoading(true)
    try {
      const schoolFilter = getSchoolFilter(user.role, user.etablissementId || null)
      const etabId = filterEcole !== 'all' ? filterEcole : (schoolFilter || undefined)
      const res = await tc.listFrais(etabId, undefined, undefined)
      const data = res?.data ?? []
      setFraisList(Array.isArray(data) ? data : [])
    } catch (error: any) {
      toast.error(error?.message || error?.error || 'Erreur lors du chargement des frais')
    } finally {
      setLoading(false)
    }
  }, [user, filterEcole])

  useEffect(() => {
    if (!user || !canManageFees(user.role)) return
    fetchEcoles()
  }, [user, fetchEcoles])

  useEffect(() => {
    const timer = window.setTimeout(fetchFrais, 250)
    return () => window.clearTimeout(timer)
  }, [fetchFrais])

  const currentEtabForForm = form.etablissementId || (filterEcole !== 'all' ? filterEcole : '')
  useEffect(() => {
    if (currentEtabForForm) {
      fetchClasses(currentEtabForForm)
    } else {
      setClassesDisponibles([])
    }
  }, [currentEtabForForm, fetchClasses])

  useEffect(() => {
    setPage(1)
  }, [search, filterEcole, filterType])

  const filteredFrais = useMemo(() => {
    return fraisList.filter((f) => {
      if (search.trim()) {
        const q = search.toLowerCase()
        if (!f.libelle.toLowerCase().includes(q)) return false
      }
      if (filterType !== 'all' && f.type !== filterType) return false
      return true
    })
  }, [fraisList, search, filterType])

  const totalItems = filteredFrais.length
  const totalPages = Math.max(1, Math.ceil(totalItems / limit))

  const paginatedFrais = useMemo(() => {
    const start = (page - 1) * limit
    return filteredFrais.slice(start, start + limit)
  }, [filteredFrais, page, limit])

  const actifs = useMemo(() => fraisList.filter((f) => f.actif !== false), [fraisList])
  const typesUniques = useMemo(() => new Set(fraisList.map((f) => f.type)).size, [fraisList])

  const moyennesParDevise = useMemo(() => {
    const grouped = actifs.reduce<Record<string, { total: number; count: number }>>((acc, f) => {
      const devise = f.devise || 'CDF'
      acc[devise] ||= { total: 0, count: 0 }
      acc[devise].total += Number(f.montant || 0)
      acc[devise].count += 1
      return acc
    }, {})
    return Object.entries(grouped).map(([devise, v]) => ({ devise, moyenne: v.total / v.count }))
  }, [actifs])

  if (user && !canManageFees(user.role)) {
    return (
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
        <ShieldAlert className="h-16 w-16 text-rose-500" />
        <h2 className="text-2xl font-bold text-stone-800">Accès réservé</h2>
        <p className="text-stone-500">La gestion des frais scolaires est réservée au coordonnateur ou à l'administrateur.</p>
      </motion.div>
    )
  }

  function openCreate() {
    setEditingId(null)
    setForm({ ...emptyForm, etablissementId: user?.etablissementId || '' })
    setSelectedClasseIds([])
    setDialogOpen(true)
  }

  function openEdit(frais: Frais) {
    setEditingId(frais.id)
    setForm({
      libelle: frais.libelle,
      type: frais.type,
      montant: String(frais.montant),
      devise: frais.devise || 'CDF',
      etablissementId: frais.etablissementId,
      tranche: frais.tranche ? String(frais.tranche) : '',
      dateEcheance: frais.dateEcheance ? frais.dateEcheance.split('T')[0] : '',
    })
    setSelectedClasseIds(frais.classesIds || (frais as any).classes_ids || (frais as any).classe_ids || [])
    if (frais.etablissementId) {
      fetchClasses(frais.etablissementId)
    }
    setDialogOpen(true)
  }

  const toggleClasseId = (id: string) => {
    setSelectedClasseIds(prev =>
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
    )
  }

  async function handleSave() {
    const montant = Number(form.montant)
    if (!form.libelle.trim() || !form.etablissementId || !Number.isFinite(montant) || montant <= 0) {
      toast.error('Le libellé, l\'établissement et un montant positif sont obligatoires (*)')
      return
    }

    setSaving(true)
    try {
      const payload = {
        libelle: form.libelle.trim(),
        type: form.type,
        montant,
        devise: form.devise,
        etablissementId: form.etablissementId,
        tranche: form.tranche ? Number(form.tranche) : undefined,
        dateEcheance: form.dateEcheance || undefined,
        classeIds: selectedClasseIds,
      }

      if (editingId) {
        await tc.updateFrais(editingId, payload)
        toast.success('Frais mis à jour avec succès')
      } else {
        await tc.createFrais(payload)
        toast.success('Frais créé avec succès')
      }
      setDialogOpen(false)
      fetchFrais()
    } catch (error: any) {
      toast.error(error?.message || error?.error || "Erreur lors de l'enregistrement")
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Voulez-vous désactiver ce frais ? Les anciens paiements ne seront pas supprimés.')) return
    try {
      await tc.deleteFrais(id)
      toast.success('Frais désactivé avec succès')
      fetchFrais()
    } catch (error: any) {
      toast.error(error?.message || error?.error || 'Erreur lors de la désactivation')
    }
  }

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-6 p-2 sm:p-4 md:p-6">
      {/* Banner Header */}
      <motion.div variants={itemVariants} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-stone-200/80 shadow-sm">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 text-amber-700 text-xs font-bold border border-amber-500/20 mb-2">
            <Banknote className="h-3.5 w-3.5" /> Barème Tarifaire
          </div>
          <h1 className="text-2xl font-extrabold text-stone-900 tracking-tight">Gestion des Frais Scolaires</h1>
          <p className="text-xs sm:text-sm text-stone-500 mt-1">Définissez et gérez les différents types de frais par classe et par tranche.</p>
        </div>
        <Button onClick={openCreate} className="bg-[#1e3a8a] hover:bg-[#172554] text-white font-bold px-5 py-2.5 rounded-xl shadow-md gap-2">
          <Plus className="h-4 w-4 text-amber-400" /> Nouveau frais
        </Button>
      </motion.div>

      {/* Stats Cards */}
      <motion.div variants={itemVariants} className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="rounded-2xl border-stone-200/80 bg-white shadow-sm border-l-4 border-l-[#1e3a8a]">
          <CardContent className="flex items-center gap-4 p-5">
            <div className="rounded-2xl bg-[#1e3a8a]/10 p-3.5 border border-[#1e3a8a]/20">
              <DollarSign className="h-6 w-6 text-[#1e3a8a]" />
            </div>
            <div>
              <p className="text-xs font-semibold text-stone-500">Total Frais Actifs</p>
              <p className="text-2xl font-extrabold text-stone-900">{actifs.length}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-stone-200/80 bg-white shadow-sm border-l-4 border-l-emerald-600">
          <CardContent className="flex items-center gap-4 p-5">
            <div className="rounded-2xl bg-emerald-500/10 p-3.5 border border-emerald-500/20">
              <Coins className="h-6 w-6 text-emerald-600" />
            </div>
            <div>
              <p className="text-xs font-semibold text-stone-500">Types de Frais</p>
              <p className="text-2xl font-extrabold text-stone-900">{typesUniques}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-stone-200/80 bg-white shadow-sm border-l-4 border-l-amber-500">
          <CardContent className="flex items-center gap-4 p-5">
            <div className="rounded-2xl bg-amber-500/10 p-3.5 border border-amber-500/20">
              <TrendingUp className="h-6 w-6 text-amber-600" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-stone-500">Moyenne par Devise</p>
              {moyennesParDevise.length === 0 ? (
                <p className="text-2xl font-extrabold text-stone-900">—</p>
              ) : (
                <div className="space-y-0.5">
                  {moyennesParDevise.map(({ devise, moyenne }) => (
                    <p key={devise} className="text-base font-bold text-stone-900 tabular-nums">{formatMoney(moyenne, devise)}</p>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Filters */}
      <motion.div variants={itemVariants} className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
          <Input className="pl-9 rounded-xl border-stone-200 font-medium" placeholder="Rechercher un frais..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={filterEcole} onValueChange={(v) => { setFilterEcole(v); onEtabSelect(v, ecoles) }}>
          <SelectTrigger className="w-full sm:w-52 rounded-xl border-stone-200 font-medium"><SelectValue placeholder="Toutes les écoles" /></SelectTrigger>
          <SelectContent className="rounded-xl">
            <SelectItem value="all">Toutes les écoles</SelectItem>
            {ecoles.map((ecole) => (
              <SelectItem key={ecole.id} value={ecole.id}>{`${getTypeIcon(ecole.type || '')} ${ecole.nom}`}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-full sm:w-44 rounded-xl border-stone-200 font-medium"><SelectValue placeholder="Tous les types" /></SelectTrigger>
          <SelectContent className="rounded-xl">
            <SelectItem value="all">Tous les types</SelectItem>
            <SelectItem value="SCOLARITE">Scolarité</SelectItem>
            <SelectItem value="INSCRIPTION">Inscription</SelectItem>
            <SelectItem value="ANNEXE">Annexe</SelectItem>
          </SelectContent>
        </Select>
      </motion.div>

      {/* Table */}
      <motion.div variants={itemVariants}>
        <Card className="rounded-2xl border-stone-200/80 shadow-sm overflow-hidden">
          <CardContent className="p-0">
            {loading ? (
              <div className="space-y-4 p-8">
                {Array.from({ length: 5 }).map((_, index) => (
                  <Skeleton key={index} className="h-10 w-full rounded-xl" />
                ))}
              </div>
            ) : paginatedFrais.length === 0 ? (
              <div className="p-12 text-center text-stone-400">
                <DollarSign className="mx-auto mb-3 h-12 w-12 opacity-30" />
                <p className="text-base font-bold text-stone-700">Aucun frais trouvé.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-[#1e3a8a] text-white">
                    <TableRow className="hover:bg-[#1e3a8a]">
                      <TableHead className="text-amber-300 font-bold">Libellé du Frais</TableHead>
                      <TableHead className="text-white font-bold">Type</TableHead>
                      <TableHead className="text-white font-bold">Montant</TableHead>
                      <TableHead className="text-white font-bold">Devise</TableHead>
                      <TableHead className="text-white font-bold">Établissement</TableHead>
                      <TableHead className="text-white font-bold">Classes</TableHead>
                      <TableHead className="text-white font-bold">Tranche</TableHead>
                      <TableHead className="text-white font-bold">Échéance</TableHead>
                      <TableHead className="text-white font-bold">Statut</TableHead>
                      <TableHead className="text-right text-white font-bold">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedFrais.map((frais) => {
                      const typeInfo = TYPE_MAP[frais.type] || { label: frais.type, className: 'bg-stone-100 text-stone-800' }
                      const isActif = frais.actif !== false
                      const statusClass = isActif ? 'bg-emerald-100 text-emerald-800 border border-emerald-200 font-semibold' : 'bg-stone-100 text-stone-700'
                      const classesLabel = frais.classesIds.length > 0
                        ? `${frais.classesIds.length} classe(s)`
                        : 'Toutes les classes'
                      return (
                        <TableRow key={frais.id} className="hover:bg-amber-500/5 transition-colors">
                          <TableCell className="font-bold text-stone-900 break-words">{frais.libelle}</TableCell>
                          <TableCell><Badge variant="secondary" className={typeInfo.className}>{typeInfo.label}</Badge></TableCell>
                          <TableCell className="font-extrabold text-stone-900 tabular-nums">{formatMoney(frais.montant, frais.devise)}</TableCell>
                          <TableCell className="font-bold text-stone-700">{frais.devise || 'CDF'}</TableCell>
                          <TableCell className="font-medium text-stone-700 break-words">{frais.etablissementNom || '—'}</TableCell>
                          <TableCell className="font-medium text-stone-600">{classesLabel}</TableCell>
                          <TableCell className="font-medium text-stone-600">{frais.tranche ? `Tranche ${frais.tranche}` : '—'}</TableCell>
                          <TableCell className="font-medium text-stone-600">{formatDate(frais.dateEcheance)}</TableCell>
                          <TableCell><Badge variant="secondary" className={statusClass}>{isActif ? 'Actif' : 'Inactif'}</Badge></TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-amber-700 hover:bg-amber-50" onClick={() => openEdit(frais)} title="Modifier"><Edit className="h-4 w-4" /></Button>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-rose-600 hover:bg-rose-50" onClick={() => handleDelete(frais.id)} title="Désactiver"><Trash2 className="h-4 w-4" /></Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
            {!loading && totalItems > 0 && (
              <div className="flex flex-col items-center justify-between gap-3 border-t border-stone-100 bg-stone-50/50 px-6 py-4 text-sm font-medium text-stone-600 sm:flex-row">
                <p className="text-xs">
                  {totalItems} frais au total — Page <b>{page}</b> sur <b>{totalPages}</b>
                </p>
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))} className="rounded-xl border-stone-200 text-xs font-semibold">
                    <ChevronLeft className="h-3.5 w-3.5 mr-1" /> Précédent
                  </Button>
                  <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))} className="rounded-xl border-stone-200 text-xs font-semibold">
                    Suivant <ChevronRight className="h-3.5 w-3.5 ml-1" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Dialog Create/Edit */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto bg-white p-6 sm:p-8 rounded-3xl border border-stone-200 shadow-2xl">
          <DialogHeader className="border-b border-stone-100 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-2xl bg-[#1e3a8a] text-amber-400">
                <Banknote className="h-6 w-6" />
              </div>
              <div>
                <DialogTitle className="text-xl font-extrabold text-[#1e3a8a]">
                  {editingId ? 'Modifier le frais' : 'Nouveau frais'}
                </DialogTitle>
                <p className="text-xs text-stone-500 font-medium">Définissez les modalités financières.</p>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-4 pt-4">
            <div>
              <Label htmlFor="libelle" className="text-xs font-semibold text-stone-600">Libellé du frais *</Label>
              <Input id="libelle" placeholder="Ex. Minerval T1, Frais d'inscription" value={form.libelle} onChange={(e) => setForm({ ...form, libelle: e.target.value })} className="rounded-xl border-stone-200 bg-white font-medium mt-1" />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label className="text-xs font-semibold text-stone-600">Type de frais *</Label>
                <Select value={form.type} onValueChange={(value) => setForm({ ...form, type: value })}>
                  <SelectTrigger className="rounded-xl border-stone-200 bg-white font-medium mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent className="rounded-xl">
                    <SelectItem value="SCOLARITE">Scolarité</SelectItem>
                    <SelectItem value="INSCRIPTION">Inscription</SelectItem>
                    <SelectItem value="ANNEXE">Annexe</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs font-semibold text-stone-600">Établissement *</Label>
                <Select value={form.etablissementId} onValueChange={(value) => { setForm({ ...form, etablissementId: value }); setSelectedClasseIds([]); }}>
                  <SelectTrigger className="rounded-xl border-stone-200 bg-white font-medium mt-1"><SelectValue placeholder="Sélectionner" /></SelectTrigger>
                  <SelectContent className="rounded-xl">
                    {ecoles.map((ecole) => (
                      <SelectItem key={ecole.id} value={ecole.id}>{ecole.nom}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="montant" className="text-xs font-semibold text-stone-600">Montant *</Label>
                <Input id="montant" type="number" min="0" step="1" placeholder="0" value={form.montant} onChange={(e) => setForm({ ...form, montant: e.target.value })} className="rounded-xl border-stone-200 bg-white font-bold text-stone-900 mt-1" />
              </div>
              <div>
                <Label className="text-xs font-semibold text-stone-600">Devise *</Label>
                <Select value={form.devise} onValueChange={(value) => setForm({ ...form, devise: value })}>
                  <SelectTrigger className="rounded-xl border-stone-200 bg-white font-medium mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent className="rounded-xl">
                    <SelectItem value="CDF">CDF (Franc congolais)</SelectItem>
                    <SelectItem value="USD">USD ($)</SelectItem>
                    <SelectItem value="BIF">BIF (Franc burundais)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="tranche" className="text-xs font-semibold text-stone-600">Numéro de Tranche</Label>
                <Input id="tranche" type="number" min="1" step="1" placeholder="Ex. 1" value={form.tranche} onChange={(e) => setForm({ ...form, tranche: e.target.value })} className="rounded-xl border-stone-200 bg-white font-medium mt-1" />
              </div>
              <div>
                <Label htmlFor="dateEcheance" className="text-xs font-semibold text-stone-600">Date d&apos;échéance</Label>
                <Input id="dateEcheance" type="date" value={form.dateEcheance} onChange={(e) => setForm({ ...form, dateEcheance: e.target.value })} className="rounded-xl border-stone-200 bg-white font-medium mt-1" />
              </div>
            </div>

            {/* Sélection des classes */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold text-stone-600">Classes concernées (si vide = s&apos;applique à toutes)</Label>
              {classesDisponibles.length === 0 ? (
                <p className="text-xs text-stone-400 font-medium p-3 rounded-xl bg-stone-50 border border-stone-100">Aucune classe disponible pour cet établissement.</p>
              ) : (
                <div className="max-h-40 overflow-y-auto border border-stone-200/80 rounded-2xl p-3 space-y-1.5 bg-stone-50/50">
                  {classesDisponibles.map((classe) => (
                    <div key={classe.id} className="flex items-center space-x-2.5">
                      <Checkbox
                        id={`classe-${classe.id}`}
                        checked={selectedClasseIds.includes(classe.id)}
                        onCheckedChange={() => toggleClasseId(classe.id)}
                      />
                      <label htmlFor={`classe-${classe.id}`} className="text-xs font-semibold text-stone-700 cursor-pointer">{classe.nom}</label>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 border-t border-stone-100 pt-4">
              <Button variant="outline" className="rounded-xl border-stone-200" onClick={() => setDialogOpen(false)}>Annuler</Button>
              <Button disabled={saving} className="bg-[#1e3a8a] hover:bg-[#172554] text-white font-bold rounded-xl px-6 shadow-md" onClick={handleSave}>
                {saving ? 'Enregistrement...' : editingId ? 'Mettre à jour' : 'Créer le frais'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </motion.div>
  )
}