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
import { AlertCircle, CheckCircle2, Receipt, Search, X } from 'lucide-react'
import { toast } from 'sonner'
import { ReceiptPOS } from './ReceiptPOS'

/* ────────────────────────────────────────────────────────────────────────────
 * Constantes & helpers
 * ──────────────────────────────────────────────────────────────────────────*/

/** Devises sans décimales à l'affichage. */
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

  /* ── Situation du compte, calculée côté page ─────────────────────────── */
  totalDu?: number | null
  totalPaye?: number | null
  reste?: number | null
  detailReste?: string | null
  prochaineEcheance?: string | null
  /** Situation ventilée par devise (prime sur les champs scalaires). */
  totaux?: { devise: string; totalDu: number; totalPaye: number; reste: number }[]
  /** Devise des montants de situation — distincte de celle du versement. */
  deviseSituation?: string | null
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

  /** Année scolaire active : requise par `createPaiement`, affichée sur le reçu. */
  const [annee, setAnnee] = useState<{ id: string; libelle: string } | null>(null)

  // Formulaire d'encaissement
  const [studentSearch, setStudentSearch] = useState('')
  const [selectedStudent, setSelectedStudent] = useState<Eleve | null>(null)
  const [echeances, setEcheances] = useState<Echeance[]>([])
  const [selectedEcheance, setSelectedEcheance] = useState<Echeance | null>(null)
  const [loadingEcheances, setLoadingEcheances] = useState(false)

  const [motif, setMotif] = useState('')
  const [montant, setMontant] = useState('')
  const [devise, setDevise] = useState('CDF')
  const [modePaiement, setModePaiement] = useState('')
  const [referencePaiement, setReferencePaiement] = useState('')
  const [tauxChange, setTauxChange] = useState(2500)
  const [submitting, setSubmitting] = useState(false)

  // Historique
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

  // Dialogues
  const [receipt, setReceipt] = useState<Encaissement | null>(null)
  const [annulationTarget, setAnnulationTarget] = useState<Encaissement | null>(null)
  const [annulationMotif, setAnnulationMotif] = useState('')
  const [annulling, setAnnulling] = useState(false)

  /* ── Chargements ────────────────────────────────────────────────────── */

  const fetchEtablissements = useCallback(async () => {
    try {
      const res = await tc.listEtablissements()
      setEtablissements(res?.etablissements ?? [])
    } catch {
      /* silencieux : les filtres restent utilisables */
    }
  }, [])

  const fetchTaux = useCallback(async () => {
    try {
      const res = await tc.getParametres(locked ? schoolFilter! : '')
      const data = res?.data ?? res
      const taux = Number(data?.tauxChangeUsdCdf ?? data?.tauxChangeUsdBif ?? 0)
      if (taux > 0) setTauxChange(taux)
    } catch {
      /* on garde la valeur par défaut */
    }
  }, [locked, schoolFilter])

  /**
   * Charge l'année active. Un coordonnateur non verrouillé n'a pas de
   * `schoolFilter` : l'année est alors résolue depuis l'élève sélectionné.
   */
  const fetchAnnee = useCallback(async (etablissementId?: string) => {
    const etabId = etablissementId || schoolFilter || undefined
    if (!etabId) return
    try {
      const res = await tc.listAnneesScolaires(etabId)
      const list: any[] = Array.isArray(res?.annees_scolaires) ? res.annees_scolaires : []
      const active = list.find((a) => a.active) ?? list[0]
      if (active) setAnnee({ id: active.id, libelle: active.libelle })
    } catch {
      /* le reçu s'imprimera sans l'année */
    }
  }, [schoolFilter])

  const fetchStudents = useCallback(async () => {
    try {
      const etabId = schoolFilter || undefined
      const res = await tc.listEleves({ etablissementId: etabId, pageSize: 100 })
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

  useEffect(() => {
    if (!user) return
    fetchEtablissements()
    fetchTaux()
    fetchAnnee()
    fetchStudents()
  }, [user, fetchEtablissements, fetchTaux, fetchAnnee, fetchStudents])

  const fetchHistory = useCallback(
    async (requestedPage = page) => {
      setHistoryLoading(true)
      try {
        const etabId = schoolFilter || histEtablissementId || undefined
        const res = await tc.listPaiements({
          etablissementId: etabId,
          dateFrom: histDateDebut || undefined,
          dateTo: histDateFin || undefined,
          page: requestedPage,
          pageSize,
        })
        const all = res?.paiements ?? res?.data ?? []
        let filtered = Array.isArray(all) ? all : []

        if (histSearch.trim()) {
          const q = histSearch.toLowerCase()
          filtered = filtered.filter((p: any) =>
            `${p.eleveNom ?? ''} ${p.eleveMatricule ?? ''} ${p.motif ?? ''}`
              .toLowerCase()
              .includes(q),
          )
        }
        if (histMode) {
          filtered = filtered.filter((p: any) => p.modePaiement === histMode)
        }

        const total = Math.max(1, Math.ceil(filtered.length / pageSize))
        const start = (requestedPage - 1) * pageSize
        setEncaissements(filtered.slice(start, start + pageSize))
        setTotalPages(total)
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

  /* ── Sélection élève / échéance ─────────────────────────────────────── */

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
    // L'élève peut relever d'un autre établissement que celui par défaut.
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
      // ⚠️ On garde TOUTES les échéances : le total exigible du reçu en dépend.
      // Le filtrage se fait à l'affichage (`echeancesImpayees`).
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

  /** Échéances encore dues, seules affichées dans le tableau. */
  const echeancesImpayees = useMemo(
    () => echeances.filter((e) => e.statut !== 'PAYE' && e.montantRestant > 0),
    [echeances],
  )

  /** Montant réellement imputé à l'échéance, après conversion éventuelle. */
  const montantImpute = useMemo(() => {
    if (!selectedEcheance || !montant) return null
    const value = Number(montant)
    if (!Number.isFinite(value)) return null
    if (devise === selectedEcheance.devise) return value
    return devise === 'USD' ? value * tauxChange : value / tauxChange
  }, [montant, devise, selectedEcheance, tauxChange])

  /**
   * Situation du compte APRÈS le versement en cours.
   * `echeances` reflète l'état d'avant : on retranche le montant imputé.
   */
  function situationApresPaiement(impute: number) {
    // ── Ventilation par devise : additionner CDF et USD n'a aucun sens ──
    const parDevise = new Map<string, { totalDu: number; totalPaye: number; reste: number }>()
    for (const e of echeances) {
      const dev = (e.devise || 'CDF').toUpperCase()
      const acc = parDevise.get(dev) ?? { totalDu: 0, totalPaye: 0, reste: 0 }
      // Le versement en cours ne s'impute que sur SA devise
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

    // Scalaires de compatibilité : devise dominante, jamais une somme
    // inter-devises. Un consommateur qui ignore `totaux` verra un montant
    // partiel mais correct, plutôt qu'un total faux.
    const principal =
      totaux.length > 0 ? totaux.reduce((a, b) => (b.reste > a.reste ? b : a)) : null

    return {
      totaux,
      // La dette peut être en CDF alors que le versement est en USD.
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

  /* ── Encaissement ───────────────────────────────────────────────────── */

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
      const res = await tc.createPaiement({
        eleveId: selectedStudent.id,
        echeanceId: selectedEcheance.id,
        etablissementId: selectedStudent.etablissementId,
        anneeScolaireId: annee?.id,
        userId: user.id,
        motif,
        montant: value,
        devise,
        modePaiement,
        referencePaiement: referencePaiement || undefined,
        tauxChange: devise !== selectedEcheance.devise ? tauxChange : undefined,
        montantAffecte: value,
        deviseEcheance: selectedEcheance.devise,
      })
      const paiement = res?.data ?? res

      // ⚠️ Calculé AVANT clearStudent(), qui vide `echeances`.
      const impute = montantImpute ?? value
      const situation = situationApresPaiement(impute)

      setReceipt({
        ...paiement,
        // Le backend ne renvoie pas toujours ces champs : on complète.
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

      toast.success('Encaissement enregistré')
      clearStudent()
      setModePaiement('')
      setReferencePaiement('')
      setPage(1)
      fetchHistory(1)
    } catch (e: any) {
      toast.error(e?.message || 'Erreur encaissement')
    } finally {
      setSubmitting(false)
    }
  }

  /**
   * Réimpression depuis l'historique : le paiement stocké ne porte pas la
   * situation du compte. On la recharge pour que le bloc reste présent.
   */
  async function ouvrirRecu(e: Encaissement) {
    // Affichage immédiat, complété ensuite par la situation du compte.
    setReceipt(e)
    if (!e.eleveMatricule) return
    try {
      const res = await tc.listEcheances({ search: e.eleveMatricule, pageSize: 1 })
      const row = res?.data?.[0]
      if (!row) return
      // ⚠️ `row.totalDu` / `row.reste` sont des scalaires : ils additionnent
      // les devises. On transmet `row.totaux`, qui est ventilé — sans quoi le
      // reçu affiche « 20 180 USD » pour 20 000 CDF + 180 USD.
      let totaux = Array.isArray(row.totaux) ? row.totaux : []
      // Repli : backend pas encore recompilé → on reconstruit depuis `lignes`.
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
      // ⚠️ `row.totalDu` / `row.reste` viennent d'un SUM() SQL qui additionne
      // les devises. On ne les utilise QUE si une seule devise est en jeu ;
      // sinon on prend la devise dont le reste est le plus élevé, avec SES
      // montants — jamais un total hybride.
      const principal =
        totaux.length > 0
          ? totaux.reduce((a, b) => (b.reste > a.reste ? b : a))
          : null
      setReceipt((cur) =>
        cur && cur.id === e.id
          ? {
              ...cur,
              totaux,
              // `devise` reste celle du versement ; la situation a la sienne.
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
      /* le reçu reste affiché sans le bloc situation */
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

  /* ── Dérivés ────────────────────────────────────────────────────────── */

  const suggestions = useMemo(() => {
    const q = studentSearch.trim().toLowerCase()
    if (!q || selectedStudent) return []
    return students
      .filter((s) =>
        `${s.matricule} ${s.nom} ${s.prenom} ${s.classe}`.toLowerCase().includes(q),
      )
      .slice(0, 8)
  }, [students, studentSearch, selectedStudent])

  const etablissementRecu = etablissements.find((e) => e.id === receipt?.etablissementId)

  const besoinReference = modePaiement === 'CHEQUE' || modePaiement === 'VIREMENT'

  /* ── Rendu ──────────────────────────────────────────────────────────── */

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Receipt className="h-7 w-7" />
          Encaissements
        </h1>
        <p className="text-sm text-muted-foreground">
          Gérez les paiements et les reçus des élèves.
        </p>
      </div>

      <Tabs defaultValue="nouveau">
        <TabsList>
          <TabsTrigger value="nouveau">Nouvel encaissement</TabsTrigger>
          <TabsTrigger value="historique">Historique des reçus</TabsTrigger>
        </TabsList>

        {/* ── Nouvel encaissement ───────────────────────────────────── */}
        <TabsContent value="nouveau" className="mt-4 grid gap-4 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Recherche de l'élève</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="relative">
                  <Input
                    value={studentSearch}
                    onChange={(e) => {
                      setStudentSearch(e.target.value)
                      if (selectedStudent) clearStudent()
                    }}
                    placeholder="Nom, prénom, matricule ou classe..."
                  />
                  {suggestions.length > 0 && (
                    <div className="absolute z-10 mt-1 w-full rounded-md border bg-popover shadow-lg">
                      {suggestions.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          className="block w-full px-3 py-2 text-left text-sm hover:bg-muted"
                          onClick={() => selectStudent(s)}
                        >
                          <b>{s.matricule}</b> — {s.nom} {s.prenom}
                          <span className="float-right text-muted-foreground">{s.classe}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {selectedStudent && (
                  <div className="mt-4 flex items-center justify-between rounded-md border bg-muted/30 p-3 text-sm">
                    <div>
                      <b>
                        {selectedStudent.nom} {selectedStudent.prenom}
                      </b>
                      <span className="mx-2">•</span>
                      {selectedStudent.matricule}
                      <span className="mx-2">•</span>
                      {selectedStudent.classe}
                    </div>
                    <Button variant="ghost" size="icon" onClick={clearStudent}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {selectedStudent && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Échéances en attente</CardTitle>
                </CardHeader>
                <CardContent>
                  {loadingEcheances ? (
                    <p className="py-6 text-center text-sm text-muted-foreground">Chargement...</p>
                  ) : echeancesImpayees.length === 0 ? (
                    <p className="py-6 text-center text-sm text-muted-foreground">
                      Aucune échéance impayée.
                    </p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Frais</TableHead>
                          <TableHead>Échéance</TableHead>
                          <TableHead className="text-right">Payé</TableHead>
                          <TableHead className="text-right">Reste</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {echeancesImpayees.map((e) => (
                          <TableRow
                            key={e.id}
                            onClick={() => selectEcheance(e)}
                            className={`cursor-pointer ${
                              selectedEcheance?.id === e.id ? 'bg-primary/10' : ''
                            }`}
                          >
                            <TableCell>
                              <b>{e.fraisDesignation}</b>
                              <br />
                              <span className="text-xs text-muted-foreground">{e.statut}</span>
                            </TableCell>
                            <TableCell>{formatDate(e.dateEcheance)}</TableCell>
                            <TableCell className="text-right">
                              {formatMoney(e.montantPaye, e.devise)}
                            </TableCell>
                            <TableCell className="text-right font-semibold text-orange-600">
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
          <Card className="h-fit">
            <CardHeader>
              <CardTitle className="text-base">Détails du paiement</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Motif</Label>
                <Input
                  value={motif}
                  disabled={!selectedEcheance}
                  onChange={(e) => setMotif(e.target.value)}
                />
              </div>

              <div>
                <Label>Montant remis</Label>
                <Input
                  type="number"
                  min="0"
                  step={WHOLE_CURRENCIES.includes(devise) ? '1' : '0.01'}
                  value={montant}
                  disabled={!selectedEcheance}
                  onChange={(e) => setMontant(e.target.value)}
                />
              </div>

              <div>
                <Label>Devise reçue</Label>
                <Select value={devise} onValueChange={setDevise} disabled={!selectedEcheance}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CDF">CDF (FC)</SelectItem>
                    <SelectItem value="USD">USD ($)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {selectedEcheance && devise !== selectedEcheance.devise && (
                <div className="rounded border bg-muted p-2 text-xs">
                  Taux : 1 USD = {tauxChange.toLocaleString('fr-CD')} CDF
                  <br />
                  Montant imputé à l'échéance :{' '}
                  <b>
                    {montantImpute !== null
                      ? formatMoney(montantImpute, selectedEcheance.devise)
                      : '—'}
                  </b>
                </div>
              )}

              <div>
                <Label>Mode de paiement</Label>
                <Select
                  value={modePaiement}
                  onValueChange={setModePaiement}
                  disabled={!selectedEcheance}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Sélectionner" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ESPECES">Espèces</SelectItem>
                    <SelectItem value="CHEQUE">Chèque</SelectItem>
                    <SelectItem value="VIREMENT">Virement</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {besoinReference && (
                <div>
                  <Label>Référence *</Label>
                  <Input
                    value={referencePaiement}
                    onChange={(e) => setReferencePaiement(e.target.value)}
                  />
                </div>
              )}

              {selectedEcheance && (
                <div className="rounded border bg-primary/5 p-3 text-sm">
                  Reste de l'échéance :{' '}
                  <b>{formatMoney(selectedEcheance.montantRestant, selectedEcheance.devise)}</b>
                </div>
              )}

              <Button
                className="w-full"
                disabled={
                  !selectedEcheance ||
                  !modePaiement ||
                  !montant ||
                  submitting ||
                  (besoinReference && !referencePaiement.trim())
                }
                onClick={submitPayment}
              >
                {submitting ? 'Enregistrement...' : 'Encaisser'}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Historique ────────────────────────────────────────────── */}
        <TabsContent value="historique" className="mt-4 space-y-3">
          <Card>
            <CardContent className="grid grid-cols-1 gap-3 pt-6 md:grid-cols-2 xl:grid-cols-3">
              <Input
                placeholder="Élève ou matricule"
                value={histSearch}
                onChange={(e) => setHistSearch(e.target.value)}
              />
              <Input
                type="date"
                value={histDateDebut}
                onChange={(e) => setHistDateDebut(e.target.value)}
              />
              <Input
                type="date"
                value={histDateFin}
                onChange={(e) => setHistDateFin(e.target.value)}
              />

              <Select value={histMode || 'all'} onValueChange={(v) => setHistMode(v === 'all' ? '' : v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les modes</SelectItem>
                  <SelectItem value="ESPECES">Espèces</SelectItem>
                  <SelectItem value="CHEQUE">Chèque</SelectItem>
                  <SelectItem value="VIREMENT">Virement</SelectItem>
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
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tous établissements</SelectItem>
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
                  className="min-w-[120px] flex-1"
                  onClick={() => {
                    setPage(1)
                    fetchHistory(1)
                  }}
                >
                  <Search className="mr-1 h-4 w-4" />
                  Rechercher
                </Button>
                <Button
                  variant="outline"
                  className="min-w-[120px] flex-1"
                  onClick={() => {
                    setHistSearch('')
                    setHistDateDebut('')
                    setHistDateFin('')
                    setHistMode('')
                    setHistEtablissementId('')
                    setPage(1)
                  }}
                >
                  Effacer
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0">
              {historyLoading ? (
                <p className="p-12 text-center text-sm text-muted-foreground">Chargement...</p>
              ) : encaissements.length === 0 ? (
                <p className="p-12 text-center text-sm text-muted-foreground">
                  Aucun encaissement trouvé.
                </p>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Reçu</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead>Élève</TableHead>
                          <TableHead>Motif</TableHead>
                          <TableHead className="text-right">Montant</TableHead>
                          <TableHead>Statut</TableHead>
                          <TableHead />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {encaissements.map((e) => (
                          <TableRow
                            key={e.id}
                            className={e.statut === 'ANNULE' ? 'bg-red-50 opacity-70' : ''}
                          >
                            <TableCell className="font-mono text-xs">{e.numeroRecu}</TableCell>
                            <TableCell>{formatDate(e.dateEncaissement)}</TableCell>
                            <TableCell>
                              <b>{e.eleveNom}</b>
                              <br />
                              <span className="text-xs text-muted-foreground">{e.eleveClasse}</span>
                            </TableCell>
                            <TableCell>{e.motif}</TableCell>
                            <TableCell className="text-right font-semibold">
                              {formatMoney(e.montant, e.devise)}
                            </TableCell>
                            <TableCell>
                              {e.statut === 'ANNULE' ? (
                                <Badge variant="destructive">Annulé</Badge>
                              ) : (
                                <Badge className="bg-green-600">
                                  <CheckCircle2 className="mr-1 h-3 w-3" />
                                  Payé
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              <Button
                                size="sm"
                                variant="ghost"
                                title="Voir le reçu"
                                onClick={() => ouvrirRecu(e)}
                              >
                                <Receipt className="h-4 w-4" />
                              </Button>
                              {e.statut !== 'ANNULE' && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="text-red-600"
                                  title="Annuler le reçu"
                                  onClick={() => {
                                    setAnnulationTarget(e)
                                    setAnnulationMotif('')
                                  }}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  <div className="flex items-center justify-between border-t p-3 text-sm">
                    <span>
                      Page {page} sur {totalPages}
                    </span>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={page <= 1}
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                      >
                        Précédent
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
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

      {/* ── Reçu ──────────────────────────────────────────────────────── */}
      <Dialog open={!!receipt} onOpenChange={(open) => !open && setReceipt(null)}>
        <DialogContent className="w-[calc(80mm+2rem)] max-w-[calc(100vw-2rem)] overflow-hidden p-0 sm:max-w-[calc(80mm+2rem)]">
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
              }}
              onClose={() => setReceipt(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* ── Annulation ────────────────────────────────────────────────── */}
      <Dialog
        open={!!annulationTarget}
        onOpenChange={(open) => !open && setAnnulationTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-red-600">
              <AlertCircle className="mr-2 inline h-5 w-5" />
              Annuler le reçu
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm">
            Le reçu <b>{annulationTarget?.numeroRecu}</b> sera annulé et l'échéance sera
            recalculée.
          </p>
          <div>
            <Label>Motif d'annulation *</Label>
            <Textarea
              value={annulationMotif}
              onChange={(e) => setAnnulationMotif(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setAnnulationTarget(null)}>
              Fermer
            </Button>
            <Button
              variant="destructive"
              disabled={annulling || !annulationMotif.trim()}
              onClick={confirmAnnulation}
            >
              {annulling ? 'Annulation...' : 'Confirmer'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
