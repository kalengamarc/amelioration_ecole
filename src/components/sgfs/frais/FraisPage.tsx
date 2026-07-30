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
import { Coins, DollarSign, Edit, Plus, Search, ShieldAlert, Trash2, TrendingUp, ChevronLeft, ChevronRight } from 'lucide-react'
import { formatMoney } from '@/lib/utils'

// ─── Types (camelCase, grâce au rename_all dans models.rs) ──────────────────
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
  SCOLARITE: { label: 'Scolarité', className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' },
  INSCRIPTION: { label: 'Inscription', className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' },
  ANNEXE: { label: 'Annexe', className: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400' },
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
  const limit = 6

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [selectedClasseIds, setSelectedClasseIds] = useState<string[]>([])

  const [search, setSearch] = useState('')
  const [filterEcole, setFilterEcole] = useState('all')
  const [filterType, setFilterType] = useState('all')

  // ─── Charger les écoles ──────────────────────────────────────────────────
  const fetchEcoles = useCallback(async () => {
    try {
      const res = await tc.listEtablissements()
      setEcoles(res?.etablissements ?? [])
    } catch (error) {
      console.error('Erreur établissements:', error)
    }
  }, [])

  // ─── Charger les classes pour un établissement ───────────────────────────
  const fetchClasses = useCallback(async (etablissementId: string) => {
    try {
      // On peut filtrer par année active si on veut, mais pour simplifier on prend toutes les classes
      const res = await tc.listClasses(etablissementId)
      setClassesDisponibles(res?.classes ?? [])
    } catch (error) {
      console.error('Erreur chargement classes:', error)
      setClassesDisponibles([])
    }
  }, [])

  // ─── Charger les frais ───────────────────────────────────────────────────
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

  // Charger les classes quand l'établissement du filtre change (pour le formulaire aussi)
  const currentEtabForForm = form.etablissementId || (filterEcole !== 'all' ? filterEcole : '')
  useEffect(() => {
    if (currentEtabForForm) {
      fetchClasses(currentEtabForForm)
    } else {
      setClassesDisponibles([])
    }
  }, [currentEtabForForm, fetchClasses])

  // Reset page on filter change
  useEffect(() => {
    setPage(1)
  }, [search, filterEcole, filterType])

  // ─── Filtrage & Pagination côté client ──────────────────────────────────
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

  // ─── Stats ──────────────────────────────────────────────────────────────
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

  // ─── Access Control ──────────────────────────────────────────────────────
  if (user && !canManageFees(user.role)) {
    return (
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
        <ShieldAlert className="h-16 w-16 text-red-400" />
        <h2 className="text-2xl font-bold">Accès réservé</h2>
        <p className="text-muted-foreground">Accès réservé au coordonnateur ou à l'administration.</p>
      </motion.div>
    )
  }

  // ─── Handlers ────────────────────────────────────────────────────────────
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
    setSelectedClasseIds(frais.classesIds || [])
    // Charger les classes pour l'établissement si pas déjà fait
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
      toast.error('Le libellé, l\'établissement et un montant positif sont obligatoires')
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
        classeIds: selectedClasseIds.length > 0 ? selectedClasseIds : undefined,
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

  // ─── Rendu ──────────────────────────────────────────────────────────────
  return (
    <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-6 p-4 md:p-6">
      {/* Header */}
      <motion.div variants={itemVariants} className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Gestion des Frais Scolaires</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Définissez et gérez les différents types de frais par classe.</p>
        </div>
        <Button onClick={openCreate} className="gap-2 bg-[var(--etab-color,#075e54)] text-white hover:bg-[var(--etab-color-hover,#064e46)]">
          <Plus className="h-4 w-4" /> Nouveau frais
        </Button>
      </motion.div>

      {/* Stats Cards */}
      <motion.div variants={itemVariants} className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="border-l-4 border-l-[var(--etab-color,#075e54)]">
          <CardContent className="flex items-center gap-4 p-4">
            <div className="rounded-full bg-[var(--etab-color,#075e54)]/10 p-3">
              <DollarSign className="h-6 w-6 text-[var(--etab-color,#075e54)]" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total frais actifs</p>
              <p className="text-xl font-bold">{actifs.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-[#25d366]">
          <CardContent className="flex items-center gap-4 p-4">
            <div className="rounded-full bg-[#25d366]/10 p-3">
              <Coins className="h-6 w-6 text-[#25d366]" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Nombre de types</p>
              <p className="text-xl font-bold">{typesUniques}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="flex items-center gap-4 p-4">
            <div className="rounded-full bg-blue-500/10 p-3">
              <TrendingUp className="h-6 w-6 text-blue-500" />
            </div>
            <div className="min-w-0">
              <p className="text-sm text-muted-foreground">Moyenne par devise</p>
              {moyennesParDevise.length === 0 ? (
                <p className="text-xl font-bold">—</p>
              ) : (
                <div className="space-y-0.5">
                  {moyennesParDevise.map(({ devise, moyenne }) => (
                    <p key={devise} className="text-lg font-bold">{formatMoney(moyenne, devise)}</p>
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
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input className="pl-9" placeholder="Rechercher un frais..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={filterEcole} onValueChange={(v) => { setFilterEcole(v); onEtabSelect(v, ecoles) }}>
          <SelectTrigger className="w-full sm:w-52"><SelectValue placeholder="Toutes les écoles" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes les écoles</SelectItem>
            {ecoles.map((ecole) => (
              <SelectItem key={ecole.id} value={ecole.id}>{`${getTypeIcon(ecole.type || '')} ${ecole.nom}`}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-full sm:w-44"><SelectValue placeholder="Tous les types" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les types</SelectItem>
            <SelectItem value="SCOLARITE">Scolarité</SelectItem>
            <SelectItem value="INSCRIPTION">Inscription</SelectItem>
            <SelectItem value="ANNEXE">Annexe</SelectItem>
          </SelectContent>
        </Select>
      </motion.div>

      {/* Table */}
      <motion.div variants={itemVariants}>
        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="space-y-4 p-6">
                {Array.from({ length: 5 }).map((_, index) => (
                  <div key={index} className="flex gap-4">
                    <Skeleton className="h-8 w-1/4" /><Skeleton className="h-8 w-1/6" /><Skeleton className="h-8 w-1/6" /><Skeleton className="h-8 w-1/5" />
                  </div>
                ))}
              </div>
            ) : paginatedFrais.length === 0 ? (
              <div className="p-12 text-center text-muted-foreground">
                <DollarSign className="mx-auto mb-3 h-12 w-12 opacity-30" />
                <p>Aucun frais trouvé.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gray-50 dark:bg-[var(--etab-color,#075e54)] text-white">
                      <TableHead>Libellé</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Montant</TableHead>
                      <TableHead>Devise</TableHead>
                      <TableHead className='text-center'>École</TableHead>
                      <TableHead>Classes</TableHead>
                      <TableHead>Tranche</TableHead>
                      <TableHead>Échéance</TableHead>
                      <TableHead>Statut</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedFrais.map((frais) => {
                      const typeInfo = TYPE_MAP[frais.type] || { label: frais.type, className: 'bg-gray-100 text-gray-600' }
                      const isActif = frais.actif !== false
                      const statusClass = isActif ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
                      // Affichage des classes : nous n'avons que les IDs, il faudrait les noms. On peut afficher le nombre ou les IDs.
                      const classesLabel = frais.classesIds.length > 0
                        ? `${frais.classesIds.length} classe(s)`
                        : 'Toutes'
                      return (
                        <TableRow key={frais.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30">
                          <TableCell className="font-medium">{frais.libelle}</TableCell>
                          <TableCell><Badge variant="secondary" className={typeInfo.className}>{typeInfo.label}</Badge></TableCell>
                          <TableCell className="font-semibold">{formatMoney(frais.montant, frais.devise)}</TableCell>
                          <TableCell>{frais.devise || 'CDF'}</TableCell>
                          <TableCell>{frais.etablissementNom || '—'}</TableCell>
                          <TableCell>{classesLabel}</TableCell>
                          <TableCell>{frais.tranche ? `Tranche ${frais.tranche}` : '—'}</TableCell>
                          <TableCell>{formatDate(frais.dateEcheance)}</TableCell>
                          <TableCell><Badge variant="secondary" className={statusClass}>{isActif ? 'Actif' : 'Inactif'}</Badge></TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button variant="ghost" size="icon" className="text-blue-500" onClick={() => openEdit(frais)}><Edit className="h-4 w-4" /></Button>
                              <Button variant="ghost" size="icon" className="text-red-500" onClick={() => handleDelete(frais.id)}><Trash2 className="h-4 w-4" /></Button>
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
              <div className="flex flex-col items-center justify-between gap-3 border-t px-6 py-4 sm:flex-row">
                <p className="text-sm text-muted-foreground">
                  {totalItems} frais au total — Page <b>{page}</b> sur <b>{totalPages}</b>
                </p>
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))} className="gap-1"><ChevronLeft className="h-4 w-4" /> Précédent</Button>
                  <span className="px-3 text-sm font-medium text-muted-foreground">{page} / {totalPages}</span>
                  <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))} className="gap-1">Suivant <ChevronRight className="h-4 w-4" /></Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Dialog Create/Edit */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto bg-white/90">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold text-[var(--etab-color,#075e54)]">
              {editingId ? 'Modifier le frais' : 'Nouveau frais'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label htmlFor="libelle">Libellé *</Label>
              <Input id="libelle" placeholder="Ex. Frais de scolarité" value={form.libelle} onChange={(e) => setForm({ ...form, libelle: e.target.value })} />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Type *</Label>
                <Select value={form.type} onValueChange={(value) => setForm({ ...form, type: value })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SCOLARITE">Scolarité</SelectItem>
                    <SelectItem value="INSCRIPTION">Inscription</SelectItem>
                    <SelectItem value="ANNEXE">Annexe</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>École *</Label>
                <Select value={form.etablissementId} onValueChange={(value) => { setForm({ ...form, etablissementId: value }); setSelectedClasseIds([]); }}>
                  <SelectTrigger><SelectValue placeholder="Sélectionner" /></SelectTrigger>
                  <SelectContent>
                    {ecoles.map((ecole) => (
                      <SelectItem key={ecole.id} value={ecole.id}>{ecole.nom}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="montant">Montant *</Label>
                <Input id="montant" type="number" min="0" step="1" placeholder="0" value={form.montant} onChange={(e) => setForm({ ...form, montant: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Devise</Label>
                <Select value={form.devise} onValueChange={(value) => setForm({ ...form, devise: value })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CDF">CDF (Franc congolais)</SelectItem>
                    <SelectItem value="USD">USD ($)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="tranche">Tranche (optionnel)</Label>
                <Input id="tranche" type="number" min="1" step="1" placeholder="Ex. 1" value={form.tranche} onChange={(e) => setForm({ ...form, tranche: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dateEcheance">Date d'échéance</Label>
                <Input id="dateEcheance" type="date" value={form.dateEcheance} onChange={(e) => setForm({ ...form, dateEcheance: e.target.value })} />
              </div>
            </div>

            {/* Sélection des classes */}
            <div className="space-y-2">
              <Label>Classes concernées (aucune = toutes)</Label>
              {classesDisponibles.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucune classe disponible pour cet établissement.</p>
              ) : (
                <div className="max-h-40 overflow-y-auto border rounded-md p-2 space-y-1">
                  {classesDisponibles.map((classe) => (
                    <div key={classe.id} className="flex items-center space-x-2">
                      <Checkbox
                        id={`classe-${classe.id}`}
                        checked={selectedClasseIds.includes(classe.id)}
                        onCheckedChange={() => toggleClasseId(classe.id)}
                      />
                      <label htmlFor={`classe-${classe.id}`} className="text-sm cursor-pointer">{classe.nom}</label>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Annuler</Button>
              <Button disabled={saving} className="bg-[var(--etab-color,#075e54)] text-white hover:bg-[var(--etab-color-hover,#064e46)]" onClick={handleSave}>
                {saving ? 'Enregistrement...' : editingId ? 'Mettre à jour' : 'Créer'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </motion.div>
  )
}