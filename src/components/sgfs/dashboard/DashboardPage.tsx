'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { motion, type Variants } from 'framer-motion'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, Legend,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Banknote, Users, TrendingUp, TrendingDown, AlertTriangle,
  CheckCircle, Clock, ArrowUpRight, School, Wallet,
} from 'lucide-react'
import { useAppStore, getSchoolFilter } from '@/lib/store'
import * as tc from '@/lib/tauri-commands'

/* ────────────────────────────────────────────────────────────────────────────
 * Types — tout est ventilé par devise, aucune conversion
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
 * Constantes
 * ──────────────────────────────────────────────────────────────────────────*/

const COLORS_MODE = ['#075e54', '#25d366', '#128c7e', '#34b7f1']
const COLORS_MOTIF = ['#075e54', '#25d366', '#128c7e', '#34b7f1', '#ffc107', '#f97316']

/** Une couleur par devise, pour la distinguer d'un coup d'œil. */
const COULEUR_DEVISE: Record<string, { badge: string; texte: string; barre: string }> = {
  CDF: { badge: 'bg-emerald-100 text-emerald-800', texte: 'text-emerald-700', barre: '#25d366' },
  USD: { badge: 'bg-sky-100 text-sky-800', texte: 'text-sky-700', barre: '#0284c7' },
  BIF: { badge: 'bg-violet-100 text-violet-800', texte: 'text-violet-700', barre: '#7c3aed' },
}

function couleurDevise(d: string) {
  return (
    COULEUR_DEVISE[d] ?? {
      badge: 'bg-slate-100 text-slate-700',
      texte: 'text-slate-700',
      barre: '#64748b',
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

/**
 * Montant + code devise, format homogène quelle que soit la devise.
 *
 * On n'utilise pas `style: 'currency'` : Intl produit « 20 000 FC » pour CDF
 * et « $180.00 » pour USD — symbole tantôt suffixe, tantôt préfixe. Associé
 * à un badge, cela donnait « CDF20 000 FC ». Ici le code suit toujours le
 * nombre, et le badge devient inutile.
 */
function formatCurrency(value: number | null | undefined, devise: string): string {
  const v = Number(value ?? 0)
  const sansDec = SANS_DECIMALES.includes(devise)
  const n = new Intl.NumberFormat(LOCALES[devise] ?? 'fr-FR', {
    minimumFractionDigits: sansDec ? 0 : 2,
    maximumFractionDigits: sansDec ? 0 : 2,
  }).format(v)
  return `${n} ${devise}`
}

/** Axes des graphiques : « 1,2 M » au lieu de « 1 200 000 ». */
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
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${couleurDevise(devise).badge}`}>
      {devise}
    </span>
  )
}

/**
 * Bloc de montants pour une devise donnée.
 * Aucun total inter-devises : chaque colonne est autonome.
 */
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
    <Card className="overflow-hidden rounded-xl border-gray-100 bg-white shadow-sm">
      <div className="h-1" style={{ backgroundColor: c.barre }} />
      <CardContent className="space-y-4 p-5">
        <div className="flex items-center justify-between">
          <span className={`rounded-md px-2 py-1 text-xs font-bold ${c.badge}`}>{devise}</span>
          {dette ? (
            <span className="text-[11px] text-gray-400">
              {Math.round(pct)} % recouvré
            </span>
          ) : null}
        </div>

        <div className="space-y-2.5">
          <div className="flex items-baseline justify-between gap-2">
            <span className="flex items-center gap-1.5 text-xs text-gray-500">
              <Banknote className="h-3.5 w-3.5 text-emerald-600" /> Encaissé
            </span>
            <span className="text-base font-bold tabular-nums text-gray-900">
              {formatCurrency(encaisse?.montant ?? 0, devise)}
            </span>
          </div>

          <div className="flex items-baseline justify-between gap-2">
            <span className="flex items-center gap-1.5 text-xs text-gray-500">
              <TrendingDown className="h-3.5 w-3.5 text-red-500" /> Dépensé
            </span>
            <span className="text-base font-bold tabular-nums text-gray-900">
              {formatCurrency(depense?.montant ?? 0, devise)}
            </span>
          </div>

          <div className="flex items-baseline justify-between gap-2 border-t border-gray-100 pt-2.5">
            <span className="flex items-center gap-1.5 text-xs font-medium text-gray-600">
              <Wallet className="h-3.5 w-3.5 text-teal-600" /> Solde
            </span>
            <span
              className={`text-lg font-bold tabular-nums ${
                benef >= 0 ? 'text-emerald-600' : 'text-red-600'
              }`}
            >
              {formatCurrency(benef, devise)}
            </span>
          </div>
        </div>

        {dette ? (
          <div className="space-y-1.5 border-t border-gray-100 pt-3">
            <div className="flex items-baseline justify-between gap-2">
              <span className="flex items-center gap-1.5 text-xs text-gray-500">
                <AlertTriangle className="h-3.5 w-3.5 text-orange-500" /> Reste à percevoir
              </span>
              <span
                className={`text-base font-bold tabular-nums ${
                  dette.reste > 0.009 ? 'text-orange-600' : 'text-emerald-600'
                }`}
              >
                {formatCurrency(dette.reste, devise)}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-gray-100">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${Math.min(100, pct)}%`,
                  backgroundColor: dette.reste > 0.009 ? '#fb923c' : '#10b981',
                }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-gray-400">
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
  value, size = 64, strokeWidth = 6, color = '#25d366',
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
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#e5e7eb" strokeWidth={strokeWidth} />
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
    <div className="animate-pulse rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
      <div className="mb-4 h-6 w-16 rounded bg-gray-200" />
      <div className="space-y-3">
        <div className="h-4 w-full rounded bg-gray-200" />
        <div className="h-4 w-4/5 rounded bg-gray-200" />
        <div className="h-4 w-3/5 rounded bg-gray-200" />
      </div>
    </div>
  )
}

function SkeletonChart() {
  return (
    <div className="animate-pulse rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
      <div className="mb-6 h-5 w-48 rounded bg-gray-200" />
      <div className="h-[300px] w-full rounded bg-gray-100" />
    </div>
  )
}

/* ────────────────────────────────────────────────────────────────────────────
 * Page
 * ──────────────────────────────────────────────────────────────────────────*/

export default function DashboardPage() {
  const { user } = useAppStore()
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  /** Devise sélectionnée pour les graphiques : un graphe = une devise. */
  const [deviseActive, setDeviseActive] = useState<string>('')

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
      const d = result?.data
      if (!d) {
        setError('Aucune donnée disponible')
        return
      }

      const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : [])
      const clean: DashboardData = {
        encaissementsParDevise: arr<DeviseMontant>(d.encaissementsParDevise),
        depensesParDevise: arr<DeviseMontant>(d.depensesParDevise),
        beneficeParDevise: arr<DeviseMontant>(d.beneficeParDevise),
        detteParDevise: arr<DetteDevise>(d.detteParDevise),
        encaissementsParMois: arr<MoisDeviseMontant>(d.encaissementsParMois),
        repartitionParMotif: arr<MotifDeviseMontant>(d.repartitionParMotif),
        repartitionParMode: arr<ModeDeviseMontant>(d.repartitionParMode),
        comparaisonEcoles: arr<EcoleDeviseMontant>(d.comparaisonEcoles),
        nombreEleves: d.nombreEleves ?? { total: 0, parEcole: [] },
        elevesEnOrdre: Number(d.elevesEnOrdre ?? 0),
        elevesEnRetard: Number(d.elevesEnRetard ?? 0),
        margeRetardMoyenne: Number(d.margeRetardMoyenne ?? 0),
        topElevesEnRetard: arr<EleveRetard>(d.topElevesEnRetard),
        bonsPayeurs: arr<any>(d.bonsPayeurs),
        devises: arr<string>(d.devises),
      }
      setData(clean)
      setDeviseActive((cur) => (cur && clean.devises.includes(cur) ? cur : clean.devises[0] ?? ''))
    } catch (err: any) {
      setError(err?.message || 'Erreur lors du chargement des données')
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  /* ── Séries filtrées sur la devise active ───────────────────────────
   * Un graphique ne peut afficher qu'une seule devise à la fois :
   * mélanger 150 000 CDF et 50 USD sur le même axe n'a aucun sens.
   * ─────────────────────────────────────────────────────────────────*/
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

  /* ── Chargement ─────────────────────────────────────────────────────── */
  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <div>
          <div className="mb-1 h-7 w-64 animate-pulse rounded bg-gray-200" />
          <div className="h-4 w-96 animate-pulse rounded bg-gray-200" />
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2"><SkeletonChart /></div>
          <SkeletonChart />
        </div>
      </div>
    )
  }

  /* ── Erreur ─────────────────────────────────────────────────────────── */
  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-32">
        <div className="rounded-full bg-red-50 p-4">
          <AlertTriangle className="h-8 w-8 text-red-500" />
        </div>
        <h3 className="text-lg font-semibold text-gray-800">Erreur de chargement</h3>
        <p className="max-w-md text-center text-sm text-gray-500">
          {error || 'Aucune donnée disponible'}
        </p>
        <button
          onClick={fetchData}
          className="mt-2 inline-flex items-center gap-2 rounded-lg bg-[var(--etab-color,#075e54)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--etab-color-hover,#064e46)]"
        >
          <ArrowUpRight className="h-4 w-4" /> Réessayer
        </button>
      </div>
    )
  }

  const trouve = <T extends { devise: string }>(arr: T[], d: string) =>
    arr.find((x) => x.devise === d)

  /* ── Rendu ──────────────────────────────────────────────────────────── */
  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-6 p-6"
    >
      <motion.div variants={itemVariants}>
        <h1 className="text-2xl font-bold text-gray-900">Tableau de bord</h1>
        <p className="mt-1 text-sm text-gray-500">
          Chaque devise est présentée séparément — aucun montant n'est converti.
        </p>
      </motion.div>

      {/* ── Une carte par devise ───────────────────────────────────── */}
      {data.devises.length === 0 ? (
        <motion.div variants={itemVariants}>
          <Card className="rounded-xl border-gray-100 bg-white shadow-sm">
            <CardContent className="p-12 text-center text-gray-400">
              Aucune opération enregistrée pour cette année scolaire.
            </CardContent>
          </Card>
        </motion.div>
      ) : (
        <motion.div
          variants={itemVariants}
          className={`grid grid-cols-1 gap-4 ${
            data.devises.length >= 3 ? 'md:grid-cols-2 xl:grid-cols-3' : 'md:grid-cols-2'
          }`}
        >
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
        </motion.div>
      )}

      {/* ── Sélecteur de devise pour les graphiques ────────────────── */}
      {data.devises.length > 1 && (
        <motion.div variants={itemVariants} className="flex items-center gap-2">
          <span className="text-xs text-gray-500">Graphiques affichés en</span>
          <div className="flex gap-1.5">
            {data.devises.map((d) => {
              const actif = d === deviseActive
              const c = couleurDevise(d)
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDeviseActive(d)}
                  className={`rounded-md px-2.5 py-1 text-xs font-bold transition-all ${
                    actif ? c.badge + ' ring-2 ring-offset-1' : 'bg-gray-100 text-gray-400'
                  }`}
                  style={actif ? { boxShadow: `0 0 0 2px ${c.barre}33` } : undefined}
                >
                  {d}
                </button>
              )
            })}
          </div>
        </motion.div>
      )}

      {/* ── Évolution + modes ──────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <motion.div variants={itemVariants} className="lg:col-span-2">
          <Card className="rounded-xl border-gray-100 bg-white py-5 shadow-sm">
            <CardHeader className="px-5 pb-0">
              <CardTitle className="flex items-center gap-2 text-base font-semibold text-gray-800">
                <TrendingUp className="h-4 w-4 text-[#25d366]" /> Évolution des encaissements
                {deviseActive && <DeviseBadge devise={deviseActive} />}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-5">
              {serieMois.length === 0 ? (
                <p className="py-24 text-center text-sm text-gray-400">
                  Aucun encaissement en {deviseActive || '—'}.
                </p>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={serieMois} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="mois" tick={{ fontSize: 12, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                    <YAxis
                      tick={{ fontSize: 12, fill: '#6b7280' }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={formatCompact}
                    />
                    <RechartsTooltip
                      formatter={(v: number) => formatCurrency(v, deviseActive)}
                      contentStyle={{ borderRadius: 8, fontSize: 13 }}
                    />
                    <Line
                      type="monotone" dataKey="montant" name="Encaissements"
                      stroke={couleurDevise(deviseActive).barre} strokeWidth={3}
                      dot={{ r: 5, strokeWidth: 2, stroke: '#fff' }}
                      activeDot={{ r: 7 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </motion.div>

        <motion.div variants={itemVariants}>
          <Card className="rounded-xl border-gray-100 bg-white py-5 shadow-sm">
            <CardHeader className="px-5 pb-0">
              <CardTitle className="flex items-center gap-2 text-base font-semibold text-gray-800">
                <Wallet className="h-4 w-4 text-[var(--etab-color,#075e54)]" /> Modes de paiement
                {deviseActive && <DeviseBadge devise={deviseActive} />}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-5">
              {serieMode.length === 0 ? (
                <p className="py-24 text-center text-sm text-gray-400">Aucune donnée.</p>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={serieMode} cx="50%" cy="45%"
                      innerRadius={55} outerRadius={85} paddingAngle={3}
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

      {/* ── Écoles + motifs ────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <motion.div variants={itemVariants}>
          <Card className="rounded-xl border-gray-100 bg-white py-5 shadow-sm">
            <CardHeader className="px-5 pb-0">
              <CardTitle className="flex items-center gap-2 text-base font-semibold text-gray-800">
                <School className="h-4 w-4 text-[var(--etab-color,#075e54)]" /> Comparaison écoles
                {deviseActive && <DeviseBadge devise={deviseActive} />}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-5">
              {serieEcoles.length === 0 ? (
                <p className="py-24 text-center text-sm text-gray-400">Aucune donnée.</p>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={serieEcoles} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis
                      dataKey="nom" tick={{ fontSize: 11, fill: '#6b7280' }}
                      interval={0} angle={-15} textAnchor="end" height={60}
                    />
                    <YAxis tick={{ fontSize: 12, fill: '#6b7280' }} tickFormatter={formatCompact} />
                    <RechartsTooltip formatter={(v: number) => formatCurrency(v, deviseActive)} />
                    <Legend />
                    <Bar dataKey="encaissements" name="Encaissements" fill="#25d366" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="depenses" name="Dépenses" fill="#ef4444" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </motion.div>

        <motion.div variants={itemVariants}>
          <Card className="rounded-xl border-gray-100 bg-white py-5 shadow-sm">
            <CardHeader className="px-5 pb-0">
              <CardTitle className="flex items-center gap-2 text-base font-semibold text-gray-800">
                <TrendingUp className="h-4 w-4 text-[#128c7e]" /> Répartition par frais
                {deviseActive && <DeviseBadge devise={deviseActive} />}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-5">
              {serieMotif.length === 0 ? (
                <p className="py-24 text-center text-sm text-gray-400">Aucune donnée.</p>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={serieMotif} cx="50%" cy="45%"
                      innerRadius={55} outerRadius={85} paddingAngle={3}
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

      {/* ── Tableaux ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <motion.div variants={itemVariants}>
          <Card className="rounded-xl border-gray-100 bg-white py-5 shadow-sm">
            <CardHeader className="px-5 pb-0">
              <CardTitle className="flex items-center gap-2 text-base font-semibold text-gray-800">
                <AlertTriangle className="h-4 w-4 text-red-500" /> Top élèves en retard
              </CardTitle>
            </CardHeader>
            <CardContent className="px-5">
              {data.topElevesEnRetard.length === 0 ? (
                <p className="py-8 text-center text-sm text-gray-400">Aucun élève en retard.</p>
              ) : (
                <div className="space-y-2">
                  {data.topElevesEnRetard.slice(0, 6).map((item, i) => (
                    <div
                      key={i}
                      className="flex items-start justify-between gap-3 border-b border-gray-50 pb-2 last:border-0 last:pb-0"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-gray-800">
                          {item.eleve?.prenom} {item.eleve?.nom}
                        </p>
                        {item.matricule && (
                          <p className="text-[10px] text-gray-400">{item.matricule}</p>
                        )}
                      </div>
                      {/* Une ligne par devise, jamais de total mélangé.
                          Le montant porte déjà son symbole : pas de badge
                          en plus, qui donnait « CDF20 000 FC ». */}
                      <div className="shrink-0 space-y-1 text-right">
                        {item.dettes.map((d) => (
                          <div
                            key={d.devise}
                            className="whitespace-nowrap text-sm font-semibold tabular-nums text-red-600"
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
          <Card className="rounded-xl border-gray-100 bg-white py-5 shadow-sm">
            <CardHeader className="px-5 pb-0">
              <CardTitle className="flex items-center gap-2 text-base font-semibold text-gray-800">
                <CheckCircle className="h-4 w-4 text-emerald-500" /> Bons payeurs
              </CardTitle>
            </CardHeader>
            <CardContent className="px-5">
              {data.bonsPayeurs.length === 0 ? (
                <p className="py-8 text-center text-sm text-gray-400">Aucun élève à jour.</p>
              ) : (
                <div className="space-y-2.5">
                  {data.bonsPayeurs.slice(0, 6).map((item, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-3 rounded-lg border border-emerald-100 bg-emerald-50/50 px-4 py-2.5"
                    >
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100">
                        <CheckCircle className="h-4 w-4 text-emerald-600" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {item.eleve?.prenom} {item.eleve?.nom}
                        </p>
                        {item.matricule && (
                          <p className="mt-0.5 text-[10px] text-gray-400">{item.matricule}</p>
                        )}
                      </div>
                      <Badge className="border-0 bg-emerald-100 text-emerald-700">À jour</Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* ── Effectifs : sans devise ────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card className="rounded-xl border-gray-100 bg-white py-5 shadow-sm">
          <CardContent className="flex items-center gap-3 px-5">
            <div className="rounded-full bg-[var(--etab-color,#075e54)]/10 p-3">
              <Users className="h-5 w-5 text-[var(--etab-color,#075e54)]" />
            </div>
            <div>
              <p className="text-xl font-bold">{formatNumber(data.nombreEleves.total)}</p>
              <p className="text-xs text-gray-500">Nombre d'élèves</p>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-xl border-gray-100 bg-white py-5 shadow-sm">
          <CardContent className="flex items-center gap-3 px-5">
            <div className="relative flex h-11 w-11 shrink-0 items-center justify-center">
              <CircularProgress value={tauxGlobalRecouvrement} size={44} strokeWidth={4} />
              <span className="absolute text-[9px] font-bold text-emerald-700">
                {Math.round(tauxGlobalRecouvrement)}%
              </span>
            </div>
            <div>
              <p className="text-xl font-bold">{formatNumber(data.elevesEnOrdre)}</p>
              <p className="text-xs text-gray-500">Élèves en ordre</p>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-xl border-gray-100 bg-white py-5 shadow-sm">
          <CardContent className="flex items-center gap-3 px-5">
            <div className="rounded-full bg-orange-50 p-3">
              <AlertTriangle className="h-5 w-5 text-orange-500" />
            </div>
            <div>
              <p className="text-xl font-bold">{formatNumber(data.elevesEnRetard)}</p>
              <p className="text-xs text-gray-500">Élèves en retard</p>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-xl border-gray-100 bg-white py-5 shadow-sm">
          <CardContent className="flex items-center gap-3 px-5">
            <div className="rounded-full bg-amber-50 p-3">
              <Clock className="h-5 w-5 text-amber-500" />
            </div>
            <div>
              <p className="text-xl font-bold">
                {Math.round(data.margeRetardMoyenne)} jour
                {Math.round(data.margeRetardMoyenne) > 1 ? 's' : ''}
              </p>
              <p className="text-xs text-gray-500">Retard moyen</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </motion.div>
  )
}
