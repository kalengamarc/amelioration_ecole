'use client'

import { useCallback, useEffect, useState } from 'react'
import { useAppStore, getSchoolFilter, isCoordinateur } from '@/lib/store'
import * as tc from '@/lib/tauri-commands'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { toast } from 'sonner'
import { GraduationCap, Eye, Pencil, Plus, Trash2, Users, Search, User, ShieldCheck, Sparkles, Building2, Phone, MapPin } from 'lucide-react'

type School = { id: string; nom: string }
type Year = { id: string; libelle: string; active?: boolean; etablissementId?: string }
type Classe = { id: string; nom: string; anneeScolaireId?: string }
type Student = {
  id: string; matricule: string; nom: string; prenom: string; sexe: string; statut: string
  dateNaissance?: string; lieuNaissance?: string; etablissementId: string
  etablissement?: { nom: string }
  inscriptions?: any[]; classes?: any[]; tuteurs?: any[]; echeances?: any[]; paiements?: any[]
}

const empty = {
  nom: '', prenom: '', sexe: 'M', dateNaissance: '', lieuNaissance: '',
  etablissementId: '', anneeScolaireId: '', classeId: '',
  tuteurNom: '', tuteurPrenom: '', tuteurTelephone: '', tuteurTelephone2: '',
  tuteurRelation: 'Père', tuteurAdresse: '', tuteurProfession: ''
}

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  ACTIF: { label: 'Actif', className: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  INSCRIT: { label: 'Inscrit', className: 'bg-sky-100 text-sky-800 border-sky-200' },
  SUSPENDU: { label: 'Suspendu', className: 'bg-amber-100 text-amber-800 border-amber-200' },
  TRANSFERE: { label: 'Transféré', className: 'bg-stone-100 text-stone-700 border-stone-200' }
}

export default function ElevesPage() {
  const { user } = useAppStore()
  const role = user?.role ?? ''
  const userEtabId = user?.etablissementId ?? null
  const schoolFilter = getSchoolFilter(role, userEtabId)
  const locked = !!schoolFilter

  const [students, setStudents] = useState<Student[]>([])
  const [schools, setSchools] = useState<School[]>([])
  const [years, setYears] = useState<Year[]>([])
  const [classes, setClasses] = useState<Classe[]>([])

  const [school, setSchool] = useState(locked ? schoolFilter! : '')
  const [year, setYear] = useState('')
  const [classe, setClasse] = useState('')
  const [search, setSearch] = useState('')
  const [filterNoClass, setFilterNoClass] = useState(false)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)

  const [form, setForm] = useState(empty)
  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [detail, setDetail] = useState<Student | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Student | null>(null)
  const [classSearch, setClassSearch] = useState('')
  const [showClassDropdown, setShowClassDropdown] = useState(false)

  const fetchSchools = useCallback(async () => {
    try {
      const res = await tc.listEtablissements(locked ? schoolFilter! : undefined)
      const data = res?.etablissements ?? []
      setSchools(Array.isArray(data) ? data : [])
      if (locked) setSchool(schoolFilter!)
    } catch (e) { console.error(e) }
  }, [locked, schoolFilter])

  const fetchYears = useCallback(async () => {
    const etabId = locked ? schoolFilter! : school || (schools?.[0]?.id) || undefined
    try {
      const res = await tc.listAnneesScolaires(etabId)
      const data = res?.annees_scolaires ?? res?.data ?? []
      setYears(Array.isArray(data) ? data : [])
    } catch (e) { setYears([]) }
  }, [school, schools, locked, schoolFilter])

  const fetchClasses = useCallback(async () => {
    const etabId = locked ? schoolFilter! : school || (schools?.[0]?.id) || undefined
    try {
      const res = await tc.listClasses(etabId, year || undefined)
      const data = res?.classes ?? res?.data ?? []
      setClasses(Array.isArray(data) ? data : [])
    } catch (e) { setClasses([]) }
  }, [school, schools, year, locked, schoolFilter])

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
        statut: undefined,
        search: search || undefined,
        page,
        pageSize: 15,
      })
      let students = res?.data ?? []
      // Filtrer les élèves sans classe active si demandé
      if (filterNoClass) {
        students = students.filter(s => {
          const inscriptions = s.inscriptions || s.classes || []
          // Vérifier s'il y a une inscription avec statut ACTIF et une classe valide
          const hasActiveClass = inscriptions.some((x: any) => {
            const isActive = x.statut === 'ACTIF'
            const hasClasseId = x.classe_id && x.classe_id.length > 0
            const hasClasseObject = x.classe && x.classe.id && x.classe.id.length > 0
            return isActive && (hasClasseId || hasClasseObject)
          })
          return !hasActiveClass
        })
      }
      setStudents(students)
      setTotal(filterNoClass ? students.length : (res?.pagination?.total ?? 0))
      setTotalPages(filterNoClass ? Math.ceil(students.length / 15) : (res?.pagination?.totalPages ?? 1))
    } catch (e: any) { toast.error(e?.message || 'Erreur chargement') }
    finally { setLoading(false) }
  }, [user, role, userEtabId, school, year, classe, search, page, filterNoClass])

  useEffect(() => { if (user) fetchSchools() }, [user, fetchSchools])
  useEffect(() => { fetchYears() }, [fetchYears])
  useEffect(() => { fetchClasses() }, [fetchClasses])
  useEffect(() => { fetchStudents() }, [fetchStudents])

  useEffect(() => {
    const handleSync = () => {
      fetchStudents()
      fetchClasses()
    }
    window.addEventListener('sync-completed', handleSync)
    return () => window.removeEventListener('sync-completed', handleSync)
  }, [fetchStudents, fetchClasses])

  function openCreate() {
    setEditingId(null)
    setForm({ ...empty, etablissementId: school || (locked ? schoolFilter! : ''), anneeScolaireId: year })
    setClassSearch('')
    setShowClassDropdown(false)
    setFormOpen(true)
  }

  async function openEdit(s: Student) {
    const etabId = s.etablissementId ?? (s as any).etablissement_id ?? school ?? (schools?.[0]?.id) ?? ''
    let listC: Classe[] = []
    if (etabId) {
      try {
        const resY = await tc.listAnneesScolaires(etabId)
        const listY = resY?.annees_scolaires ?? resY?.data ?? []
        if (Array.isArray(listY) && listY.length > 0) setYears(listY)

        const resC = await tc.listClasses(etabId, undefined)
        listC = resC?.classes ?? resC?.data ?? []
        if (Array.isArray(listC) && listC.length > 0) setClasses(listC)
      } catch { /* silencieux */ }
    }

    const ins = (s.inscriptions || s.classes || []).find((x: any) => x.statut === 'ACTIF') ?? (s.inscriptions || s.classes || [])[0]
    const t = s.tuteurs?.find((x: any) => x.tuteur?.isPrincipal)?.tuteur ?? s.tuteurs?.[0]?.tuteur
    const classeId = ins?.classeId ?? ins?.classe_id ?? ins?.classe?.id ?? ''
    setEditingId(s.id)
    setForm({
      ...empty,
      nom: s.nom, prenom: s.prenom, sexe: s.sexe,
      dateNaissance: s.dateNaissance ?? (s as any).date_naissance ?? '',
      lieuNaissance: s.lieuNaissance ?? (s as any).lieu_naissance ?? '',
      etablissementId: etabId,
      anneeScolaireId: ins?.classe?.anneeScolaire?.id ?? ins?.classe?.annee_scolaire?.id ?? ins?.anneeScolaireId ?? ins?.annee_scolaire_id ?? (s as any).anneeScolaireId ?? (s as any).annee_scolaire_id ?? '',
      classeId: classeId,
      tuteurNom: t?.nom ?? '', tuteurPrenom: t?.prenom ?? '',
      tuteurTelephone: t?.telephone ?? '', tuteurTelephone2: t?.telephone2 ?? '',
      tuteurRelation: t?.relation ?? 'Père', tuteurAdresse: t?.adresse ?? '', tuteurProfession: t?.profession ?? '',
    })
    const classeObj = listC.find(c => c.id === classeId)
    setClassSearch(classeObj?.nom ?? '')
    setShowClassDropdown(false)
    setFormOpen(true)
  }

  async function handleSave() {
    if (!form.nom.trim() || !form.prenom.trim() || !form.etablissementId || !form.anneeScolaireId || !form.classeId) {
      toast.error('Veuillez remplir tous les champs obligatoires (*)')
      return
    }
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
        telephone: form.tuteurTelephone.trim() || 'Non renseigné', telephone2: form.tuteurTelephone2?.trim() || undefined,
        relation: form.tuteurRelation, adresse: form.tuteurAdresse || undefined,
        profession: form.tuteurProfession || undefined, isPrincipal: true,
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
      console.error('Erreur save:', e)
      const msg = typeof e === 'string' ? e : e?.message || e?.error || JSON.stringify(e)
      toast.error(msg || 'Erreur inconnue')
    } finally { setBusy(false) }
  }

  async function handleDelete() {
    if (!isCoordinateur(role)) {
      toast.error("Seul l'Administrateur / Coordonnateur peut archiver un élève.")
      return
    }
    if (!deleteTarget) return
    setBusy(true)
    try { await tc.deleteEleve(deleteTarget.id); toast.success('Élève archivé avec succès'); setDeleteTarget(null); fetchStudents() }
    catch (e: any) { toast.error(typeof e === 'string' ? e : e?.message || 'Erreur') }
    finally { setBusy(false) }
  }

  async function showDetail(s: Student) {
    try { const res = await tc.getEleve(s.id); setDetail(res?.data ?? res) }
    catch { setDetail(s) }
  }

  return (
    <main className="space-y-6 p-2 sm:p-4 md:p-6">
      {/* ── BANNIÈRE HEADER ── */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-stone-200/80 shadow-sm">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 text-amber-700 text-xs font-bold border border-amber-500/20 mb-2">
            <GraduationCap className="h-3.5 w-3.5" /> Gestion des Élèves
          </div>
          <h1 className="text-2xl font-extrabold text-stone-900 tracking-tight">Répertoire des Élèves</h1>
          <p className="text-xs sm:text-sm text-stone-500 mt-1">Inscriptions, scolarité, tuteurs et situation financière.</p>
        </div>
        <Button onClick={openCreate} className="bg-[#1e3a8a] hover:bg-[#172554] text-white font-bold px-5 py-2.5 rounded-xl shadow-md gap-2">
          <Plus className="h-4 w-4 text-amber-400" /> Nouvel élève
        </Button>
      </header>

      {/* ── BARRE DE RECHERCHE ET FILTRES ── */}
      <Card className="rounded-2xl border-stone-200/80 shadow-sm">
        <CardContent className="grid gap-3 p-4 md:grid-cols-5">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400" />
            <Input className="pl-9 rounded-xl border-stone-200 font-medium" placeholder="Rechercher nom, prénom, matricule..." value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} />
          </div>
          <Select value={school || 'all'} onValueChange={v => { setSchool(v === 'all' ? '' : v); setYear(''); setClasse('') }} disabled={locked}>
            <SelectTrigger className="rounded-xl border-stone-200 font-medium"><SelectValue placeholder="Établissement" /></SelectTrigger>
            <SelectContent className="rounded-xl"><SelectItem value="all">Tous les établissements</SelectItem>{schools.map(s => <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={year || 'all'} onValueChange={v => { setYear(v === 'all' ? '' : v); setClasse('') }}>
            <SelectTrigger className="rounded-xl border-stone-200 font-medium"><SelectValue placeholder="Année scolaire" /></SelectTrigger>
            <SelectContent className="rounded-xl"><SelectItem value="all">Toutes les années</SelectItem>{years.map(y => <SelectItem key={y.id} value={y.id}>{y.libelle}{y.active ? ' ★' : ''}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={classe || 'all'} onValueChange={v => setClasse(v === 'all' ? '' : v)} disabled={!school}>
            <SelectTrigger className="rounded-xl border-stone-200 font-medium"><SelectValue placeholder="Classe" /></SelectTrigger>
            <SelectContent className="rounded-xl"><SelectItem value="all">Toutes les classes</SelectItem>{classes.map(c => <SelectItem key={c.id} value={c.id}>{c.nom}</SelectItem>)}</SelectContent>
          </Select>
          <Button
            variant={filterNoClass ? "default" : "outline"}
            onClick={() => { setFilterNoClass(!filterNoClass); setPage(1) }}
            className={filterNoClass ? "bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold" : "rounded-xl border-stone-200 font-medium"}
          >
            {filterNoClass ? "✓ Sans classe" : "Sans classe"}
          </Button>
        </CardContent>
      </Card>

      {/* ── TABLEAU DES ÉLÈVES ── */}
      <Card className="rounded-2xl border-stone-200/80 shadow-sm overflow-hidden">
        <CardHeader className="bg-stone-50/50 border-b border-stone-100 px-6 py-4">
          <CardTitle className="flex items-center gap-2 text-base font-bold text-stone-900">
            <Users className="h-5 w-5 text-amber-600" /> Total : {total} élève(s) inscrit(s)
            {filterNoClass && <Badge className="bg-rose-600 text-white ml-2">Sans classe active</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-[#1e3a8a] text-white">
              <TableRow className="hover:bg-[#1e3a8a]">
                <TableHead className="text-amber-300 font-bold">Matricule</TableHead>
                <TableHead className="text-white font-bold">Élève</TableHead>
                <TableHead className="text-white font-bold">Classe</TableHead>
                <TableHead className="text-white font-bold">Année Scolaire</TableHead>
                <TableHead className="text-white font-bold">Statut</TableHead>
                <TableHead className="text-right text-white font-bold">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={6} className="p-12 text-center text-stone-400 font-medium">Chargement du répertoire...</TableCell></TableRow>
              ) : students.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="p-12 text-center text-stone-400 font-medium">Aucun élève trouvé.</TableCell></TableRow>
              ) : (
                students.map(s => {
                  const i = (s.inscriptions || s.classes || []).find((x: any) => x.statut === 'ACTIF') ?? (s.inscriptions || s.classes || [])[0]
                  const st = STATUS_LABEL[s.statut] ?? { label: s.statut, className: 'bg-stone-100 text-stone-700' }
                  return (
                    <TableRow key={s.id} className="hover:bg-amber-500/5 transition-colors cursor-pointer" onClick={() => showDetail(s)}>
                      <TableCell className="font-mono text-xs font-bold text-stone-700">{s.matricule}</TableCell>
                      <TableCell>
                        <span className="font-bold text-stone-900">{s.nom} {s.prenom}</span>
                        <br />
                        <span className="text-[11px] font-semibold text-stone-400">{s.sexe === 'F' ? 'Féminin' : 'Masculin'}</span>
                      </TableCell>
                      <TableCell className="font-semibold text-stone-800">{i?.classe?.nom ?? '—'}</TableCell>
                      <TableCell className="text-xs text-stone-600 font-medium">{i?.classe?.anneeScolaire?.libelle ?? i?.classe?.annee_scolaire?.libelle ?? '—'}</TableCell>
                      <TableCell><Badge variant="outline" className={`font-semibold ${st.className}`}>{st.label}</Badge></TableCell>
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-end gap-1">
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-stone-600 hover:text-[#1e3a8a] hover:bg-stone-100" onClick={(e) => { e.stopPropagation(); showDetail(s) }}><Eye className="h-4 w-4" /></Button>
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-amber-700 hover:bg-amber-50" onClick={(e) => { e.stopPropagation(); openEdit(s) }}><Pencil className="h-4 w-4" /></Button>
                          {isCoordinateur(role) && (
                            <Button size="icon" variant="ghost" className="h-8 w-8 text-rose-600 hover:bg-rose-50" onClick={(e) => { e.stopPropagation(); setDeleteTarget(s) }}><Trash2 className="h-4 w-4" /></Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>

          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-stone-100 px-6 py-4 text-sm font-medium text-stone-600">
              <span>Page {page} sur {totalPages}</span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="rounded-xl border-stone-200" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Précédent</Button>
                <Button size="sm" variant="outline" className="rounded-xl border-stone-200" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Suivant</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── DIALOG INSCRIPTION / MODIFICATION D'ÉLÈVE ── */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="!w-[calc(100vw-2rem)] !max-w-5xl max-h-[92vh] overflow-y-auto bg-white p-6 sm:p-8 rounded-3xl border border-stone-200 shadow-2xl">
          <DialogHeader className="border-b border-stone-100 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-2xl bg-[#1e3a8a] text-amber-400">
                <GraduationCap className="h-6 w-6" />
              </div>
              <div>
                <DialogTitle className="text-xl font-extrabold text-[#1e3a8a]">
                  {editingId ? 'Modifier la fiche élève' : 'Inscrire un nouvel élève'}
                </DialogTitle>
                <p className="text-xs text-stone-500 font-medium">Saisissez les informations de scolarité et du tuteur légal.</p>
              </div>
            </div>
          </DialogHeader>

          <div className="grid gap-6 md:grid-cols-2 pt-4">
            {/* Informations personnelles */}
            <section className="space-y-4 rounded-2xl border border-stone-200/80 bg-stone-50/50 p-5">
              <h3 className="font-bold text-stone-800 text-sm flex items-center gap-2">
                <User className="h-4 w-4 text-amber-600" /> Informations Personnelles
              </h3>
              <div className="space-y-3">
                <div>
                  <Label className="text-xs font-semibold text-stone-600">Nom *</Label>
                  <Input className="rounded-xl border-stone-200 bg-white font-medium mt-1" placeholder="Nom de famille" value={form.nom} onChange={e => setForm({ ...form, nom: e.target.value })} />
                </div>
                <div>
                  <Label className="text-xs font-semibold text-stone-600">Prénom *</Label>
                  <Input className="rounded-xl border-stone-200 bg-white font-medium mt-1" placeholder="Prénom de l'élève" value={form.prenom} onChange={e => setForm({ ...form, prenom: e.target.value })} />
                </div>
                <div>
                  <Label className="text-xs font-semibold text-stone-600">Sexe *</Label>
                  <Select value={form.sexe} onValueChange={v => setForm({ ...form, sexe: v })}>
                    <SelectTrigger className="rounded-xl border-stone-200 bg-white font-medium mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent className="rounded-xl"><SelectItem value="M">Masculin</SelectItem><SelectItem value="F">Féminin</SelectItem></SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs font-semibold text-stone-600">Date de naissance</Label>
                  <Input type="date" className="rounded-xl border-stone-200 bg-white font-medium mt-1" value={form.dateNaissance} onChange={e => setForm({ ...form, dateNaissance: e.target.value })} />
                </div>
                <div>
                  <Label className="text-xs font-semibold text-stone-600">Lieu de naissance</Label>
                  <Input className="rounded-xl border-stone-200 bg-white font-medium mt-1" placeholder="Ville ou commune" value={form.lieuNaissance} onChange={e => setForm({ ...form, lieuNaissance: e.target.value })} />
                </div>
              </div>
            </section>

            {/* Scolarité */}
            <section className="space-y-4 rounded-2xl border border-stone-200/80 bg-stone-50/50 p-5">
              <h3 className="font-bold text-stone-800 text-sm flex items-center gap-2">
                <Building2 className="h-4 w-4 text-[#1e3a8a]" /> Affectation Scolaire
              </h3>
              <div className="space-y-3">
                <div>
                  <Label className="text-xs font-semibold text-stone-600">Établissement *</Label>
                  <Select value={form.etablissementId} onValueChange={v => { setForm({ ...form, etablissementId: v, anneeScolaireId: '', classeId: '' }); setSchool(v) }} disabled={!!locked}>
                    <SelectTrigger className="rounded-xl border-stone-200 bg-white font-medium mt-1"><SelectValue placeholder="Sélectionner l'école" /></SelectTrigger>
                    <SelectContent className="rounded-xl">{schools.map(s => <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs font-semibold text-stone-600">Année Scolaire *</Label>
                  <Select value={form.anneeScolaireId} onValueChange={v => setForm({ ...form, anneeScolaireId: v, classeId: '' })}>
                    <SelectTrigger className="rounded-xl border-stone-200 bg-white font-medium mt-1"><SelectValue placeholder="Sélectionner l'année" /></SelectTrigger>
                    <SelectContent className="rounded-xl">{years.map(y => <SelectItem key={y.id} value={y.id}>{y.libelle}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="relative">
                  <Label className="text-xs font-semibold text-stone-600">Classe *</Label>
                  <Input 
                    className="rounded-xl border-stone-200 bg-white font-medium mt-1" 
                    placeholder="Rechercher une classe..." 
                    value={classSearch}
                    onChange={e => { setClassSearch(e.target.value); setShowClassDropdown(true) }}
                    onFocus={() => setShowClassDropdown(true)}
                    onBlur={() => setTimeout(() => setShowClassDropdown(false), 200)}
                  />
                  {showClassDropdown && (
                    <div className="absolute z-50 w-full mt-1 bg-white border border-stone-200 rounded-xl shadow-lg max-h-60 overflow-y-auto">
                      {classes
                        .filter(c => c.nom.toLowerCase().includes(classSearch.toLowerCase()))
                        .map(c => (
                          <div 
                            key={c.id}
                            className="px-3 py-2 hover:bg-stone-100 cursor-pointer text-sm"
                            onClick={() => { setForm({ ...form, classeId: c.id }); setClassSearch(c.nom); setShowClassDropdown(false) }}
                          >
                            {c.nom}
                          </div>
                        ))
                      }
                      {classes.filter(c => c.nom.toLowerCase().includes(classSearch.toLowerCase())).length === 0 && (
                        <div className="px-3 py-2 text-stone-500 text-sm">Aucune classe trouvée</div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </section>

            {/* Tuteur principal */}
            <section className="space-y-4 rounded-2xl border border-stone-200/80 bg-stone-50/50 p-5 md:col-span-2">
              <h3 className="font-bold text-stone-800 text-sm flex items-center gap-2">
                <Phone className="h-4 w-4 text-amber-600" /> Tuteur Principal / Responsable Légal
              </h3>
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <Label className="text-xs font-semibold text-stone-600">Nom du tuteur</Label>
                  <Input className="rounded-xl border-stone-200 bg-white font-medium mt-1" placeholder="Nom de famille" value={form.tuteurNom} onChange={e => setForm({ ...form, tuteurNom: e.target.value })} />
                </div>
                <div>
                  <Label className="text-xs font-semibold text-stone-600">Prénom du tuteur</Label>
                  <Input className="rounded-xl border-stone-200 bg-white font-medium mt-1" placeholder="Prénom" value={form.tuteurPrenom} onChange={e => setForm({ ...form, tuteurPrenom: e.target.value })} />
                </div>
                <div>
                  <Label className="text-xs font-semibold text-stone-600">Téléphone *</Label>
                  <Input className="rounded-xl border-stone-200 bg-white font-medium mt-1" placeholder="+243..." value={form.tuteurTelephone} onChange={e => setForm({ ...form, tuteurTelephone: e.target.value })} />
                </div>
                <div>
                  <Label className="text-xs font-semibold text-stone-600">Téléphone secondaire</Label>
                  <Input className="rounded-xl border-stone-200 bg-white font-medium mt-1" placeholder="Optionnel" value={form.tuteurTelephone2} onChange={e => setForm({ ...form, tuteurTelephone2: e.target.value })} />
                </div>
                <div>
                  <Label className="text-xs font-semibold text-stone-600">Lien de parenté</Label>
                  <Input className="rounded-xl border-stone-200 bg-white font-medium mt-1" placeholder="Père, Mère, Tuteur..." value={form.tuteurRelation} onChange={e => setForm({ ...form, tuteurRelation: e.target.value })} />
                </div>
                <div>
                  <Label className="text-xs font-semibold text-stone-600">Profession</Label>
                  <Input className="rounded-xl border-stone-200 bg-white font-medium mt-1" placeholder="Profession" value={form.tuteurProfession} onChange={e => setForm({ ...form, tuteurProfession: e.target.value })} />
                </div>
                <div className="md:col-span-2">
                  <Label className="text-xs font-semibold text-stone-600">Adresse de résidence</Label>
                  <Input className="rounded-xl border-stone-200 bg-white font-medium mt-1" placeholder="N°, Avenue, Quartier..." value={form.tuteurAdresse} onChange={e => setForm({ ...form, tuteurAdresse: e.target.value })} />
                </div>
              </div>
            </section>
          </div>

          <div className="flex justify-end gap-3 border-t border-stone-100 pt-4">
            <Button variant="outline" className="rounded-xl border-stone-200" onClick={() => setFormOpen(false)}>Annuler</Button>
            <Button disabled={busy} onClick={handleSave} className="bg-[#1e3a8a] hover:bg-[#172554] text-white font-bold rounded-xl px-6 shadow-md">
              {busy ? 'Enregistrement...' : editingId ? 'Mettre à jour' : 'Inscrire l’élève'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── DIALOG FICHE DÉTAILLÉE D'ÉLÈVE ── */}
      <Dialog open={!!detail} onOpenChange={open => !open && setDetail(null)}>
        <DialogContent className="!w-[calc(100vw-2rem)] !max-w-6xl max-h-[92vh] overflow-y-auto bg-white p-6 sm:p-8 rounded-3xl border border-stone-200 shadow-2xl">
          <DialogHeader className="border-b border-stone-100 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-2xl bg-gradient-to-br from-amber-500 to-amber-600 text-white font-bold text-lg">
                {detail ? detail.prenom[0] + detail.nom[0] : 'EL'}
              </div>
              <div>
                <DialogTitle className="text-2xl font-extrabold text-[#1e3a8a]">{detail?.nom} {detail?.prenom}</DialogTitle>
                <p className="text-xs font-mono font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200/50 w-fit mt-1">
                  Matricule : {detail?.matricule}
                </p>
              </div>
            </div>
          </DialogHeader>

          {detail && (
            <div className="grid gap-5 md:grid-cols-2 pt-2">
              <Card className="rounded-2xl border-stone-200 shadow-sm"><CardHeader><CardTitle className="text-sm font-bold text-[#1e3a8a]">Informations Personnelles</CardTitle></CardHeader><CardContent className="space-y-2 text-xs sm:text-sm font-medium"><p><b>Sexe :</b> {detail.sexe === 'F' ? 'Féminin' : 'Masculin'}</p><p><b>Date de naissance :</b> {detail.dateNaissance ? new Date(detail.dateNaissance).toLocaleDateString('fr-FR') : '—'}</p><p><b>Lieu :</b> {detail.lieuNaissance || '—'}</p><p><b>Établissement :</b> {detail.etablissement?.nom || '—'}</p></CardContent></Card>
              <Card className="rounded-2xl border-stone-200 shadow-sm"><CardHeader><CardTitle className="text-sm font-bold text-[#1e3a8a]">Scolarité Actuelle</CardTitle></CardHeader><CardContent className="space-y-2">{(detail.inscriptions || detail.classes || []).map((i: any, n: number) => (<div key={n} className="rounded-xl border border-stone-200 p-3 bg-stone-50/50"><b>{i.classe?.nom || '—'}</b><p className="text-xs text-stone-500 mt-0.5">{i.classe?.anneeScolaire?.libelle || i.classe?.annee_scolaire?.libelle || '—'} · <Badge variant="outline" className="text-[10px] ml-1">{i.statut}</Badge></p></div>))}</CardContent></Card>
              <Card className="rounded-2xl border-stone-200 shadow-sm"><CardHeader><CardTitle className="text-sm font-bold text-[#1e3a8a]">Tuteur Légal</CardTitle></CardHeader><CardContent className="space-y-2">{detail.tuteurs?.length ? detail.tuteurs.map((x: any, n: number) => (<div key={n} className="rounded-xl border border-stone-200 p-3 bg-stone-50/50"><b>{x.tuteur?.nom} {x.tuteur?.prenom}</b><p className="text-xs font-semibold text-amber-700 mt-1">{x.tuteur?.relation || '—'} · {x.tuteur?.telephone || '—'}</p><p className="text-xs text-stone-500">{x.tuteur?.adresse || '—'}</p></div>)) : <p className="text-xs text-stone-400 font-medium">Aucun tuteur renseigné.</p>}</CardContent></Card>
              <Card className="rounded-2xl border-stone-200 shadow-sm"><CardHeader><CardTitle className="text-sm font-bold text-[#1e3a8a]">Situation Financière</CardTitle></CardHeader><CardContent>{detail.echeances?.length ? (<Table><TableHeader><TableRow><TableHead>Frais</TableHead><TableHead>Dû</TableHead><TableHead>Payé</TableHead><TableHead>Statut</TableHead></TableRow></TableHeader><TableBody>{detail.echeances.map((e: any) => (<TableRow key={e.id}><TableCell className="font-semibold text-xs">{e.fraisScolaire?.libelle || e.frais_scolaire?.libelle || '—'}</TableCell><TableCell className="text-xs font-bold">{Number(e.montantDu || e.montant_du || 0).toLocaleString('fr-CD')} {e.fraisScolaire?.devise || e.frais_scolaire?.devise || 'CDF'}</TableCell><TableCell className="text-xs text-emerald-700 font-bold">{Number(e.montantPaye || e.montant_paye || 0).toLocaleString('fr-CD')} {e.fraisScolaire?.devise || e.frais_scolaire?.devise || 'CDF'}</TableCell><TableCell><Badge variant="outline" className="text-[10px]">{e.statut}</Badge></TableCell></TableRow>))}</TableBody></Table>) : <p className="text-xs text-stone-400 font-medium">Aucune échéance enregistrée.</p>}</CardContent></Card>
              <Card className="md:col-span-2 rounded-2xl border-stone-200 shadow-sm"><CardHeader><CardTitle className="text-sm font-bold text-[#1e3a8a]">Historique des Paiements</CardTitle></CardHeader><CardContent>{detail.paiements?.length ? (<div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>N° Reçu</TableHead><TableHead>Motif</TableHead><TableHead>Montant</TableHead><TableHead>Mode</TableHead><TableHead>Date</TableHead><TableHead>État</TableHead></TableRow></TableHeader><TableBody>{detail.paiements.map((p: any) => (<TableRow key={p.id} className={p.annule ? 'opacity-50 line-through bg-rose-50/50' : ''}><TableCell className="font-mono text-xs font-bold">{p.numeroRecu || p.numero_recu || '—'}</TableCell><TableCell className="text-xs font-medium">{p.motif || '—'}</TableCell><TableCell className="text-xs font-bold text-emerald-700">{Number(p.montant || 0).toLocaleString('fr-CD')} {p.devise || 'CDF'}</TableCell><TableCell className="text-xs">{p.modePaiement === 'ESPECES' ? 'Espèces' : p.modePaiement === 'CHEQUE' ? 'Chèque' : p.modePaiement === 'VIREMENT' ? 'Virement' : p.modePaiement || '—'}</TableCell><TableCell className="text-xs">{p.createdAt || p.created_at ? new Date(p.createdAt || p.created_at).toLocaleDateString('fr-FR') : '—'}</TableCell><TableCell>{p.annule ? <Badge variant="destructive" className="text-[10px]">Annulé</Badge> : <Badge className="bg-emerald-600 text-[10px]">Validé</Badge>}</TableCell></TableRow>))}</TableBody></Table></div>) : <p className="text-xs text-stone-400 font-medium">Aucun paiement enregistré.</p>}</CardContent></Card>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── DIALOG CONFIRMATION SUPPRESSION / ARCHIVAGE ── */}
      <Dialog open={!!deleteTarget} onOpenChange={open => !open && setDeleteTarget(null)}>
        <DialogContent className="rounded-3xl border border-stone-200 p-6 shadow-2xl max-w-md">
          <DialogHeader><DialogTitle className="text-lg font-bold text-[#1e3a8a]">Archiver la fiche élève ?</DialogTitle></DialogHeader>
          <p className="text-sm text-stone-600 font-medium mt-1">Voulez-vous archiver la fiche de <b className="text-stone-900">{deleteTarget?.nom} {deleteTarget?.prenom}</b> ? L'historique financier et les reçus seront conservés.</p>
          <div className="flex justify-end gap-2 pt-4"><Button variant="outline" className="rounded-xl border-stone-200" onClick={() => setDeleteTarget(null)}>Annuler</Button><Button variant="destructive" className="rounded-xl font-bold" disabled={busy} onClick={handleDelete}>{busy ? 'Traitement...' : 'Archiver'}</Button></div>
        </DialogContent>
      </Dialog>
    </main>
  )
}