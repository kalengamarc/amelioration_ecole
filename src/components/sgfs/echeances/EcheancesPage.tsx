'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAppStore, getSchoolFilter } from '@/lib/store'
import * as tc from '@/lib/tauri-commands'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle,
  Download,
  Clock,
  Printer,
  RefreshCw,
  Search,
  Send,
  TrendingDown,
  UserRound,
  X,
} from 'lucide-react'

/* ────────────────────────────────────────────────────────────────────────────
 * Types
 * ──────────────────────────────────────────────────────────────────────────*/

type School = { id: string; nom: string }
type Year = { id: string; libelle: string; active?: boolean }
type Classe = { id: string; nom: string }

interface Echeance {
  eleveId: string
  eleveNom: string
  elevePrenom: string
  eleveMatricule: string
  classeNom: string
  totalDu: number
  totalPaye: number
  reste: number
  statut: string
  dateEcheance?: string | null
  retardJours?: number | null
  devise?: string | null
  motif?: string | null
  nbEcheances?: number | null
  lignes?: LigneFrais[] | null
  totaux?: TotalDevise[] | null
  tuteurNom?: string | null
  tuteurTelephone?: string | null
  tuteurLien?: string | null
}

interface TotalDevise {
  devise: string
  totalDu: number
  totalPaye: number
  reste: number
}

interface LigneFrais {
  libelle: string
  devise: string
  montantDu: number
  montantPaye: number
  reste: number
  dateEcheance?: string | null
  etat: 'PAYE' | 'PARTIEL' | 'DU'
}

type StatKey = 'PAYE' | 'PARTIELLEMENT_PAYE' | 'EN_RETARD' | 'EN_ATTENTE'

/* ────────────────────────────────────────────────────────────────────────────
 * Constantes
 * ──────────────────────────────────────────────────────────────────────────*/

const PAGE_SIZE = 20
const PRINT_FRAME_ID = '__relance_print_frame__'
const DEVISE_DEFAUT = 'CDF'

const ETAB_NOM = 'Complexe Scolaire Le Bon Berger'
const ETAB_SITE = 'Dav/Kahinda'
const ETAB_SIGNATURE = "L'Administration\nCS Le Bon Berger (Kahinda/DAV)"
const ETAB_SOUS_TITRE = 'Kahinda / DAV — Service Comptabilité'
const ETAB_TELEPHONE = '+243 000 000 000'
const ETAB_LIEU_PAIEMENT = "Secrétariat de l'établissement."
const ETAB_HORAIRES = 'du lundi au vendredi, 08h00 – 15h00'
const ETAB_MODES_PAIEMENT = 'espèces, chèque, virement bancaire'
const SEP = '━━━━━━━━━━━━━━━━━━━━'

const STATUS_LABEL: Record<string, string> = {
  PAYE: 'Payé',
  PARTIELLEMENT_PAYE: 'Partiellement payé',
  EN_RETARD: 'En retard',
  EN_ATTENTE: 'En attente',
}

const STATUS_BADGE: Record<string, string> = {
  PAYE: 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200',
  PARTIELLEMENT_PAYE: 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-700 dark:bg-amber-900/40 dark:text-amber-200',
  EN_RETARD: 'border-red-300 bg-red-50 text-red-800 dark:border-red-700 dark:bg-red-900/40 dark:text-red-200',
  EN_ATTENTE: 'border-slate-300 bg-slate-50 text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200',
}

const STATUS_DOT: Record<string, string> = {
  PAYE: 'bg-emerald-500',
  PARTIELLEMENT_PAYE: 'bg-amber-500',
  EN_RETARD: 'bg-red-500',
  EN_ATTENTE: 'bg-slate-400',
}

const SUMMARY_CARDS: {
  key: StatKey
  label: string
  icon: typeof CheckCircle
  bubble: string
  value: string
  ring: string
}[] = [
  {
    key: 'PAYE',
    label: 'Payés',
    icon: CheckCircle,
    bubble: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
    value: 'text-emerald-700 dark:text-emerald-300',
    ring: 'ring-emerald-500',
  },
  {
    key: 'PARTIELLEMENT_PAYE',
    label: 'Partiellement payés',
    icon: Clock,
    bubble: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    value: 'text-amber-700 dark:text-amber-300',
    ring: 'ring-amber-500',
  },
  {
    key: 'EN_RETARD',
    label: 'En retard',
    icon: AlertTriangle,
    bubble: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
    value: 'text-red-700 dark:text-red-300',
    ring: 'ring-red-500',
  },
  {
    key: 'EN_ATTENTE',
    label: 'En attente',
    icon: TrendingDown,
    bubble: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
    value: 'text-slate-700 dark:text-slate-200',
    ring: 'ring-slate-400',
  },
]

/* ────────────────────────────────────────────────────────────────────────────
 * Helpers
 * ──────────────────────────────────────────────────────────────────────────*/

const LOCALES: Record<string, string> = { CDF: 'fr-CD', BIF: 'fr-BI', USD: 'en-US' }
const SANS_DECIMALES = ['CDF', 'BIF']

function money(n: number | null | undefined, devise?: string | null): string {
  const d = (devise || DEVISE_DEFAUT).toUpperCase()
  const v = Number(n ?? 0)
  const sansDec = SANS_DECIMALES.includes(d)
  const s = new Intl.NumberFormat(LOCALES[d] ?? 'fr-FR', {
    minimumFractionDigits: sansDec ? 0 : 2,
    maximumFractionDigits: sansDec ? 0 : 2,
  }).format(v)
  return `${s} ${d}`
}

function moneyMulti(totaux: TotalDevise[] | null | undefined, champ: keyof TotalDevise): string {
  const l = (totaux ?? []).filter((t) => Math.abs(Number(t[champ])) > 0.009)
  if (l.length === 0) return money(0)
  return l.map((t) => money(Number(t[champ]), t.devise)).join(' + ')
}

function formatDate(iso?: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('fr-FR')
}

function getRetard(e: Echeance): number {
  if (typeof e.retardJours === 'number') return e.retardJours
  if (!e.dateEcheance) return 0
  const d = new Date(e.dateEcheance)
  if (Number.isNaN(d.getTime())) return 0
  const diff = Math.floor((Date.now() - d.getTime()) / 86_400_000)
  return diff > 0 ? diff : 0
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  )
}

function joursRetard(iso?: string | null): number {
  if (!iso) return 0
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 0
  const j = Math.floor((Date.now() - d.getTime()) / 86_400_000)
  return j > 0 ? j : 0
}

function splitLignes(e: Echeance) {
  const l = e.lignes ?? []
  return {
    dus: l.filter((x) => x.etat === 'DU'),
    partiels: l.filter((x) => x.etat === 'PARTIEL'),
    payes: l.filter((x) => x.etat === 'PAYE'),
    hasDetail: l.length > 0,
  }
}

function errMessage(e: unknown, fallback: string): string {
  if (typeof e === 'string') return e
  const err = e as { message?: string; error?: string } | undefined
  return err?.message || err?.error || fallback
}

/* ────────────────────────────────────────────────────────────────────────────
 * Sous-composants
 * ──────────────────────────────────────────────────────────────────────────*/

function ProgressBar({ value, total }: { value: number; total: number }) {
  const pct = total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0
  const bar =
    pct >= 100
      ? 'bg-emerald-500'
      : pct >= 60
        ? 'bg-lime-500'
        : pct >= 25
          ? 'bg-amber-500'
          : pct > 0
            ? 'bg-orange-500'
            : 'bg-slate-300 dark:bg-slate-600'
  const txt =
    pct >= 100
      ? 'text-emerald-700 dark:text-emerald-300'
      : pct > 0
        ? 'text-slate-700 dark:text-slate-200'
        : 'text-slate-400'

  return (
    <div className="flex items-center gap-2">
      <div
        className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={`h-full rounded-full transition-all duration-500 ${bar}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={`w-10 shrink-0 text-right text-xs font-semibold tabular-nums ${txt}`}>
        {pct}%
      </span>
    </div>
  )
}

async function openExternal(url: string) {
  try {
    const w = window as any
    const plugin = w.__TAURI__?.opener ?? w.__TAURI__?.shell
    if (plugin?.openUrl) return await plugin.openUrl(url)
    if (plugin?.open) return await plugin.open(url)
    const opened = window.open(url, '_blank', 'noopener,noreferrer')
    if (!opened) {
      await navigator.clipboard?.writeText(url)
      toast.info('Lien copié dans le presse-papiers', { description: url })
    }
  } catch {
    toast.error("Impossible d'ouvrir WhatsApp.")
  }
}

/* ────────────────────────────────────────────────────────────────────────────
 * Page
 * ──────────────────────────────────────────────────────────────────────────*/

export default function EcheancesPage() {
  const { user } = useAppStore()
  const role = user?.role ?? ''
  const userEtabId = user?.etablissementId ?? null
  const schoolFilter = useMemo(() => getSchoolFilter(role, userEtabId), [role, userEtabId])
  const locked = !!schoolFilter

  const [school, setSchool] = useState(schoolFilter ?? '')
  const [year, setYear] = useState('')
  const [classe, setClasse] = useState('')
  const [statut, setStatut] = useState('')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  const [schools, setSchools] = useState<School[]>([])
  const [years, setYears] = useState<Year[]>([])
  const [classes, setClasses] = useState<Classe[]>([])

  const [rows, setRows] = useState<Echeance[]>([])
  const [stats, setStats] = useState<Record<StatKey, number>>({
    PAYE: 0,
    PARTIELLEMENT_PAYE: 0,
    EN_RETARD: 0,
    EN_ATTENTE: 0,
  })
  const [total, setTotal] = useState(0)
  const [resteGlobal, setResteGlobal] = useState(0)
  const [resteParDevise, setResteParDevise] = useState<TotalDevise[]>([])
  const [schemaInfo, setSchemaInfo] = useState<{
    hasEcheances: boolean
    hasClasseTargeting: boolean
    hasTuteurs: boolean
  } | null>(null)
  const [totalPages, setTotalPages] = useState(1)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)

  const [selectedId, setSelectedId] = useState<string | null>(null)

  const yearAutoPicked = useRef(false)

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300)
    return () => clearTimeout(t)
  }, [search])

  const loadSchools = useCallback(async () => {
    try {
      const res = await tc.listEtablissements(locked ? schoolFilter! : undefined)
      const data = res?.etablissements ?? []
      setSchools(Array.isArray(data) ? data : [])
      if (locked) setSchool(schoolFilter!)
    } catch {
      /* silencieux */
    }
  }, [locked, schoolFilter])

  const loadYears = useCallback(async () => {
    const etabId = locked ? schoolFilter! : school || undefined
    if (!etabId) {
      setYears([])
      return
    }
    try {
      const res = await tc.listAnneesScolaires(etabId)
      const data: Year[] = Array.isArray(res?.annees_scolaires) ? res.annees_scolaires : []
      setYears(data)
      if (data.length > 0 && !yearAutoPicked.current) {
        yearAutoPicked.current = true
        setYear(data.find((y) => y.active)?.id ?? data[0].id)
      }
    } catch {
      setYears([])
    }
  }, [school, locked, schoolFilter])

  const loadClasses = useCallback(async () => {
    const etabId = locked ? schoolFilter! : school || undefined
    if (!etabId) {
      setClasses([])
      return
    }
    try {
      const res = await tc.listClasses(etabId, year || undefined)
      const data = res?.classes ?? []
      setClasses(Array.isArray(data) ? data : [])
    } catch {
      setClasses([])
    }
  }, [school, year, locked, schoolFilter])

  const loadEcheances = useCallback(async () => {
    if (!user) return
    setLoading(true)
    try {
      const res = await tc.listEcheances({
        etablissementId: locked ? schoolFilter! : school || undefined,
        anneeScolaireId: year || undefined,
        classeId: classe || undefined,
        statut: statut || undefined,
        search: debouncedSearch || undefined,
        page,
        pageSize: PAGE_SIZE,
      })
      setRows(Array.isArray(res?.data) ? res.data : [])
      setStats(
        res?.stats ?? { PAYE: 0, PARTIELLEMENT_PAYE: 0, EN_RETARD: 0, EN_ATTENTE: 0 },
      )
      setTotal(res?.pagination?.total ?? 0)
      setResteGlobal(res?.resteGlobal ?? 0)
      setResteParDevise(
        Array.isArray(res?.resteGlobalParDevise) ? res.resteGlobalParDevise : [],
      )
      setSchemaInfo(res?.schema ?? null)
      setTotalPages(res?.pagination?.totalPages ?? 1)
    } catch (e) {
      toast.error(errMessage(e, 'Erreur de chargement'))
      setRows([])
      setTotal(0)
      setResteGlobal(0)
      setResteParDevise([])
      setTotalPages(1)
    } finally {
      setLoading(false)
    }
  }, [user, locked, schoolFilter, school, year, classe, statut, debouncedSearch, page])

  useEffect(() => { if (user) loadSchools() }, [user, loadSchools])
  useEffect(() => { loadYears() }, [loadYears])
  useEffect(() => { loadClasses() }, [loadClasses])
  useEffect(() => { loadEcheances() }, [loadEcheances])
  useEffect(() => { setPage(1) }, [school, year, classe, statut, debouncedSearch])

  const selected = useMemo(
    () => (selectedId ? (rows.find((r) => r.eleveId === selectedId) ?? null) : null),
    [rows, selectedId],
  )

  const currentPage = Math.min(page, totalPages)
  const summary = stats
  const totalReste = resteGlobal
  const hasFilters = Boolean(debouncedSearch || statut || classe || (!locked && school) || year)

  function resetFilters() {
    setSearch('')
    setStatut('')
    setClasse('')
    if (!locked) {
      setSchool('')
      setYear('')
      yearAutoPicked.current = false
    }
  }

  function buildRelanceHtml(e: Echeance): string {
    const retard = getRetard(e)
    return `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <title>Relance ${escapeHtml(e.elevePrenom)} ${escapeHtml(e.eleveNom)}</title>
    <style>
      * { box-sizing: border-box; }
      @page { size: A4; margin: 18mm; }
      body {
        font-family: "Segoe UI", Arial, Helvetica, sans-serif;
        color: #111827; margin: 0; padding: 0; font-size: 13px; line-height: 1.5;
      }
      .sheet { max-width: 174mm; margin: 0 auto; }
      .header {
        border-bottom: 3px solid #075e54; padding-bottom: 14px; margin-bottom: 22px;
        display: flex; justify-content: space-between; align-items: flex-end;
      }
      .header h1 { margin: 0; font-size: 22px; color: #075e54; letter-spacing: -0.3px; }
      .header .sub { margin: 4px 0 0; color: #6b7280; font-size: 12px; }
      .header .ref { text-align: right; font-size: 11px; color: #6b7280; }
      .tag {
        display: inline-block; padding: 3px 10px; border-radius: 999px;
        font-size: 11px; font-weight: 700; letter-spacing: .3px;
        border: 1px solid currentColor;
      }
      .tag.retard { color: #b91c1c; background: #fef2f2; }
      .tag.attente { color: #92400e; background: #fffbeb; }
      .lien { font-weight: 400; color: #6b7280; font-size: 12px; }
      .muted { font-weight: 400; color: #9ca3af; font-style: italic; }
      .dest {
        border-left: 3px solid #075e54; background: #f0fdf4;
        padding: 10px 14px; margin-bottom: 20px; border-radius: 0 6px 6px 0;
      }
      .dest-lbl { font-size: 10px; text-transform: uppercase; letter-spacing: .6px; color: #6b7280; }
      .dest-name { font-size: 15px; font-weight: 700; color: #064e46; margin-top: 2px; }
      .dest-sub { font-size: 11px; color: #6b7280; margin-top: 1px; }
      table.detail { width: 100%; border-collapse: collapse; margin-bottom: 14px; font-size: 11px; }
      table.detail th {
        background: #075e54; color: #fff; padding: 6px 8px; text-align: left;
        font-size: 9.5px; text-transform: uppercase; letter-spacing: .4px;
      }
      table.detail th.n, table.detail td.n { text-align: right; }
      table.detail th.st, table.detail td.st { text-align: center; width: 66px; }
      table.detail td { padding: 6px 8px; border-bottom: 1px solid #e5e7eb; }
      table.detail td.strong { font-weight: 700; }
      table.detail tr.ok td { color: #6b7280; }
      table.detail tr.du td.strong { color: #b91c1c; }
      table.detail tr.part td.strong { color: #b45309; }
      .pill { display: inline-block; padding: 1px 7px; border-radius: 99px; font-size: 9px; font-weight: 700; }
      .pill.ok { background: #dcfce7; color: #166534; }
      .pill.part { background: #fef3c7; color: #92400e; }
      .pill.du { background: #fee2e2; color: #991b1b; }
      .pay-box { border: 1px solid #d1d5db; border-radius: 6px; padding: 10px 14px;
                 margin-bottom: 16px; background: #f9fafb; break-inside: avoid; }
      .pay-box h3 { font-size: 9.5px; text-transform: uppercase; letter-spacing: .6px;
                    color: #075e54; margin: 0 0 6px; font-weight: 800; }
      .pay-box ul { list-style: none; margin: 0; padding: 0; font-size: 11px; color: #374151; }
      .pay-box li { padding: 2px 0 2px 13px; position: relative; }
      .pay-box li:before { content: '▸'; position: absolute; left: 0; color: #075e54; }
      table.info { width: 100%; border-collapse: collapse; margin-bottom: 22px; }
      table.info td { padding: 7px 0; vertical-align: top; border-bottom: 1px solid #f3f4f6; }
      table.info td.k { color: #6b7280; width: 42%; font-size: 12px; }
      table.info td.v { font-weight: 600; text-align: right; }
      .total {
        background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px;
        padding: 14px 18px; display: flex; justify-content: space-between;
        align-items: center; margin-bottom: 26px;
      }
      .total .lbl { font-size: 12px; color: #7f1d1d; font-weight: 600; text-transform: uppercase; letter-spacing: .5px; }
      .total .val { font-size: 22px; font-weight: 800; color: #b91c1c; }
      .note { font-size: 12px; color: #374151; margin-bottom: 34px; }
      .sign { display: flex; justify-content: space-between; margin-top: 40px; font-size: 12px; color: #6b7280; }
      .sign .line { border-top: 1px solid #9ca3af; width: 58mm; padding-top: 5px; text-align: center; }
      .footer { margin-top: 28px; border-top: 1px solid #e5e7eb; padding-top: 10px; font-size: 10px; color: #9ca3af; text-align: center; }
      @media print {
        body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      }
    </style>
  </head>
  <body>
    <div class="sheet">
      <div class="header">
        <div>
          <h1>Avis de relance</h1>
          <p class="sub">Régularisation des frais scolaires</p>
        </div>
        <div class="ref">
          <div>N° ${escapeHtml(e.eleveMatricule || e.eleveId.slice(0, 8))}</div>
          <div>${new Date().toLocaleDateString('fr-FR')}</div>
        </div>
      </div>

      ${e.tuteurNom
        ? `<div class="dest">
             <div class="dest-lbl">À l'attention de</div>
             <div class="dest-name">${escapeHtml(e.tuteurNom)}</div>
             ${e.tuteurLien ? `<div class="dest-sub">${escapeHtml(e.tuteurLien)} de l'élève</div>` : ''}
           </div>`
        : ''}

      <table class="info">
        <tr><td class="k">Élève</td><td class="v">${escapeHtml(e.elevePrenom)} ${escapeHtml(e.eleveNom)}</td></tr>
        <tr><td class="k">Matricule</td><td class="v">${escapeHtml(e.eleveMatricule || '—')}</td></tr>
        <tr><td class="k">Classe</td><td class="v">${escapeHtml(e.classeNom || '—')}</td></tr>
        ${e.motif ? `<tr><td class="k">Motif</td><td class="v">${escapeHtml(e.motif)}</td></tr>` : ''}
        <tr>
          <td class="k">Tuteur / responsable</td>
          <td class="v">
            ${e.tuteurNom
              ? `${escapeHtml(e.tuteurNom)}${e.tuteurLien ? ` <span class="lien">(${escapeHtml(e.tuteurLien)})</span>` : ''}`
              : `<span class="muted">Non renseigné</span>`}
          </td>
        </tr>
        ${e.tuteurTelephone
          ? `<tr><td class="k">Téléphone</td><td class="v">${escapeHtml(e.tuteurTelephone)}</td></tr>`
          : ''}
        <tr><td class="k">Total dû</td><td class="v">${escapeHtml(moneyMulti(e.totaux, 'totalDu'))}</td></tr>
        <tr><td class="k">Déjà versé</td><td class="v">${escapeHtml(moneyMulti(e.totaux, 'totalPaye'))}</td></tr>
        <tr><td class="k">Date d'échéance</td><td class="v">${formatDate(e.dateEcheance)}</td></tr>
        <tr>
          <td class="k">Situation</td>
          <td class="v">
            ${retard > 0
              ? `<span class="tag retard">${retard} jour(s) de retard</span>`
              : `<span class="tag attente">En attente de règlement</span>`}
          </td>
        </tr>
      </table>

      ${(() => {
        const { dus, partiels, payes, hasDetail } = splitLignes(e)
        if (!hasDetail) return ''
        const row = (x: LigneFrais) => {
          const cls = x.etat === 'PAYE' ? 'ok' : x.etat === 'PARTIEL' ? 'part' : 'du'
          const lbl = x.etat === 'PAYE' ? 'Réglé' : x.etat === 'PARTIEL' ? 'Partiel' : 'Dû'
          return `<tr class="${cls}">
            <td>${escapeHtml(x.libelle)}</td>
            <td class="n">${money(x.montantDu, x.devise)}</td>
            <td class="n">${money(x.montantPaye, x.devise)}</td>
            <td class="n strong">${money(x.reste, x.devise)}</td>
            <td class="st"><span class="pill ${cls}">${lbl}</span></td>
          </tr>`
        }
        return `<table class="detail">
          <thead><tr>
            <th>Frais</th><th class="n">Montant</th><th class="n">Versé</th>
            <th class="n">Reste</th><th class="st">État</th>
          </tr></thead>
          <tbody>${[...partiels, ...dus, ...payes].map(row).join('')}</tbody>
        </table>`
      })()}

      <div class="total">
        <span class="lbl">Montant restant dû</span>
        <span class="val">${escapeHtml(moneyMulti(e.totaux, 'reste'))}</span>
      </div>

      <div class="pay-box">
        <h3>Modalités de règlement</h3>
        <ul>
          <li>Au secrétariat — ${ETAB_HORAIRES}</li>
          <li>Modes acceptés : ${ETAB_MODES_PAIEMENT}</li>
          <li>Renseignements : ${ETAB_TELEPHONE}</li>
          <li>Un reçu numéroté vous est remis à chaque versement.</li>
        </ul>
      </div>

      <p class="note">
        Madame, Monsieur,<br /><br />
        Sauf erreur ou omission de notre part, le solde ci-dessus reste impayé à ce jour.
        Nous vous prions de bien vouloir procéder à sa régularisation dans les meilleurs délais
        auprès du secrétariat de l'établissement.<br /><br />
        Si le règlement a déjà été effectué, veuillez ne pas tenir compte de cet avis.
      </p>

      <div class="sign">
        <div class="line">${e.tuteurNom ? escapeHtml(e.tuteurNom) : 'Signature du tuteur'}</div>
        <div class="line">Le service comptabilité</div>
      </div>

      <div class="footer">
        Document généré automatiquement le ${new Date().toLocaleString('fr-FR')}
      </div>
    </div>
  </body>
</html>`
  }

  function printRelance(e: Echeance) {
    const html = buildRelanceHtml(e)
    document.getElementById(PRINT_FRAME_ID)?.remove()
    const frame = document.createElement('iframe')
    frame.id = PRINT_FRAME_ID
    frame.setAttribute('aria-hidden', 'true')
    Object.assign(frame.style, {
      position: 'fixed', right: '0', bottom: '0', width: '0', height: '0',
      border: '0', visibility: 'hidden',
    })
    document.body.appendChild(frame)
    const doc = frame.contentDocument
    const win = frame.contentWindow
    if (!doc || !win) { frame.remove(); toast.error("Impression indisponible."); return }
    doc.open(); doc.write(html); doc.close()
    const launch = () => { try { win.focus(); win.print() } catch {} finally { setTimeout(() => frame.remove(), 1500) } }
    if (doc.readyState === 'complete') setTimeout(launch, 60)
    else frame.onload = launch
  }

  function downloadRelance(e: Echeance) {
    const blob = new Blob([buildRelanceHtml(e)], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `relance-${(e.eleveMatricule || e.eleveNom).replace(/\s+/g, '-')}.html`
    document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 2000)
    toast.success('Bon de relance téléchargé')
  }

  function buildRelanceMessage(e: Echeance): string {
    const eleve = `${e.elevePrenom} ${e.eleveNom}`
    const matricule = e.eleveMatricule ? ` (Matricule : ${e.eleveMatricule})` : ''
    const classe = e.classeNom && e.classeNom !== '—' ? `, en classe de ${e.classeNom}` : ''
    const civilite = e.tuteurNom ? `M./Mme ${e.tuteurNom}` : 'Chers parents'
    const { dus, partiels, hasDetail } = splitLignes(e)
    const aRegler = [...partiels, ...dus]
    const L: string[] = []
    L.push(`Bonjour ${civilite},`)
    L.push('')
    L.push(`L'équipe du ${ETAB_NOM} (${ETAB_SITE}) vous informe de la situation des frais de scolarité de votre enfant ${eleve}${matricule}${classe}.`)
    L.push('')
    L.push('📌 RÉCAPITULATIF DU COMPTE')
    L.push(SEP)
    const tot = e.totaux ?? []
    if (tot.length > 1) {
      L.push('🔹 Total des frais exigibles :')
      for (const t of tot) L.push(`     ${money(t.totalDu, t.devise)}`)
      L.push('🔹 Montant déjà réglé :')
      for (const t of tot) L.push(`     ${money(t.totalPaye, t.devise)}`)
      L.push(SEP)
      L.push('💰 SOLDE RESTANT À PAYER :')
      for (const t of tot.filter((x) => x.reste > 0.009)) L.push(`     ${money(t.reste, t.devise)}`)
    } else {
      L.push(`🔹 Total des frais exigibles : ${moneyMulti(tot, 'totalDu')}`)
      L.push(`🔹 Montant déjà réglé : ${moneyMulti(tot, 'totalPaye')}`)
      L.push(SEP)
      L.push(`💰 SOLDE RESTANT À PAYER : ${moneyMulti(tot, 'reste')}`)
    }
    if (hasDetail && aRegler.length > 0) {
      L.push('')
      L.push('📌 DÉTAIL DES RESTES À PAYER')
      for (const x of aRegler) {
        const j = joursRetard(x.dateEcheance)
        const suffixe = j > 0 ? ` — en retard de ${j} jour(s)` : ''
        L.push(
          x.etat === 'PARTIEL'
            ? `• ${x.libelle} : ${money(x.reste, x.devise)} (déjà versé ${money(x.montantPaye, x.devise)} sur ${money(x.montantDu, x.devise)})${suffixe}`
            : `• ${x.libelle} : ${money(x.reste, x.devise)}${suffixe}`,
        )
      }
    } else if (e.reste > 0) {
      L.push('')
      L.push('📌 DÉTAIL DES RESTES À PAYER')
      if (e.motif) {
        const items = e.motif.split(',').map((x) => x.trim()).filter(Boolean)
        if (items.length === 1) L.push(`• ${items[0]} : ${moneyMulti(e.totaux, 'reste')}`)
        else { for (const it of items) L.push(`• ${it}`); L.push(`  (total ${moneyMulti(e.totaux, 'reste')})`) }
      } else L.push(`• Frais de scolarité : ${moneyMulti(e.totaux, 'reste')}`)
    }
    const echeance = aRegler.find((x) => x.dateEcheance)?.dateEcheance ?? e.dateEcheance
    if (echeance) {
      const retard = getRetard(e)
      L.push('')
      L.push(`📅 Échéance : ${formatDate(echeance)}` + (retard > 0 ? ` — dépassée depuis ${retard} jour(s)` : ''))
    }
    L.push('')
    L.push(`📍 Lieu de paiement : ${ETAB_LIEU_PAIEMENT}`)
    L.push('')
    L.push('Nous vous remercions de bien vouloir régulariser ce solde dans les plus brefs délais.')
    L.push('')
    L.push('Cordialement,')
    L.push(ETAB_SIGNATURE)
    return L.join('\n')
  }

  function sendWhatsApp(e: Echeance) {
    const phone = (e.tuteurTelephone ?? '').replace(/\D/g, '')
    if (!phone) { toast.error('Aucun numéro de tuteur enregistré.'); return }
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(buildRelanceMessage(e))}`
    openExternal(url)
  }

  /* ── Rendu ──────────────────────────────────────────────────────────── */
  return (
    <main className="mx-auto w-full max-w-[1400px] space-y-6 p-4 md:p-6">
      <header className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <CalendarDays className="h-6 w-6 text-[var(--etab-color,#075e54)]" />
            Suivi des échéances
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Suivi des frais scolaires par élève, établissement et année.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => loadEcheances()} disabled={loading} className="gap-1.5">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Actualiser
          </Button>
          {!loading && (resteParDevise.length > 0 || totalReste > 0) && (
            <div className="rounded-lg border border-emerald-200 bg-[var(--etab-color,#075e54)] px-4 py-2 dark:border-emerald-800 dark:bg-[var(--etab-color,#075e54)]">
              <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">Reste à percevoir</p>
              {resteParDevise.length > 0 ? (
                <div className="space-y-0.5">
                  {resteParDevise.filter((t) => t.reste > 0.009).map((t) => (
                    <p key={t.devise} className="whitespace-nowrap text-lg font-bold tabular-nums text-emerald-800 dark:text-emerald-300">
                      {money(t.reste, t.devise)}
                    </p>
                  ))}
                  {resteParDevise.every((t) => t.reste <= 0.009) && (
                    <p className="text-lg font-bold text-emerald-800 dark:text-emerald-300">Tout est réglé</p>
                  )}
                </div>
              ) : (
                <p className="text-lg font-bold tabular-nums text-emerald-800 dark:text-emerald-300">
                  {money(totalReste, rows[0]?.devise)}
                </p>
              )}
            </div>
          )}
        </div>
      </header>

      {schemaInfo && !schemaInfo.hasClasseTargeting && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            <span className="font-semibold">Ciblage par classe indisponible.</span>{' '}
            La base ne contient ni <code className="font-mono text-xs">FraisScolaire.classe_ids</code>{' '}
            ni la table <code className="font-mono text-xs">FraisClasse</code> : tous les frais de
            l’établissement sont appliqués à chaque élève. Les montants estimés peuvent être trop élevés.
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {SUMMARY_CARDS.map(({ key, label, icon: Icon, bubble, value, ring }) => {
          const active = statut === key
          return (
            <button
              key={key}
              type="button"
              onClick={() => setStatut(active ? '' : key)}
              aria-pressed={active}
              className={`group relative overflow-hidden rounded-xl border bg-card p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md ${
                active
                  ? `border-transparent ring-2 ring-offset-2 ${ring} dark:ring-offset-slate-950`
                  : 'border-slate-200 dark:border-slate-800'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${bubble}`}>
                  <Icon className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className={`text-2xl font-bold leading-none tabular-nums ${value}`}>{summary[key]}</p>
                  <p className="mt-1 truncate text-xs font-medium text-muted-foreground">{label}</p>
                </div>
              </div>
              {active && (
                <span className="absolute right-2 top-2 rounded-full bg-foreground/80 px-1.5 py-0.5 text-[9px] font-bold uppercase text-background">
                  filtré
                </span>
              )}
            </button>
          )
        })}
      </div>
      <p className="-mt-4 text-right text-[11px] text-muted-foreground">
        Répartition sur l’ensemble du périmètre · cliquez sur une carte pour filtrer
      </p>

      <Card>
        <CardContent className="grid gap-3 p-4 md:grid-cols-2 lg:grid-cols-5">
          <div className="relative lg:col-span-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9 pr-9" placeholder="Nom ou matricule" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Rechercher un élève" />
            {search && (
              <button type="button" onClick={() => setSearch('')} aria-label="Effacer la recherche"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-slate-100 hover:text-foreground dark:hover:bg-slate-800">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <Select value={school || 'all'} onValueChange={(v) => { setSchool(v === 'all' ? '' : v); setYear(''); setClasse(''); yearAutoPicked.current = false }} disabled={locked}>
            <SelectTrigger aria-label="Établissement"><SelectValue placeholder="Établissement" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les établissements</SelectItem>
              {schools.map((s) => (<SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>))}
            </SelectContent>
          </Select>
          <Select value={year || 'all'} onValueChange={(v) => { setYear(v === 'all' ? '' : v); setClasse('') }} disabled={years.length === 0}>
            <SelectTrigger aria-label="Année scolaire"><SelectValue placeholder="Année scolaire" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes les années</SelectItem>
              {years.map((y) => (<SelectItem key={y.id} value={y.id}>{y.libelle}{y.active ? ' ★' : ''}</SelectItem>))}
            </SelectContent>
          </Select>
          <Select value={classe || 'all'} onValueChange={(v) => setClasse(v === 'all' ? '' : v)} disabled={classes.length === 0}>
            <SelectTrigger aria-label="Classe"><SelectValue placeholder="Classe" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes les classes</SelectItem>
              {classes.map((c) => (<SelectItem key={c.id} value={c.id}>{c.nom}</SelectItem>))}
            </SelectContent>
          </Select>
          <div className="flex gap-2">
            <Select value={statut || 'all'} onValueChange={(v) => setStatut(v === 'all' ? '' : v)}>
              <SelectTrigger className="flex-1" aria-label="Statut"><SelectValue placeholder="Statut" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les statuts</SelectItem>
                {Object.entries(STATUS_LABEL).map(([k, v]) => (<SelectItem key={k} value={k}>{v}</SelectItem>))}
              </SelectContent>
            </Select>
            {hasFilters && (
              <Button variant="ghost" size="icon" onClick={resetFilters} aria-label="Réinitialiser les filtres" title="Réinitialiser les filtres" className="shrink-0 text-muted-foreground">
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="py-4">
          <CardTitle className="text-base font-semibold">{total} élève{total > 1 ? 's' : ''} avec échéances</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-b-2 border-slate-200 bg-slate-50 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900">
                  <TableHead className="text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">Élève</TableHead>
                  <TableHead className="hidden text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 md:table-cell">Classe</TableHead>
                  <TableHead className="hidden text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 lg:table-cell">Total dû</TableHead>
                  <TableHead className="text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">Reste</TableHead>
                  <TableHead className="w-[180px] text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">Progression</TableHead>
                  <TableHead className="text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">Statut</TableHead>
                  <TableHead className="hidden text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 xl:table-cell">Échéance</TableHead>
                  <TableHead className="text-right text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell colSpan={8} className="py-4"><div className="h-6 w-full animate-pulse rounded bg-slate-100 dark:bg-slate-800" /></TableCell>
                    </TableRow>
                  ))
                ) : rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="p-12 text-center">
                      <CalendarDays className="mx-auto mb-3 h-10 w-10 text-slate-300" />
                      <p className="font-medium">Aucune échéance trouvée.</p>
                      <p className="mt-1 text-sm text-muted-foreground">{hasFilters ? 'Essayez d’élargir vos filtres.' : 'Aucun frais n’est actuellement dû.'}</p>
                      {hasFilters && <Button variant="outline" size="sm" onClick={resetFilters} className="mt-4 gap-1.5"><X className="h-3.5 w-3.5" />Réinitialiser</Button>}
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((e) => {
                    const retard = getRetard(e)
                    return (
                      <TableRow key={e.eleveId} className="group transition-colors even:bg-slate-50/50 hover:bg-slate-100 dark:even:bg-slate-900/30 dark:hover:bg-slate-800/50">
                        <TableCell className="py-3">
                          <div className="font-medium">{e.elevePrenom} {e.eleveNom}</div>
                          <div className="text-xs text-muted-foreground">{e.eleveMatricule || '—'}<span className="md:hidden"> · {e.classeNom || '—'}</span></div>
                          {e.tuteurNom && (
                            <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                              <UserRound className="h-3 w-3 shrink-0" />
                              <span className="truncate">{e.tuteurNom}{e.tuteurLien ? ` (${e.tuteurLien})` : ''}</span>
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="hidden py-3 text-sm text-muted-foreground md:table-cell">{e.classeNom || '—'}</TableCell>
                        <TableCell className="hidden py-3 lg:table-cell">
                          <div className="text-sm tabular-nums">{moneyMulti(e.totaux, 'totalDu')}</div>
                          <div className="text-xs text-muted-foreground tabular-nums">Payé : {moneyMulti(e.totaux, 'totalPaye')}{e.nbEcheances ? ` · ${e.nbEcheances} échéance${e.nbEcheances > 1 ? 's' : ''}` : ''}</div>
                          {e.nbEcheances === 0 && <span className="mt-0.5 inline-block cursor-help rounded bg-sky-100 px-1.5 py-px text-[10px] font-semibold text-sky-800 dark:bg-sky-900/50 dark:text-sky-200">Estimé (sans échéance)</span>}
                        </TableCell>
                        <TableCell className="py-3 font-semibold tabular-nums">
                          {(e.totaux?.length ?? 0) > 0 ? (
                            <div className="space-y-0.5">
                              {e.totaux!.map((t) => (
                                <div key={t.devise} className={`whitespace-nowrap ${t.reste > 0.009 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                                  {money(t.reste, t.devise)}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <span className={e.reste > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}>{money(e.reste, e.devise)}</span>
                          )}
                        </TableCell>
                        <TableCell className="py-3">
                          {(e.totaux?.length ?? 0) > 1 ? (
                            <div className="space-y-1">
                              {e.totaux!.map((t) => (
                                <div key={t.devise} className="flex items-center gap-1.5">
                                  <span className="w-8 shrink-0 text-[9px] font-bold text-muted-foreground">{t.devise}</span>
                                  <div className="flex-1"><ProgressBar value={t.totalPaye} total={t.totalDu} /></div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <ProgressBar value={e.totaux?.[0]?.totalPaye ?? e.totalPaye} total={e.totaux?.[0]?.totalDu ?? e.totalDu} />
                          )}
                        </TableCell>
                        <TableCell className="py-3">
                          <Badge variant="outline" className={`gap-1.5 whitespace-nowrap text-xs font-semibold ${STATUS_BADGE[e.statut] ?? STATUS_BADGE.EN_ATTENTE}`}>
                            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_DOT[e.statut] ?? STATUS_DOT.EN_ATTENTE}`} />
                            {STATUS_LABEL[e.statut] ?? e.statut}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden py-3 text-sm xl:table-cell">
                          <div className="text-muted-foreground">{formatDate(e.dateEcheance)}</div>
                          {retard > 0 && <div className="text-xs font-medium text-red-500">+{retard} j de retard</div>}
                        </TableCell>
                        <TableCell className="py-3 text-right">
                          <Button size="icon" variant="ghost" aria-label={`Relancer ${e.elevePrenom} ${e.eleveNom}`} title="Relance de paiement"
                            className="h-8 w-8 border border-slate-200 text-slate-600 transition-colors hover:border-white hover:bg-white hover:text-black dark:border-slate-700 dark:text-slate-300"
                            onClick={() => setSelectedId(e.eleveId)}>
                            <Printer className="h-4 w-4 text-[var(--etab-color,#075e54)]" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>
          {totalPages > 1 && (
            <div className="flex flex-col items-center justify-between gap-3 border-t p-4 sm:flex-row">
              <span className="text-sm text-muted-foreground">Page <b className="text-foreground">{currentPage}</b> sur <b className="text-foreground">{totalPages}</b> · {total} résultat{total > 1 ? 's' : ''}</span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={currentPage <= 1 || loading} onClick={() => setPage((p) => Math.max(1, p - 1))}>Précédent</Button>
                <Button size="sm" variant="outline" disabled={currentPage >= totalPages || loading} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>Suivant</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelectedId(null)}>
        <DialogContent className="sm:max-w-md bg-white dark:bg-white-900">
          <DialogHeader>
            <DialogTitle>Relance de paiement</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div className="rounded-lg bg-slate-50 p-4 dark:bg-slate-900/50">
                <p className="font-medium">{selected.elevePrenom} {selected.eleveNom}</p>
                <p className="text-sm text-muted-foreground">{selected.eleveMatricule || '—'} · {selected.classeNom || '—'}</p>
                {selected.motif && !(selected.lignes?.length) && (
                  <p className="mt-2 text-sm"><span className="font-medium">Motif :</span> {selected.motif}</p>
                )}
                <p className="mt-2 text-sm"><span className="font-medium">Total dû :</span> {moneyMulti(selected.totaux, 'totalDu')}</p>
                <div className="mt-1 text-sm">
                  <span className="font-medium">Reste :</span>{' '}
                  {(selected.totaux?.length ?? 0) > 0 ? (
                    <span className="font-bold text-red-600 dark:text-red-400">{moneyMulti(selected.totaux, 'reste')}</span>
                  ) : (
                    <span className="font-bold text-red-600 dark:text-red-400">{money(selected.reste, selected.devise)}</span>
                  )}
                </div>
                <p className="mt-1 text-sm">
                  <span className="font-medium">Échéance :</span> {formatDate(selected.dateEcheance)}
                  {getRetard(selected) > 0 && <span className="text-red-500"> ({getRetard(selected)} jour(s) de retard)</span>}
                </p>
              </div>
              {!!selected.lignes?.length && (
                <div className="overflow-hidden rounded-lg border">
                  <p className="border-b bg-slate-50 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground dark:bg-slate-900/50">Détail des frais</p>
                  <ul className="divide-y">
                    {[...splitLignes(selected).partiels, ...splitLignes(selected).dus, ...splitLignes(selected).payes].map((x, i) => (
                      <li key={i} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                        <div className="min-w-0">
                          <p className="truncate font-medium">{x.libelle}</p>
                          <p className="text-xs text-muted-foreground tabular-nums">{money(x.montantPaye, x.devise)} / {money(x.montantDu, x.devise)}{x.dateEcheance ? ` · éch. ${formatDate(x.dateEcheance)}` : ''}</p>
                          {x.etat !== 'PAYE' && joursRetard(x.dateEcheance) > 0 && (
                            <p className="text-xs font-medium text-red-500">En retard de {joursRetard(x.dateEcheance)} jour(s)</p>
                          )}
                        </div>
                        <div className="shrink-0 text-right">
                          <p className={`text-sm font-bold tabular-nums ${x.etat === 'PAYE' ? 'text-emerald-600 dark:text-emerald-400' : x.etat === 'PARTIEL' ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'}`}>
                            {x.etat === 'PAYE' ? 'Réglé' : money(x.reste, x.devise)}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="grid grid-cols-3 gap-2">
                <Button
                  variant="outline"
                  className="h-auto flex-col bg-[var(--etab-color,#075e54)] gap-1.5 border-slate-200 py-3 text-xs font-semibold text-slate-700 hover:border-[var(--etab-color,#075e54)] hover:bg-[var(--etab-color,#075e54)] hover:text-white dark:border-slate-700 dark:text-slate-300"
                  onClick={() => printRelance(selected)}
                >
                  <Printer className="h-4 w-4" />
                  Imprimer
                </Button>
                <Button
                  variant="outline"
                  className="h-auto bg-[var(--etab-color,#075e54)] flex-col gap-1.5 border-slate-200 py-3 text-xs font-semibold text-slate-700 hover:border-emerald-600 hover:bg-emerald-600 hover:text-white dark:border-slate-700 dark:text-slate-300"
                  onClick={() => downloadRelance(selected)}
                >
                  <Download className="h-4 w-4" />
                  Télécharger
                </Button>
                <Button
                  variant="outline"
                  className="h-auto bg-[var(--etab-color,#075e54)] flex-col gap-1.5 border-slate-200 py-3 text-xs font-semibold text-slate-700 hover:border-emerald-500 hover:bg-emerald-500 hover:text-white dark:border-slate-700 dark:text-slate-300"
                  onClick={() => sendWhatsApp(selected)}
                  disabled={!selected.tuteurTelephone}
                >
                  <Send className="h-4 w-4" />
                  WhatsApp
                </Button>
              </div>

              {!selected.tuteurTelephone && (
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                  <AlertTriangle className="mr-1 inline-block h-3 w-3" />
                  Aucun numéro de téléphone de tuteur enregistré. L'envoi WhatsApp est désactivé.
                </p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </main>
  )
}
