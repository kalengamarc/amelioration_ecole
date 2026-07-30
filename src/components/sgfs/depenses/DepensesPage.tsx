'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAppStore, getSchoolFilter, getTypeIcon, onEtabSelect } from '@/lib/store'
import * as tc from '@/lib/tauri-commands'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import { formatMoney as fm } from '@/lib/utils'
import { 
  BarChart3, ListOrdered, Plus, Receipt, Search, TrendingDown, Edit, Trash2, 
  ChevronLeft, ChevronRight 
} from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────────────────────

interface Depense {
  id: string
  dateDepense: string
  libelle: string
  categorie: string
  montant: number
  devise: string
  beneficiaire?: string
  etablissementId: string
  etablissementNom?: string
  referencePiece?: string
  statut: string
}

interface Etablissement {
  id: string
  nom: string
  type?: string
}

// ─── Constants & Helpers ─────────────────────────────────────────────────────

const categories = [
  'SALAIRES', 'FOURNITURES', 'REPARATIONS', 'LOYER', 'ENERGIE',
  'EAU', 'INTERNET', 'COMMUNICATION', 'TRANSPORT', 'SECURITE',
  'ENTRETIEN', 'ASSURANCES', 'FRAIS_BANCAIRES', 'IMPOTS_TAXES',
  'FORMATION', 'ACTIVITES_SCOLAIRES', 'CANTINE', 'AUTRE',
]

const CATEGORIE_MAP: Record<string, { label: string; className: string }> = {
  SALAIRES: { label: 'Salaires', className: 'bg-blue-100 text-blue-800' },
  FOURNITURES: { label: 'Fournitures', className: 'bg-green-100 text-green-800' },
  REPARATIONS: { label: 'Réparations', className: 'bg-orange-100 text-orange-800' },
  LOYER: { label: 'Loyer', className: 'bg-purple-100 text-purple-800' },
  ENERGIE: { label: 'Énergie', className: 'bg-yellow-100 text-yellow-800' },
  EAU: { label: 'Eau', className: 'bg-cyan-100 text-cyan-800' },
  INTERNET: { label: 'Internet', className: 'bg-indigo-100 text-indigo-800' },
  COMMUNICATION: { label: 'Communication', className: 'bg-pink-100 text-pink-800' },
  TRANSPORT: { label: 'Transport', className: 'bg-sky-100 text-sky-800' },
  SECURITE: { label: 'Sécurité', className: 'bg-red-100 text-red-800' },
  ENTRETIEN: { label: 'Entretien', className: 'bg-lime-100 text-lime-800' },
  ASSURANCES: { label: 'Assurances', className: 'bg-teal-100 text-teal-800' },
  FRAIS_BANCAIRES: { label: 'Frais bancaires', className: 'bg-violet-100 text-violet-800' },
  IMPOTS_TAXES: { label: 'Impôts et taxes', className: 'bg-rose-100 text-rose-800' },
  FORMATION: { label: 'Formation', className: 'bg-amber-100 text-amber-800' },
  ACTIVITES_SCOLAIRES: { label: 'Activités scolaires', className: 'bg-emerald-100 text-emerald-800' },
  CANTINE: { label: 'Cantine', className: 'bg-orange-100 text-orange-800' },
  AUTRE: { label: 'Autre', className: 'bg-gray-100 text-gray-700' },
}

const STATUS_MAP: Record<string, { label: string; className: string }> = {
  VALIDÉ: { label: 'Validée', className: 'bg-green-100 text-green-800' },
  EN_ATTENTE: { label: 'En attente', className: 'bg-yellow-100 text-yellow-800' },
  REJETÉ: { label: 'Rejetée', className: 'bg-red-100 text-red-800' },
}

const formatMoney = (montant: number, devise = 'CDF') => fm(montant, devise)
const formatDate = (value?: string) => value ? new Date(value).toLocaleDateString('fr-FR') : '—'

const emptyForm = {
  libelle: '', categorie: 'FOURNITURES', montant: '', devise: 'CDF',
  etablissementId: '', beneficiaire: '', date: new Date().toISOString().slice(0, 10),
  referencePiece: '', statut: 'EN_ATTENTE',
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function DepensesPage() {
  const { user } = useAppStore()
  const role = user?.role ?? ''
  const userEtabId = user?.etablissementId ?? null
  const schoolFilter = getSchoolFilter(role, userEtabId)
  const locked = !!schoolFilter

  const [depenses, setDepenses] = useState<Depense[]>([])
  const [ecoles, setEcoles] = useState<Etablissement[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [page, setPage] = useState(1)
  const limit = 15

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)

  const [search, setSearch] = useState('')
  const [filterEcole, setFilterEcole] = useState('all')
  const [filterCategorie, setFilterCategorie] = useState('all')
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')

  // ─── Chargement ──────────────────────────────────────────────────────────
  const fetchEcoles = useCallback(async () => {
    try {
      const res = await tc.listEtablissements()
      setEcoles(res?.etablissements ?? [])
    } catch { /* ignore */ }
  }, [])

  const fetchDepenses = useCallback(async () => {
  if (!user) return
  setLoading(true)
  try {
    const sf = getSchoolFilter(role, userEtabId)
    const etabId = sf || (filterEcole !== 'all' ? filterEcole : undefined)
    console.log('🔍 etabId envoyé à listDepenses:', etabId)
    const res = await tc.listDepenses({
      etablissementId: etabId,
    })
    console.log('📦 Réponse brute listDepenses:', res)
    const all = res?.depenses ?? res?.data ?? []
    console.log('📋 Dépenses extraites:', all)
    // Filtrage côté client
    let filtered = all
    if (filterCategorie !== 'all') filtered = filtered.filter((d: any) => d.categorie === filterCategorie)
    if (search.trim()) {
      const q = search.toLowerCase()
      filtered = filtered.filter((d: any) => 
        d.libelle?.toLowerCase().includes(q) || 
        d.beneficiaire?.toLowerCase().includes(q) ||
        d.referencePiece?.toLowerCase().includes(q)
      )
    }
    if (filterDateFrom) filtered = filtered.filter((d: any) => d.dateDepense >= filterDateFrom)
    if (filterDateTo) filtered = filtered.filter((d: any) => d.dateDepense <= filterDateTo)
    setDepenses(filtered)
    console.log('✅ Dépenses filtrées:', filtered.length)
  } catch (e: any) {
    console.error('❌ Erreur fetchDepenses:', e)
    toast.error(e?.message || 'Erreur chargement dépenses')
  } finally {
    setLoading(false)
  }
}, [user, role, userEtabId, filterEcole, filterCategorie, search, filterDateFrom, filterDateTo])
  useEffect(() => { if (user) fetchEcoles() }, [user, fetchEcoles])
  useEffect(() => { const timer = setTimeout(fetchDepenses, 250); return () => clearTimeout(timer) }, [fetchDepenses])
  useEffect(() => { setPage(1) }, [search, filterEcole, filterCategorie, filterDateFrom, filterDateTo])

  // ─── Pagination côté client ──────────────────────────────────────────────
  const totalItems = depenses.length
  const totalPages = Math.max(1, Math.ceil(totalItems / limit))

  const paginatedDepenses = useMemo(() => {
    const start = (page - 1) * limit
    return depenses.slice(start, start + limit)
  }, [depenses, page, limit])

  // ─── Stats ───────────────────────────────────────────────────────────────
  const totalsByCurrency = useMemo(() => 
    Object.entries(depenses.reduce<Record<string, number>>((acc, d) => {
      const dev = d.devise || 'CDF'
      acc[dev] = (acc[dev] || 0) + Number(d.montant || 0)
      return acc
    }, {})), [depenses])

  const categoryCounts = useMemo(() => 
    depenses.reduce<Record<string, number>>((acc, d) => {
      acc[d.categorie] = (acc[d.categorie] || 0) + 1
      return acc
    }, {}), [depenses])
  const maxCount = Math.max(...Object.values(categoryCounts), 1)

  // ─── Handlers ────────────────────────────────────────────────────────────
  function openCreate() {
    setEditingId(null)
    setForm({ ...emptyForm, etablissementId: user?.etablissementId || '', date: new Date().toISOString().slice(0, 10) })
    setDialogOpen(true)
  }

  function openEdit(d: Depense) {
    setEditingId(d.id)
    setForm({
      libelle: d.libelle,
      categorie: d.categorie,
      montant: String(d.montant),
      devise: d.devise || 'CDF',
      etablissementId: d.etablissementId,
      beneficiaire: d.beneficiaire || '',
      date: d.dateDepense?.split('T')[0] || '',
      referencePiece: d.referencePiece || '',
      statut: d.statut || 'EN_ATTENTE',
    })
    setDialogOpen(true)
  }

  async function handleSave() {
    const montant = Number(form.montant)
    if (!form.libelle.trim() || !form.etablissementId || !form.date || !Number.isFinite(montant) || montant <= 0) {
      return toast.error('Libellé, établissement, date et montant positif obligatoires')
    }
    setSaving(true)
    try {
      const payload = {
        libelle: form.libelle.trim(),
        categorie: form.categorie,
        montant,
        devise: form.devise,
        etablissementId: form.etablissementId,
        beneficiaire: form.beneficiaire || undefined,
        dateDepense: form.date,
        referencePiece: form.referencePiece || undefined,
        statut: form.statut,
        // anneeScolaireId n'est pas envoyé, le backend utilisera l'année active
      }
      if (editingId) {
        await tc.updateDepense(editingId, payload)
        toast.success('Dépense mise à jour')
      } else {
        await tc.createDepense(payload)
        toast.success('Dépense créée')
      }
      setDialogOpen(false)
      fetchDepenses()
    } catch (e: any) {
      toast.error(e?.message || "Erreur d'enregistrement")
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Supprimer définitivement cette dépense ?')) return
    try {
      await tc.deleteDepense(id)
      toast.success('Dépense supprimée')
      fetchDepenses()
    } catch (e: any) {
      toast.error(e?.message || 'Erreur suppression')
    }
  }

  // ─── Rendu ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold">Gestion des Dépenses</h1>
          <p className="text-sm text-muted-foreground">Suivez et gérez les dépenses de l'établissement.</p>
        </div>
        <Button onClick={openCreate} className="gap-2 text-white bg-[var(--etab-color,#075e54)] hover:bg-[var(--etab-color-hover,#064e46)]">
          <Plus className="h-4 w-4" /> Nouvelle dépense
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="border-l-4 border-l-[var(--etab-color,#075e54)]">
          <CardContent className="flex items-center gap-4 p-4">
            <div className="rounded-full bg-[var(--etab-color,#075e54)]/10 p-3"><Receipt className="h-6 w-6 text-[var(--etab-color,#075e54)]" /></div>
            <div>
              <p className="text-sm text-muted-foreground">Total par devise</p>
              {totalsByCurrency.length ? totalsByCurrency.map(([dev, total]) => (
                <p key={dev} className="text-lg font-bold">{formatMoney(total, dev)}</p>
              )) : <p className="text-lg font-bold">—</p>}
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-[#25d366]">
          <CardContent className="flex items-center gap-4 p-4">
            <div className="rounded-full bg-[#25d366]/10 p-3"><ListOrdered className="h-6 w-6 text-[#25d366]" /></div>
            <div>
              <p className="text-sm text-muted-foreground">Nombre de dépenses</p>
              <p className="text-xl font-bold">{totalItems}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-orange-500">
          <CardContent className="p-4">
            <div className="mb-3 flex items-center gap-2">
              <div className="rounded-full bg-orange-500/10 p-2"><BarChart3 className="h-5 w-5 text-orange-500" /></div>
              <p className="text-sm text-muted-foreground">Répartition par catégorie</p>
            </div>
            <div className="space-y-1.5">
              {Object.entries(categoryCounts).slice(0, 4).map(([cat, count]) => (
                <div key={cat} className="flex items-center gap-2">
                  <span className="w-24 truncate text-xs">{CATEGORIE_MAP[cat]?.label || cat}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-orange-500 transition-all duration-500" style={{ width: `${(count / maxCount) * 100}%` }} />
                  </div>
                  <span className="text-xs">{count}</span>
                </div>
              ))}
              {!Object.keys(categoryCounts).length && <p className="text-xs text-muted-foreground">Aucune donnée</p>}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filtres */}
      <div className="flex flex-col flex-wrap gap-3 sm:flex-row">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Libellé, bénéficiaire ou référence..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={filterEcole} onValueChange={v => { setFilterEcole(v); onEtabSelect(v, ecoles) }} disabled={locked}>
          <SelectTrigger className="w-full sm:w-52"><SelectValue placeholder="Toutes les écoles" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes les écoles</SelectItem>
            {ecoles.map(e => <SelectItem key={e.id} value={e.id}>{`${getTypeIcon(e.type || '')} ${e.nom}`}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterCategorie} onValueChange={setFilterCategorie}>
          <SelectTrigger className="w-full sm:w-48"><SelectValue placeholder="Toutes catégories" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes catégories</SelectItem>
            {categories.map(c => <SelectItem key={c} value={c}>{CATEGORIE_MAP[c].label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input type="date" className="w-full sm:w-40" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} />
        <Input type="date" className="w-full sm:w-40" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} />
      </div>

      {/* Tableau */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-4 p-6">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
          ) : !totalItems ? (
            <div className="p-12 text-center text-muted-foreground">
              <TrendingDown className="mx-auto mb-3 h-12 w-12 opacity-30" />
              <p>Aucune dépense trouvée.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Libellé</TableHead>
                    <TableHead>Catégorie</TableHead>
                    <TableHead className="text-right">Montant</TableHead>
                    <TableHead>Bénéficiaire</TableHead>
                    <TableHead>École</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedDepenses.map(d => {
                    const cat = CATEGORIE_MAP[d.categorie] || { label: d.categorie, className: 'bg-gray-100' }
                    const status = STATUS_MAP[d.statut] || { label: d.statut, className: 'bg-gray-100' }
                    return (
                      <TableRow key={d.id}>
                        <TableCell>{formatDate(d.dateDepense)}</TableCell>
                        <TableCell className="font-medium">{d.libelle}{d.referencePiece && <span className="text-xs text-muted-foreground"> ({d.referencePiece})</span>}</TableCell>
                        <TableCell><Badge variant="secondary" className={cat.className}>{cat.label}</Badge></TableCell>
                        <TableCell className="text-right font-semibold">{formatMoney(d.montant, d.devise)}</TableCell>
                        <TableCell>{d.beneficiaire || '—'}</TableCell>
                        <TableCell>{d.etablissementNom || '—'}</TableCell>
                        <TableCell><Badge variant="secondary" className={status.className}>{status.label}</Badge></TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="icon" className="text-blue-600" onClick={() => openEdit(d)}><Edit className="h-4 w-4" /></Button>
                            <Button variant="ghost" size="icon" className="text-red-600" onClick={() => handleDelete(d.id)}><Trash2 className="h-4 w-4" /></Button>
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
              <p className="text-sm text-muted-foreground">{totalItems} dépense{totalItems > 1 ? 's' : ''} — Page <b>{page}</b> sur <b>{totalPages}</b></p>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="gap-1"><ChevronLeft className="h-4 w-4" />Précédent</Button>
                <span className="px-3 text-sm font-medium">{page} / {totalPages}</span>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="gap-1">Suivant<ChevronRight className="h-4 w-4" /></Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialogue création/édition */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto bg-white/90">
          <DialogHeader>
            <DialogTitle className="text-[var(--etab-color,#075e54)]">{editingId ? 'Modifier la dépense' : 'Nouvelle dépense'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Libellé *</Label>
              <Input value={form.libelle} onChange={e => setForm({ ...form, libelle: e.target.value })} />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label>Catégorie *</Label>
                <Select value={form.categorie} onValueChange={categorie => setForm({ ...form, categorie })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{categories.map(c => <SelectItem key={c} value={c}>{CATEGORIE_MAP[c].label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>École *</Label>
                <Select value={form.etablissementId} onValueChange={etablissementId => setForm({ ...form, etablissementId })}>
                  <SelectTrigger><SelectValue placeholder="Sélectionner" /></SelectTrigger>
                  <SelectContent>{ecoles.map(e => <SelectItem key={e.id} value={e.id}>{`${getTypeIcon(e.type || '')} ${e.nom}`}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label>Montant *</Label>
                <Input type="number" min="0" step="1" value={form.montant} onChange={e => setForm({ ...form, montant: e.target.value })} />
              </div>
              <div>
                <Label>Devise</Label>
                <Select value={form.devise} onValueChange={devise => setForm({ ...form, devise })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CDF">CDF (Franc congolais)</SelectItem>
                    <SelectItem value="USD">USD ($)</SelectItem>   
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label>Bénéficiaire</Label>
                <Input value={form.beneficiaire} onChange={e => setForm({ ...form, beneficiaire: e.target.value })} />
              </div>
              <div>
                <Label>Date *</Label>
                <Input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label>Référence pièce</Label>
                <Input value={form.referencePiece} onChange={e => setForm({ ...form, referencePiece: e.target.value })} />
              </div>
              <div>
                <Label>Statut</Label>
                <Select value={form.statut} onValueChange={statut => setForm({ ...form, statut })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="EN_ATTENTE">En attente</SelectItem>
                    <SelectItem value="VALIDÉ">Validée</SelectItem>
                    <SelectItem value="REJETÉ">Rejetée</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex justify-end gap-3 border-t pt-4">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Annuler</Button>
              <Button disabled={saving} className="bg-[var(--etab-color,#075e54)] hover:bg-[var(--etab-color-hover,#064e46)]" onClick={handleSave}>
                {saving ? 'Enregistrement...' : editingId ? 'Mettre à jour' : 'Créer'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}