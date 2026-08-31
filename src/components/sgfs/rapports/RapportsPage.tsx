'use client'

import { useEffect, useMemo, useState } from 'react'
import { useAppStore, getSchoolFilter, getTypeIcon } from '@/lib/store'
import * as tc from '@/lib/tauri-commands'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
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
import { toast } from 'sonner'
import { Printer, TrendingUp, TrendingDown, Banknote, FileText, Sparkles, BarChart3, Users, FileSpreadsheet } from 'lucide-react'
import * as XLSX from 'xlsx'

// ─── Types ───────────────────────────────────────────────────────────────────

interface MoisDeviseMontant {
  mois: string
  devise: string
  total: number
}

interface SoldeDevise {
  devise: string
  encaissements: number
  depenses: number
  solde: number
}

interface RapportFinancier {
  encaissements: MoisDeviseMontant[]
  depenses: MoisDeviseMontant[]
  soldes: SoldeDevise[]
  devises: string[]
}

interface StatutCount {
  statut: string
  count: number
}
interface SexeCount {
  sexe: string
  count: number
}
interface ClasseCount {
  classeNom: string
  count: number
}

interface RapportEleves {
  parStatut: StatutCount[]
  parSexe: SexeCount[]
  parClasse: ClasseCount[]
  total: number
}

interface RapportJournalier {
  date: string
  recus: any[]
  depenses: any[]
  totaux: { devise: string; encaissements: number; depenses: number; solde: number }[]
  parMode: { mode: string; devise: string; nombre: number; total: number }[]
  totalRecus: number
  totalValides: number
  totalAnnules: number
  totalDepenses: number
}

// ─── Constantes & helpers ─────────────────────────────────────────────────────

const PRINT_FRAME_ID = '__rapport_print_frame__'

const STATUS_LABELS: Record<string, string> = {
  ACTIF: 'Actif',
  INSCRIT: 'Inscrit',
  SUSPENDU: 'Suspendu',
  TRANSFERE: 'Transféré',
  'TRANSFÉRÉ': 'Transféré',
  DIPLOME: 'Diplômé',
  'DIPLÔMÉ': 'Diplômé',
}

const LOCALES: Record<string, string> = { CDF: 'fr-CD', BIF: 'fr-BI', USD: 'en-US' }
const SANS_DECIMALES = ['CDF', 'BIF']

function formatMoney(montant: number | null | undefined, devise = 'CDF') {
  const d = (devise || 'CDF').toUpperCase()
  const v = Number(montant || 0)
  const sansDec = SANS_DECIMALES.includes(d)
  const n = new Intl.NumberFormat(LOCALES[d] ?? 'fr-FR', {
    minimumFractionDigits: sansDec ? 0 : 2,
    maximumFractionDigits: sansDec ? 0 : 2,
  }).format(v)
  return `${n} ${d}`
}

function dateLocaleISO() {
  const now = new Date()
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}

function formatMois(mois: string) {
  const [annee, moisNum] = String(mois ?? '').split('-')
  const d = new Date(Number(annee), Number(moisNum) - 1, 1)
  if (Number.isNaN(d.getTime())) return mois
  return d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
}

function normaliserFinancier(data: any): RapportFinancier {
  const enc: any[] = Array.isArray(data?.encaissements) ? data.encaissements : []
  const dep: any[] = Array.isArray(data?.depenses) ? data.depenses : []

  const DEFAUT = (data?.devise || 'CDF').toUpperCase()

  const norm = (l: any[]): MoisDeviseMontant[] =>
    l.map((x) => ({
      mois: String(x?.mois ?? ''),
      devise: String(x?.devise ?? DEFAUT).toUpperCase(),
      total: Number(x?.total ?? 0),
    }))

  const encaissements = norm(enc)
  const depenses = norm(dep)

  let soldes: SoldeDevise[] = Array.isArray(data?.soldes) ? data.soldes : []
  if (soldes.length === 0) {
    const acc = new Map<string, { encaissements: number; depenses: number }>()
    for (const e of encaissements) {
      const a = acc.get(e.devise) ?? { encaissements: 0, depenses: 0 }
      a.encaissements += e.total
      acc.set(e.devise, a)
    }
    for (const d of depenses) {
      const a = acc.get(d.devise) ?? { encaissements: 0, depenses: 0 }
      a.depenses += d.total
      acc.set(d.devise, a)
    }
    soldes = Array.from(acc.entries()).map(([devise, v]) => ({
      devise,
      encaissements: v.encaissements,
      depenses: v.depenses,
      solde: v.encaissements - v.depenses,
    }))
  }

  const devises: string[] = Array.isArray(data?.devises) && data.devises.length
    ? data.devises.map((d: string) => String(d).toUpperCase())
    : Array.from(new Set([...encaissements, ...depenses].map((x) => x.devise)))

  return { encaissements, depenses, soldes, devises }
}

function errorDetail(error: any) {
  if (typeof error === 'string') return error
  if (error?.message) return error.message
  if (error?.error) return error.error
  try { return JSON.stringify(error) } catch { return 'Erreur inconnue' }
}

function sexeLabel(s: string) {
  return s === 'M' ? 'Masculin' : s === 'F' ? 'Féminin' : s
}

function escapeHtml(value: unknown) {
  return String(value ?? '—')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

interface PrintContext {
  titre: string
  etablissement: string
  annee: string
  financier: RapportFinancier | null
  eleves: RapportEleves | null
  journalier: RapportJournalier | null
  onglet: string
}

function buildRapportHtml(ctx: PrintContext): string {
  const { financier, eleves } = ctx

  let blocFinancier = ''
  if (ctx.onglet === 'financier' && financier) {
    const devises =
      financier.devises.length > 0
        ? financier.devises
        : Array.from(
            new Set([
              ...financier.encaissements.map((e) => e.devise),
              ...financier.depenses.map((d) => d.devise),
            ]),
          )

    const cartes = financier.soldes
      .map(
        (s) => `
      <div class="card">
        <span>${escapeHtml(s.devise)} — Encaissements</span>
        <b class="pos">${escapeHtml(formatMoney(s.encaissements, s.devise))}</b>
        <span style="margin-top:4px">Dépenses</span>
        <b class="neg">${escapeHtml(formatMoney(s.depenses, s.devise))}</b>
        <span style="margin-top:4px">Solde</span>
        <b class="${s.solde >= 0 ? 'pos' : 'neg'}">${escapeHtml(formatMoney(s.solde, s.devise))}</b>
      </div>`,
      )
      .join('')

    const tables = devises
      .map((dev) => {
        const enc = financier.encaissements.filter((e) => e.devise === dev)
        const dep = financier.depenses.filter((d) => d.devise === dev)
        const mois = Array.from(
          new Set([...enc.map((e) => e.mois), ...dep.map((d) => d.mois)]),
        ).sort()

        const lignes = mois
          .map((m) => {
            const e = enc.find((x) => x.mois === m)?.total ?? 0
            const d = dep.find((x) => x.mois === m)?.total ?? 0
            const solde = e - d
            return `<tr>
              <td>${escapeHtml(formatMois(m))}</td>
              <td class="n">${escapeHtml(formatMoney(e, dev))}</td>
              <td class="n">${escapeHtml(formatMoney(d, dev))}</td>
              <td class="n ${solde >= 0 ? 'pos' : 'neg'}">${escapeHtml(formatMoney(solde, dev))}</td>
            </tr>`
          })
          .join('')

        const s = financier.soldes.find((x) => x.devise === dev)
        return `
      <h2>Évolution mensuelle — ${escapeHtml(dev)}</h2>
      <table>
        <thead><tr>
          <th>Mois</th><th class="n">Encaissements</th><th class="n">Dépenses</th><th class="n">Solde</th>
        </tr></thead>
        <tbody>${lignes || '<tr><td colspan="4" class="vide">Aucune donnée</td></tr>'}</tbody>
        ${
          mois.length && s
            ? `<tfoot><tr>
                 <td>TOTAL ${escapeHtml(dev)}</td>
                 <td class="n">${escapeHtml(formatMoney(s.encaissements, dev))}</td>
                 <td class="n">${escapeHtml(formatMoney(s.depenses, dev))}</td>
                 <td class="n ${s.solde >= 0 ? 'pos' : 'neg'}">${escapeHtml(formatMoney(s.solde, dev))}</td>
               </tr></tfoot>`
            : ''
        }
      </table>`
      })
      .join('')

    blocFinancier =
      devises.length === 0
        ? '<p class="vide">Aucune opération sur la période.</p>'
        : `<div class="cards">${cartes}</div>${tables}`
  }

  let blocEleves = ''
  if (ctx.onglet === 'eleves' && eleves) {
    const petiteTable = (titre: string, entete: string, rows: string, total: number) => `
      <div class="col">
        <h2>${escapeHtml(titre)}</h2>
        <table>
          <thead><tr><th>${escapeHtml(entete)}</th><th class="n">Nombre</th></tr></thead>
          <tbody>${rows || '<tr><td colspan="2" class="vide">Aucune donnée</td></tr>'}</tbody>
          <tfoot><tr><td>TOTAL</td><td class="n">${total}</td></tr></tfoot>
        </table>
      </div>`

    const rowsStatut = eleves.parStatut
      .map(
        (s) =>
          `<tr><td>${escapeHtml(STATUS_LABELS[s.statut] ?? s.statut)}</td><td class="n">${s.count}</td></tr>`,
      )
      .join('')
    const rowsSexe = eleves.parSexe
      .map((s) => `<tr><td>${escapeHtml(sexeLabel(s.sexe))}</td><td class="n">${s.count}</td></tr>`)
      .join('')
    const rowsClasse = eleves.parClasse
      .map((c) => `<tr><td>${escapeHtml(c.classeNom)}</td><td class="n">${c.count}</td></tr>`)
      .join('')

    const totalEleves = eleves.total

    blocEleves = `
    <div class="grid">
      ${petiteTable('Par statut', 'Statut', rowsStatut, totalEleves)}
      ${petiteTable('Par sexe', 'Sexe', rowsSexe, totalEleves)}
    </div>
    ${petiteTable('Par classe', 'Classe', rowsClasse, totalEleves)}`
  }

  let blocJournalier = ''
  if (ctx.onglet === 'journalier' && ctx.journalier) {
    const j = ctx.journalier
    const showEtab = ctx.etablissement === 'Tous les établissements'
    const totalCards = `
      <div class="cards">
        <div class="card"><span>Reçus enregistrés</span><b>${j.totalRecus}</b></div>
        <div class="card"><span>Reçus valides</span><b class="pos">${j.totalValides}</b></div>
        <div class="card"><span>Reçus annulés</span><b class="neg">${j.totalAnnules}</b></div>
        <div class="card"><span>Dépenses</span><b>${j.totalDepenses}</b></div>
      </div>`
    const totalTables = j.totaux.map((t) => `<div class="card"><span>${escapeHtml(t.devise)} — Encaissements</span><b class="pos">${escapeHtml(formatMoney(t.encaissements, t.devise))}</b><span style="margin-top:4px">Dépenses</span><b class="neg">${escapeHtml(formatMoney(t.depenses, t.devise))}</b><span style="margin-top:4px">Solde net</span><b class="${t.solde >= 0 ? 'pos' : 'neg'}">${escapeHtml(formatMoney(t.solde, t.devise))}</b></div>`).join('')
    const modeRows = j.parMode.map((m) => `<tr><td>${escapeHtml(m.mode || '—')}</td><td>${escapeHtml(m.devise)}</td><td class="n">${m.nombre}</td><td class="n">${escapeHtml(formatMoney(m.total, m.devise))}</td></tr>`).join('')
    const receiptRows = j.recus.map((r) => `<tr><td>${escapeHtml(r.heure)}</td><td>${escapeHtml(r.numeroRecu)}</td>${showEtab ? `<td>${escapeHtml(r.etablissementNom || '—')}</td>` : ''}<td>${escapeHtml(r.eleve)}<br><small>${escapeHtml(r.matricule)} — ${escapeHtml(r.classe)}</small></td><td>${escapeHtml(r.motif)}</td><td>${escapeHtml(r.modePaiement)}</td><td class="n">${escapeHtml(formatMoney(r.montant, r.devise))}</td><td>${escapeHtml(r.statut)}</td></tr>`).join('')
    const expenseRows = j.depenses.map((d) => `<tr><td>${escapeHtml(d.heure)}</td>${showEtab ? `<td>${escapeHtml(d.etablissementNom || '—')}</td>` : ''}<td>${escapeHtml(d.categorie)}</td><td>${escapeHtml(d.libelle)}</td><td>${escapeHtml(d.beneficiaire)}</td><td class="n">${escapeHtml(formatMoney(d.montant, d.devise))}</td><td>${escapeHtml(d.statut)}</td></tr>`).join('')
    blocJournalier = `<h2>Résumé de la journée</h2>${totalCards}<div class="cards">${totalTables || '<p class="vide">Aucune opération financière.</p>'}</div><h2>Répartition des encaissements par mode</h2><table><thead><tr><th>Mode</th><th>Devise</th><th class="n">Nombre</th><th class="n">Total</th></tr></thead><tbody>${modeRows || '<tr><td colspan="4" class="vide">Aucun encaissement</td></tr>'}</tbody></table><h2>Détail des reçus</h2><table><thead><tr><th>Heure</th><th>N° reçu</th>${showEtab ? '<th>Établissement</th>' : ''}<th>Élève</th><th>Motif</th><th>Mode</th><th class="n">Montant</th><th>Statut</th></tr></thead><tbody>${receiptRows || `<tr><td colspan="${showEtab ? '8' : '7'}" class="vide">Aucun reçu</td></tr>`}</tbody></table><h2>Détail des dépenses</h2><table><thead><tr><th>Heure</th>${showEtab ? '<th>Établissement</th>' : ''}<th>Catégorie</th><th>Libellé</th><th>Bénéficiaire</th><th class="n">Montant</th><th>Statut</th></tr></thead><tbody>${expenseRows || `<tr><td colspan="${showEtab ? '7' : '6'}" class="vide">Aucune dépense</td></tr>`}</tbody></table>`
  }

  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(ctx.titre)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    @page { size: A4; margin: 15mm; }
    body {
      font-family: "Segoe UI", Arial, Helvetica, sans-serif;
      color: #111827; font-size: 12px; line-height: 1.45;
    }
    header {
      border-bottom: 3px solid #1e3a8a; padding-bottom: 10px; margin-bottom: 18px;
      display: flex; justify-content: space-between; align-items: flex-end;
    }
    header h1 { font-size: 20px; color: #1e3a8a; letter-spacing: -.3px; }
    header .sub { color: #6b7280; font-size: 11px; margin-top: 3px; }
    header .meta { text-align: right; font-size: 11px; color: #6b7280; }
    h2 {
      font-size: 12px; text-transform: uppercase; letter-spacing: .5px;
      color: #1e3a8a; margin: 16px 0 6px; padding-bottom: 3px;
      border-bottom: 1px solid #e5e7eb;
    }
    .cards { display: flex; gap: 8px; margin-bottom: 6px; }
    .card {
      flex: 1; border: 1px solid #d1d5db; border-radius: 6px; padding: 8px 10px;
      display: flex; flex-direction: column; gap: 2px;
    }
    .card span { font-size: 10px; color: #6b7280; text-transform: uppercase; letter-spacing: .4px; }
    .card b { font-size: 15px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
    th {
      background: #1e3a8a; color: #fff; padding: 6px 8px; text-align: left;
      font-size: 10px; text-transform: uppercase; letter-spacing: .4px;
    }
    td { padding: 5px 8px; border-bottom: 1px solid #e5e7eb; }
    th.n, td.n { text-align: right; }
    tfoot td { font-weight: 700; border-top: 2px solid #111827; background: #f9fafb; }
    .pos { color: #047857; }
    .neg { color: #b91c1c; }
    .vide { text-align: center; color: #9ca3af; font-style: italic; padding: 14px; }
    .grid { display: flex; gap: 12px; }
    small { color: #6b7280; font-size: 9px; }
    .col { flex: 1; }
    footer {
      margin-top: 20px; border-top: 1px solid #e5e7eb; padding-top: 8px;
      font-size: 9px; color: #9ca3af; text-align: center;
    }
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      table, .cards, .col { break-inside: avoid; }
      thead { display: table-header-group; }
    }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>${escapeHtml(ctx.titre)}</h1>
      <p class="sub">${escapeHtml(ctx.etablissement)}</p>
    </div>
    <div class="meta">
      <div>Année scolaire : <b>${escapeHtml(ctx.annee)}</b></div>
      <div>Édité le ${escapeHtml(new Date().toLocaleDateString('fr-FR'))}</div>
    </div>
  </header>

  ${blocFinancier}${blocEleves}${blocJournalier}

  <footer>
    Document généré automatiquement le ${escapeHtml(new Date().toLocaleString('fr-FR'))}
  </footer>
</body>
</html>`
}

function exportRapportExcel(rapport: RapportJournalier, etablissement: string, annee: string) {
  const wb = XLSX.utils.book_new()
  const resume = [
    ['RAPPORT JOURNALIER DE CAISSE'],
    ['Établissement', etablissement],
    ['Année scolaire', annee],
    ['Date', rapport.date],
    [],
    ['Indicateur', 'Valeur'],
    ['Reçus enregistrés', rapport.totalRecus],
    ['Reçus valides', rapport.totalValides],
    ['Reçus annulés', rapport.totalAnnules],
    ['Dépenses', rapport.totalDepenses],
    [],
    ['Devise', 'Encaissements', 'Dépenses', 'Solde net'],
    ...rapport.totaux.map((t) => [t.devise, t.encaissements, t.depenses, t.solde]),
  ]
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(resume), 'Résumé')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rapport.recus.map((r) => ({
    Heure: r.heure, 'N° reçu': r.numeroRecu, ...(etablissement === 'Tous les établissements' ? { Établissement: r.etablissementNom || '—' } : {}), Élève: r.eleve, Matricule: r.matricule, Classe: r.classe,
    Motif: r.motif, Montant: r.montant, Devise: r.devise, 'Mode paiement': r.modePaiement,
    Référence: r.reference || '', Statut: r.statut, Caissier: r.caissier || '',
  }))), 'Reçus')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rapport.depenses.map((d) => ({
    Heure: d.heure, ...(etablissement === 'Tous les établissements' ? { Établissement: d.etablissementNom || '—' } : {}), Catégorie: d.categorie, Libellé: d.libelle, Bénéficiaire: d.beneficiaire || '',
    Montant: d.montant, Devise: d.devise, Référence: d.reference || '', Statut: d.statut,
  }))), 'Dépenses')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rapport.parMode.map((m) => ({
    Mode: m.mode, Devise: m.devise, Nombre: m.nombre, Total: m.total,
  }))), 'Modes paiement')
  const safeDate = rapport.date.replace(/[^0-9-]/g, '') || 'date'
  XLSX.writeFile(wb, `rapport-journalier-${safeDate}.xlsx`)
}

function printRapport(ctx: PrintContext) {
  document.getElementById(PRINT_FRAME_ID)?.remove()

  const frame = document.createElement('iframe')
  frame.id = PRINT_FRAME_ID
  frame.setAttribute('aria-hidden', 'true')
  Object.assign(frame.style, {
    position: 'fixed',
    right: '0',
    bottom: '0',
    width: '0',
    height: '0',
    border: '0',
    visibility: 'hidden',
  })
  document.body.appendChild(frame)

  const doc = frame.contentDocument
  const win = frame.contentWindow
  if (!doc || !win) {
    toast.error('Impression indisponible sur cet environnement.')
    frame.remove()
    return
  }

  doc.open()
  doc.write(buildRapportHtml(ctx))
  doc.close()

  const launch = () => {
    try {
      win.focus()
      win.print()
    } catch {
      toast.error("L'impression a été interrompue.")
    } finally {
      setTimeout(() => frame.remove(), 1500)
    }
  }

  if (doc.readyState === 'complete') setTimeout(launch, 60)
  else frame.onload = launch
}

export default function RapportsPage() {
  const { user } = useAppStore()
  const role = user?.role ?? ''
  const userEtabId = user?.etablissementId ?? null
  const schoolFilter = useMemo(() => getSchoolFilter(role, userEtabId), [role, userEtabId])
  const locked = !!schoolFilter

  const [schools, setSchools] = useState<any[]>([])
  const [years, setYears] = useState<any[]>([])
  const [school, setSchool] = useState(schoolFilter ?? '')
  const [year, setYear] = useState('')
  const [loading, setLoading] = useState(false)
  const [rapportFinancier, setRapportFinancier] = useState<RapportFinancier | null>(null)
  const [rapportEleves, setRapportEleves] = useState<RapportEleves | null>(null)
  const [rapportJournalier, setRapportJournalier] = useState<RapportJournalier | null>(null)
  const [dateJournalier, setDateJournalier] = useState(dateLocaleISO)
  const [activeTab, setActiveTab] = useState('financier')

  useEffect(() => {
    if (!user) return
    ;(async () => {
      try {
        const res = await tc.listEtablissements(locked ? schoolFilter! : undefined)
        setSchools(res?.etablissements ?? [])
        if (locked) setSchool(schoolFilter!)
      } catch {
        /* silencieux */
      }
    })()
  }, [user, locked, schoolFilter])

  useEffect(() => {
    if (!school) {
      setYears([])
      setYear('')
      return
    }
    ;(async () => {
      try {
        const res = await tc.listAnneesScolaires(school === 'ALL' ? undefined : school)
        const data: any[] = res?.annees_scolaires ?? []
        if (school === 'ALL') {
          // Deduplicate by libelle
          const seen = new Set()
          const unique: any[] = []
          for (const y of data) {
            if (!seen.has(y.libelle)) {
              seen.add(y.libelle)
              unique.push(y)
            }
          }
          setYears(unique)
          if (unique.length > 0) {
            const active = unique.find((y) => y.active)
            setYear(active?.libelle ?? unique[0].libelle)
          } else {
            setYear('')
          }
        } else {
          setYears(data)
          if (data.length > 0) {
            const active = data.find((y) => y.active)
            setYear(active?.id ?? data[0].id)
          } else {
            setYear('')
          }
        }
      } catch {
        setYears([])
        setYear('')
      }
    })()
  }, [school])

  async function generate() {
    if (!school || !year) {
      toast.error('Veuillez sélectionner un établissement et une année scolaire')
      return
    }
    setLoading(true)
    try {
      if (activeTab === 'financier') {
        const res = await tc.getRapportFinancier(school, year)
        const data = res?.data ?? res
        setRapportFinancier(normaliserFinancier(data))
      } else if (activeTab === 'eleves') {
        const res = await tc.getRapportEleves(school, year)
        const data = res?.data ?? res
        setRapportEleves({
          parStatut: Array.isArray(data?.parStatut) ? data.parStatut : [],
          parSexe: Array.isArray(data?.parSexe) ? data.parSexe : [],
          parClasse: Array.isArray(data?.parClasse) ? data.parClasse : [],
          total: Number.isFinite(Number(data?.total)) ? Number(data.total) : 0,
        })
      } else {
        const res = await tc.getRapportJournalier(school, dateJournalier, year)
        const data = res?.data ?? res
        setRapportJournalier({
          date: dateJournalier,
          recus: Array.isArray(data?.recus) ? data.recus : [],
          depenses: Array.isArray(data?.depenses) ? data.depenses : [],
          totaux: Array.isArray(data?.totaux) ? data.totaux : [],
          parMode: Array.isArray(data?.parMode) ? data.parMode : [],
          totalRecus: Number(data?.totalRecus ?? 0),
          totalValides: Number(data?.totalValides ?? 0),
          totalAnnules: Number(data?.totalAnnules ?? 0),
          totalDepenses: Number(data?.totalDepenses ?? 0),
        })
      }
      toast.success('Rapport généré avec succès')
    } catch (e: any) {
      const nomRapport = activeTab === 'financier' ? 'financier' : activeTab === 'eleves' ? 'élèves' : 'journalier'
      toast.error(`Erreur du rapport ${nomRapport} : ${errorDetail(e)}`)
    } finally {
      setLoading(false)
    }
  }

  const rapportCourant = activeTab === 'financier' ? rapportFinancier : activeTab === 'eleves' ? rapportEleves : rapportJournalier
  const peutImprimer = !!rapportCourant

  const devises = useMemo(() => {
    if (!rapportFinancier) return []
    if (rapportFinancier.devises?.length) return rapportFinancier.devises
    return Array.from(
      new Set([
        ...rapportFinancier.encaissements.map((e) => e.devise),
        ...rapportFinancier.depenses.map((d) => d.devise),
      ]),
    ).filter(Boolean)
  }, [rapportFinancier])

  const moisParDevise = useMemo(() => {
    if (!rapportFinancier) return new Map<string, string[]>()
    const m = new Map<string, string[]>()
    for (const dev of devises) {
      const mois = Array.from(
        new Set([
          ...rapportFinancier.encaissements.filter((e) => e.devise === dev).map((e) => e.mois),
          ...rapportFinancier.depenses.filter((d) => d.devise === dev).map((d) => d.mois),
        ]),
      ).sort()
      m.set(dev, mois)
    }
    return m
  }, [rapportFinancier, devises])

  function montantMois(
    liste: MoisDeviseMontant[] | undefined,
    mois: string,
    devise: string,
  ): number {
    return liste?.find((x) => x.mois === mois && x.devise === devise)?.total ?? 0
  }

  function handleExportExcel() {
    if (!rapportJournalier) {
      toast.error('Générez d’abord le rapport journalier.')
      return
    }
    const etabNom = school === 'ALL' ? 'Tous les établissements' : (schools.find((s) => s.id === school)?.nom ?? '—')
    const anneeLib = school === 'ALL' ? year : (years.find((y) => y.id === year)?.libelle ?? '—')
    exportRapportExcel(
      rapportJournalier,
      etabNom,
      anneeLib,
    )
    toast.success('Fichier Excel exporté avec succès')
  }

  function handlePrint() {
    if (!peutImprimer) {
      toast.error('Générez d’abord un rapport avant d’imprimer.')
      return
    }
    const etabNom = school === 'ALL' ? 'Tous les établissements' : (schools.find((s) => s.id === school)?.nom ?? '—')
    const anneeLib = school === 'ALL' ? year : (years.find((y) => y.id === year)?.libelle ?? '—')
    printRapport({
      titre: activeTab === 'financier' ? 'Rapport financier' : activeTab === 'eleves' ? 'Rapport des élèves' : 'Rapport journalier de caisse',
      etablissement: etabNom,
      annee: anneeLib,
      financier: rapportFinancier,
      eleves: rapportEleves,
      journalier: rapportJournalier,
      onglet: activeTab,
    })
  }

  return (
    <div className="space-y-6 p-2 sm:p-4 md:p-6">
      {/* Banner Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-stone-200/80 shadow-sm">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 text-amber-700 text-xs font-bold border border-amber-500/20 mb-2">
            <FileText className="h-3.5 w-3.5" /> Analyses & Audits
          </div>
          <h1 className="text-2xl font-extrabold text-stone-900 tracking-tight">Rapports & Synthèses</h1>
          <p className="text-xs sm:text-sm text-stone-500 mt-1">Consultez et imprimez les rapports financiers et statistiques d&apos;effectifs.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            className="bg-[#1e3a8a] hover:bg-[#172554] text-white font-bold px-5 py-2.5 rounded-xl shadow-md gap-2"
            onClick={handlePrint}
            disabled={!peutImprimer}
            title={peutImprimer ? 'Imprimer ou enregistrer en PDF' : 'Générez un rapport pour l’imprimer'}
          >
            <Printer className="h-4 w-4 text-amber-400" /> {activeTab === 'journalier' ? 'Exporter PDF' : 'Imprimer le Rapport'}
          </Button>
          {activeTab === 'journalier' && (
            <Button
              variant="outline"
              className="rounded-xl border-emerald-200 bg-emerald-50 px-5 font-bold text-emerald-800 shadow-sm hover:bg-emerald-100"
              onClick={handleExportExcel}
              disabled={!rapportJournalier}
              title="Télécharger le rapport Excel"
            >
              <FileSpreadsheet className="mr-2 h-4 w-4" /> Exporter Excel
            </Button>
          )}
        </div>
      </div>

      {/* Filtres */}
      <Card className="rounded-2xl border-stone-200/80 shadow-sm">
        <CardContent className="grid gap-4 p-5 md:grid-cols-3">
          <div>
            <label className="text-xs font-semibold text-stone-600">Établissement *</label>
            <Select
              value={school || undefined}
              onValueChange={(v) => {
                setSchool(v)
                setYear('')
                setRapportFinancier(null)
                setRapportEleves(null)
                setRapportJournalier(null)
              }}
              disabled={locked}
            >
              <SelectTrigger className="rounded-xl border-stone-200 bg-white font-medium mt-1">
                <SelectValue placeholder="Sélectionner un établissement" />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                {!locked && (
                  <SelectItem value="ALL">
                    🏢 Tous les établissements
                  </SelectItem>
                )}
                {schools.map((s: any) => (
                  <SelectItem key={s.id} value={s.id}>
                    {`${getTypeIcon(s.type || '')} ${s.nom}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-xs font-semibold text-stone-600">Année scolaire *</label>
            <Select
              value={year || undefined}
              onValueChange={setYear}
              disabled={!school || years.length === 0}
            >
              <SelectTrigger className="rounded-xl border-stone-200 bg-white font-medium mt-1">
                <SelectValue placeholder="Sélectionner une année" />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                {years.map((y: any) => (
                  <SelectItem key={y.id} value={school === 'ALL' ? y.libelle : y.id}>
                    {y.libelle}
                    {y.active ? ' ★' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {activeTab === 'journalier' && (
            <div>
              <label className="text-xs font-semibold text-stone-600">Date du rapport *</label>
              <input type="date" value={dateJournalier} onChange={(e) => { setDateJournalier(e.target.value); setRapportJournalier(null) }} className="mt-1 h-10 w-full rounded-xl border border-stone-200 bg-white px-3 text-sm font-medium text-stone-700 outline-none focus:ring-2 focus:ring-amber-400" />
            </div>
          )}
          <div className="flex items-end">
            <Button onClick={generate} disabled={loading || !school || !year || (activeTab === 'journalier' && !dateJournalier)} className="w-full bg-[#1e3a8a] hover:bg-[#172554] text-white font-bold rounded-xl h-10 shadow-md">
              {loading ? 'Génération...' : 'Générer le rapport'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="bg-stone-100 p-1 rounded-xl border border-stone-200">
          <TabsTrigger value="financier" className="rounded-lg font-bold text-xs sm:text-sm data-[state=active]:bg-[#1e3a8a] data-[state=active]:text-amber-400">Rapport financier</TabsTrigger>
          <TabsTrigger value="eleves" className="rounded-lg font-bold text-xs sm:text-sm data-[state=active]:bg-[#1e3a8a] data-[state=active]:text-amber-400">Rapport élèves</TabsTrigger>
          <TabsTrigger value="journalier" className="rounded-lg font-bold text-xs sm:text-sm data-[state=active]:bg-[#1e3a8a] data-[state=active]:text-amber-400">Rapport journalier</TabsTrigger>
        </TabsList>

        {/* ── Financier ─────────────────────────────────────────────── */}
        <TabsContent value="financier" className="mt-4 space-y-4">
          {rapportFinancier ? (
            devises.length === 0 ? (
              <Card className="rounded-2xl border-stone-200 shadow-sm">
                <CardContent className="p-12 text-center text-stone-400 font-medium">
                  Aucune opération sur la période sélectionnée.
                </CardContent>
              </Card>
            ) : (
              <>
                <div className={`grid grid-cols-1 gap-4 ${
                  rapportFinancier.soldes.length > 1 ? 'md:grid-cols-2' : ''
                }`}>
                  {rapportFinancier.soldes.map((s) => (
                    <Card key={s.devise} className="rounded-2xl border-stone-200/80 shadow-sm overflow-hidden">
                      <CardHeader className="bg-stone-50/50 border-b border-stone-100 px-6 py-3">
                        <CardTitle className="flex items-center justify-between text-sm font-bold text-[#1e3a8a]">
                          <span>Bilan Financier</span>
                          <span className="rounded-md bg-[#1e3a8a] text-amber-400 px-2.5 py-0.5 text-xs font-bold">
                            {s.devise}
                          </span>
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3 p-6">
                        <div className="flex items-center justify-between gap-3">
                          <span className="flex items-center gap-1.5 text-xs font-semibold text-stone-600">
                            <TrendingUp className="h-4 w-4 text-emerald-600" /> Total Encaissements
                          </span>
                          <span className="font-bold tabular-nums text-stone-900 text-sm">
                            {formatMoney(s.encaissements, s.devise)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span className="flex items-center gap-1.5 text-xs font-semibold text-stone-600">
                            <TrendingDown className="h-4 w-4 text-rose-600" /> Total Dépenses
                          </span>
                          <span className="font-bold tabular-nums text-stone-900 text-sm">
                            {formatMoney(s.depenses, s.devise)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-3 border-t border-stone-100 pt-3">
                          <span className="flex items-center gap-1.5 text-xs font-bold text-stone-800">
                            <Banknote className="h-4 w-4 text-amber-600" /> Solde Net
                          </span>
                          <span
                            className={`text-base font-extrabold tabular-nums ${
                              s.solde >= 0 ? 'text-emerald-700' : 'text-rose-600'
                            }`}
                          >
                            {formatMoney(s.solde, s.devise)}
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {devises.map((dev) => {
                  const mois = moisParDevise.get(dev) ?? []
                  const s = rapportFinancier.soldes.find((x) => x.devise === dev)
                  return (
                    <Card key={dev} className="rounded-2xl border-stone-200/80 shadow-sm overflow-hidden">
                      <CardHeader className="bg-stone-50/50 border-b border-stone-100 px-6 py-4">
                        <CardTitle className="flex items-center justify-between text-base font-bold text-stone-900">
                          <span>Évolution Mensuelle</span>
                          <span className="rounded-md bg-[#1e3a8a] text-amber-400 px-2.5 py-0.5 text-xs font-bold">
                            {dev}
                          </span>
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="p-0">
                        <Table>
                          <TableHeader className="bg-[#1e3a8a] text-white">
                            <TableRow className="hover:bg-[#1e3a8a]">
                              <TableHead className="text-amber-300 font-bold">Mois</TableHead>
                              <TableHead className="text-right text-white font-bold">Encaissements</TableHead>
                              <TableHead className="text-right text-white font-bold">Dépenses</TableHead>
                              <TableHead className="text-right text-amber-300 font-bold">Solde</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {mois.length === 0 ? (
                              <TableRow>
                                <TableCell
                                  colSpan={4}
                                  className="py-8 text-center text-xs font-semibold text-stone-400"
                                >
                                  Aucune donnée pour cette devise.
                                </TableCell>
                              </TableRow>
                            ) : (
                              mois.map((m) => {
                                const enc = montantMois(rapportFinancier.encaissements, m, dev)
                                const dep = montantMois(rapportFinancier.depenses, m, dev)
                                const solde = enc - dep
                                return (
                                  <TableRow key={m} className="hover:bg-amber-500/5 transition-colors">
                                    <TableCell className="font-bold text-stone-800 text-xs">{formatMois(m)}</TableCell>
                                    <TableCell className="text-right tabular-nums text-xs font-bold text-emerald-700">
                                      {formatMoney(enc, dev)}
                                    </TableCell>
                                    <TableCell className="text-right tabular-nums text-xs font-bold text-rose-600">
                                      {formatMoney(dep, dev)}
                                    </TableCell>
                                    <TableCell
                                      className={`text-right font-extrabold tabular-nums text-xs ${
                                        solde >= 0 ? 'text-emerald-700' : 'text-rose-600'
                                      }`}
                                    >
                                      {formatMoney(solde, dev)}
                                    </TableCell>
                                  </TableRow>
                                )
                              })
                            )}
                            {mois.length > 0 && s && (
                              <TableRow className="border-t-2 border-stone-200 bg-stone-50 font-extrabold text-xs">
                                <TableCell className="text-stone-900">TOTAL {dev}</TableCell>
                                <TableCell className="text-right tabular-nums text-emerald-800">
                                  {formatMoney(s.encaissements, dev)}
                                </TableCell>
                                <TableCell className="text-right tabular-nums text-rose-700">
                                  {formatMoney(s.depenses, dev)}
                                </TableCell>
                                <TableCell
                                  className={`text-right tabular-nums ${
                                    s.solde >= 0 ? 'text-emerald-800' : 'text-rose-700'
                                  }`}
                                >
                                  {formatMoney(s.solde, dev)}
                                </TableCell>
                              </TableRow>
                            )}
                          </TableBody>
                        </Table>
                      </CardContent>
                    </Card>
                  )
                })}
              </>
            )
          ) : (
            <Card className="rounded-2xl border-stone-200 shadow-sm">
              <CardContent className="p-12 text-center text-stone-400 font-medium">
                <FileText className="mx-auto mb-3 h-12 w-12 opacity-30" />
                <p className="text-base font-bold text-stone-700">Générez un rapport pour afficher le bilan financier.</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── Élèves ────────────────────────────────────────────────── */}
        <TabsContent value="eleves" className="mt-4 space-y-4">
          {rapportEleves ? (
            <>
              <Card className="rounded-2xl border-stone-200/80 shadow-sm">
                <CardContent className="flex items-center gap-3 p-5">
                  <Users className="h-6 w-6 text-amber-600" />
                  <div>
                    <p className="text-xs font-semibold text-stone-500">Total élèves comptés</p>
                    <p className="text-2xl font-extrabold text-[#1e3a8a]">{rapportEleves.total}</p>
                  </div>
                </CardContent>
              </Card>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <Card className="rounded-2xl border-stone-200/80 shadow-sm overflow-hidden">
                <CardHeader className="bg-stone-50/50 border-b border-stone-100 px-6 py-3">
                  <CardTitle className="text-sm font-bold text-[#1e3a8a]">Par Statut</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader className="bg-[#1e3a8a] text-white">
                      <TableRow className="hover:bg-[#1e3a8a]">
                        <TableHead className="text-amber-300 font-bold">Statut</TableHead>
                        <TableHead className="text-right text-white font-bold">Nombre</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rapportEleves.parStatut.map((s) => (
                        <TableRow key={s.statut} className="hover:bg-amber-500/5">
                          <TableCell className="font-semibold text-xs text-stone-800">{STATUS_LABELS[s.statut] ?? s.statut}</TableCell>
                          <TableCell className="text-right font-extrabold text-xs text-stone-900">{s.count}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              <Card className="rounded-2xl border-stone-200/80 shadow-sm overflow-hidden">
                <CardHeader className="bg-stone-50/50 border-b border-stone-100 px-6 py-3">
                  <CardTitle className="text-sm font-bold text-[#1e3a8a]">Par Sexe</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader className="bg-[#1e3a8a] text-white">
                      <TableRow className="hover:bg-[#1e3a8a]">
                        <TableHead className="text-amber-300 font-bold">Sexe</TableHead>
                        <TableHead className="text-right text-white font-bold">Nombre</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rapportEleves.parSexe.map((s) => (
                        <TableRow key={s.sexe} className="hover:bg-amber-500/5">
                          <TableCell className="font-semibold text-xs text-stone-800">{sexeLabel(s.sexe)}</TableCell>
                          <TableCell className="text-right font-extrabold text-xs text-stone-900">{s.count}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              <Card className="rounded-2xl border-stone-200/80 shadow-sm overflow-hidden">
                <CardHeader className="bg-stone-50/50 border-b border-stone-100 px-6 py-3">
                  <CardTitle className="text-sm font-bold text-[#1e3a8a]">Par Classe</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader className="bg-[#1e3a8a] text-white">
                      <TableRow className="hover:bg-[#1e3a8a]">
                        <TableHead className="text-amber-300 font-bold">Classe</TableHead>
                        <TableHead className="text-right text-white font-bold">Nombre</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rapportEleves.parClasse.map((c) => (
                        <TableRow key={c.classeNom} className="hover:bg-amber-500/5">
                          <TableCell className="font-semibold text-xs text-stone-800 break-words">{c.classeNom}</TableCell>
                          <TableCell className="text-right font-extrabold text-xs text-stone-900">{c.count}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
              </div>
            </>
          ) : (
            <Card className="rounded-2xl border-stone-200 shadow-sm">
              <CardContent className="p-12 text-center text-stone-400 font-medium">
                <Users className="mx-auto mb-3 h-12 w-12 opacity-30" />
                <p className="text-base font-bold text-stone-700">Générez un rapport pour voir les statistiques des élèves.</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="journalier" className="mt-4 space-y-4">
          {rapportJournalier ? (
            <>
              <Card className="rounded-2xl border-stone-200/80 bg-[#1e3a8a] text-white shadow-lg">
                <CardContent className="grid grid-cols-2 gap-4 p-5 md:grid-cols-4">
                  <div><p className="text-[10px] font-bold uppercase tracking-wider text-amber-300">Reçus enregistrés</p><p className="mt-1 text-2xl font-extrabold">{rapportJournalier.totalRecus}</p></div>
                  <div><p className="text-[10px] font-bold uppercase tracking-wider text-emerald-300">Reçus valides</p><p className="mt-1 text-2xl font-extrabold">{rapportJournalier.totalValides}</p></div>
                  <div><p className="text-[10px] font-bold uppercase tracking-wider text-rose-300">Reçus annulés</p><p className="mt-1 text-2xl font-extrabold">{rapportJournalier.totalAnnules}</p></div>
                  <div><p className="text-[10px] font-bold uppercase tracking-wider text-amber-300">Dépenses</p><p className="mt-1 text-2xl font-extrabold">{rapportJournalier.totalDepenses}</p></div>
                </CardContent>
              </Card>
              <div className="grid gap-4 md:grid-cols-2">
                {rapportJournalier.totaux.map((t) => (
                  <Card key={t.devise} className="rounded-2xl border-stone-200/80 shadow-sm"><CardContent className="grid grid-cols-3 gap-3 p-5"><div><p className="text-[10px] font-bold uppercase text-stone-500">Encaissements</p><p className="mt-1 text-sm font-extrabold text-emerald-700">{formatMoney(t.encaissements, t.devise)}</p></div><div><p className="text-[10px] font-bold uppercase text-stone-500">Dépenses</p><p className="mt-1 text-sm font-extrabold text-rose-600">{formatMoney(t.depenses, t.devise)}</p></div><div><p className="text-[10px] font-bold uppercase text-stone-500">Solde net</p><p className={`mt-1 text-sm font-extrabold ${t.solde >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>{formatMoney(t.solde, t.devise)}</p></div></CardContent></Card>
                ))}
              </div>
              <Card className="overflow-hidden rounded-2xl border-stone-200/80 shadow-sm"><CardHeader className="border-b border-stone-100 bg-stone-50/50 px-6 py-3"><CardTitle className="text-sm font-bold text-[#1e3a8a]">Répartition par mode de paiement</CardTitle></CardHeader><CardContent className="p-0"><Table><TableHeader className="bg-[#1e3a8a] text-white"><TableRow><TableHead className="text-amber-300">Mode</TableHead><TableHead>Devise</TableHead><TableHead className="text-right">Nombre</TableHead><TableHead className="text-right">Total</TableHead></TableRow></TableHeader><TableBody>{rapportJournalier.parMode.map((m, i) => <TableRow key={`${m.mode}-${m.devise}-${i}`}><TableCell className="text-xs font-semibold">{m.mode || '—'}</TableCell><TableCell className="text-xs">{m.devise}</TableCell><TableCell className="text-right text-xs font-bold">{m.nombre}</TableCell><TableCell className="text-right text-xs font-bold text-emerald-700">{formatMoney(m.total, m.devise)}</TableCell></TableRow>)}</TableBody></Table></CardContent></Card>
              <Card className="overflow-hidden rounded-2xl border-stone-200/80 shadow-sm"><CardHeader className="border-b border-stone-100 bg-stone-50/50 px-6 py-3"><CardTitle className="text-sm font-bold text-[#1e3a8a]">Détail des reçus — {dateJournalier}</CardTitle></CardHeader><CardContent className="overflow-x-auto p-0"><Table><TableHeader className="bg-[#1e3a8a] text-white"><TableRow><TableHead className="text-amber-300">Heure</TableHead><TableHead>N° reçu</TableHead>{school === 'ALL' && <TableHead>Établissement</TableHead>}<TableHead>Élève</TableHead><TableHead>Motif</TableHead><TableHead>Mode</TableHead><TableHead className="text-right">Montant</TableHead><TableHead>Statut</TableHead></TableRow></TableHeader><TableBody>{rapportJournalier.recus.map((r, i) => <TableRow key={`${r.numeroRecu}-${i}`} className={r.statut === 'ANNULE' ? 'bg-rose-50/50 opacity-60' : ''}><TableCell className="text-xs">{r.heure}</TableCell><TableCell className="font-mono text-xs font-bold">{r.numeroRecu}</TableCell>{school === 'ALL' && <TableCell className="text-xs font-semibold">{r.etablissementNom || '—'}</TableCell>}<TableCell className="text-xs font-semibold">{r.eleve}<br /><span className="text-[10px] text-stone-400">{r.matricule} — {r.classe}</span></TableCell><TableCell className="text-xs">{r.motif}</TableCell><TableCell className="text-xs">{r.modePaiement}</TableCell><TableCell className="text-right text-xs font-bold">{formatMoney(r.montant, r.devise)}</TableCell><TableCell className="text-xs font-bold">{r.statut === 'ANNULE' ? 'Annulé' : 'Valide'}</TableCell></TableRow>)}</TableBody></Table></CardContent></Card>
              <Card className="overflow-hidden rounded-2xl border-stone-200/80 shadow-sm"><CardHeader className="border-b border-stone-100 bg-stone-50/50 px-6 py-3"><CardTitle className="text-sm font-bold text-[#1e3a8a]">Détail des dépenses</CardTitle></CardHeader><CardContent className="overflow-x-auto p-0"><Table><TableHeader className="bg-[#1e3a8a] text-white"><TableRow><TableHead className="text-amber-300">Heure</TableHead>{school === 'ALL' && <TableHead>Établissement</TableHead>}<TableHead>Catégorie</TableHead><TableHead>Libellé</TableHead><TableHead>Bénéficiaire</TableHead><TableHead className="text-right">Montant</TableHead><TableHead>Statut</TableHead></TableRow></TableHeader><TableBody>{rapportJournalier.depenses.map((d, i) => <TableRow key={`${d.heure}-${d.libelle}-${i}`}><TableCell className="text-xs">{d.heure}</TableCell>{school === 'ALL' && <TableCell className="text-xs font-semibold">{d.etablissementNom || '—'}</TableCell>}<TableCell className="text-xs">{d.categorie}</TableCell><TableCell className="text-xs font-semibold">{d.libelle}</TableCell><TableCell className="text-xs">{d.beneficiaire || '—'}</TableCell><TableCell className="text-right text-xs font-bold">{formatMoney(d.montant, d.devise)}</TableCell><TableCell className="text-xs">{d.statut}</TableCell></TableRow>)}</TableBody></Table></CardContent></Card>
            </>
          ) : (
            <Card className="rounded-2xl border-stone-200 shadow-sm"><CardContent className="p-12 text-center text-stone-400 font-medium"><FileText className="mx-auto mb-3 h-12 w-12 opacity-30" /><p className="text-base font-bold text-stone-700">Sélectionnez une date puis générez le rapport journalier.</p></CardContent></Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}