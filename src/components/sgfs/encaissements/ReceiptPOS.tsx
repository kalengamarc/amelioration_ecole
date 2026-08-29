'use client'

import filigram from '@/assets/gramme.png'
import { Printer, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/lib/store'

/* ────────────────────────────────────────────────────────────────────────────
 * Types
 * ──────────────────────────────────────────────────────────────────────────*/

/** Totaux d'un élève dans UNE devise. Jamais de somme inter-devises. */
export interface TotalDevise {
  devise: string
  totalDu: number
  totalPaye: number
  reste: number
}

export interface PosReceiptData {
  numeroRecu: string
  dateEncaissement?: string
  eleveNom?: string
  eleveClasse?: string
  motif?: string
  montant: number
  devise: string
  modePaiement: string
  referencePaiement?: string
  tauxChange?: number | null
  caissierNom?: string
  statut?: string

  /* ── Situation du compte après ce versement ─────────────────────────────
   * Tous facultatifs : le bloc n'apparaît que si des données sont fournies.
   * ─────────────────────────────────────────────────────────────────────*/
  /** Total des frais exigibles — valable si UNE seule devise. */
  totalDu?: number | null
  /** Cumul versé, CE paiement inclus — valable si UNE seule devise. */
  totalPaye?: number | null
  /** Solde restant — valable si UNE seule devise. */
  reste?: number | null
  /** Détail des frais encore dus, ex. « Bulletin ». */
  detailReste?: string | null
  /** Prochaine échéance à honorer. */
  prochaineEcheance?: string | null
  /**
   * Devise des montants de situation ci-dessus.
   *
   * ⚠️ Distincte de `devise`, qui est celle du VERSEMENT. Un parent peut
   * payer 80 USD sur un compte dont la dette est en CDF : étiquetter
   * « 20 000 » avec la devise du paiement affiche « 20 000 USD ».
   */
  deviseSituation?: string | null

  /**
   * Situation ventilée par devise.
   *
   * Un élève peut devoir 20 000 CDF ET 180 USD : les additionner produirait
   * « 20 180 USD », un montant qui n'existe pas. Si ce tableau est fourni,
   * il prime sur `totalDu` / `totalPaye` / `reste`.
   */
  totaux?: TotalDevise[] | null
}

export interface PosSchoolData {
  nom?: string
  adresse?: string
  telephone?: string
  email?: string
  siteWeb?: string
  rccm?: string | null
  idNat?: string | null
}

export interface PosEtabParams {
  mentionsLegales?: string | null
  piedPageRecu?: string | null
}

/* ────────────────────────────────────────────────────────────────────────────
 * Constantes
 * ──────────────────────────────────────────────────────────────────────────*/

/** Affiché sous le nom de l'établissement, écran et impression. */
const ETAB_SITE_WEB = ''

const LOCALES: Record<string, string> = { CDF: 'fr-CD', BIF: 'fr-BI', USD: 'en-US' }
const SANS_DECIMALES = ['CDF', 'BIF']

/* ────────────────────────────────────────────────────────────────────────────
 * Helpers
 * ──────────────────────────────────────────────────────────────────────────*/

/**
 * Année scolaire déduite de la DATE DU REÇU.
 *
 *   août → décembre (08-12) : année en cours → suivante   → 2026-2027
 *   janvier → juillet (01-07) : année précédente → en cours → 2025-2026
 *
 * Août est rattaché à la rentrée à venir : les inscriptions y démarrent.
 * Un reçu réimprimé garde ainsi l'année de son encaissement, pas celle
 * du jour où on l'imprime.
 */
function anneeScolaireDuRecu(dateRecu?: string): string {
  const ref = dateRecu ? new Date(dateRecu) : new Date()
  const d = Number.isNaN(ref.getTime()) ? new Date() : ref
  // getMonth() est 0-based : 7 = août, premier mois de la nouvelle année.
  const MOIS_RENTREE = 7
  const an = d.getFullYear()
  const debut = d.getMonth() >= MOIS_RENTREE ? an : an - 1
  return `${debut}-${debut + 1}`
}

/**
 * Montant suivi de son code devise.
 *
 * ⚠️ Ne jamais replier sur `currency: 'USD'` : un montant en CDF s'afficherait
 * « $20,180.00 ». Le code passé est conservé tel quel et toujours suffixé.
 */
function money(value: number | null | undefined, devise?: string | null) {
  const d = (devise || 'CDF').toUpperCase()
  const v = Number(value ?? 0)
  const sansDec = SANS_DECIMALES.includes(d)
  const n = new Intl.NumberFormat(LOCALES[d] ?? 'fr-FR', {
    minimumFractionDigits: sansDec ? 0 : 2,
    maximumFractionDigits: sansDec ? 0 : 2,
  }).format(v)
  return `${n} ${d}`
}

/** Liste multi-devises : « 20 000 CDF + 180.00 USD ». */
function moneyMulti(
  totaux: TotalDevise[] | null | undefined,
  champ: 'totalDu' | 'totalPaye' | 'reste',
  fallback: { montant?: number | null; devise?: string | null },
): string {
  const l = (totaux ?? []).filter((t) => Math.abs(Number(t[champ])) > 0.009)
  if (l.length === 0) return money(fallback.montant, fallback.devise)
  return l.map((t) => money(Number(t[champ]), t.devise)).join(' + ')
}

/**
 * Devise des montants de situation.
 * Priorité : champ explicite → 1re devise de `totaux` → devise du paiement.
 */
function deviseSituation(r: PosReceiptData): string {
  return (r.deviseSituation || r.totaux?.[0]?.devise || r.devise || 'CDF').toUpperCase()
}

/** Devises ayant encore un reste à payer. */
function restesDus(r: PosReceiptData): TotalDevise[] {
  return (r.totaux ?? []).filter((t) => t.reste > 0.009)
}

function dateTime(value?: string) {
  const date = value ? new Date(value) : new Date()
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}

function dateOnly(value?: string | null) {
  if (!value) return '—'
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('fr-FR')
}

function paymentLabel(mode?: string) {
  return (
    ({ ESPECES: 'Espèces', CHEQUE: 'Chèque', VIREMENT: 'Virement' } as Record<string, string>)[
      mode || ''
    ] || mode || '—'
  )
}

function escapeHtml(value: unknown) {
  return String(value ?? '—')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

/** Le bloc « situation » n'a de sens que si un montant dû est connu. */
function hasSituation(r: PosReceiptData): boolean {
  if ((r.totaux?.length ?? 0) > 0) return true
  return typeof r.totalDu === 'number' && r.totalDu > 0
}

/* ────────────────────────────────────────────────────────────────────────────
 * Impression via iframe temporaire
 * ──────────────────────────────────────────────────────────────────────────*/

function printPosReceipt(
  receipt: PosReceiptData,
  school?: PosSchoolData,
  etabParams?: PosEtabParams | null,
) {
  const iframe = document.createElement('iframe')
  Object.assign(iframe.style, {
    position: 'fixed',
    right: '0',
    bottom: '0',
    width: '0',
    height: '0',
    border: 'none',
    visibility: 'hidden',
  })
  document.body.appendChild(iframe)

  const annule = receipt.statut === 'ANNULE'
  const devise = receipt.devise

  const reference = receipt.referencePaiement
    ? `<div class="line"><span>Référence</span><b>${escapeHtml(receipt.referencePaiement)}</b></div>`
    : ''

  const taux =
    receipt.tauxChange && devise === 'CDF'
      ? `<div class="line"><span>Taux</span><b>1 USD = ${receipt.tauxChange.toLocaleString('fr-CD')} CDF</b></div>`
      : ''

  // ── Bloc situation, ventilé par devise ──────────────────────────────────
  const multi = (receipt.totaux?.length ?? 0) > 0
  const dus = restesDus(receipt)
  const solde = multi ? dus.reduce((s, t) => s + t.reste, 0) : Number(receipt.reste ?? 0)
  const rienDu = multi ? dus.length === 0 : solde <= 0.009
  // Devise de la DETTE, distincte de celle du versement.
  const devSit = deviseSituation(receipt)

  const ligneSolde = multi
    ? dus.length === 0
      ? `<div class="solde solde-ok"><span>COMPTE SOLDÉ</span><strong>—</strong></div>`
      : dus
          .map(
            (t) =>
              `<div class="solde solde-du"><span>RESTE À PAYER</span>` +
              `<strong>${escapeHtml(money(t.reste, t.devise))}</strong></div>`,
          )
          .join('')
    : `<div class="solde ${rienDu ? 'solde-ok' : 'solde-du'}">
         <span>${rienDu ? 'COMPTE SOLDÉ' : 'RESTE À PAYER'}</span>
         <strong>${escapeHtml(money(solde, devSit))}</strong>
       </div>`

  const situation = hasSituation(receipt)
    ? `
  <hr />
  <div class="section-title">SITUATION DU COMPTE</div>
  <div class="line"><span>Total exigible</span><b>${escapeHtml(
    moneyMulti(receipt.totaux, 'totalDu', { montant: receipt.totalDu, devise: devSit }),
  )}</b></div>
  <div class="line"><span>Total versé</span><b>${escapeHtml(
    moneyMulti(receipt.totaux, 'totalPaye', { montant: receipt.totalPaye, devise: devSit }),
  )}</b></div>
  ${ligneSolde}
  ${
    !rienDu && receipt.detailReste
      ? `<div class="detail">Reste : ${escapeHtml(receipt.detailReste)}</div>`
      : ''
  }
  ${
    !rienDu && receipt.prochaineEcheance
      ? `<div class="line"><span>Prochaine échéance</span><b>${escapeHtml(dateOnly(receipt.prochaineEcheance))}</b></div>`
      : ''
  }`
    : ''

  const anneeLbl = anneeScolaireDuRecu(receipt.dateEncaissement)

  const htmlContent = `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <title>Reçu ${escapeHtml(receipt.numeroRecu)}</title>
  <style>
    @page { size: 80mm auto; margin: 0; }
    * { box-sizing: border-box; }
    html, body {
      width: 100%; margin: 0; padding: 0; background: #fff; color: #000;
    }
    body { font-family: Arial, sans-serif; font-size: 10px; line-height: 1; }
    .ticket { 
      width: 70mm; 
      padding: 4mm 4mm 2mm 4mm;  /* ← padding gauche = droite = 4mm */
      overflow: hidden; 
      background: #fff;
      position: relative;
      margin: 0 auto;  /* ← centrage horizontal sur la page */
    }
    .ticket::before {
      content: '';
      position: absolute;
      top: 0; left: 0; right: 0; bottom: 0;
      background-image: url('${filigram.src}');
      background-size: 50mm auto;
      background-position: center;
      background-repeat: no-repeat;
      opacity: 0.12;
      z-index: 0;
      pointer-events: none;
    }
    .ticket > * {
      position: relative;
      justify-content : center;
      z-index: 1;
    }
    .center { text-align: center; }
    h1 { font-size: 10px; line-height: 1; margin: 0; text-transform: uppercase; font-weight: bold; }
    p { margin: 0.8mm 0; }
    hr { border: 0; border-top: 1px dashed #000; margin: 1mm 0; }
    .line { display: flex; justify-content: space-between; gap: 1mm; margin: 0.8mm 0; }
    .line b { max-width: 40mm; text-align: right; overflow-wrap: anywhere; }
    .student { font-weight: bold; text-transform: uppercase; font-size: 12px; }
    .amount { display: flex; justify-content: space-between; align-items: flex-end;
              font-size: 8px; font-weight: bold; }
    .amount strong { font-size: 8px; }
    .section-title { font-size: 8px; font-weight: bold; letter-spacing: .5px;
                     text-align: center; margin-bottom: 1mm; }
    .solde { display: flex; justify-content: space-between; align-items: center;
             border: 1px solid #000; padding: 1mm; margin: 1mm 0;
             font-weight: bold; font-size: 8px; }
    .solde strong { font-size: 8px; }
    .solde-ok { border-style: dashed; }
    .detail { font-size: 8px; text-align: center; margin: 0.8mm 0;
              padding: 1mm; border: 1px dotted #000; overflow-wrap: anywhere; }
    .cancelled { display: inline-block; border: 2px solid #000; padding: 1mm 1mm;
                 margin-top: 1.5mm; font-weight: bold; }
    .footer { text-align: center; font-size: 8px; }
    @media print { 
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      @page { margin: 0; }
    }
  </style>
</head>
<body>
<main class="ticket">
  <header class="center">
    <h1>${escapeHtml(school?.nom || 'SGFS-ME')}</h1>
    <p>${escapeHtml(school?.siteWeb || ETAB_SITE_WEB)}</p>
    ${school?.adresse ? `<p>${escapeHtml(school.adresse)}</p>` : ''}
    ${school?.telephone ? `<p>Tél: ${escapeHtml(school.telephone)}</p>` : ''}
  </header>
  <hr />
  <div class="center">
    <b>REÇU PAIEMENT</b>
    ${annule ? '<div class="cancelled">ANNULÉ</div>' : ''}
  </div>
  ${anneeLbl ? `<div class="center">${escapeHtml(anneeLbl)}</div>` : ''}
  <hr />
  <div class="line"><span>N°</span><b>${escapeHtml(receipt.numeroRecu)}</b></div>
  <div class="line"><span>Date</span><b>${escapeHtml(dateTime(receipt.dateEncaissement))}</b></div>
  <div class="line"><span>Caissier</span><b>${escapeHtml(receipt.caissierNom || 'Sys')}</b></div>
  <hr />
  <p>ÉLÈVE</p><p class="student">${escapeHtml(receipt.eleveNom)}</p>
  <div class="line"><span>Classe</span><b>${escapeHtml(receipt.eleveClasse)}</b></div>
  <hr />
  <div class="line"><span>Motif</span><b>${escapeHtml(receipt.motif)}</b></div>
  <div class="line"><span>Mode</span><b>${escapeHtml(paymentLabel(receipt.modePaiement))}</b></div>
  ${reference}${taux}
  <hr />
  <div class="amount"><span>REÇU</span><strong>${escapeHtml(money(receipt.montant, devise))}</strong></div>
  ${situation}
  ${receipt.detailReste ? `<div class="detail">Reste: ${escapeHtml(receipt.detailReste)}</div>` : ''}
  ${receipt.prochaineEcheance ? `<div class="line"><span>Prochaine échéance</span><b>${escapeHtml(dateOnly(receipt.prochaineEcheance))}</b></div>` : ''}
  <hr />
  <footer class="footer">
    ${etabParams?.mentionsLegales ? `<p style="font-size:9px;margin-bottom:0.5mm;">${escapeHtml(etabParams.mentionsLegales)}</p>` : ''}
    <p style="font-size:9px;margin-bottom:0.5mm;font-weight:bold;">NB: L'argent payé n'est pas remboursable.</p>
    <p style="font-size:9px;margin-bottom:0.5mm;">Merci pour votre paiement.</p>
    <p style="font-size:9px;margin-bottom:0.5mm;">Conservez ce reçu comme preuve de paiement.</p>
    <p style="font-size:9px;">${escapeHtml(etabParams?.piedPageRecu || 'Document généré électroniquement')}</p>
  </footer>
</main>
<script>
  window.onload = function () {
    setTimeout(function () { window.print(); }, 1000);
  };
  window.onafterprint = function () { window.parent.postMessage('close-iframe', '*'); };
<\/script>
</body>
</html>`

  const doc = iframe.contentWindow?.document
  if (!doc) {
    document.body.removeChild(iframe)
    window.alert("Impossible d'ouvrir la fenêtre d'impression. Veuillez réessayer.")
    return
  }
  doc.open()
  doc.write(htmlContent)
  doc.close()

  const cleanup = () => {
    if (document.body.contains(iframe)) document.body.removeChild(iframe)
  }
  const handler = (e: MessageEvent) => {
    if (e.data === 'close-iframe') {
      cleanup()
      window.removeEventListener('message', handler)
    }
  }
  window.addEventListener('message', handler)
  setTimeout(cleanup, 10_000)
}

/* ────────────────────────────────────────────────────────────────────────────
 * Composant
 * ──────────────────────────────────────────────────────────────────────────*/

export function ReceiptPOS({
  receipt,
  school,
  onClose,
}: {
  receipt: PosReceiptData
  school?: PosSchoolData
  onClose: () => void
}) {
  const annule = receipt.statut === 'ANNULE'
  // Le store expose `EtabParams | null` ; on l'élargit pour accepter les deux
  // formes (null | undefined) sans caster à chaque usage.
  const etabParams = useAppStore((s) => s.etabParams) as PosEtabParams | null | undefined
  const devise = receipt.devise
  const anneeLbl = anneeScolaireDuRecu(receipt.dateEncaissement)

  // Situation ventilée si disponible, sinon repli sur les champs scalaires.
  const multi = (receipt.totaux?.length ?? 0) > 0
  const dus = restesDus(receipt)
  const solde = multi ? dus.reduce((s, t) => s + t.reste, 0) : Number(receipt.reste ?? 0)
  const rienDu = multi ? dus.length === 0 : solde <= 0.009
  // Devise de la DETTE, distincte de celle du versement.
  const devSit = deviseSituation(receipt)

  return (
    <section className="relative mx-auto box-border w-full max-w-[400px] overflow-hidden bg-white p-4 font-mono text-[11px] leading-[1.35] text-black print:w-[80mm] print:max-w-[80mm]">
      {/* Filigrane */}
      <div
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          backgroundImage: `url(${filigram.src})`,
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'center',
          backgroundSize: '60%',
          opacity: 0.3,
        }}
      />

      <div className="relative z-10">
        <header className="text-center">
          <h2 className="text-sm font-extrabold uppercase leading-tight">
            {school?.nom || 'SGFS-ME'}
          </h2>
          <p className="text-[10px]">{school?.siteWeb || ETAB_SITE_WEB}</p>
          {school?.adresse && <p className="mt-1 text-[10px]">{school.adresse}</p>}
          {school?.telephone && <p className="text-[10px]">Tél. : {school.telephone}</p>}
        </header>

        <div className="my-1 border-t border-dashed border-black" />
        <div className="text-center">
          <p className="text-xs font-extrabold uppercase tracking-wide">Reçu de paiement</p>
          <p className="text-xs font-extrabold uppercase tracking-wide">{anneeLbl}</p>
          {annule && (
            <p className="mt-1 inline-block border-2 border-black px-1 py-0.5 text-xs font-extrabold">
              ANNULÉ
            </p>
          )}
        </div>
        <div className="my-2 border-t border-dashed border-black" />

        <div className="space-y-1">
          <div className="flex justify-between gap-2">
            <span>N° reçu</span>
            <b>{receipt.numeroRecu}</b>
          </div>
          <div className="flex justify-between gap-2">
            <span>Date</span>
            <b>{dateTime(receipt.dateEncaissement)}</b>
          </div>
          <div className="flex justify-between gap-2">
            <span>Caissier</span>
            <b className="max-w-[48mm] text-right">{receipt.caissierNom || 'Système'}</b>
          </div>
        </div>

        <div className="my-3 border-t border-dashed border-black" />
        <div className="space-y-1">
          <div>
            <span className="text-[10px]">ÉLÈVE</span>
            <p className="font-bold uppercase">{receipt.eleveNom || '—'}</p>
          </div>
          <div className="flex justify-between gap-2">
            <span>Classe</span>
            <b>{receipt.eleveClasse || '—'}</b>
          </div>
        </div>

        <div className="my-3 border-t border-dashed border-black" />
        <div className="space-y-1">
          <div className="flex justify-between gap-3">
            <span>Motif</span>
            <b className="max-w-[48mm] text-right">{receipt.motif || '—'}</b>
          </div>
          <div className="flex justify-between gap-3">
            <span>Mode</span>
            <b>{paymentLabel(receipt.modePaiement)}</b>
          </div>
          {receipt.referencePaiement && (
            <div className="flex justify-between gap-3">
              <span>Référence</span>
              <b className="max-w-[43mm] break-all text-right">{receipt.referencePaiement}</b>
            </div>
          )}
          {receipt.tauxChange && devise === 'CDF' && (
            <div className="flex justify-between gap-3">
              <span>Taux</span>
              <b>1 USD = {receipt.tauxChange.toLocaleString('fr-CD')} CDF</b>
            </div>
          )}
        </div>

        <div className="my-1 border-t border-dashed border-black" />
        <div className="flex items-end justify-between gap-3">
          <span className="font-bold uppercase">Montant reçu</span>
          <strong className="text-base">{money(receipt.montant, devise)}</strong>
        </div>

        {/* ── Situation du compte après ce versement ── */}
        {hasSituation(receipt) && (
          <>
            <div className="my-2 border-t border-dashed border-black" />
            <p className="mb-1.5 text-center text-[10px] font-bold tracking-wide">
              SITUATION DU COMPTE
            </p>
            <div className="space-y-1">
              <div className="flex justify-between gap-3">
                <span>Total exigible</span>
                <b className="max-w-[46mm] text-right">
                  {moneyMulti(receipt.totaux, 'totalDu', {
                    montant: receipt.totalDu,
                    devise: devSit,
                  })}
                </b>
              </div>
              <div className="flex justify-between gap-3">
                <span>Total versé</span>
                <b className="max-w-[46mm] text-right">
                  {moneyMulti(receipt.totaux, 'totalPaye', {
                    montant: receipt.totalPaye,
                    devise: devSit,
                  })}
                </b>
              </div>
            </div>

            {/* Un encadré PAR DEVISE : jamais de total hybride */}
            {multi ? (
              dus.length === 0 ? (
                <div className="mt-2 flex items-center justify-between gap-3 border-2 border-dashed border-black px-2 py-1.5 font-bold">
                  <span className="text-[11px]">COMPTE SOLDÉ</span>
                  <strong className="text-sm">—</strong>
                </div>
              ) : (
                <div className="mt-2 space-y-1">
                  {dus.map((t) => (
                    <div
                      key={t.devise}
                      className="flex items-center justify-between gap-3 border-2 border-black px-2 py-1.5 font-bold"
                    >
                      <span className="text-[11px]">RESTE À PAYER</span>
                      <strong className="text-sm">{money(t.reste, t.devise)}</strong>
                    </div>
                  ))}
                </div>
              )
            ) : (
              <div
                className={`mt-2 flex items-center justify-between gap-3 border-black px-2 py-1.5 font-bold ${
                  rienDu ? 'border-2 border-dashed' : 'border-2'
                }`}
              >
                <span className="text-[11px]">{rienDu ? 'COMPTE SOLDÉ' : 'RESTE À PAYER'}</span>
                <strong className="text-sm">{money(solde, devSit)}</strong>
              </div>
            )}

            {!rienDu && receipt.detailReste && (
              <p className="mt-1 border border-dotted border-black p-1 text-center text-[10px]">
                Reste : {receipt.detailReste}
              </p>
            )}
            {!rienDu && receipt.prochaineEcheance && (
              <div className="mt-1 flex justify-between gap-3">
                <span>Prochaine échéance</span>
                <b>{dateOnly(receipt.prochaineEcheance)}</b>
              </div>
            )}
          </>
        )}

        <div className="my-1 border-t border-dashed border-black" />

        {etabParams?.mentionsLegales && (
          <p className="mb-1 text-center text-[9px] text-gray-500">{etabParams.mentionsLegales}</p>
        )}
        <footer className="text-center text-[10px]">
          <p className="mb-1 font-bold">NB: L'argent payé n'est pas remboursable.</p>
          <p className="font-bold">Merci pour votre paiement.</p>
          <p>Conservez ce reçu comme preuve de paiement.</p>
          <p className="mt-2">{etabParams?.piedPageRecu || 'Document généré électroniquement'}</p>
        </footer>

        <div className="no-print mt-1 flex justify-center gap-2 border-t pt-3">
          <Button variant="outline" size="sm" onClick={onClose}>
            <X className="mr-1 h-4 w-4" /> Fermer
          </Button>
          <Button
            size="sm"
            onClick={() => printPosReceipt(receipt, school, etabParams)}
            className="bg-[#0f0e50f1] text-white"
          >
            Imprimer
          </Button>
        </div>
      </div>
    </section>
  )
}