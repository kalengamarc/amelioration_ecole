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
  ChevronLeft, ChevronRight, Sparkles 
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
  SALAIRES: { label: 'Salaires', className: 'bg-sky-100 text-sky-900 border border-sky-200 font-semibold' },
  FOURNITURES: { label: 'Fournitures', className: 'bg-emerald-100 text-emerald-900 border border-emerald-200 font-semibold' },
  REPARATIONS: { label: 'Réparations', className: 'bg-amber-100 text-amber-900 border border-amber-200 font-semibold' },
  LOYER: { label: 'Loyer', className: 'bg-purple-100 text-purple-900 border border-purple-200 font-semibold' },
  ENERGIE: { label: 'Énergie', className: 'bg-yellow-100 text-yellow-900 border border-yellow-200 font-semibold' },
  EAU: { label: 'Eau', className: 'bg-cyan-100 text-cyan-900 border border-cyan-200 font-semibold' },
  INTERNET: { label: 'Internet', className: 'bg-indigo-100 text-indigo-900 border border-indigo-200 font-semibold' },
  COMMUNICATION: { label: 'Communication', className: 'bg-pink-100 text-pink-900 border border-pink-200 font-semibold' },
  TRANSPORT: { label: 'Transport', className: 'bg-sky-100 text-sky-900 border border-sky-200 font-semibold' },
  SECURITE: { label: 'Sécurité', className: 'bg-rose-100 text-rose-900 border border-rose-200 font-semibold' },
  ENTRETIEN: { label: 'Entretien', className: 'bg-lime-100 text-lime-900 border border-lime-200 font-semibold' },
  ASSURANCES: { label: 'Assurances', className: 'bg-teal-100 text-teal-900 border border-teal-200 font-semibold' },
  FRAIS_BANCAIRES: { label: 'Frais bancaires', className: 'bg-violet-100 text-violet-900 border border-violet-200 font-semibold' },
  IMPOTS_TAXES: { label: 'Impôts et taxes', className: 'bg-rose-100 text-rose-900 border border-rose-200 font-semibold' },
  FORMATION: { label: 'Formation', className: 'bg-amber-100 text-amber-900 border border-amber-200 font-semibold' },
  ACTIVITES_SCOLAIRES: { label: 'Activités scolaires', className: 'bg-emerald-100 text-emerald-900 border border-emerald-200 font-semibold' },
  CANTINE: { label: 'Cantine', className: 'bg-amber-100 text-amber-900 border border-amber-200 font-semibold' },
  AUTRE: { label: 'Autre', className: 'bg-stone-100 text-stone-800 border border-stone-200 font-semibold' },
}

const STATUS_MAP: Record<string, { label: string; className: string }> = {
  VALIDÉ: { label: 'Validée', className: 'bg-emerald-100 text-emerald-800 border border-emerald-200 font-semibold' },
  EN_ATTENTE: { label: 'En attente', className: 'bg-amber-100 text-amber-800 border border-amber-200 font-semibold' },
  REJETÉ: { label: 'Rejetée', className: 'bg-rose-100 text-rose-800 border border-rose-200 font-semibold' },
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
      const res = await tc.listDepenses({
        etablissementId: etabId,
      })
      const all = res?.depenses ?? res?.data ?? []
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
    } catch (e: any) {
      toast.error(e?.message || 'Erreur chargement dépenses')
    } finally {
      setLoading(false)
    }
  }, [user, role, userEtabId, filterEcole, filterCategorie, search, filterDateFrom, filterDateTo])

  useEffect(() => { if (user) fetchEcoles() }, [user, fetchEcoles])
  useEffect(() => { const timer = setTimeout(fetchDepenses, 250); return () => clearTimeout(timer) }, [fetchDepenses])
  useEffect(() => { setPage(1) }, [search, filterEcole, filterCategorie, filterDateFrom, filterDateTo])

  const totalItems = depenses.length
  const totalPages = Math.max(1, Math.ceil(totalItems / limit))

  const paginatedDepenses = useMemo(() => {
    const start = (page - 1) * limit
    return depenses.slice(start, start + limit)
  }, [depenses, page, limit])

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
      return toast.error('Libellé, établissement, date et montant positif obligatoires (*)')
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
      }
      if (editingId) {
        await tc.updateDepense(editingId, payload)
        toast.success('Dépense mise à jour avec succès')
      } else {
        await tc.createDepense(payload)
        toast.success('Dépense enregistrée avec succès')
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

  return (
    <div className="space-y-6 p-2 sm:p-4 md:p-6">
      {/* Banner Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-stone-200/80 shadow-sm">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 text-amber-700 text-xs font-bold border border-amber-500/20 mb-2">
            <TrendingDown className="h-3.5 w-3.5" /> Sorties de Caisse
          </div>
          <h1 className="text-2xl font-extrabold text-stone-900 tracking-tight">Gestion des Dépenses</h1>
          <p className="text-xs sm:text-sm text-stone-500 mt-1">Suivez et contrôlez les charges et sorties de caisse par établissement.</p>
        </div>
        <Button onClick={openCreate} className="bg-[#1e3a8a] hover:bg-[#172554] text-white font-bold px-5 py-2.5 rounded-xl shadow-md gap-2">
          <Plus className="h-4 w-4 text-amber-400" /> Nouvelle dépense
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="rounded-2xl border-stone-200/80 bg-white shadow-sm border-l-4 border-l-[#1e3a8a]">
          <CardContent className="flex items-center gap-4 p-5">
            <div className="p-3.5 rounded-2xl bg-[#1e3a8a]/10 border border-[#1e3a8a]/20"><Receipt className="h-6 w-6 text-[#1e3a8a]" /></div>
            <div>
              <p className="text-xs font-semibold text-stone-500">Total Dépensé par Devise</p>
              {totalsByCurrency.length ? totalsByCurrency.map(([dev, total]) => (
                <p key={dev} className="text-lg font-extrabold text-stone-900 tabular-nums">{formatMoney(total, dev)}</p>
              )) : <p className="text-lg font-extrabold text-stone-900">—</p>}
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-2xl border-stone-200/80 bg-white shadow-sm border-l-4 border-l-emerald-600">
          <CardContent className="flex items-center gap-4 p-5">
            <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20"><ListOrdered className="h-6 w-6 text-emerald-600" /></div>
            <div>
              <p className="text-xs font-semibold text-stone-500">Nombre de Dépenses</p>
              <p className="text-2xl font-extrabold text-stone-900">{totalItems}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-2xl border-stone-200/80 bg-white shadow-sm border-l-4 border-l-amber-500">
          <CardContent className="p-5">
            <div className="mb-2 flex items-center gap-2">
              <div className="p-2 rounded-xl bg-amber-500/10 text-amber-600"><BarChart3 className="h-4 w-4" /></div>
              <p className="text-xs font-bold text-stone-700">Top Catégories</p>
            </div>
            <div className="space-y-1.5">
              {Object.entries(categoryCounts).slice(0, 3).map(([cat, count]) => (
                <div key={cat} className="flex items-center gap-2">
                  <span className="w-24 truncate text-xs font-semibold text-stone-600">{CATEGORIE_MAP[cat]?.label || cat}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-stone-100">
                    <div className="h-full rounded-full bg-[#d97706]" style={{ width: `${(count / maxCount) * 100}%` }} />
                  </div>
                  <span className="text-xs font-bold text-stone-800">{count}</span>
                </div>
              ))}
              {!Object.keys(categoryCounts).length && <p className="text-xs text-stone-400 font-medium">Aucune donnée</p>}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filtres */}
      <div className="flex flex-col flex-wrap gap-3 sm:flex-row">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
          <Input className="pl-9 rounded-xl border-stone-200 font-medium" placeholder="Rechercher par libellé, bénéficiaire ou référence..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={filterEcole} onValueChange={v => { setFilterEcole(v); onEtabSelect(v, ecoles) }} disabled={locked}>
          <SelectTrigger className="w-full sm:w-52 rounded-xl border-stone-200 font-medium"><SelectValue placeholder="Toutes les écoles" /></SelectTrigger>
          <SelectContent className="rounded-xl">
            <SelectItem value="all">Toutes les écoles</SelectItem>
            {ecoles.map(e => <SelectItem key={e.id} value={e.id}>{`${getTypeIcon(e.type || '')} ${e.nom}`}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterCategorie} onValueChange={setFilterCategorie}>
          <SelectTrigger className="w-full sm:w-48 rounded-xl border-stone-200 font-medium"><SelectValue placeholder="Toutes catégories" /></SelectTrigger>
          <SelectContent className="rounded-xl">
            <SelectItem value="all">Toutes catégories</SelectItem>
            {categories.map(c => <SelectItem key={c} value={c}>{CATEGORIE_MAP[c].label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input type="date" className="w-full sm:w-40 rounded-xl border-stone-200 font-medium" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} />
        <Input type="date" className="w-full sm:w-40 rounded-xl border-stone-200 font-medium" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} />
      </div>

      {/* Tableau */}
      <Card className="rounded-2xl border-stone-200/80 shadow-sm overflow-hidden">
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-4 p-8">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full rounded-xl" />)}</div>
          ) : !totalItems ? (
            <div className="p-12 text-center text-stone-400">
              <TrendingDown className="mx-auto mb-3 h-12 w-12 opacity-30" />
              <p className="text-base font-bold text-stone-700">Aucune dépense enregistrée.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-[#1e3a8a] text-white">
                  <TableRow className="hover:bg-[#1e3a8a]">
                    <TableHead className="text-amber-300 font-bold">Date</TableHead>
                    <TableHead className="text-white font-bold">Libellé</TableHead>
                    <TableHead className="text-white font-bold">Catégorie</TableHead>
                    <TableHead className="text-right text-amber-300 font-bold">Montant</TableHead>
                    <TableHead className="text-white font-bold">Bénéficiaire</TableHead>
                    <TableHead className="text-white font-bold">Établissement</TableHead>
                    <TableHead className="text-white font-bold">Statut</TableHead>
                    <TableHead className="text-right text-white font-bold">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedDepenses.map(d => {
                    const cat = CATEGORIE_MAP[d.categorie] || { label: d.categorie, className: 'bg-stone-100 text-stone-800' }
                    const status = STATUS_MAP[d.statut] || { label: d.statut, className: 'bg-stone-100 text-stone-800' }
                    return (
                      <TableRow key={d.id} className="hover:bg-amber-500/5 transition-colors">
                        <TableCell className="font-semibold text-xs text-stone-600">{formatDate(d.dateDepense)}</TableCell>
                        <TableCell className="font-bold text-stone-900 break-words">{d.libelle}{d.referencePiece && <span className="text-xs text-stone-400 font-medium"> ({d.referencePiece})</span>}</TableCell>
                        <TableCell><Badge variant="secondary" className={cat.className}>{cat.label}</Badge></TableCell>
                        <TableCell className="text-right font-extrabold text-rose-600 tabular-nums">{formatMoney(d.montant, d.devise)}</TableCell>
                        <TableCell className="font-medium text-stone-700 break-words">{d.beneficiaire || '—'}</TableCell>
                        <TableCell className="font-medium text-stone-700 break-words">{d.etablissementNom || '—'}</TableCell>
                        <TableCell><Badge variant="secondary" className={status.className}>{status.label}</Badge></TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-amber-700 hover:bg-amber-50" onClick={() => openEdit(d)} title="Modifier"><Edit className="h-4 w-4" /></Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-rose-600 hover:bg-rose-50" onClick={() => handleDelete(d.id)} title="Supprimer"><Trash2 className="h-4 w-4" /></Button>
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
            <div className="flex flex-col items-center justify-between gap-3 border-t border-stone-100 bg-stone-50/50 px-6 py-4 text-xs font-semibold text-stone-600 sm:flex-row">
              <p>{totalItems} dépense{totalItems > 1 ? 's' : ''} — Page <b>{page}</b> sur <b>{totalPages}</b></p>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="rounded-xl border-stone-200"><ChevronLeft className="h-3.5 w-3.5 mr-1" />Précédent</Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="rounded-xl border-stone-200">Suivant<ChevronRight className="h-3.5 w-3.5 ml-1" /></Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialogue création/édition */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto bg-white p-6 sm:p-8 rounded-3xl border border-stone-200 shadow-2xl">
          <DialogHeader className="border-b border-stone-100 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-2xl bg-[#1e3a8a] text-amber-400">
                <TrendingDown className="h-6 w-6" />
              </div>
              <div>
                <DialogTitle className="text-xl font-extrabold text-[#1e3a8a]">
                  {editingId ? 'Modifier la dépense' : 'Nouvelle dépense'}
                </DialogTitle>
                <p className="text-xs text-stone-500 font-medium">Saisissez les détails de la sortie de caisse.</p>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-4 pt-4">
            <div>
              <Label className="text-xs font-semibold text-stone-600">Libellé de la dépense *</Label>
              <Input className="rounded-xl border-stone-200 bg-white font-medium mt-1" placeholder="Ex: Achat fournitures de bureau" value={form.libelle} onChange={e => setForm({ ...form, libelle: e.target.value })} />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label className="text-xs font-semibold text-stone-600">Catégorie *</Label>
                <Select value={form.categorie} onValueChange={categorie => setForm({ ...form, categorie })}>
                  <SelectTrigger className="rounded-xl border-stone-200 bg-white font-medium mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent className="rounded-xl">{categories.map(c => <SelectItem key={c} value={c}>{CATEGORIE_MAP[c].label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs font-semibold text-stone-600">Établissement *</Label>
                <Select value={form.etablissementId} onValueChange={etablissementId => setForm({ ...form, etablissementId })}>
                  <SelectTrigger className="rounded-xl border-stone-200 bg-white font-medium mt-1"><SelectValue placeholder="Sélectionner" /></SelectTrigger>
                  <SelectContent className="rounded-xl">{ecoles.map(e => <SelectItem key={e.id} value={e.id}>{`${getTypeIcon(e.type || '')} ${e.nom}`}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label className="text-xs font-semibold text-stone-600">Montant *</Label>
                <Input className="rounded-xl border-stone-200 bg-white font-bold text-stone-900 mt-1" type="number" min="0" step="1" value={form.montant} onChange={e => setForm({ ...form, montant: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs font-semibold text-stone-600">Devise *</Label>
                <Select value={form.devise} onValueChange={devise => setForm({ ...form, devise })}>
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
                <Label className="text-xs font-semibold text-stone-600">Bénéficiaire</Label>
                <Input className="rounded-xl border-stone-200 bg-white font-medium mt-1" placeholder="Nom de la personne ou fournisseur" value={form.beneficiaire} onChange={e => setForm({ ...form, beneficiaire: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs font-semibold text-stone-600">Date de dépense *</Label>
                <Input className="rounded-xl border-stone-200 bg-white font-medium mt-1" type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label className="text-xs font-semibold text-stone-600">Référence pièce / Facture</Label>
                <Input className="rounded-xl border-stone-200 bg-white font-medium mt-1" placeholder="N° Pièce" value={form.referencePiece} onChange={e => setForm({ ...form, referencePiece: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs font-semibold text-stone-600">Statut *</Label>
                <Select value={form.statut} onValueChange={statut => setForm({ ...form, statut })}>
                  <SelectTrigger className="rounded-xl border-stone-200 bg-white font-medium mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent className="rounded-xl">
                    <SelectItem value="EN_ATTENTE">En attente</SelectItem>
                    <SelectItem value="VALIDÉ">Validée</SelectItem>
                    <SelectItem value="REJETÉ">Rejetée</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex justify-end gap-3 border-t border-stone-100 pt-4">
              <Button variant="outline" className="rounded-xl border-stone-200" onClick={() => setDialogOpen(false)}>Annuler</Button>
              <Button disabled={saving} className="bg-[#1e3a8a] hover:bg-[#172554] text-white font-bold rounded-xl px-6 shadow-md" onClick={handleSave}>
                {saving ? 'Enregistrement...' : editingId ? 'Mettre à jour' : 'Créer la dépense'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}