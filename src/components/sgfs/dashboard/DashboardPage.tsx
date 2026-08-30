'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { motion, type Variants } from 'framer-motion'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area, Legend,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Banknote, Users, TrendingUp, TrendingDown, AlertTriangle,
  CheckCircle, Clock, ArrowUpRight, School, Wallet,
  Plus, Receipt, ShieldCheck, Sparkles, Building2
} from 'lucide-react'
import { useAppStore, getSchoolFilter } from '@/lib/store'
import * as tc from '@/lib/tauri-commands'

/* ────────────────────────────────────────────────────────────────────────────
 * Types — ventilés par devise
 * ──────────────────────────────────────────────────────────────────────────*/

interface DeviseMontant {
  devise: string
  montant: number
  nombre: number
}

interface DetteDevise {
  devise: string
  totalDu: number
  totalPaye: number
  reste: number
  nombreEleves: number
  tauxRecouvrement: number
}

interface MoisDeviseMontant {
  mois: string
  devise: string
  montant: number
}

interface MotifDeviseMontant {
  motif: string
  devise: string
  montant: number
  nombre: number
}

interface ModeDeviseMontant {
  mode: string
  devise: string
  montant: number
  nombre: number
}

interface EcoleDeviseMontant {
  nom: string
  devise: string
  encaissements: number
  depenses: number
}

interface EleveRetard {
  eleve: { nom: string; prenom: string }
  matricule?: string | null
  dettes: DeviseMontant[]
}

interface DashboardData {
  encaissementsParDevise: DeviseMontant[]
  depensesParDevise: DeviseMontant[]
  beneficeParDevise: DeviseMontant[]
  detteParDevise: DetteDevise[]
  encaissementsParMois: MoisDeviseMontant[]
  repartitionParMotif: MotifDeviseMontant[]
  repartitionParMode: ModeDeviseMontant[]
  comparaisonEcoles: EcoleDeviseMontant[]
  nombreEleves: { total: number; parEcole: { nom: string; count: number }[] }
  elevesEnOrdre: number
  elevesEnRetard: number
  margeRetardMoyenne: number
  topElevesEnRetard: EleveRetard[]
  bonsPayeurs: { eleve: { nom: string; prenom: string }; matricule?: string | null }[]
  devises: string[]
}

/* ────────────────────────────────────────────────────────────────────────────
 * Palette de couleurs (inspirée du design de référence)
 * ──────────────────────────────────────────────────────────────────────────*/

const COLORS_MODE = ['#0c241f', '#d97706', '#124e3f', '#0284c7', '#7c3aed']
const COLORS_MOTIF = ['#0c241f', '#d97706', '#059669', '#0284c7', '#d97706', '#475569']

const COULEUR_DEVISE: Record<string, { badge: string; texte: string; barre: string }> = {
  CDF: { badge: 'bg-emerald-100 text-emerald-800 border-emerald-200', texte: 'text-emerald-700', barre: '#059669' },
  USD: { badge: 'bg-amber-100 text-amber-900 border-amber-200', texte: 'text-amber-800', barre: '#d97706' },
  BIF: { badge: 'bg-violet-100 text-violet-800 border-violet-200', texte: 'text-violet-700', barre: '#7c3aed' },
}

function couleurDevise(d: string) {
  return (
    COULEUR_DEVISE[d] ?? {
      badge: 'bg-stone-100 text-stone-700 border-stone-200',
      texte: 'text-stone-700',
      barre: '#0c241f',
    }
  )
}

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.08 } },
}

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' } },
}

/* ────────────────────────────────────────────────────────────────────────────
 * Helpers
 * ──────────────────────────────────────────────────────────────────────────*/

const LOCALES: Record<string, string> = { CDF: 'fr-CD', BIF: 'fr-BI', USD: 'en-US' }
const SANS_DECIMALES = ['CDF', 'BIF']

function formatCurrency(value: number | null | undefined, devise: string): string {
  const v = Number(value ?? 0)
  const sansDec = SANS_DECIMALES.includes(devise)
  const n = new Intl.NumberFormat(LOCALES[devise] ?? 'fr-FR', {
    minimumFractionDigits: sansDec ? 0 : 2,
    maximumFractionDigits: sansDec ? 0 : 2,
  }).format(v)
  return `${n} ${devise}`
}

function formatCompact(value: number): string {
  const abs = Math.abs(value)
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace('.0', '')} M`
  if (abs >= 1_000) return `${Math.round(value / 1_000)} k`
  return String(Math.round(value))
}

function formatNumber(value: number | null | undefined): string {
  return Number(value ?? 0).toLocaleString('fr-FR')
}

function formatMois(mois: string): string {
  const [a, m] = String(mois ?? '').split('-')
  const d = new Date(Number(a), Number(m) - 1, 1)
  return Number.isNaN(d.getTime())
    ? mois
    : d.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' })
}

/* ────────────────────────────────────────────────────────────────────────────
 * Sous-composants
 * ──────────────────────────────────────────────────────────────────────────*/

function DeviseBadge({ devise }: { devise: string }) {
  return (
    <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold border ${couleurDevise(devise).badge}`}>
      {devise}
    </span>
  )
}

function CarteDevise({
  devise,
  encaisse,
  depense,
  benefice,
  dette,
}: {
  devise: string
  encaisse?: DeviseMontant
  depense?: DeviseMontant
  benefice?: DeviseMontant
  dette?: DetteDevise
}) {
  const c = couleurDevise(devise)
  const benef = benefice?.montant ?? 0
  const pct = dette?.tauxRecouvrement ?? 0

  return (
    <Card className="overflow-hidden rounded-2xl border border-stone-200/80 bg-white shadow-sm hover:shadow-md transition-all duration-200">
      <div className="h-1.5" style={{ backgroundColor: c.barre }} />
      <CardContent className="space-y-4 p-5">
        <div className="flex items-center justify-between">
          <span className={`rounded-lg px-2.5 py-1 text-xs font-bold border ${c.badge}`}>{devise}</span>
          {dette ? (
            <span className="text-[11px] font-semibold text-stone-500 bg-stone-100 px-2 py-0.5 rounded-full">
              {Math.round(pct)}% recouvré
            </span>
          ) : null}
        </div>

        <div className="space-y-3">
          <div className="flex items-baseline justify-between gap-2">
            <span className="flex items-center gap-1.5 text-xs text-stone-500 font-medium">
              <Banknote className="h-4 w-4 text-emerald-600" /> Encaissé
            </span>
            <span className="text-base font-bold tabular-nums text-stone-900">
              {formatCurrency(encaisse?.montant ?? 0, devise)}
            </span>
          </div>

          <div className="flex items-baseline justify-between gap-2">
            <span className="flex items-center gap-1.5 text-xs text-stone-500 font-medium">
              <TrendingDown className="h-4 w-4 text-rose-500" /> Dépensé
            </span>
            <span className="text-base font-bold tabular-nums text-stone-900">
              {formatCurrency(depense?.montant ?? 0, devise)}
            </span>
          </div>

          <div className="flex items-baseline justify-between gap-2 border-t border-stone-100 pt-3">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-stone-700">
              <Wallet className="h-4 w-4 text-[#0c241f]" /> Solde Net
            </span>
            <span
              className={`text-lg font-bold tabular-nums ${
                benef >= 0 ? 'text-emerald-700' : 'text-rose-600'
              }`}
            >
              {formatCurrency(benef, devise)}
            </span>
          </div>
        </div>

        {dette ? (
          <div className="space-y-2 border-t border-stone-100 pt-3">
            <div className="flex items-baseline justify-between gap-2">
              <span className="flex items-center gap-1.5 text-xs text-stone-500 font-medium">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-600" /> Reste à percevoir
              </span>
              <span
                className={`text-sm font-bold tabular-nums ${
                  dette.reste > 0.009 ? 'text-amber-700' : 'text-emerald-700'
                }`}
              >
                {formatCurrency(dette.reste, devise)}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-stone-100">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${Math.min(100, pct)}%`,
                  backgroundColor: dette.reste > 0.009 ? '#d97706' : '#10b981',
                }}
              />
            </div>
            <div className="flex justify-between text-[11px] text-stone-400 font-medium">
              <span>
                {formatCurrency(dette.totalPaye, devise)} / {formatCurrency(dette.totalDu, devise)}
              </span>
              <span>
                {dette.nombreEleves > 0
                  ? `${dette.nombreEleves} élève${dette.nombreEleves > 1 ? 's' : ''}`
                  : 'soldé'}
              </span>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

function CircularProgress({
  value, size = 56, strokeWidth = 5, color = '#d97706',
}: {
  value: number
  size?: number
  strokeWidth?: number
  color?: string
}) {
  const pct = Math.min(100, Math.max(0, value))
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (pct / 100) * circumference
  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#f3f0ea" strokeWidth={strokeWidth} />
      <circle
        cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={color} strokeWidth={strokeWidth}
        strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round"
        className="transition-all duration-1000 ease-out"
      />
    </svg>
  )
}

function SkeletonCard() {
  return (
    <div className="animate-pulse rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
      <div className="mb-4 h-6 w-16 rounded-md bg-stone-200" />
      <div className="space-y-3">
        <div className="h-4 w-full rounded bg-stone-200" />
        <div className="h-4 w-4/5 rounded bg-stone-200" />
        <div className="h-4 w-3/5 rounded bg-stone-200" />
      </div>
    </div>
  )
}

function SkeletonChart() {
  return (
    <div className="animate-pulse rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
      <div className="mb-6 h-5 w-48 rounded bg-stone-200" />
      <div className="h-[300px] w-full rounded-xl bg-stone-100" />
    </div>
  )
}

/* ────────────────────────────────────────────────────────────────────────────
 * Page
 * ──────────────────────────────────────────────────────────────────────────*/

export default function DashboardPage() {
  const { user, currentEtablissement, setPage } = useAppStore()
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deviseActive, setDeviseActive] = useState<string>('')
  const [overdueSet, setOverdueSet] = useState<Set<string>>(new Set())

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      let etabId = useAppStore.getState().currentEtablissement?.id
      if (!etabId) {
        const sf = getSchoolFilter(user?.role || '', user?.etablissementId || null)
        if (sf) {
          etabId = sf
        } else {
          const res = await tc.listEtablissements()
          etabId = (res?.etablissements ?? [])[0]?.id
        }
      }
      if (!etabId) {
        setError('Aucun établissement sélectionné')
        return
      }

      let anneeId = useAppStore.getState().etabParams?.anneeScolaireId
      if (!anneeId) {
        const res = await tc.listAnneesScolaires(etabId)
        const list: any[] = res?.annees_scolaires ?? []
        anneeId = (list.find((a) => a.active) ?? list[0])?.id
      }
      if (!anneeId) {
        setError('Aucune année scolaire trouvée pour cet établissement')
        return
      }

      const result = await tc.getDashboardStats(etabId, anneeId)
      // Gérer différents formats de réponse Tauri
      const d = result?.data ?? result ?? null
      if (!d) {
        setError('Aucune donnée disponible')
        return
      }

      const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : [])
      
      // Helper pour extraire des données en gérant snake_case et camelCase
      const get = (obj: any, camel: string, snake: string) => obj?.[camel] ?? obj?.[snake]
      
      const clean: DashboardData = {
        encaissementsParDevise: arr<DeviseMontant>(get(d, 'encaissementsParDevise', 'encaissements_par_devise')),
        depensesParDevise: arr<DeviseMontant>(get(d, 'depensesParDevise', 'depenses_par_devise')),
        beneficeParDevise: arr<DeviseMontant>(get(d, 'beneficeParDevise', 'benefice_par_devise')),
        detteParDevise: arr<DetteDevise>(get(d, 'detteParDevise', 'dette_par_devise')),
        encaissementsParMois: arr<MoisDeviseMontant>(get(d, 'encaissementsParMois', 'encaissements_par_mois')),
        repartitionParMotif: arr<MotifDeviseMontant>(get(d, 'repartitionParMotif', 'repartition_par_motif')),
        repartitionParMode: arr<ModeDeviseMontant>(get(d, 'repartitionParMode', 'repartition_par_mode')),
        comparaisonEcoles: arr<EcoleDeviseMontant>(get(d, 'comparaisonEcoles', 'comparaison_ecoles')),
        nombreEleves: get(d, 'nombreEleves', 'nombre_eleves') ?? { total: 0, parEcole: [] },
        elevesEnOrdre: Number(get(d, 'elevesEnOrdre', 'eleves_en_ordre') ?? 0),
        elevesEnRetard: Number(get(d, 'elevesEnRetard', 'eleves_en_retard') ?? 0),
        margeRetardMoyenne: Number(get(d, 'margeRetardMoyenne', 'marge_retard_moyenne') ?? 0),
        topElevesEnRetard: arr<EleveRetard>(get(d, 'topElevesEnRetard', 'top_eleves_en_retard')),
        bonsPayeurs: arr<any>(get(d, 'bonsPayeurs', 'bons_payeurs')),
        devises: arr<string>(get(d, 'devises', 'devises')),
      }
      setData(clean)
      setDeviseActive((cur) => (cur && clean.devises.includes(cur) ? cur : clean.devises[0] ?? ''))
      // Récupérer la liste des élèves en retard pour vérifier l'état réel des bons payeurs
      try {
        const overdueRes = await tc.listEcheances({ etablissementId: etabId, anneeScolaireId: anneeId, statut: 'EN_RETARD', pageSize: 2000 })
        const rows: any[] = overdueRes?.data ?? []
        const s = new Set<string>()
        rows.forEach((r) => {
          if (r.eleveMatricule) {
            s.add(String(r.eleveMatricule))
          } else {
            const key = `${(r.elevePrenom || '').toString().toLowerCase()} ${(r.eleveNom || '').toString().toLowerCase()}`.trim()
            if (key) s.add(key)
          }
        })
        setOverdueSet(s)
      } catch (e) {
        // Ne bloque pas l'affichage du dashboard si l'appel échoue
        setOverdueSet(new Set())
      }
    } catch (err: any) {
      setError(err?.message || 'Erreur lors du chargement des données')
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Rafraîchir les statistiques après une synchronisation (auto ou manuelle) :
  // les paiements/dépenses/élèves reçus du cloud doivent apparaître sans
  // recharger la page.
  useEffect(() => {
    const handleSync = () => { fetchData() }
    window.addEventListener('sync-completed', handleSync)
    return () => window.removeEventListener('sync-completed', handleSync)
  }, [fetchData])

  const serieMois = useMemo(
    () =>
      (data?.encaissementsParMois ?? [])
        .filter((m) => m.devise === deviseActive)
        .map((m) => ({ mois: formatMois(m.mois), montant: m.montant })),
    [data, deviseActive],
  )

  const serieMode = useMemo(
    () =>
      (data?.repartitionParMode ?? [])
        .filter((m) => m.devise === deviseActive)
        .map((m) => ({ mode: m.mode, montant: m.montant })),
    [data, deviseActive],
  )

  const serieMotif = useMemo(
    () =>
      (data?.repartitionParMotif ?? [])
        .filter((m) => m.devise === deviseActive)
        .map((m) => ({ motif: m.motif, montant: m.montant })),
    [data, deviseActive],
  )

  const serieEcoles = useMemo(
    () => (data?.comparaisonEcoles ?? []).filter((e) => e.devise === deviseActive),
    [data, deviseActive],
  )

  const tauxGlobalRecouvrement = useMemo(() => {
    if (!data?.nombreEleves.total) return 0
    return (data.elevesEnOrdre / data.nombreEleves.total) * 100
  }, [data])

  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <div className="h-32 rounded-2xl bg-stone-200 animate-pulse" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2"><SkeletonChart /></div>
          <SkeletonChart />
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-32">
        <div className="rounded-2xl bg-rose-50 p-4 border border-rose-100">
          <AlertTriangle className="h-8 w-8 text-rose-500" />
        </div>
        <h3 className="text-lg font-bold text-stone-800">Erreur de chargement</h3>
        <p className="max-w-md text-center text-sm text-stone-500">
          {error || 'Aucune donnée disponible'}
        </p>
        <button
          onClick={fetchData}
          className="mt-2 inline-flex items-center gap-2 rounded-xl bg-[#0c241f] px-5 py-2.5 text-sm font-semibold text-white shadow-md transition-colors hover:bg-[#071916]"
        >
          <ArrowUpRight className="h-4 w-4" /> Réessayer
        </button>
      </div>
    )
  }

  const trouve = <T extends { devise: string }>(arr: T[], d: string) =>
    arr.find((x) => x.devise === d)

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-8 p-2 sm:p-4 md:p-6"
    >
      {/* ── HERO HEADER BANNER (couleur solide et texte 100% visible) ── */}
      <motion.div variants={itemVariants} className="relative rounded-3xl bg-[#0c241f] p-6 sm:p-8 text-white shadow-xl border border-emerald-900/40">
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-3 max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full bg-[#d97706]/20 px-3 py-1 text-xs font-bold text-amber-400 border border-amber-500/30">
               {currentEtablissement?.nom || 'Complexe Scolaire'}
            </div>
            <h1 className="text-2xl sm:text-xl lg:text-2xl font-extrabold tracking-tight text-white leading-tight">
              Aperçu Général & Performance Financière
            </h1>
            <p className="text-sm text-stone-300 leading-relaxed">
              Suivi en temps réel des encaissements, des dépenses et de la situation des élèves par établissement.
            </p>

            {/* Badges statistiques rapides intégrés dans la bannière */}
            <div className="pt-2 flex flex-wrap gap-3">
              <div className="flex items-center gap-2 rounded-xl bg-white/10 px-3.5 py-1.5 border border-white/10 text-xs font-semibold">
                <Users className="h-4 w-4 text-amber-400" />
                <span>{formatNumber(data.nombreEleves.total)} Élèves Inscrits</span>
              </div>
              <div className="flex items-center gap-2 rounded-xl bg-white/10 px-3.5 py-1.5 border border-white/10 text-xs font-semibold">
                <ShieldCheck className="h-4 w-4 text-emerald-400" />
                <span>{Math.round(tauxGlobalRecouvrement)}% Recouvré</span>
              </div>
              <div className="flex items-center gap-2 rounded-xl bg-white/10 px-3.5 py-1.5 border border-white/10 text-xs font-semibold">
                <Clock className="h-4 w-4 text-amber-300" />
                <span>{data.elevesEnRetard} Élèves en retard</span>
              </div>
            </div>
          </div>

          {/* Boutons d'action rapide dans le Hero Header */}
          <div className="flex flex-wrap lg:flex-col gap-3 shrink-0">
            <Button
              onClick={() => setPage('encaissements')}
              className="bg-[#d97706] hover:bg-[#b45309] text-white font-bold px-5 py-2.5 rounded-xl shadow-md transition-all gap-2 text-xs sm:text-sm"
            >
              <Receipt className="h-4 w-4" /> Nouvel Encaissement
            </Button>
            <Button
              onClick={() => setPage('eleves')}
              variant="outline"
              className="bg-white/10 hover:bg-white/20 text-white border-white/20 font-semibold px-5 py-2.5 rounded-xl transition-all gap-2 text-xs sm:text-sm"
            >
              <Users className="h-4 w-4 text-amber-300" /> Inscrire un Élève
            </Button>
          </div>
        </div>
      </motion.div>

      {/* ── CARTES FINANCIÈRES PAR DEVISE ── */}
      <motion.div variants={itemVariants} className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-stone-900 flex items-center gap-2">
            <Wallet className="h-5 w-5 text-amber-600" /> Situation Financière par Devise
          </h2>
          <span className="text-xs text-stone-500">Ventilation stricte sans conversion</span>
        </div>

        {data.devises.length === 0 ? (
          <Card className="rounded-2xl border-stone-200 bg-white shadow-sm">
            <CardContent className="p-12 text-center text-stone-400">
              Aucune opération enregistrée pour cette année scolaire.
            </CardContent>
          </Card>
        ) : (
          <div className={`grid grid-cols-1 gap-4 ${
            data.devises.length >= 3 ? 'md:grid-cols-2 xl:grid-cols-3' : 'md:grid-cols-2'
          }`}>
            {data.devises.map((d) => (
              <CarteDevise
                key={d}
                devise={d}
                encaisse={trouve(data.encaissementsParDevise, d)}
                depense={trouve(data.depensesParDevise, d)}
                benefice={trouve(data.beneficeParDevise, d)}
                dette={trouve(data.detteParDevise, d)}
              />
            ))}
          </div>
        )}
      </motion.div>

      {/* ── SÉLECTEUR DE DEVISE POUR GRAPHIQUES ── */}
      {data.devises.length > 1 && (
        <motion.div variants={itemVariants} className="flex items-center gap-3 bg-stone-100 p-2 rounded-xl w-fit border border-stone-200">
          <span className="text-xs font-semibold text-stone-600 pl-2">Afficher les graphiques en :</span>
          <div className="flex gap-1.5">
            {data.devises.map((d) => {
              const actif = d === deviseActive
              const c = couleurDevise(d)
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDeviseActive(d)}
                  className={`rounded-lg px-3 py-1 text-xs font-bold transition-all ${
                    actif ? 'bg-[#0c241f] text-amber-400 shadow-sm' : 'bg-white text-stone-600 hover:bg-stone-200'
                  }`}
                >
                  {d}
                </button>
              )
            })}
          </div>
        </motion.div>
      )}

      {/* ── ÉVOLUTION + MODES (Zone Graphiques Principale) ── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Évolution mensuelle (Area Chart avec gradient) */}
        <motion.div variants={itemVariants} className="lg:col-span-2">
          <Card className="rounded-2xl border-stone-200/80 bg-white py-5 shadow-sm">
            <CardHeader className="px-6 pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-base font-bold text-stone-900">
                  <TrendingUp className="h-5 w-5 text-emerald-600" /> Évolution des Recettes
                  {deviseActive && <DeviseBadge devise={deviseActive} />}
                </CardTitle>
                <span className="text-xs text-stone-400 font-medium">Flux mensuels</span>
              </div>
            </CardHeader>
            <CardContent className="px-6 pt-4">
              {serieMois.length === 0 ? (
                <p className="py-24 text-center text-sm text-stone-400">
                  Aucun encaissement en {deviseActive || '—'}.
                </p>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={serieMois} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorMontant" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#059669" stopOpacity={0.4}/>
                        <stop offset="95%" stopColor="#059669" stopOpacity={0.0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="mois" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                    <YAxis
                      tick={{ fontSize: 12, fill: '#64748b' }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={formatCompact}
                    />
                    <RechartsTooltip
                      formatter={(v: number) => formatCurrency(v, deviseActive)}
                      contentStyle={{ borderRadius: 12, fontSize: 13, borderColor: '#e2e8f0', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)' }}
                    />
                    <Area
                      type="monotone"
                      dataKey="montant"
                      name="Encaissements"
                      stroke="#059669"
                      strokeWidth={3}
                      fillOpacity={1}
                      fill="url(#colorMontant)"
                      dot={{ r: 4, strokeWidth: 2, fill: '#ffffff', stroke: '#059669' }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Répartition par mode de paiement (Pie/Donut Chart) */}
        <motion.div variants={itemVariants}>
          <Card className="rounded-2xl border-stone-200/80 bg-white py-5 shadow-sm">
            <CardHeader className="px-6 pb-2">
              <CardTitle className="flex items-center gap-2 text-base font-bold text-stone-900">
                <Wallet className="h-5 w-5 text-amber-600" /> Modes de Paiement
                {deviseActive && <DeviseBadge devise={deviseActive} />}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-6 pt-4">
              {serieMode.length === 0 ? (
                <p className="py-24 text-center text-sm text-stone-400">Aucune donnée disponible.</p>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={serieMode} cx="50%" cy="45%"
                      innerRadius={60} outerRadius={90} paddingAngle={4}
                      dataKey="montant" nameKey="mode"
                    >
                      {serieMode.map((_, i) => (
                        <Cell key={i} fill={COLORS_MODE[i % COLORS_MODE.length]} />
                      ))}
                    </Pie>
                    <RechartsTooltip formatter={(v: number) => formatCurrency(v, deviseActive)} />
                    <Legend verticalAlign="bottom" iconType="circle" iconSize={8} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* ── COMPARAISON ÉCOLES & MOTIFS ── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <motion.div variants={itemVariants}>
          <Card className="rounded-2xl border-stone-200/80 bg-white py-5 shadow-sm">
            <CardHeader className="px-6 pb-2">
              <CardTitle className="flex items-center gap-2 text-base font-bold text-stone-900">
                <School className="h-5 w-5 text-[#0c241f]" /> Comparaison Écoles
                {deviseActive && <DeviseBadge devise={deviseActive} />}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-6 pt-4">
              {serieEcoles.length === 0 ? (
                <p className="py-24 text-center text-sm text-stone-400">Aucune donnée.</p>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={serieEcoles} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis
                      dataKey="nom" tick={{ fontSize: 11, fill: '#64748b' }}
                      interval={0} angle={-15} textAnchor="end" height={60}
                    />
                    <YAxis tick={{ fontSize: 12, fill: '#64748b' }} tickFormatter={formatCompact} />
                    <RechartsTooltip formatter={(v: number) => formatCurrency(v, deviseActive)} />
                    <Legend />
                    <Bar dataKey="encaissements" name="Encaissements" fill="#059669" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="depenses" name="Dépenses" fill="#e11d48" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </motion.div>

        <motion.div variants={itemVariants}>
          <Card className="rounded-2xl border-stone-200/80 bg-white py-5 shadow-sm">
            <CardHeader className="px-6 pb-2">
              <CardTitle className="flex items-center gap-2 text-base font-bold text-stone-900">
                <TrendingUp className="h-5 w-5 text-amber-600" /> Répartition par Type de Frais
                {deviseActive && <DeviseBadge devise={deviseActive} />}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-6 pt-4">
              {serieMotif.length === 0 ? (
                <p className="py-24 text-center text-sm text-stone-400">Aucune donnée.</p>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={serieMotif} cx="50%" cy="45%"
                      innerRadius={60} outerRadius={90} paddingAngle={4}
                      dataKey="montant" nameKey="motif"
                    >
                      {serieMotif.map((_, i) => (
                        <Cell key={i} fill={COLORS_MOTIF[i % COLORS_MOTIF.length]} />
                      ))}
                    </Pie>
                    <RechartsTooltip formatter={(v: number) => formatCurrency(v, deviseActive)} />
                    <Legend verticalAlign="bottom" iconType="circle" iconSize={8} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* ── SUIVI DES ÉLÈVES (Retards & Bons Payeurs) ── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <motion.div variants={itemVariants}>
          <Card className="rounded-2xl border-stone-200/80 bg-white py-5 shadow-sm">
            <CardHeader className="px-6 pb-2">
              <CardTitle className="flex items-center gap-2 text-base font-bold text-stone-900">
                <AlertTriangle className="h-5 w-5 text-rose-500" /> Élèves en Retard
              </CardTitle>
            </CardHeader>
            <CardContent className="px-6 pt-3">
              {data.topElevesEnRetard.length === 0 ? (
                <p className="py-8 text-center text-sm text-stone-400">Aucun élève en retard.</p>
              ) : (
                <div className="space-y-3">
                  {data.topElevesEnRetard.slice(0, 6).map((item, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between gap-3 p-3 rounded-xl border border-stone-100 bg-stone-50/50 hover:bg-stone-50 transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-stone-800 break-words">
                          {item.eleve?.prenom} {item.eleve?.nom}
                        </p>
                        {item.matricule && (
                          <p className="text-[11px] text-stone-400 font-medium">{item.matricule}</p>
                        )}
                      </div>
                      <div className="shrink-0 space-y-0.5 text-right">
                        {item.dettes.map((d) => (
                          <div
                            key={d.devise}
                            className="whitespace-nowrap text-sm font-bold tabular-nums text-rose-600"
                          >
                            {formatCurrency(d.montant, d.devise)}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        <motion.div variants={itemVariants}>
          <Card className="rounded-2xl border-stone-200/80 bg-white py-5 shadow-sm">
            <CardHeader className="px-6 pb-2">
              <CardTitle className="flex items-center gap-2 text-base font-bold text-stone-900">
                <CheckCircle className="h-5 w-5 text-emerald-600" /> Élèves en Ordre (Bons Payeurs)
              </CardTitle>
            </CardHeader>
            <CardContent className="px-6 pt-3">
              {data.bonsPayeurs.length === 0 ? (
                <p className="py-8 text-center text-sm text-stone-400">Aucun élève à jour.</p>
              ) : (
                <div className="space-y-3">
                  {data.bonsPayeurs.slice(0, 6).map((item, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-3 rounded-xl border border-emerald-100 bg-emerald-50/40 p-3"
                    >
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 border border-emerald-200">
                        <CheckCircle className="h-4 w-4 text-emerald-700" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-stone-800">
                          {item.eleve?.prenom} {item.eleve?.nom}
                        </p>
                        {item.matricule && (
                          <p className="text-[11px] text-stone-400 font-medium">{item.matricule}</p>
                        )}
                      </div>
                      {
                        (() => {
                          const ident = (item.matricule || `${item.eleve?.prenom || ''} ${item.eleve?.nom || ''}`).toString().toLowerCase().trim()
                          const isOverdue = ident ? overdueSet.has(ident) : false
                          return isOverdue ? (
                            <Badge className="border-0 bg-rose-100 text-rose-700 font-semibold">En retard</Badge>
                          ) : (
                            <Badge className="border-0 bg-emerald-100 text-emerald-800 font-semibold">À jour</Badge>
                          )
                        })()
                      }
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* ── KPI COMPTEURS D'EFFECTIFS ── */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card className="rounded-2xl border-stone-200/80 bg-white py-5 shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="flex items-center gap-4 px-6">
            <div className="rounded-2xl bg-[#0c241f]/10 p-3.5 border border-[#0c241f]/20">
              <Users className="h-6 w-6 text-[#0c241f]" />
            </div>
            <div>
              <p className="text-2xl font-extrabold text-stone-900">{formatNumber(data.nombreEleves.total)}</p>
              <p className="text-xs font-semibold text-stone-500">Total Élèves</p>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-stone-200/80 bg-white py-5 shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="flex items-center gap-4 px-6">
            <div className="relative flex h-12 w-12 shrink-0 items-center justify-center">
              <CircularProgress value={tauxGlobalRecouvrement} size={48} strokeWidth={5} />
              <span className="absolute text-[10px] font-extrabold text-amber-700">
                {Math.round(tauxGlobalRecouvrement)}%
              </span>
            </div>
            <div>
              <p className="text-2xl font-extrabold text-stone-900">{formatNumber(data.elevesEnOrdre)}</p>
              <p className="text-xs font-semibold text-stone-500">Élèves en Ordre</p>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-stone-200/80 bg-white py-5 shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="flex items-center gap-4 px-6">
            <div className="rounded-2xl bg-amber-500/10 p-3.5 border border-amber-500/20">
              <AlertTriangle className="h-6 w-6 text-amber-600" />
            </div>
            <div>
              <p className="text-2xl font-extrabold text-stone-900">{formatNumber(data.elevesEnRetard)}</p>
              <p className="text-xs font-semibold text-stone-500">Élèves en Retard</p>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-stone-200/80 bg-white py-5 shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="flex items-center gap-4 px-6">
            <div className="rounded-2xl bg-emerald-500/10 p-3.5 border border-emerald-500/20">
              <Clock className="h-6 w-6 text-emerald-600" />
            </div>
            <div>
              <p className="text-2xl font-extrabold text-stone-900">
                {Math.round(data.margeRetardMoyenne)} Jours
              </p>
              <p className="text-xs font-semibold text-stone-500">Retard Moyen</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </motion.div>
  )
}