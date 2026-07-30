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
import { Printer, TrendingUp, TrendingDown, Banknote } from 'lucide-react'

/* ────────────────────────────────────────────────────────────────────────────
 * Types
 * ──────────────────────────────────────────────────────────────────────────*/

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
}

/* ────────────────────────────────────────────────────────────────────────────
 * Constantes & helpers
 * ──────────────────────────────────────────────────────────────────────────*/

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

/**
 * Montant suivi de son code devise.
 *
 * L'ancienne version forçait la locale `fr-CD` : un montant en USD sortait
 * avec le séparateur congolais. Et `style: 'currency'` place le symbole en
 * suffixe pour CDF, en préfixe pour USD — incohérent dans un tableau.
 */
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

/** « 2026-03 » → « mars 2026 ». Tolère un format inattendu. */
function formatMois(mois: string) {
  const [annee, moisNum] = String(mois ?? '').split('-')
  const d = new Date(Number(annee), Number(moisNum) - 1, 1)
  if (Number.isNaN(d.getTime())) return mois
  return d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
}

/**
 * Accepte l'ancien format du backend comme le nouveau.
 *
 * Ancien : `{ encaissements: [{mois, total}], depenses: [...], solde }`
 *          → pas de `devise` par ligne, un `solde` scalaire.
 * Nouveau : `{ encaissements: [{mois, devise, total}], soldes: [...], devises }`
 *
 * Sans ce repli, une page à jour branchée sur un backend non recompilé
 * n'affiche plus rien : aucune devise détectée, donc aucun tableau.
 */
function normaliserFinancier(data: any): RapportFinancier {
  const enc: any[] = Array.isArray(data?.encaissements) ? data.encaissements : []
  const dep: any[] = Array.isArray(data?.depenses) ? data.depenses : []

  // Le backend est-il déjà ventilé ?
  const ventile = enc.some((x) => x?.devise) || dep.some((x) => x?.devise)
  const DEFAUT = (data?.devise || 'CDF').toUpperCase()

  const norm = (l: any[]): MoisDeviseMontant[] =>
    l.map((x) => ({
      mois: String(x?.mois ?? ''),
      devise: String(x?.devise ?? DEFAUT).toUpperCase(),
      total: Number(x?.total ?? 0),
    }))

  const encaissements = norm(enc)
  const depenses = norm(dep)

  // Soldes : fournis par le backend, sinon recalculés devise par devise.
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

  // Avertit si les montants risquent de mélanger des devises.
  if (!ventile && devises.length > 0) {
    console.warn(
      '[rapports] Backend non ventilé : les montants peuvent additionner ' +
        'plusieurs devises. Recompilez src-tauri/rapports.rs.',
    )
  }

  return { encaissements, depenses, soldes, devises }
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

/* ────────────────────────────────────────────────────────────────────────────
 * Impression
 *
 * `window.print()` sur la page courante donne une feuille blanche en Tauri :
 * la webview n'imprime pas correctement le document hôte (layout en
 * `h-screen overflow-hidden`, styles Tailwind non résolus…).
 * On construit donc un document A4 autonome dans une iframe cachée.
 * ──────────────────────────────────────────────────────────────────────────*/

interface PrintContext {
  titre: string
  etablissement: string
  annee: string
  financier: RapportFinancier | null
  eleves: RapportEleves | null
  onglet: string
}

function buildRapportHtml(ctx: PrintContext): string {
  const { financier, eleves } = ctx

  // ── Tableau mensuel, une section par devise ────────────────────────────
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

    // Cartes de synthèse : une par devise, jamais de total inter-devises
    const cartes = financier.soldes
      .map(
        (s) => `
      <div class="card">
        <span>${escapeHtml(s.devise)} — encaissements</span>
        <b class="pos">${escapeHtml(formatMoney(s.encaissements, s.devise))}</b>
        <span style="margin-top:4px">Dépenses</span>
        <b class="neg">${escapeHtml(formatMoney(s.depenses, s.devise))}</b>
        <span style="margin-top:4px">Solde</span>
        <b class="${s.solde >= 0 ? 'pos' : 'neg'}">${escapeHtml(formatMoney(s.solde, s.devise))}</b>
      </div>`,
      )
      .join('')

    // Un tableau mensuel par devise
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

  // ── Statistiques élèves ────────────────────────────────────────────────
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

    const sum = (arr: { count: number }[]) => arr.reduce((s, x) => s + x.count, 0)

    blocEleves = `
    <div class="grid">
      ${petiteTable('Par statut', 'Statut', rowsStatut, sum(eleves.parStatut))}
      ${petiteTable('Par sexe', 'Sexe', rowsSexe, sum(eleves.parSexe))}
    </div>
    ${petiteTable('Par classe', 'Classe', rowsClasse, sum(eleves.parClasse))}`
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
      border-bottom: 3px solid #075e54; padding-bottom: 10px; margin-bottom: 18px;
      display: flex; justify-content: space-between; align-items: flex-end;
    }
    header h1 { font-size: 20px; color: #075e54; letter-spacing: -.3px; }
    header .sub { color: #6b7280; font-size: 11px; margin-top: 3px; }
    header .meta { text-align: right; font-size: 11px; color: #6b7280; }
    h2 {
      font-size: 12px; text-transform: uppercase; letter-spacing: .5px;
      color: #075e54; margin: 16px 0 6px; padding-bottom: 3px;
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
      background: #075e54; color: #fff; padding: 6px 8px; text-align: left;
      font-size: 10px; text-transform: uppercase; letter-spacing: .4px;
    }
    td { padding: 5px 8px; border-bottom: 1px solid #e5e7eb; }
    th.n, td.n { text-align: right; }
    tfoot td { font-weight: 700; border-top: 2px solid #111827; background: #f9fafb; }
    .pos { color: #047857; }
    .neg { color: #b91c1c; }
    .vide { text-align: center; color: #9ca3af; font-style: italic; padding: 14px; }
    .grid { display: flex; gap: 12px; }
    .col { flex: 1; }
    footer {
      margin-top: 20px; border-top: 1px solid #e5e7eb; padding-top: 8px;
      font-size: 9px; color: #9ca3af; text-align: center;
    }
    /* Les fonds colorés doivent sortir à l'impression */
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

  ${blocFinancier}${blocEleves}

  <footer>
    Document généré automatiquement le ${escapeHtml(new Date().toLocaleString('fr-FR'))}
  </footer>
</body>
</html>`
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
      // Laisse le dialogue système s'ouvrir avant de retirer l'iframe
      setTimeout(() => frame.remove(), 1500)
    }
  }

  if (doc.readyState === 'complete') setTimeout(launch, 60)
  else frame.onload = launch
}

/* ────────────────────────────────────────────────────────────────────────────
 * Page
 * ──────────────────────────────────────────────────────────────────────────*/

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
  const [activeTab, setActiveTab] = useState('financier')

  /* ── Établissements ─────────────────────────────────────────────────── */
  useEffect(() => {
    if (!user) return
    ;(async () => {
      try {
        const res = await tc.listEtablissements(locked ? schoolFilter! : undefined)
        setSchools(res?.etablissements ?? [])
        if (locked) setSchool(schoolFilter!)
      } catch {
        /* les filtres restent utilisables */
      }
    })()
  }, [user, locked, schoolFilter])

  /* ── Années de l'établissement ──────────────────────────────────────── */
  useEffect(() => {
    if (!school) {
      setYears([])
      setYear('')
      return
    }
    ;(async () => {
      try {
        const res = await tc.listAnneesScolaires(school)
        const data: any[] = res?.annees_scolaires ?? []
        setYears(data)
        if (data.length > 0) {
          const active = data.find((y) => y.active)
          setYear(active?.id ?? data[0].id)
        } else {
          setYear('')
        }
      } catch {
        setYears([])
        setYear('')
      }
    })()
  }, [school])

  /* ── Génération ─────────────────────────────────────────────────────── */
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
      } else {
        const res = await tc.getRapportEleves(school, year)
        const data = res?.data ?? res
        setRapportEleves({
          parStatut: Array.isArray(data?.parStatut) ? data.parStatut : [],
          parSexe: Array.isArray(data?.parSexe) ? data.parSexe : [],
          parClasse: Array.isArray(data?.parClasse) ? data.parClasse : [],
        })
      }
      toast.success('Rapport généré avec succès')
    } catch (e: any) {
      toast.error(e?.message || 'Erreur lors de la génération du rapport')
    } finally {
      setLoading(false)
    }
  }

  /* ── Dérivés ────────────────────────────────────────────────────────── */
  const rapportCourant = activeTab === 'financier' ? rapportFinancier : rapportEleves
  const peutImprimer = !!rapportCourant

  /** Devises présentes dans le rapport, avec repli si le backend est ancien. */
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

  /** Mois × devise : un tableau distinct par devise. */
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

  function handlePrint() {
    if (!peutImprimer) {
      toast.error('Générez d’abord un rapport avant d’imprimer.')
      return
    }
    printRapport({
      titre: activeTab === 'financier' ? 'Rapport financier' : 'Rapport des élèves',
      etablissement: schools.find((s) => s.id === school)?.nom ?? '—',
      annee: years.find((y) => y.id === year)?.libelle ?? '—',
      financier: rapportFinancier,
      eleves: rapportEleves,
      onglet: activeTab,
    })
  }

  /* ── Rendu ──────────────────────────────────────────────────────────── */
  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Rapports</h1>
          <p className="text-sm text-muted-foreground">
            Consultez les rapports financiers et statistiques des élèves.
          </p>
        </div>
        <Button
          variant="outline"
          className="gap-2"
          onClick={handlePrint}
          disabled={!peutImprimer}
          title={peutImprimer ? 'Imprimer le rapport' : 'Générez un rapport pour l’imprimer'}
        >
          <Printer className="h-4 w-4" /> Imprimer
        </Button>
      </div>

      {/* Filtres */}
      <Card>
        <CardContent className="grid gap-3 p-4 md:grid-cols-3">
          <div>
            <label className="text-sm font-medium">Établissement</label>
            <Select
              value={school || undefined}
              onValueChange={(v) => {
                setSchool(v)
                setYear('')
                setRapportFinancier(null)
                setRapportEleves(null)
              }}
              disabled={locked}
            >
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Sélectionner un établissement" />
              </SelectTrigger>
              <SelectContent>
                {schools.map((s: any) => (
                  <SelectItem key={s.id} value={s.id}>
                    {`${getTypeIcon(s.type || '')} ${s.nom}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-sm font-medium">Année scolaire</label>
            <Select
              value={year || undefined}
              onValueChange={setYear}
              disabled={!school || years.length === 0}
            >
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Sélectionner une année" />
              </SelectTrigger>
              <SelectContent>
                {years.map((y: any) => (
                  <SelectItem key={y.id} value={y.id}>
                    {y.libelle}
                    {y.active ? ' ★' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-end">
            <Button onClick={generate} disabled={loading || !school || !year} className="w-full">
              {loading ? 'Génération...' : 'Générer le rapport'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="financier">Rapport financier</TabsTrigger>
          <TabsTrigger value="eleves">Rapport élèves</TabsTrigger>
        </TabsList>

        {/* ── Financier ─────────────────────────────────────────────── */}
        <TabsContent value="financier" className="mt-4 space-y-4">
          {rapportFinancier ? (
            devises.length === 0 ? (
              <Card>
                <CardContent className="p-12 text-center text-muted-foreground">
                  <p>Aucune opération sur la période sélectionnée.</p>
                </CardContent>
              </Card>
            ) : (
              <>
                {/* Une carte de synthèse par devise — jamais de total mélangé */}
                <div
                  className={`grid grid-cols-1 gap-4 ${
                    rapportFinancier.soldes.length > 1 ? 'md:grid-cols-2' : ''
                  }`}
                >
                  {rapportFinancier.soldes.map((s) => (
                    <Card key={s.devise} className="overflow-hidden">
                      <CardHeader className="pb-3">
                        <CardTitle className="flex items-center gap-2 text-base">
                          <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-bold">
                            {s.devise}
                          </span>
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2.5 pt-0">
                        <div className="flex items-center justify-between gap-3">
                          <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                            <TrendingUp className="h-4 w-4 text-emerald-500" /> Encaissements
                          </span>
                          <span className="font-bold tabular-nums">
                            {formatMoney(s.encaissements, s.devise)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                            <TrendingDown className="h-4 w-4 text-red-500" /> Dépenses
                          </span>
                          <span className="font-bold tabular-nums">
                            {formatMoney(s.depenses, s.devise)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-3 border-t pt-2.5">
                          <span className="flex items-center gap-1.5 text-sm font-medium">
                            <Banknote className="h-4 w-4 text-blue-500" /> Solde
                          </span>
                          <span
                            className={`text-lg font-bold tabular-nums ${
                              s.solde >= 0 ? 'text-emerald-600' : 'text-red-600'
                            }`}
                          >
                            {formatMoney(s.solde, s.devise)}
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {/* Un tableau mensuel par devise */}
                {devises.map((dev) => {
                  const mois = moisParDevise.get(dev) ?? []
                  const s = rapportFinancier.soldes.find((x) => x.devise === dev)
                  return (
                    <Card key={dev}>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          Évolution mensuelle
                          <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-bold">
                            {dev}
                          </span>
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Mois</TableHead>
                              <TableHead className="text-right">Encaissements</TableHead>
                              <TableHead className="text-right">Dépenses</TableHead>
                              <TableHead className="text-right">Solde</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {mois.length === 0 ? (
                              <TableRow>
                                <TableCell
                                  colSpan={4}
                                  className="py-8 text-center text-muted-foreground"
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
                                  <TableRow key={m}>
                                    <TableCell>{formatMois(m)}</TableCell>
                                    <TableCell className="text-right tabular-nums">
                                      {formatMoney(enc, dev)}
                                    </TableCell>
                                    <TableCell className="text-right tabular-nums">
                                      {formatMoney(dep, dev)}
                                    </TableCell>
                                    <TableCell
                                      className={`text-right font-semibold tabular-nums ${
                                        solde >= 0 ? 'text-emerald-600' : 'text-red-600'
                                      }`}
                                    >
                                      {formatMoney(solde, dev)}
                                    </TableCell>
                                  </TableRow>
                                )
                              })
                            )}
                            {mois.length > 0 && s && (
                              <TableRow className="border-t-2 bg-slate-50 font-bold dark:bg-slate-900/40">
                                <TableCell>TOTAL {dev}</TableCell>
                                <TableCell className="text-right tabular-nums">
                                  {formatMoney(s.encaissements, dev)}
                                </TableCell>
                                <TableCell className="text-right tabular-nums">
                                  {formatMoney(s.depenses, dev)}
                                </TableCell>
                                <TableCell
                                  className={`text-right tabular-nums ${
                                    s.solde >= 0 ? 'text-emerald-600' : 'text-red-600'
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
            <Card>
              <CardContent className="p-12 text-center text-muted-foreground">
                <p>Générez un rapport pour voir les données financières.</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── Élèves ────────────────────────────────────────────────── */}
        <TabsContent value="eleves" className="mt-4 space-y-4">
          {rapportEleves ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <Card>
                <CardHeader>
                  <CardTitle>Par statut</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Statut</TableHead>
                        <TableHead className="text-right">Nombre</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rapportEleves.parStatut.map((s) => (
                        <TableRow key={s.statut}>
                          <TableCell>{STATUS_LABELS[s.statut] ?? s.statut}</TableCell>
                          <TableCell className="text-right font-semibold">{s.count}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Par sexe</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Sexe</TableHead>
                        <TableHead className="text-right">Nombre</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rapportEleves.parSexe.map((s) => (
                        <TableRow key={s.sexe}>
                          <TableCell>{sexeLabel(s.sexe)}</TableCell>
                          <TableCell className="text-right font-semibold">{s.count}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Par classe</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Classe</TableHead>
                        <TableHead className="text-right">Nombre</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rapportEleves.parClasse.map((c) => (
                        <TableRow key={c.classeNom}>
                          <TableCell>{c.classeNom}</TableCell>
                          <TableCell className="text-right font-semibold">{c.count}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>
          ) : (
            <Card>
              <CardContent className="p-12 text-center text-muted-foreground">
                <p>Générez un rapport pour voir les statistiques des élèves.</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
