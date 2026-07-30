'use client'

import { useCallback, useEffect, useState } from 'react'
import { useAppStore, getSchoolFilter } from '@/lib/store'
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
import { GraduationCap, Eye, Pencil, Plus, Trash2, Users } from 'lucide-react'

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

const STATUS_LABEL: Record<string, string> = {
  ACTIF: 'Actif', INSCRIT: 'Inscrit', SUSPENDU: 'Suspendu', TRANSFERE: 'Transféré'
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

  const fetchSchools = useCallback(async () => {
    try {
      const res = await tc.listEtablissements(locked ? schoolFilter! : undefined)
      const data = res?.etablissements ?? []
      setSchools(Array.isArray(data) ? data : [])
      if (locked) setSchool(schoolFilter!)
    } catch (e) { console.error(e) }
  }, [locked, schoolFilter])

  const fetchYears = useCallback(async () => {
    const etabId = locked ? schoolFilter! : school || undefined
    if (!etabId) { setYears([]); return }
    try {
      const res = await tc.listAnneesScolaires(etabId)
      const data = res?.annees_scolaires ?? []
      setYears(Array.isArray(data) ? data : [])
    } catch (e) { setYears([]) }
  }, [school, locked, schoolFilter])

  const fetchClasses = useCallback(async () => {
    const etabId = locked ? schoolFilter! : school || undefined
    if (!etabId) { setClasses([]); return }
    try {
      const res = await tc.listClasses(etabId, year || undefined)
      const data = res?.classes ?? []
      setClasses(Array.isArray(data) ? data : [])
    } catch (e) { setClasses([]) }
  }, [school, year, locked, schoolFilter])

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
      setStudents(res?.data ?? [])
      setTotal(res?.pagination?.total ?? 0)
      setTotalPages(res?.pagination?.totalPages ?? 1)
    } catch (e: any) { toast.error(e?.message || 'Erreur chargement') }
    finally { setLoading(false) }
  }, [user, role, userEtabId, school, year, classe, search, page])

  useEffect(() => { if (user) fetchSchools() }, [user, fetchSchools])
  useEffect(() => { fetchYears() }, [fetchYears])
  useEffect(() => { fetchClasses() }, [fetchClasses])
  useEffect(() => { fetchStudents() }, [fetchStudents])

  function openCreate() {
    setEditingId(null)
    setForm({ ...empty, etablissementId: school || (locked ? schoolFilter! : ''), anneeScolaireId: year })
    setFormOpen(true)
  }

  function openEdit(s: Student) {
    const ins = (s.inscriptions || s.classes || []).find((x: any) => x.statut === 'ACTIF') ?? (s.inscriptions || s.classes || [])[0]
    const t = s.tuteurs?.find((x: any) => x.tuteur?.isPrincipal)?.tuteur ?? s.tuteurs?.[0]?.tuteur
    setEditingId(s.id)
    setForm({
      ...empty,
      nom: s.nom, prenom: s.prenom, sexe: s.sexe,
      dateNaissance: s.dateNaissance ?? '',
      lieuNaissance: s.lieuNaissance ?? '',
      etablissementId: s.etablissementId,
      anneeScolaireId: ins?.classe?.anneeScolaire?.id ?? ins?.classe?.annee_scolaire?.id ?? '',
      classeId: ins?.classeId ?? '',
      tuteurNom: t?.nom ?? '', tuteurPrenom: t?.prenom ?? '',
      tuteurTelephone: t?.telephone ?? '', tuteurTelephone2: t?.telephone2 ?? '',
      tuteurRelation: t?.relation ?? 'Père', tuteurAdresse: t?.adresse ?? '', tuteurProfession: t?.profession ?? '',
    })
    setFormOpen(true)
  }

  async function handleSave() {
    if (!form.nom.trim() || !form.prenom.trim() || !form.etablissementId || !form.anneeScolaireId || !form.classeId) {
      toast.error('Champs obligatoires manquants')
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
      tuteurs: form.tuteurNom && form.tuteurPrenom && form.tuteurTelephone ? [{
        nom: form.tuteurNom, prenom: form.tuteurPrenom,
        telephone: form.tuteurTelephone, telephone2: form.tuteurTelephone2 || undefined,
        relation: form.tuteurRelation, adresse: form.tuteurAdresse || undefined,
        profession: form.tuteurProfession || undefined, isPrincipal: true,
      }] : [],
    }
    try {
      if (editingId) {
        await tc.updateEleve(editingId, payload)
        toast.success('Élève modifié')
      } else {
        await tc.createEleve(payload)
        toast.success('Élève inscrit')
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
    if (!deleteTarget) return
    setBusy(true)
    try { await tc.deleteEleve(deleteTarget.id); toast.success('Élève archivé'); setDeleteTarget(null); fetchStudents() }
    catch (e: any) { toast.error(typeof e === 'string' ? e : e?.message || 'Erreur') }
    finally { setBusy(false) }
  }

  async function showDetail(s: Student) {
    try { const res = await tc.getEleve(s.id); setDetail(res?.data ?? res) }
    catch { setDetail(s) }
  }

  return (
    <main className="space-y-6 p-4 md:p-6">
      <header className="flex items-center justify-between">
        <div><h1 className="flex items-center gap-2 text-2xl font-bold"><GraduationCap /> Gestion des élèves</h1>
        <p className="text-sm text-muted-foreground">Informations personnelles, scolarité et situation financière.</p></div>
        <Button onClick={openCreate} className="bg-[var(--etab-color,#075e54)] text-white"><Plus className="mr-2 h-4 w-4" />Nouvel élève</Button>
      </header>

      <Card>
        <CardContent className="grid gap-3 p-4 md:grid-cols-4">
          <Input placeholder="Nom, prénom ou matricule" value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} />
          <Select value={school || 'all'} onValueChange={v => { setSchool(v === 'all' ? '' : v); setYear(''); setClasse('') }} disabled={locked}>
            <SelectTrigger><SelectValue placeholder="Établissement" /></SelectTrigger>
            <SelectContent><SelectItem value="all">Tous les établissements</SelectItem>{schools.map(s => <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={year || 'all'} onValueChange={v => { setYear(v === 'all' ? '' : v); setClasse('') }}>
            <SelectTrigger><SelectValue placeholder="Année scolaire" /></SelectTrigger>
            <SelectContent><SelectItem value="all">Toutes les années</SelectItem>{years.map(y => <SelectItem key={y.id} value={y.id}>{y.libelle}{y.active ? ' ★' : ''}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={classe || 'all'} onValueChange={v => setClasse(v === 'all' ? '' : v)} disabled={!school}>
            <SelectTrigger><SelectValue placeholder="Classe" /></SelectTrigger>
            <SelectContent><SelectItem value="all">Toutes les classes</SelectItem>{classes.map(c => <SelectItem key={c.id} value={c.id}>{c.nom}</SelectItem>)}</SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" />{total} élève(s)</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-[var(--etab-color,#075e54)] text-white"><TableRow><TableHead>Matricule</TableHead><TableHead>Élève</TableHead><TableHead>Classe</TableHead><TableHead>Année scolaire</TableHead><TableHead>Statut</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
            <TableBody>
              {loading ? <TableRow><TableCell colSpan={6} className="p-10 text-center">Chargement...</TableCell></TableRow> :
               students.length === 0 ? <TableRow><TableCell colSpan={6} className="p-10 text-center text-muted-foreground">Aucun élève trouvé.</TableCell></TableRow> :
               students.map(s => {
                 const i = (s.inscriptions || s.classes || []).find((x: any) => x.statut === 'ACTIF') ?? (s.inscriptions || s.classes || [])[0]
                 return (
                   <TableRow key={s.id}>
                     <TableCell className="font-mono text-xs">{s.matricule}</TableCell>
                     <TableCell><b>{s.nom} {s.prenom}</b><br /><span className="text-xs text-muted-foreground">{s.sexe === 'F' ? 'Féminin' : 'Masculin'}</span></TableCell>
                     <TableCell>{i?.classe?.nom ?? '—'}</TableCell>
                     <TableCell>{i?.classe?.anneeScolaire?.libelle ?? i?.classe?.annee_scolaire?.libelle ?? '—'}</TableCell>
                     <TableCell><Badge variant="outline">{STATUS_LABEL[s.statut] ?? s.statut}</Badge></TableCell>
                     <TableCell className="text-right">
                       <Button size="icon" variant="ghost" onClick={() => showDetail(s)}><Eye className="h-4 w-4" /></Button>
                       <Button size="icon" variant="ghost" onClick={() => openEdit(s)}><Pencil className="h-4 w-4" /></Button>
                       <Button size="icon" variant="ghost" className="text-red-600" onClick={() => setDeleteTarget(s)}><Trash2 className="h-4 w-4" /></Button>
                     </TableCell>
                   </TableRow>
                 )
               })}
            </TableBody>
          </Table>
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t p-3 text-sm">
              <span>Page {page} sur {totalPages}</span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Précédent</Button>
                <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Suivant</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="!w-[calc(100vw-2rem)] !max-w-5xl max-h-[95vh] overflow-y-auto bg-slate-100">
          <DialogHeader><DialogTitle>{editingId ? 'Modifier l’élève' : 'Inscrire un élève'}</DialogTitle></DialogHeader>
          <div className="grid gap-5 md:grid-cols-2 bg-slate-200">
            <section className="space-y-3 rounded border p-4">
              <h3 className="font-semibold">Informations personnelles</h3>
              <Input placeholder="Nom *" value={form.nom} onChange={e => setForm({ ...form, nom: e.target.value })} />
              <Input placeholder="Prénom *" value={form.prenom} onChange={e => setForm({ ...form, prenom: e.target.value })} />
              <Select value={form.sexe} onValueChange={v => setForm({ ...form, sexe: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="M">Masculin</SelectItem><SelectItem value="F">Féminin</SelectItem></SelectContent>
              </Select>
              <Label>Date de naissance</Label>
              <Input type="date" value={form.dateNaissance} onChange={e => setForm({ ...form, dateNaissance: e.target.value })} />
              <Input placeholder="Lieu de naissance" value={form.lieuNaissance} onChange={e => setForm({ ...form, lieuNaissance: e.target.value })} />
            </section>
            <section className="space-y-3 rounded border p-4">
              <h3 className="font-semibold">Scolarité</h3>
              <Select value={form.etablissementId} onValueChange={v => { setForm({ ...form, etablissementId: v, anneeScolaireId: '', classeId: '' }); setSchool(v) }} disabled={!!locked || !!editingId}>
                <SelectTrigger><SelectValue placeholder="Établissement *" /></SelectTrigger>
                <SelectContent>{schools.map(s => <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={form.anneeScolaireId} onValueChange={v => setForm({ ...form, anneeScolaireId: v, classeId: '' })} disabled={!!editingId}>
                <SelectTrigger><SelectValue placeholder="Année scolaire *" /></SelectTrigger>
                <SelectContent>{years.map(y => <SelectItem key={y.id} value={y.id}>{y.libelle}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={form.classeId} onValueChange={v => setForm({ ...form, classeId: v })} disabled={!!editingId}>
                <SelectTrigger><SelectValue placeholder="Classe *" /></SelectTrigger>
                <SelectContent>{classes.map(c => <SelectItem key={c.id} value={c.id}>{c.nom}</SelectItem>)}</SelectContent>
              </Select>
            </section>
            <section className="space-y-3 rounded border p-4 md:col-span-2">
              <h3 className="font-semibold">Tuteur principal</h3>
              <div className="grid gap-3 md:grid-cols-2">
                <Input placeholder="Nom du tuteur" value={form.tuteurNom} onChange={e => setForm({ ...form, tuteurNom: e.target.value })} />
                <Input placeholder="Prénom du tuteur" value={form.tuteurPrenom} onChange={e => setForm({ ...form, tuteurPrenom: e.target.value })} />
                <Input placeholder="Téléphone" value={form.tuteurTelephone} onChange={e => setForm({ ...form, tuteurTelephone: e.target.value })} />
                <Input placeholder="Téléphone secondaire" value={form.tuteurTelephone2} onChange={e => setForm({ ...form, tuteurTelephone2: e.target.value })} />
                <Input placeholder="Relation : Père, Mère..." value={form.tuteurRelation} onChange={e => setForm({ ...form, tuteurRelation: e.target.value })} />
                <Input placeholder="Profession" value={form.tuteurProfession} onChange={e => setForm({ ...form, tuteurProfession: e.target.value })} />
                <Input className="md:col-span-2" placeholder="Adresse du tuteur" value={form.tuteurAdresse} onChange={e => setForm({ ...form, tuteurAdresse: e.target.value })} />
              </div>
            </section>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setFormOpen(false)}>Annuler</Button>
            <Button disabled={busy} onClick={handleSave} className="bg-[var(--etab-color,#075e54)] text-white">{busy ? 'Enregistrement...' : editingId ? 'Mettre à jour' : 'Inscrire'}</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!detail} onOpenChange={open => !open && setDetail(null)}>
        <DialogContent className="!w-[calc(100vw-2rem)] !max-w-7xl max-h-[95vh] overflow-y-auto bg-slate-50">
          <DialogHeader><DialogTitle>{detail?.nom} {detail?.prenom}</DialogTitle></DialogHeader>
          {detail && (
            <div className="grid gap-5 md:grid-cols-2">
              <Card><CardHeader><CardTitle>Informations personnelles</CardTitle></CardHeader><CardContent className="space-y-2 text-sm"><p><b>Matricule :</b> {detail.matricule}</p><p><b>Sexe :</b> {detail.sexe === 'F' ? 'Féminin' : 'Masculin'}</p><p><b>Date de naissance :</b> {detail.dateNaissance ? new Date(detail.dateNaissance).toLocaleDateString('fr-BI') : '—'}</p><p><b>Lieu :</b> {detail.lieuNaissance || '—'}</p><p><b>Établissement :</b> {detail.etablissement?.nom || '—'}</p></CardContent></Card>
              <Card><CardHeader><CardTitle>Scolarité</CardTitle></CardHeader><CardContent className="space-y-2">{(detail.inscriptions || detail.classes || []).map((i: any, n: number) => (<div key={n} className="rounded border p-3"><b>{i.classe?.nom || '—'}</b><p className="text-sm text-muted-foreground">{i.classe?.anneeScolaire?.libelle || i.classe?.annee_scolaire?.libelle || '—'} · {i.statut}</p></div>))}</CardContent></Card>
              <Card><CardHeader><CardTitle>Tuteurs</CardTitle></CardHeader><CardContent className="space-y-2">{detail.tuteurs?.length ? detail.tuteurs.map((x: any, n: number) => (<div key={n} className="rounded border p-3"><b>{x.tuteur?.nom} {x.tuteur?.prenom}</b><p className="text-sm">{x.tuteur?.relation || '—'} · {x.tuteur?.telephone || '—'}</p><p className="text-sm text-muted-foreground">{x.tuteur?.adresse || '—'}</p></div>)) : <p className="text-muted-foreground">Aucun tuteur.</p>}</CardContent></Card>
              <Card><CardHeader><CardTitle>Situation financière</CardTitle></CardHeader><CardContent>{detail.echeances?.length ? (<Table><TableHeader><TableRow><TableHead>Frais</TableHead><TableHead>Dû</TableHead><TableHead>Payé</TableHead><TableHead>Statut</TableHead></TableRow></TableHeader><TableBody>{detail.echeances.map((e: any) => (<TableRow key={e.id}><TableCell>{e.fraisScolaire?.libelle || e.frais_scolaire?.libelle || '—'}</TableCell><TableCell>{Number(e.montantDu || e.montant_du || 0).toLocaleString('fr-CD')} {e.fraisScolaire?.devise || e.frais_scolaire?.devise || 'CDF'}</TableCell><TableCell>{Number(e.montantPaye || e.montant_paye || 0).toLocaleString('fr-CD')} {e.fraisScolaire?.devise || e.frais_scolaire?.devise || 'CDF'}</TableCell><TableCell><Badge variant="outline">{e.statut}</Badge></TableCell></TableRow>))}</TableBody></Table>) : <p className="text-muted-foreground">Aucune échéance.</p>}</CardContent></Card>
              <Card className="md:col-span-2"><CardHeader><CardTitle>Historique des paiements</CardTitle></CardHeader><CardContent>{detail.paiements?.length ? (<div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Reçu</TableHead><TableHead>Motif</TableHead><TableHead>Montant</TableHead><TableHead>Mode</TableHead><TableHead>Date</TableHead><TableHead>État</TableHead></TableRow></TableHeader><TableBody>{detail.paiements.map((p: any) => (<TableRow key={p.id} className={p.annule ? 'opacity-60 line-through' : ''}><TableCell className="font-mono text-xs">{p.numeroRecu || p.numero_recu || '—'}</TableCell><TableCell>{p.motif || '—'}</TableCell><TableCell>{Number(p.montant || 0).toLocaleString('fr-CD')} {p.devise || 'CDF'}</TableCell><TableCell>{p.modePaiement === 'ESPECES' ? 'Espèces' : p.modePaiement === 'CHEQUE' ? 'Chèque' : p.modePaiement === 'VIREMENT' ? 'Virement' : p.modePaiement || p.mode_paiement || '—'}</TableCell><TableCell>{p.createdAt || p.created_at ? new Date(p.createdAt || p.created_at).toLocaleDateString('fr-CD') : '—'}</TableCell><TableCell>{p.annule ? <Badge variant="destructive">Annulé</Badge> : <Badge className="bg-emerald-600">Validé</Badge>}</TableCell></TableRow>))}</TableBody></Table></div>) : <p className="text-sm text-muted-foreground">Aucun paiement enregistré.</p>}</CardContent></Card>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={open => !open && setDeleteTarget(null)}>
        <DialogContent><DialogHeader><DialogTitle>Archiver l’élève ?</DialogTitle></DialogHeader><p>Voulez-vous archiver {deleteTarget?.nom} {deleteTarget?.prenom} ? L’historique financier sera conservé.</p><div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setDeleteTarget(null)}>Annuler</Button><Button variant="destructive" disabled={busy} onClick={handleDelete}>{busy ? 'Traitement...' : 'Archiver'}</Button></div></DialogContent>
      </Dialog>
    </main>
  )
}