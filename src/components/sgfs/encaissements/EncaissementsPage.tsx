'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAppStore, getSchoolFilter, getTypeIcon, onEtabSelect } from '@/lib/store'
import * as tc from '@/lib/tauri-commands'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AlertCircle, CheckCircle2, Receipt, Search, X, Sparkles, Banknote, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { ReceiptPOS } from './ReceiptPOS'

/* ────────────────────────────────────────────────────────────────────────────
 * Constantes & helpers
 * ──────────────────────────────────────────────────────────────────────────*/

const WHOLE_CURRENCIES = ['CDF', 'BIF']

const LOCALES: Record<string, string> = {
  CDF: 'fr-CD',
  BIF: 'fr-BI',
  USD: 'en-US',
}

function formatMoney(montant: number | null | undefined, devise = 'CDF') {
  const isWhole = WHOLE_CURRENCIES.includes(devise)
  return new Intl.NumberFormat(LOCALES[devise] ?? 'fr-FR', {
    style: 'currency',
    currency: devise,
    minimumFractionDigits: isWhole ? 0 : 2,
    maximumFractionDigits: isWhole ? 0 : 2,
  }).format(Number(montant || 0))
}

function formatDate(date?: string | null) {
  if (!date) return '—'
  const d = new Date(date)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('fr-FR')
}

/* ────────────────────────────────────────────────────────────────────────────
 * Types
 * ──────────────────────────────────────────────────────────────────────────*/

interface Etablissement {
  id: string
  nom: string
  type?: string
  adresse?: string
  telephone?: string
  logoUrl?: string | null
}

interface Eleve {
  id: string
  nom: string
  prenom: string
  matricule: string
  classe: string
  etablissementId: string
  etablissementNom?: string
}

interface Echeance {
  id: string
  fraisDesignation: string
  montantTotal: number
  montantPaye: number
  montantRestant: number
  devise: string
  dateEcheance?: string
  statut: string
}

interface Encaissement {
  id: string
  numeroRecu: string
  dateEncaissement: string
  eleveNom: string
  eleveClasse: string
  eleveMatricule: string
  motif: string
  montant: number
  devise: string
  modePaiement: string
  referencePaiement?: string
  statut: 'PAYE' | 'ANNULE'
  tauxChange?: number | null
  etablissementId: string
  etablissementNom?: string
  caissierNom?: string

  totalDu?: number | null
  totalPaye?: number | null
  reste?: number | null
  detailReste?: string | null
  prochaineEcheance?: string | null
  totaux?: { devise: string; totalDu: number; totalPaye: number; reste: number }[]
  deviseSituation?: string | null
  deviseEcheance?: string | null
}

/* ────────────────────────────────────────────────────────────────────────────
 * Page
 * ──────────────────────────────────────────────────────────────────────────*/

export default function EncaissementsPage() {
  const { user } = useAppStore()
  const role = user?.role ?? ''
  const userEtabId = user?.etablissementId ?? null
  const schoolFilter = useMemo(() => getSchoolFilter(role, userEtabId), [role, userEtabId])
  const locked = !!schoolFilter

  const [etablissements, setEtablissements] = useState<Etablissement[]>([])
  const [students, setStudents] = useState<Eleve[]>([])

  const [annee, setAnnee] = useState<{ id: string; libelle: string } | null>(null)

  const [studentSearch, setStudentSearch] = useState('')
  const [selectedStudent, setSelectedStudent] = useState<Eleve | null>(null)
  const [echeances, setEcheances] = useState<Echeance[]>([])
  const [selectedEcheance, setSelectedEcheance] = useState<Echeance | null>(null)
  const [studentSuggestions, setStudentSuggestions] = useState<any[]>([])
  const [searchingStudents, setSearchingStudents] = useState(false)
  const [loadingEcheances, setLoadingEcheances] = useState(false)

  const [motif, setMotif] = useState('')
  const [montant, setMontant] = useState('')
  const [devise, setDevise] = useState('CDF')
  const [modePaiement, setModePaiement] = useState('')
  const [referencePaiement, setReferencePaiement] = useState('')
  const [tauxChange, setTauxChange] = useState(2500)
  const [submitting, setSubmitting] = useState(false)

  const [encaissements, setEncaissements] = useState<Encaissement[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [page, setPage] = useState(1)
  const pageSize = 10
  const [totalPages, setTotalPages] = useState(1)
  const [histSearch, setHistSearch] = useState('')
  const [histDateDebut, setHistDateDebut] = useState('')
  const [histDateFin, setHistDateFin] = useState('')
  const [histMode, setHistMode] = useState('')
  const [histEtablissementId, setHistEtablissementId] = useState('')

  const [receipt, setReceipt] = useState<Encaissement | null>(null)
  const [annulationTarget, setAnnulationTarget] = useState<Encaissement | null>(null)
  const [annulationMotif, setAnnulationMotif] = useState('')
  const [annulling, setAnnulling] = useState(false)

  const [modificationTarget, setModificationTarget] = useState<Encaissement | null>(null)
  const [modMotif, setModMotif] = useState('')
  const [modMontant, setModMontant] = useState('')
  const [modDevise, setModDevise] = useState('CDF')
  const [modModePaiement, setModModePaiement] = useState('')
  const [modReferencePaiement, setModReferencePaiement] = useState('')
  const [modifying, setModifying] = useState(false)

  const fetchEtablissements = useCallback(async () => {
    try {
      const res = await tc.listEtablissements()
      setEtablissements(res?.etablissements ?? [])
    } catch {
      /* silencieux */
    }
  }, [])

  const fetchTaux = useCallback(async () => {
    try {
      const res = await tc.getParametres(locked ? schoolFilter! : '')
      const data = res?.data ?? res
      const taux = Number(data?.tauxChangeUsdCdf ?? data?.tauxChangeUsdBif ?? 0)
      if (taux > 0) setTauxChange(taux)
    } catch {
      /* valeur par défaut */
    }
  }, [locked, schoolFilter])

  const fetchAnnee = useCallback(async (etablissementId?: string) => {
    const etabId = etablissementId || schoolFilter || undefined
    if (!etabId) return
    try {
      const res = await tc.listAnneesScolaires(etabId)
      const list: any[] = Array.isArray(res?.annees_scolaires) ? res.annees_scolaires : []
      const active = list.find((a) => a.active) ?? list[0]
      if (active) setAnnee({ id: active.id, libelle: active.libelle })
    } catch {
      /* silencieux */
    }
  }, [schoolFilter])

  const fetchStudents = useCallback(async () => {
    try {
      const etabId = schoolFilter || undefined
      const res = await tc.listEleves({ etablissementId: etabId, pageSize: 1000 })
      const list = res?.data ?? []
      setStudents(
        (Array.isArray(list) ? list : []).map((eleve: any) => ({
          id: eleve.id,
          nom: eleve.nom,
          prenom: eleve.prenom,
          matricule: eleve.matricule,
          classe: eleve.inscriptions?.[0]?.classe?.nom ?? '—',
          etablissementId: eleve.etablissementId,
          etablissementNom: eleve.etablissement?.nom ?? '',
        })),
      )
    } catch {
      toast.error('Erreur chargement élèves')
    }
  }, [schoolFilter])

  const searchStudentsServer = useCallback(async (query: string) => {
    if (!query.trim() || selectedStudent) {
      setStudentSuggestions([])
      return
    }
    setSearchingStudents(true)
    try {
      const etabId = schoolFilter || undefined
      const res = await tc.listEleves({ etablissementId: etabId, search: query.trim(), pageSize: 20 })
      const list = res?.data ?? []
      const suggestions = (Array.isArray(list) ? list : []).map((eleve: any) => ({
        id: eleve.id,
        nom: eleve.nom,
        prenom: eleve.prenom,
        matricule: eleve.matricule,
        classe: eleve.inscriptions?.[0]?.classe?.nom ?? '—',
        etablissementId: eleve.etablissementId,
        etablissementNom: eleve.etablissement?.nom ?? '',
      }))
      setStudentSuggestions(suggestions)
    } catch {
      setStudentSuggestions([])
    } finally {
      setSearchingStudents(false)
    }
  }, [schoolFilter, selectedStudent])

  useEffect(() => {
    if (!user) return
    fetchEtablissements()
    fetchTaux()
    fetchAnnee()
    fetchStudents()
  }, [user, fetchEtablissements, fetchTaux, fetchAnnee, fetchStudents])

  // Debounced search for students
  useEffect(() => {
    const timer = setTimeout(() => {
      if (studentSearch.trim()) {
        searchStudentsServer(studentSearch)
      } else {
        setStudentSuggestions([])
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [studentSearch, searchStudentsServer])

  const fetchHistory = useCallback(
    async (requestedPage = page) => {
      setHistoryLoading(true)
      try {
        const etabId = schoolFilter || histEtablissementId || undefined
        const res = await tc.listPaiements({
          etablissementId: etabId,
          dateFrom: histDateDebut || undefined,
          dateTo: histDateFin || undefined,
          search: histSearch || undefined,
          modePaiement: histMode || undefined,
          page: requestedPage,
          pageSize,
        })
        const all = res?.paiements ?? res?.data ?? []
        const rows = Array.isArray(all) ? all : []
        const total = Number(res?.total ?? rows.length)

        // Le backend a déjà filtré et paginé. Ne pas filtrer ni découper
        // une seconde fois ici, sinon des reçus des pages suivantes disparaissent.
        setEncaissements(rows)
        setTotalPages(Math.max(1, Math.ceil(total / pageSize)))
      } catch (e: any) {
        toast.error(e?.message || 'Erreur historique')
      } finally {
        setHistoryLoading(false)
      }
    },
    [page, histSearch, histDateDebut, histDateFin, histMode, histEtablissementId, schoolFilter],
  )

  useEffect(() => {
    if (user) fetchHistory(page)
  }, [user, page, fetchHistory])

  // Rafraîchir les données (élèves, historique, taux…) après une synchronisation
  // — qu'elle soit automatique ou manuelle — afin que les nouvelles données
  // reçues du cloud apparaissent sans avoir à quitter la page.
  useEffect(() => {
    const handleSync = () => {
      fetchStudents()
      fetchTaux()
      fetchAnnee()
      fetchHistory(page)
    }
    window.addEventListener('sync-completed', handleSync)
    return () => window.removeEventListener('sync-completed', handleSync)
  }, [fetchStudents, fetchTaux, fetchAnnee, fetchHistory, page])

  function clearStudent() {
    setSelectedStudent(null)
    setStudentSearch('')
    setEcheances([])
    setSelectedEcheance(null)
    setMotif('')
    setMontant('')
  }

  async function selectStudent(eleve: Eleve) {
    setSelectedStudent(eleve)
    setStudentSearch(`${eleve.matricule} — ${eleve.nom} ${eleve.prenom}`)
    setSelectedEcheance(null)
    setMotif('')
    setMontant('')
    setLoadingEcheances(true)
    if (!locked && eleve.etablissementId) void fetchAnnee(eleve.etablissementId)
    try {
      const res = await tc.getEleve(eleve.id)
      const detail = res?.data ?? res
      const mapped: Echeance[] = (detail?.echeances ?? []).map((e: any) => ({
        id: e.id,
        fraisDesignation: e.fraisScolaire?.libelle ?? 'Frais',
        montantTotal: Number(e.montantDu ?? 0),
        montantPaye: Number(e.montantPaye ?? 0),
        montantRestant:
          e.restant ?? Math.max(0, Number(e.montantDu ?? 0) - Number(e.montantPaye ?? 0)),
        devise: e.fraisScolaire?.devise ?? 'CDF',
        dateEcheance: e.dateEcheance,
        statut: e.statut,
      }))
      setEcheances(mapped)
    } catch {
      setEcheances([])
      toast.error('Erreur chargement échéances')
    } finally {
      setLoadingEcheances(false)
    }
  }

  function selectEcheance(echeance: Echeance) {
    setSelectedEcheance(echeance)
    setMotif(echeance.fraisDesignation)
    setMontant(String(echeance.montantRestant))
    setDevise(echeance.devise)
  }

  const echeancesImpayees = useMemo(
    () => echeances.filter((e) => e.statut !== 'PAYE' && e.montantRestant > 0),
    [echeances],
  )

  const montantImpute = useMemo(() => {
    if (!selectedEcheance || !montant) return null
    const value = Number(montant)
    if (!Number.isFinite(value)) return null
    if (devise === selectedEcheance.devise) return value
    return devise === 'USD' ? value * tauxChange : value / tauxChange
  }, [montant, devise, selectedEcheance, tauxChange])

  function situationApresPaiement(impute: number) {
    const parDevise = new Map<string, { totalDu: number; totalPaye: number; reste: number }>()
    for (const e of echeances) {
      const dev = (e.devise || 'CDF').toUpperCase()
      const acc = parDevise.get(dev) ?? { totalDu: 0, totalPaye: 0, reste: 0 }
      const part = e.id === selectedEcheance?.id ? impute : 0
      acc.totalDu += e.montantTotal
      acc.totalPaye += e.montantPaye + part
      acc.reste += Math.max(0, e.montantRestant - part)
      parDevise.set(dev, acc)
    }

    const totaux = Array.from(parDevise.entries()).map(([devise, v]) => ({
      devise,
      totalDu: v.totalDu,
      totalPaye: v.totalPaye,
      reste: v.reste,
    }))

    const restants = echeances
      .filter((e) => {
        const part = e.id === selectedEcheance?.id ? impute : 0
        return e.montantRestant - part > 0.009
      })
      .sort((a, b) => (a.dateEcheance ?? '9999').localeCompare(b.dateEcheance ?? '9999'))

    const principal =
      totaux.length > 0 ? totaux.reduce((a, b) => (b.reste > a.reste ? b : a)) : null

    return {
      totaux,
      deviseSituation: principal?.devise ?? null,
      totalDu: principal?.totalDu ?? 0,
      totalPaye: principal?.totalPaye ?? 0,
      reste: principal?.reste ?? 0,
      detailReste: restants.length
        ? restants.slice(0, 3).map((e) => e.fraisDesignation).join(', ')
        : null,
      prochaineEcheance: restants[0]?.dateEcheance ?? null,
    }
  }

  async function submitPayment() {
    if (!user) return toast.error('Utilisateur non connecté')
    if (!selectedStudent || !selectedEcheance) {
      return toast.error('Sélectionnez un élève et une échéance')
    }
    const value = Number(montant)
    if (!Number.isFinite(value) || value <= 0) return toast.error('Montant invalide')
    if (!modePaiement) return toast.error('Sélectionnez un mode de paiement')
    if (!annee?.id) {
      return toast.error(
        "Aucune année scolaire active pour cet établissement. Créez-en une avant d'encaisser.",
      )
    }
    if ((modePaiement === 'CHEQUE' || modePaiement === 'VIREMENT') && !referencePaiement.trim()) {
      return toast.error('La référence est obligatoire pour ce mode de paiement')
    }

    setSubmitting(true)
    try {
      const impute = montantImpute ?? value
      const res = await tc.createPaiement({
        eleveId: selectedStudent.id,
        echeanceId: selectedEcheance?.id,
        etablissementId: selectedStudent.etablissementId,
        anneeScolaireId: annee?.id,
        userId: user.id,
        motif,
        montant: value,
        devise,
        modePaiement,
        referencePaiement: referencePaiement || undefined,
        tauxChange: selectedEcheance && devise !== selectedEcheance.devise ? tauxChange : undefined,
        montantAffecte: impute,
        deviseEcheance: selectedEcheance?.devise || devise,
      })
      const paiement = res?.data ?? res

      const situation = situationApresPaiement(impute)

      setReceipt({
        ...paiement,
        eleveNom: paiement?.eleveNom ?? `${selectedStudent.nom} ${selectedStudent.prenom}`,
        eleveClasse: paiement?.eleveClasse ?? selectedStudent.classe,
        eleveMatricule: paiement?.eleveMatricule ?? selectedStudent.matricule,
        caissierNom: paiement?.caissierNom ?? (user as any)?.nomComplet ?? (user as any)?.username,
        motif: paiement?.motif ?? motif,
        montant: paiement?.montant ?? value,
        devise: paiement?.devise ?? devise,
        modePaiement: paiement?.modePaiement ?? modePaiement,
        referencePaiement: paiement?.referencePaiement ?? referencePaiement ?? undefined,
        etablissementId: paiement?.etablissementId ?? selectedStudent.etablissementId,
        statut: paiement?.statut ?? 'PAYE',
        ...situation,
      })

      toast.success('Encaissement enregistré avec succès')
      clearStudent()
      setModePaiement('')
      setReferencePaiement('')
      setPage(1)
      fetchHistory(1)
    } catch (e: any) {
      const msg = typeof e === 'string' ? e : e?.message || e?.error || JSON.stringify(e)
      toast.error(msg || 'Erreur lors de l\'encaissement')
    } finally {
      setSubmitting(false)
    }
  }

  async function ouvrirRecu(e: Encaissement) {
    setReceipt(e)
    if (!e.eleveMatricule) return
    try {
      const res = await tc.listEcheances({ search: e.eleveMatricule, pageSize: 1 })
      const row = res?.data?.[0]
      if (!row) return
      let totaux = Array.isArray(row.totaux) ? row.totaux : []
      if (totaux.length === 0 && Array.isArray(row.lignes) && row.lignes.length > 0) {
        const m = new Map<string, { totalDu: number; totalPaye: number; reste: number }>()
        for (const l of row.lignes as any[]) {
          const dev = String(l.devise || 'CDF').toUpperCase()
          const a = m.get(dev) ?? { totalDu: 0, totalPaye: 0, reste: 0 }
          a.totalDu += Number(l.montantDu ?? 0)
          a.totalPaye += Number(l.montantPaye ?? 0)
          a.reste += Number(l.reste ?? 0)
          m.set(dev, a)
        }
        totaux = Array.from(m.entries()).map(([devise, v]) => ({ devise, ...v }))
      }
      const principal =
        totaux.length > 0
          ? totaux.reduce((a, b) => (b.reste > a.reste ? b : a))
          : null
      setReceipt((cur) =>
        cur && cur.id === e.id
          ? {
              ...cur,
              totaux,
              deviseSituation: principal?.devise ?? row.devise ?? null,
              totalDu: principal?.totalDu ?? row.totalDu,
              totalPaye: principal?.totalPaye ?? row.totalPaye,
              reste: principal?.reste ?? row.reste,
              detailReste: row.motif ?? null,
              prochaineEcheance: row.dateEcheance ?? null,
            }
          : cur,
      )
    } catch {
      /* silencieux */
    }
  }

  async function confirmAnnulation() {
    if (!user) return toast.error('Utilisateur non connecté')
    if (!annulationTarget || !annulationMotif.trim()) {
      return toast.error("Motif d'annulation requis")
    }
    setAnnulling(true)
    try {
      await tc.annulerPaiement(annulationTarget.id, user.id, annulationMotif.trim())
      toast.success('Reçu annulé')
      setAnnulationTarget(null)
      setAnnulationMotif('')
      fetchHistory()
    } catch (e: any) {
      toast.error(e?.message || "Erreur d'annulation")
    } finally {
      setAnnulling(false)
    }
  }

  const modMontantImpute = useMemo(() => {
    if (!modificationTarget || !modMontant) return null
    const value = Number(modMontant)
    if (!Number.isFinite(value)) return null
    const echeanceDevise = modificationTarget.deviseEcheance || modificationTarget.devise
    if (modDevise === echeanceDevise) return value
    return modDevise === 'USD' ? value * tauxChange : value / tauxChange
  }, [modMontant, modDevise, modificationTarget, tauxChange])

  function debuterModification(e: Encaissement) {
    setModificationTarget(e)
    setModMotif(e.motif)
    setModMontant(String(e.montant))
    setModDevise(e.devise)
    setModModePaiement(e.modePaiement)
    setModReferencePaiement(e.referencePaiement || '')
  }

  async function confirmModification() {
    if (!user) return toast.error('Utilisateur non connecté')
    if (!modificationTarget) return
    const value = Number(modMontant)
    if (!Number.isFinite(value) || value <= 0) return toast.error('Montant invalide')
    const impute = modMontantImpute == null ? value : Number(modMontantImpute)
    if (!Number.isFinite(impute) || impute <= 0) return toast.error('Le montant imputé doit être supérieur à zéro')
    if (!modMotif.trim()) return toast.error('Le motif du reçu est obligatoire')
    if (!modDevise.trim()) return toast.error('La devise du reçu est obligatoire')
    if (!modModePaiement) return toast.error('Mode de paiement requis')
    if ((modModePaiement === 'CHEQUE' || modModePaiement === 'VIREMENT') && !modReferencePaiement.trim()) {
      return toast.error('La référence est obligatoire pour ce mode de paiement')
    }

    setModifying(true)
    try {
      await tc.updatePaiement(modificationTarget.id, {
        motif: modMotif.trim(),
        montant: value,
        devise: modDevise.trim(),
        modePaiement: modModePaiement,
        referencePaiement: modReferencePaiement.trim() || null,
        tauxChange: modificationTarget.deviseEcheance && modDevise !== modificationTarget.deviseEcheance ? tauxChange : null,
        montantAffecte: impute,
        deviseEcheance: modificationTarget.deviseEcheance || modDevise.trim(),
      })
      toast.success('Reçu modifié avec succès')
      setModificationTarget(null)
      fetchHistory()
    } catch (e: any) {
      toast.error(e?.message || "Erreur de modification")
    } finally {
      setModifying(false)
    }
  }

  const suggestions = useMemo(() => {
    if (selectedStudent) return []
    return studentSuggestions.slice(0, 8)
  }, [studentSuggestions, selectedStudent])

  const etablissementRecu = etablissements.find((e) => e.id === receipt?.etablissementId)
  const besoinReference = modePaiement === 'CHEQUE' || modePaiement === 'VIREMENT'

  return (
    <div className="space-y-6 p-2 sm:p-4 md:p-6">
      {/* Banner Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-stone-200/80 shadow-sm">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 text-amber-700 text-xs font-bold border border-amber-500/20 mb-2">
            <Receipt className="h-3.5 w-3.5" /> Caisses & Encaissements
          </div>
          <h1 className="text-2xl font-extrabold text-stone-900 tracking-tight">
            Encaissements & Reçus
          </h1>
          <p className="text-xs sm:text-sm text-stone-500 mt-1">
            Enregistrez les paiements, imputez les frais et imprimez les reçus officiels.
          </p>
        </div>
      </div>

      <Tabs defaultValue="nouveau" className="w-full">
        <TabsList className="bg-stone-100 p-1 rounded-xl border border-stone-200">
          <TabsTrigger value="nouveau" className="rounded-lg font-bold text-xs sm:text-sm data-[state=active]:bg-[#0c241f] data-[state=active]:text-amber-400">Nouvel encaissement</TabsTrigger>
          <TabsTrigger value="historique" className="rounded-lg font-bold text-xs sm:text-sm data-[state=active]:bg-[#0c241f] data-[state=active]:text-amber-400">Historique des reçus</TabsTrigger>
        </TabsList>

        {/* ── Nouvel encaissement ───────────────────────────────────── */}
        <TabsContent value="nouveau" className="mt-4 grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <Card className="rounded-2xl border-stone-200/80 shadow-sm">
              <CardHeader className="bg-stone-50/50 border-b border-stone-100 px-6 py-4">
                <CardTitle className="text-sm font-bold text-[#0c241f]">Recherche de l&apos;élève</CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                <div className="relative">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400" />
                  <Input
                    value={studentSearch}
                    onChange={(e) => {
                      setStudentSearch(e.target.value)
                      if (selectedStudent) clearStudent()
                    }}
                    className="pl-10 rounded-xl border-stone-200 font-medium"
                    placeholder="Tapez nom, prénom, matricule ou classe..."
                  />
                  {searchingStudents && (
                    <div className="absolute z-20 mt-1 w-full rounded-2xl border border-stone-200 bg-white p-4 shadow-xl text-center text-xs text-stone-500">
                      Recherche en cours...
                    </div>
                  )}
                  {!searchingStudents && suggestions.length > 0 && (
                    <div className="absolute z-20 mt-1 w-full rounded-2xl border border-stone-200 bg-white p-2 shadow-xl max-h-60 overflow-y-auto">
                      {suggestions.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          className="block w-full px-4 py-2.5 text-left text-xs font-semibold rounded-xl hover:bg-stone-50 transition-colors"
                          onClick={() => selectStudent(s)}
                        >
                          <b className="text-amber-700 font-mono">{s.matricule}</b> — <span className="text-stone-900">{s.nom} {s.prenom}</span>
                          <span className="float-right text-stone-500 font-normal">{s.classe}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {selectedStudent && (
                  <div className="mt-4 flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50/50 p-4 text-xs font-semibold text-stone-800">
                    <div className="break-words pr-2">
                      <b className="text-[#0c241f] text-sm">{selectedStudent.nom} {selectedStudent.prenom}</b>
                      <span className="mx-2 text-stone-300">•</span>
                      <span className="font-mono text-amber-800">{selectedStudent.matricule}</span>
                      <span className="mx-2 text-stone-300">•</span>
                      <span className="text-stone-600">{selectedStudent.classe}</span>
                    </div>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-stone-500 hover:text-rose-600 rounded-lg" onClick={clearStudent}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {selectedStudent && (
              <Card className="rounded-2xl border-stone-200/80 shadow-sm overflow-hidden">
                <CardHeader className="bg-stone-50/50 border-b border-stone-100 px-6 py-4">
                  <CardTitle className="text-sm font-bold text-[#0c241f]">Échéances en attente de paiement</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {loadingEcheances ? (
                    <p className="py-8 text-center text-xs font-semibold text-stone-400">Chargement des frais dûs...</p>
                  ) : echeancesImpayees.length === 0 ? (
                    <p className="py-8 text-center text-xs font-semibold text-stone-400">
                      Aucune échéance impayée pour cet élève.
                    </p>
                  ) : (
                    <Table>
                      <TableHeader className="bg-[#0c241f] text-white">
                        <TableRow className="hover:bg-[#0c241f]">
                          <TableHead className="text-amber-300 font-bold">Frais</TableHead>
                          <TableHead className="text-white font-bold">Échéance</TableHead>
                          <TableHead className="text-right text-white font-bold">Déjà Payé</TableHead>
                          <TableHead className="text-right text-amber-300 font-bold">Reste Dû</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {echeancesImpayees.map((e) => (
                          <TableRow
                            key={e.id}
                            onClick={() => selectEcheance(e)}
                            className={`cursor-pointer transition-colors ${
                              selectedEcheance?.id === e.id ? 'bg-amber-500/10 font-bold' : 'hover:bg-stone-50'
                            }`}
                          >
                            <TableCell className="py-3">
                              <b className="text-stone-900 text-xs break-words">{e.fraisDesignation}</b>
                            </TableCell>
                            <TableCell className="text-xs text-stone-600 font-medium">{formatDate(e.dateEcheance)}</TableCell>
                            <TableCell className="text-right font-semibold text-emerald-700 text-xs tabular-nums">
                              {formatMoney(e.montantPaye, e.devise)}
                            </TableCell>
                            <TableCell className="text-right font-extrabold text-amber-700 text-xs tabular-nums">
                              {formatMoney(e.montantRestant, e.devise)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            )}
          </div>

          {/* Panneau latéral : détails du paiement */}
          <Card className="rounded-2xl border-stone-200/80 shadow-sm h-fit">
            <CardHeader className="bg-stone-50/50 border-b border-stone-100 px-6 py-4">
              <CardTitle className="text-sm font-bold text-[#0c241f]">Saisie de l&apos;Encaissement</CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <div>
                <Label className="text-xs font-semibold text-stone-600">Motif du versement *</Label>
                <Input
                  className="rounded-xl border-stone-200 bg-white font-medium mt-1"
                  value={motif}
                  disabled={!selectedEcheance}
                  onChange={(e) => setMotif(e.target.value)}
                />
              </div>

              <div>
                <Label className="text-xs font-semibold text-stone-600">Montant versé *</Label>
                <Input
                  className="rounded-xl border-stone-200 bg-white font-extrabold text-stone-900 mt-1"
                  type="number"
                  min="0"
                  step={WHOLE_CURRENCIES.includes(devise) ? '1' : '0.01'}
                  value={montant}
                  disabled={!selectedEcheance}
                  onChange={(e) => setMontant(e.target.value)}
                />
              </div>

              <div>
                <Label className="text-xs font-semibold text-stone-600">Devise reçue *</Label>
                <Select value={devise} onValueChange={setDevise} disabled={!selectedEcheance}>
                  <SelectTrigger className="rounded-xl border-stone-200 bg-white font-medium mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    <SelectItem value="CDF">CDF (Franc congolais)</SelectItem>
                    <SelectItem value="USD">USD ($)</SelectItem>
                    <SelectItem value="BIF">BIF (Franc burundais)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {selectedEcheance && devise !== selectedEcheance.devise && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-medium text-amber-900">
                  Taux appliqué : 1 USD = {tauxChange.toLocaleString('fr-CD')} CDF
                  <br />
                  Montant imputé : <b>{montantImpute !== null ? formatMoney(montantImpute, selectedEcheance.devise) : '—'}</b>
                </div>
              )}

              <div>
                <Label className="text-xs font-semibold text-stone-600">Mode de paiement *</Label>
                <Select
                  value={modePaiement}
                  onValueChange={setModePaiement}
                  disabled={!selectedEcheance}
                >
                  <SelectTrigger className="rounded-xl border-stone-200 bg-white font-medium mt-1">
                    <SelectValue placeholder="Sélectionner le mode" />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    <SelectItem value="ESPECES">Espèces</SelectItem>
                    <SelectItem value="CHEQUE">Chèque</SelectItem>
                    <SelectItem value="VIREMENT">Virement bancaire</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {besoinReference && (
                <div>
                  <Label className="text-xs font-semibold text-stone-600">Référence pièce / bordereau *</Label>
                  <Input
                    className="rounded-xl border-stone-200 bg-white font-medium mt-1"
                    value={referencePaiement}
                    onChange={(e) => setReferencePaiement(e.target.value)}
                  />
                </div>
              )}

              {selectedEcheance && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3 text-xs font-medium text-emerald-900">
                  Reste dû sur ce frais : <b>{formatMoney(selectedEcheance.montantRestant, selectedEcheance.devise)}</b>
                </div>
              )}

              <Button
                className="w-full bg-[#0c241f] hover:bg-[#071916] text-white font-bold rounded-xl h-11 shadow-md"
                disabled={
                  !selectedEcheance ||
                  !modePaiement ||
                  !montant ||
                  submitting ||
                  (besoinReference && !referencePaiement.trim())
                }
                onClick={submitPayment}
              >
                {submitting ? 'Enregistrement...' : 'Encaisser & Imprimer Reçu'}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Historique ────────────────────────────────────────────── */}
        <TabsContent value="historique" className="mt-4 space-y-4">
          <Card className="rounded-2xl border-stone-200/80 shadow-sm">
            <CardContent className="grid grid-cols-1 gap-3 p-5 md:grid-cols-2 xl:grid-cols-3">
              <Input
                className="rounded-xl border-stone-200 font-medium"
                placeholder="Nom d'élève ou N° de reçu..."
                value={histSearch}
                onChange={(e) => setHistSearch(e.target.value)}
              />
              <Input
                className="rounded-xl border-stone-200 font-medium"
                type="date"
                value={histDateDebut}
                onChange={(e) => setHistDateDebut(e.target.value)}
              />
              <Input
                className="rounded-xl border-stone-200 font-medium"
                type="date"
                value={histDateFin}
                onChange={(e) => setHistDateFin(e.target.value)}
              />

              <Select value={histMode || 'all'} onValueChange={(v) => setHistMode(v === 'all' ? '' : v)}>
                <SelectTrigger className="rounded-xl border-stone-200 font-medium">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="all">Tous les modes</SelectItem>
                  <SelectItem value="ESPECES">Espèces</SelectItem>
                  <SelectItem value="CHEQUE">Chèque</SelectItem>
                  <SelectItem value="VIREMENT">Virement bancaire</SelectItem>
                </SelectContent>
              </Select>

              {!locked && (
                <Select
                  value={histEtablissementId || 'all'}
                  onValueChange={(v) => {
                    setHistEtablissementId(v === 'all' ? '' : v)
                    if (v !== 'all') onEtabSelect(v, etablissements)
                  }}
                >
                  <SelectTrigger className="rounded-xl border-stone-200 font-medium">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    <SelectItem value="all">Tous les établissements</SelectItem>
                    {etablissements.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {`${getTypeIcon(e.type || '')} ${e.nom}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              <div className="flex flex-wrap gap-2 md:col-span-2 xl:col-span-1">
                <Button
                  className="min-w-[120px] flex-1 bg-[#0c241f] hover:bg-[#071916] text-white font-bold rounded-xl"
                  onClick={() => {
                    setPage(1)
                    fetchHistory(1)
                  }}
                >
                  <Search className="mr-1 h-4 w-4 text-amber-400" />
                  Rechercher
                </Button>
                <Button
                  variant="outline"
                  className="min-w-[120px] flex-1 rounded-xl border-stone-200 font-medium"
                  onClick={() => {
                    setHistSearch('')
                    setHistDateDebut('')
                    setHistDateFin('')
                    setHistMode('')
                    setHistEtablissementId('')
                    setPage(1)
                  }}
                >
                  Réinitialiser
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-stone-200/80 shadow-sm overflow-hidden">
            <CardContent className="p-0">
              {historyLoading ? (
                <p className="p-12 text-center text-xs font-semibold text-stone-400">Chargement de l&apos;historique...</p>
              ) : encaissements.length === 0 ? (
                <p className="p-12 text-center text-xs font-semibold text-stone-400">
                  Aucun encaissement trouvé.
                </p>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader className="bg-[#0c241f] text-white">
                        <TableRow className="hover:bg-[#0c241f]">
                          <TableHead className="text-amber-300 font-bold">N° Reçu</TableHead>
                          <TableHead className="text-white font-bold">Date</TableHead>
                          <TableHead className="text-white font-bold">Élève</TableHead>
                          <TableHead className="text-white font-bold">Motif</TableHead>
                          <TableHead className="text-right text-white font-bold">Montant</TableHead>
                          <TableHead className="text-white font-bold">Statut</TableHead>
                          <TableHead className="text-right text-white font-bold">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {encaissements.map((e) => (
                          <TableRow
                            key={e.id}
                            className={`hover:bg-amber-500/5 transition-colors ${e.statut === 'ANNULE' ? 'bg-rose-50/50 opacity-60' : ''}`}
                          >
                            <TableCell className="font-mono text-xs font-bold text-stone-800">{e.numeroRecu}</TableCell>
                            <TableCell className="text-xs font-medium text-stone-600">{formatDate(e.dateEncaissement)}</TableCell>
                            <TableCell>
                              <b className="text-stone-900 text-xs break-words">{e.eleveNom}</b>
                              <br />
                              <span className="text-[11px] text-stone-400 font-medium">{e.eleveClasse}</span>
                            </TableCell>
                            <TableCell className="text-xs font-medium text-stone-800 break-words">{e.motif}</TableCell>
                            <TableCell className="text-right font-extrabold text-emerald-800 text-xs tabular-nums">
                              {formatMoney(e.montant, e.devise)}
                            </TableCell>
                            <TableCell>
                              {e.statut === 'ANNULE' ? (
                                <Badge variant="destructive" className="font-semibold text-[10px]">Annulé</Badge>
                              ) : (
                                <Badge className="bg-emerald-100 text-emerald-800 border border-emerald-200 font-semibold text-[10px]">
                                  <CheckCircle2 className="mr-1 h-3 w-3 text-emerald-600" />
                                  Valide
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  title="Voir / Imprimer le reçu"
                                  className="h-8 w-8 text-[#0c241f] hover:bg-stone-100"
                                  onClick={() => ouvrirRecu(e)}
                                >
                                  <Receipt className="h-4 w-4" />
                                </Button>
                                {e.statut !== 'ANNULE' && (
                                  <>
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      className="h-8 w-8 text-amber-700 hover:bg-amber-50"
                                      title="Modifier le reçu"
                                      aria-label={`Modifier le reçu ${e.numeroRecu}`}
                                      onClick={() => debuterModification(e)}
                                    >
                                      <Pencil className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      className="h-8 w-8 text-rose-600 hover:bg-rose-50"
                                    title="Annuler le reçu"
                                    onClick={() => {
                                      setAnnulationTarget(e)
                                      setAnnulationMotif('')
                                    }}
                                  >
                                      <X className="h-4 w-4" />
                                    </Button>
                                  </>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  <div className="flex items-center justify-between border-t border-stone-100 bg-stone-50/50 p-4 text-xs font-medium text-stone-600">
                    <span>
                      Page <b>{page}</b> sur <b>{totalPages}</b>
                    </span>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-xl border-stone-200"
                        disabled={page <= 1}
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                      >
                        Précédent
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-xl border-stone-200"
                        disabled={page >= totalPages}
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      >
                        Suivant
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ── Reçu POS ── */}
      <Dialog open={!!receipt} onOpenChange={(open) => !open && setReceipt(null)}>
        <DialogContent className="w-[calc(80mm+2rem)] max-w-[calc(100vw-2rem)] overflow-hidden p-0 rounded-3xl border border-stone-200 shadow-2xl">
          <DialogHeader className="sr-only">
            <DialogTitle>Reçu de paiement</DialogTitle>
          </DialogHeader>
          {receipt && (
            <ReceiptPOS
              receipt={receipt}
              school={{
                nom: etablissementRecu?.nom || receipt.etablissementNom || 'SGFS-ME',
                adresse: etablissementRecu?.adresse,
                telephone: etablissementRecu?.telephone,
                logoUrl: etablissementRecu?.logoUrl,
              }}
              onClose={() => setReceipt(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* ── Annulation ── */}
      <Dialog
        open={!!annulationTarget}
        onOpenChange={(open) => !open && setAnnulationTarget(null)}
      >
        <DialogContent className="rounded-3xl border border-stone-200 p-6 shadow-2xl max-w-md bg-white">
          <DialogHeader>
            <DialogTitle className="text-rose-600 font-extrabold text-lg flex items-center gap-2">
              <AlertCircle className="h-5 w-5" />
              Annuler le reçu
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs font-semibold text-stone-600 mt-1">
            Le reçu <b className="font-mono text-stone-900">{annulationTarget?.numeroRecu}</b> sera annulé et les montants crédités seront réajustés.
          </p>
          <div className="pt-2">
            <Label className="text-xs font-semibold text-stone-600">Motif d&apos;annulation *</Label>
            <Textarea
              className="rounded-xl border-stone-200 bg-white font-medium mt-1"
              value={annulationMotif}
              onChange={(e) => setAnnulationMotif(e.target.value)}
              placeholder="Ex: Erreur de saisie de montant, paiement rejeté..."
            />
          </div>
          <div className="flex justify-end gap-2 pt-4 border-t border-stone-100">
            <Button variant="outline" className="rounded-xl border-stone-200 font-semibold" onClick={() => setAnnulationTarget(null)}>
              Annuler
            </Button>
            <Button
              variant="destructive"
              className="rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold"
              disabled={annulling || !annulationMotif.trim()}
              onClick={confirmAnnulation}
            >
              {annulling ? 'Traitement...' : 'Confirmer l\'annulation'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Modification du reçu ── */}
      <Dialog
        open={!!modificationTarget}
        onOpenChange={(open) => !open && !modifying && setModificationTarget(null)}
      >
        <DialogContent className="rounded-3xl border-stone-200 p-6 shadow-2xl max-w-md bg-white">
          <DialogHeader>
            <DialogTitle className="text-[#0c241f] font-extrabold text-lg flex items-center gap-2">
              <Pencil className="h-5 w-5 text-amber-600" />
              Modifier le reçu
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs font-semibold text-stone-600 mt-1">
            Reçu <b className="font-mono text-stone-900">{modificationTarget?.numeroRecu}</b>
          </p>
          <div className="space-y-4 pt-3">
            <div>
              <Label className="text-xs font-semibold text-stone-600">Motif *</Label>
              <Input className="rounded-xl border-stone-200 mt-1" value={modMotif} onChange={(e) => setModMotif(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-semibold text-stone-600">Montant *</Label>
                <Input type="number" min="0" step="0.01" className="rounded-xl border-stone-200 mt-1" value={modMontant} onChange={(e) => setModMontant(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs font-semibold text-stone-600">Devise *</Label>
                <Select value={modDevise} onValueChange={setModDevise}>
                  <SelectTrigger className="rounded-xl border-stone-200 mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent className="rounded-xl">
                    <SelectItem value="CDF">CDF</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="BIF">BIF</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-xs font-semibold text-stone-600">Mode de paiement *</Label>
              <Select value={modModePaiement} onValueChange={setModModePaiement}>
                <SelectTrigger className="rounded-xl border-stone-200 mt-1"><SelectValue placeholder="Choisir un mode" /></SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="ESPECES">Espèces</SelectItem>
                  <SelectItem value="CHEQUE">Chèque</SelectItem>
                  <SelectItem value="VIREMENT">Virement bancaire</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs font-semibold text-stone-600">Référence</Label>
              <Input className="rounded-xl border-stone-200 mt-1" value={modReferencePaiement} onChange={(e) => setModReferencePaiement(e.target.value)} placeholder="Obligatoire pour chèque ou virement" />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-4 mt-2 border-t border-stone-100">
            <Button variant="outline" className="rounded-xl border-stone-200 font-semibold" disabled={modifying} onClick={() => setModificationTarget(null)}>
              Fermer
            </Button>
            <Button className="rounded-xl bg-[#0c241f] hover:bg-[#071916] text-white font-bold" disabled={modifying} onClick={confirmModification}>
              {modifying ? 'Enregistrement...' : 'Enregistrer les modifications'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}