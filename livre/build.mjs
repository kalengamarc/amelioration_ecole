#!/usr/bin/env node
/**
 * Construit le livre SGFS-ME :
 *   - livre/LIVRE-COMPLET.md   (tous les chapitres concaténés)
 *   - livre/SGFS-ME-livre.html (HTML autonome, sommaire latéral, imprimable)
 *
 * Aucune dépendance externe : un convertisseur Markdown minimal, adapté au
 * sous-ensemble utilisé dans ce livre (titres, listes, tableaux, citations,
 * blocs de code, gras/italique, liens, code inline).
 *
 * Usage : node livre/build.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT_DIR = __dirname

/* ────────────────────────────── utilitaires ────────────────────────────── */

const esc = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const slug = (s) =>
  s
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70)

const chapterFiles = fs
  .readdirSync(OUT_DIR)
  .filter((f) => /^\d{2}-.+\.md$/.test(f))
  .sort()

const fileToAnchor = new Map()
chapterFiles.forEach((f) => {
  const num = f.slice(0, 2)
  fileToAnchor.set(f, `ch-${num}`)
})

/* Liens internes : 12-sqlite-sql-et-schema.md → #ch-12 */
function rewriteHref(href) {
  const target = href.split('#')[0]
  const anchorPart = href.includes('#') ? '#' + slug(href.split('#')[1]) : ''
  const base = path.basename(target)
  if (fileToAnchor.has(base)) return '#' + fileToAnchor.get(base) + anchorPart
  if (/^https?:/.test(href) || href.startsWith('#')) return href
  return href
}

/* ─────────────────────────── inline markdown ──────────────────────────── */

function inline(text) {
  // 1. code inline (protégé)
  const codes = []
  let out = text.replace(/`([^`]+)`/g, (_, c) => {
    codes.push(c)
    return `\u0000C${codes.length - 1}\u0000`
  })

  out = esc(out)

  // 2. liens
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, href) => {
    const h = rewriteHref(href)
    const external = /^https?:/.test(h) ? ' target="_blank" rel="noreferrer"' : ''
    return `<a href="${h}"${external}>${label}</a>`
  })

  // 3. cases à cocher
  out = out.replace(/\[\s\]/g, '☐').replace(/\[x\]/gi, '☑')

  // 4. gras puis italique
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  out = out.replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1<em>$2</em>')

  // 5. restaurer le code inline
  out = out.replace(/\u0000C(\d+)\u0000/g, (_, i) => `<code>${esc(codes[Number(i)])}</code>`)
  return out
}

/* ──────────────────────────── blocs markdown ──────────────────────────── */

function isTableStart(lines, i) {
  return (
    lines[i] &&
    lines[i].trim().startsWith('|') &&
    lines[i + 1] &&
    /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(lines[i + 1])
  )
}

function splitRow(row) {
  return row
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim())
}

function renderBlocks(lines) {
  const html = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]
    const trimmed = line.trim()

    // ligne vide
    if (trimmed === '') { i++; continue }

    // bloc de code
    if (trimmed.startsWith('```')) {
      const lang = trimmed.slice(3).trim()
      const buf = []
      i++
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        buf.push(lines[i])
        i++
      }
      i++ // ferme le bloc
      html.push(
        `<pre class="code"${lang ? ` data-lang="${esc(lang)}"` : ''}><code>${esc(buf.join('\n'))}</code></pre>`
      )
      continue
    }

    // titre
    const h = trimmed.match(/^(#{1,6})\s+(.*)$/)
    if (h) {
      const level = h[1].length
      const text = h[2].replace(/\s*#+\s*$/, '')
      const id = slug(text)
      html.push(`<h${level} id="${id}">${inline(text)}</h${level}>`)
      i++
      continue
    }

    // séparateur
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      html.push('<hr />')
      i++
      continue
    }

    // citation (peut contenir listes / code)
    if (trimmed.startsWith('>')) {
      const buf = []
      while (i < lines.length && (lines[i].trim().startsWith('>') || lines[i].trim() === '')) {
        if (lines[i].trim() === '') {
          // une ligne vide termine la citation si la suivante n'est pas citée
          if (!(lines[i + 1] && lines[i + 1].trim().startsWith('>'))) break
          buf.push('')
        } else {
          buf.push(lines[i].replace(/^\s*>\s?/, ''))
        }
        i++
      }
      html.push(`<blockquote>${renderBlocks(buf)}</blockquote>`)
      continue
    }

    // tableau
    if (isTableStart(lines, i)) {
      const head = splitRow(lines[i])
      i += 2
      const rows = []
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        rows.push(splitRow(lines[i]))
        i++
      }
      html.push(
        '<div class="table-wrap"><table><thead><tr>' +
          head.map((c) => `<th>${inline(c)}</th>`).join('') +
          '</tr></thead><tbody>' +
          rows
            .map((r) => '<tr>' + r.map((c) => `<td>${inline(c)}</td>`).join('') + '</tr>')
            .join('') +
          '</tbody></table></div>'
      )
      continue
    }

    // liste non ordonnée
    if (/^[-*+]\s+/.test(trimmed)) {
      const items = []
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
        let item = lines[i].replace(/^\s*[-*+]\s+/, '')
        i++
        // lignes de continuation indentées
        while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !/^\s*[-*+]\s+/.test(lines[i])) {
          item += ' ' + lines[i].trim()
          i++
        }
        items.push(`<li>${inline(item)}</li>`)
      }
      html.push(`<ul>${items.join('')}</ul>`)
      continue
    }

    // liste ordonnée
    if (/^\d+\.\s+/.test(trimmed)) {
      const items = []
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        let item = lines[i].replace(/^\s*\d+\.\s+/, '')
        i++
        while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !/^\s*\d+\.\s+/.test(lines[i])) {
          item += ' ' + lines[i].trim()
          i++
        }
        items.push(`<li>${inline(item)}</li>`)
      }
      html.push(`<ol>${items.join('')}</ol>`)
      continue
    }

    // paragraphe
    const buf = [trimmed]
    i++
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !/^(#{1,6}\s|```|>|\||[-*+]\s|\d+\.\s)/.test(lines[i].trim()) &&
      !/^(-{3,}|\*{3,}|_{3,})$/.test(lines[i].trim())
    ) {
      buf.push(lines[i].trim())
      i++
    }
    html.push(`<p>${inline(buf.join(' '))}</p>`)
  }

  return html.join('\n')
}

/* ────────────────────────── page d'un chapitre ────────────────────────── */

const chapterTitles = []
const chaptersHtml = []

for (const file of chapterFiles) {
  const raw = fs.readFileSync(path.join(OUT_DIR, file), 'utf8').replace(/\r\n/g, '\n')
  const lines = raw.split('\n')
  const firstH1 = lines.find((l) => l.startsWith('# '))
  const title = firstH1 ? firstH1.replace(/^#\s+/, '') : file
  const anchor = fileToAnchor.get(file)

  // sommaire de niveau 2
  const subs = lines
    .filter((l) => l.startsWith('## '))
    .map((l) => l.replace(/^##\s+/, '').replace(/\s*#+\s*$/, ''))

  chapterTitles.push({ file, anchor, title, subs })

  // le premier h1 devient le titre de chapitre (id = anchor)
  let html = renderBlocks(lines)
  html = html.replace(/<h1 id="([^"]*)">([\s\S]*?)<\/h1>/, `<h1 id="${anchor}">$2</h1>`)
  // préfixe les ancres des sous-titres par le chapitre (évite les collisions)
  html = html.replace(/<h([2-4]) id="([^"]+)">/g, (_, lvl, id) => `<h${lvl} id="${anchor}--${id}">`)

  chaptersHtml.push(`<section class="chapter" id="${anchor}-section">${html}</section>`)
}

/* ───────────────────────────── LIVRE-COMPLET.md ───────────────────────── */

const mdParts = []
mdParts.push(`# Construire SGFS-ME — Le livre du projet

**Apprendre le développement logiciel à travers une vraie application de gestion scolaire**

*Édition 1 — octobre 2026*

> Ce fichier est généré automatiquement par \`node livre/build.mjs\`.
> Les sources se trouvent dans les fichiers numérotés de ce dossier.
> La version HTML autonome est \`SGFS-ME-livre.html\`.

## Sommaire

${chapterTitles.map((c) => `- ${c.title} — \`${c.file}\``).join('\n')}
`)

for (const file of chapterFiles) {
  mdParts.push(fs.readFileSync(path.join(OUT_DIR, file), 'utf8').replace(/\r\n/g, '\n'))
}

const fullMd = mdParts.join('\n\n---\n\n')
fs.writeFileSync(path.join(OUT_DIR, 'LIVRE-COMPLET.md'), fullMd, 'utf8')

/* ─────────────────────────────── HTML ─────────────────────────────────── */

const tocHtml = chapterTitles
  .map(
    (c) => `
  <li class="toc-chapter">
    <a href="#${c.anchor}">${esc(c.title)}</a>
    ${c.subs.length ? `<ul>${c.subs.map((s) => `<li><a href="#${c.anchor}--${slug(s)}">${esc(s)}</a></li>`).join('')}</ul>` : ''}
  </li>`
  )
  .join('')

const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Construire SGFS-ME — Le livre du projet</title>
<style>
  :root {
    --vert: #0c241f;
    --vert-2: #143a33;
    --ambre: #b45309;
    --ambre-clair: #d97706;
    --papier: #fbfaf7;
    --encre: #1c2321;
    --gris: #5b6560;
    --bord: #e3e0d8;
    --code-bg: #f3f1ea;
  }
  * { box-sizing: border-box; }
  html { scroll-behavior: smooth; }
  body {
    margin: 0;
    background: var(--papier);
    color: var(--encre);
    font-family: "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif;
    font-size: 17px;
    line-height: 1.65;
  }
  .layout { display: flex; align-items: flex-start; }

  /* ── Sommaire latéral ── */
  .sidebar {
    position: sticky; top: 0; height: 100vh; width: 330px; flex: 0 0 330px;
    overflow-y: auto; background: var(--vert); color: #e8efe9;
    padding: 26px 18px 60px; border-right: 1px solid #0a1b17;
  }
  .sidebar .brand { display: flex; gap: 10px; align-items: center; margin-bottom: 6px; }
  .sidebar .mark {
    width: 38px; height: 38px; border-radius: 10px; background: var(--ambre-clair);
    display: grid; place-items: center; font-weight: 800; color: #fff;
    font-family: system-ui, sans-serif; font-size: 15px;
  }
  .sidebar h1 { font-size: 15px; margin: 0; letter-spacing: .02em; font-family: system-ui, sans-serif; }
  .sidebar .sub { font-size: 11px; color: #a8bdb4; margin: 2px 0 18px; font-family: system-ui, sans-serif; letter-spacing: .04em; text-transform: uppercase; }
  .sidebar nav ul { list-style: none; margin: 0; padding: 0; }
  .sidebar nav > ul > li { margin-bottom: 6px; }
  .sidebar a { color: #dfe9e2; text-decoration: none; font-family: system-ui, sans-serif; font-size: 13px; }
  .sidebar a:hover { color: #f3c98b; }
  .sidebar .toc-chapter > a { font-weight: 700; display: block; padding: 5px 8px; border-radius: 6px; }
  .sidebar .toc-chapter > a:hover { background: rgba(255,255,255,.07); }
  .sidebar .toc-chapter ul { margin: 2px 0 8px 12px; padding-left: 10px; border-left: 1px solid rgba(255,255,255,.14); }
  .sidebar .toc-chapter ul li { margin: 2px 0; }
  .sidebar .toc-chapter ul a { font-size: 11.5px; color: #a9bfb5; }

  /* ── Contenu ── */
  main { flex: 1; min-width: 0; padding: 0 0 100px; }
  .page { max-width: 820px; margin: 0 auto; padding: 40px 40px 0; }

  .cover { padding: 64px 0 44px; border-bottom: 2px solid var(--vert); margin-bottom: 40px; }
  .cover .kicker { font-family: system-ui, sans-serif; text-transform: uppercase; letter-spacing: .18em; font-size: 11px; color: var(--ambre); font-weight: 700; }
  .cover h1 { font-size: 46px; line-height: 1.06; margin: 12px 0 14px; color: var(--vert); letter-spacing: -.02em; }
  .cover h1 span { color: var(--ambre); }
  .cover .tagline { font-size: 19px; color: var(--gris); font-style: italic; max-width: 620px; }
  .cover .meta { margin-top: 22px; font-family: system-ui, sans-serif; font-size: 12.5px; color: var(--gris); }
  .cover .meta code { background: var(--code-bg); }

  .chapter { padding-top: 8px; }
  .chapter h1 {
    font-size: 32px; line-height: 1.15; color: var(--vert);
    margin: 56px 0 18px; padding-bottom: 12px; border-bottom: 2px solid var(--bord);
    letter-spacing: -.01em;
  }
  .chapter h1::before {
    content: ""; display: block; width: 44px; height: 4px; background: var(--ambre-clair);
    border-radius: 2px; margin-bottom: 14px;
  }
  h2 { font-size: 23px; color: var(--vert-2); margin: 40px 0 10px; line-height: 1.25; }
  h3 { font-size: 18.5px; color: var(--ambre); margin: 30px 0 8px; }
  h4 { font-size: 16px; margin: 22px 0 6px; }
  p { margin: 0 0 14px; }
  strong { color: #101614; }
  a { color: var(--ambre); text-decoration-thickness: 1px; text-underline-offset: 2px; }
  a:hover { color: var(--vert); }

  code {
    font-family: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 0.84em; background: var(--code-bg); padding: 1.5px 5px;
    border-radius: 4px; color: #7a3410; border: 1px solid #e7e3d8;
  }
  pre.code {
    background: #10201c; color: #e6eee8; padding: 16px 18px; border-radius: 10px;
    overflow-x: auto; font-size: 13px; line-height: 1.55; margin: 16px 0 20px;
    border-left: 4px solid var(--ambre-clair);
  }
  pre.code code { background: none; border: 0; padding: 0; color: inherit; font-size: inherit; }
  pre.code::before {
    content: attr(data-lang); display: block; font-family: system-ui, sans-serif;
    font-size: 10px; letter-spacing: .14em; text-transform: uppercase;
    color: #7fa08f; margin-bottom: 8px;
  }
  pre.code[data-lang]::before { content: attr(data-lang); }

  blockquote {
    margin: 20px 0; padding: 14px 18px 14px 20px; background: #f4f1e6;
    border-left: 4px solid var(--ambre-clair); border-radius: 0 8px 8px 0;
    color: #343d38;
  }
  blockquote p:last-child { margin-bottom: 0; }
  blockquote ul, blockquote ol { margin: 8px 0; }
  blockquote code { background: #eae5d5; }

  ul, ol { padding-left: 22px; margin: 0 0 16px; }
  li { margin: 4px 0; }

  .table-wrap { overflow-x: auto; margin: 20px 0; }
  table { border-collapse: collapse; width: 100%; font-family: system-ui, sans-serif; font-size: 13.5px; }
  th { background: var(--vert); color: #f2f6f3; text-align: left; padding: 9px 11px; font-weight: 600; }
  td { padding: 8px 11px; border-bottom: 1px solid var(--bord); vertical-align: top; }
  tr:nth-child(even) td { background: #f6f4ee; }

  hr { border: 0; border-top: 1px solid var(--bord); margin: 32px 0; }

  .backtop {
    position: fixed; right: 18px; bottom: 18px; background: var(--vert); color: #fff;
    border-radius: 999px; padding: 9px 14px; font-family: system-ui, sans-serif;
    font-size: 12px; text-decoration: none; box-shadow: 0 6px 18px rgba(0,0,0,.18);
  }
  .backtop:hover { background: var(--ambre); color: #fff; }

  @media (max-width: 1080px) {
    .sidebar { display: none; }
    .page { padding: 24px 20px 0; }
    .cover h1 { font-size: 34px; }
  }

  @media print {
    .sidebar, .backtop { display: none !important; }
    body { background: #fff; font-size: 11pt; }
    .page { max-width: none; padding: 0; }
    .chapter h1 { page-break-before: always; }
    .cover { page-break-after: always; }
    pre.code { background: #f5f5f5; color: #111; border-left: 3px solid #999; page-break-inside: avoid; }
    pre.code::before { display: none; }
    a { color: #111; text-decoration: none; }
    table { page-break-inside: avoid; }
    .table-wrap { overflow: visible; }
  }
</style>
</head>
<body>
<div class="layout">
  <aside class="sidebar">
    <div class="brand">
      <div class="mark">SG</div>
      <div>
        <h1>Construire SGFS-ME</h1>
        <div class="sub">Le livre du projet</div>
      </div>
    </div>
    <nav><ul>${tocHtml}</ul></nav>
  </aside>

  <main>
    <div class="page">
      <header class="cover" id="top">
        <div class="kicker">Manuel de développement par projet</div>
        <h1>Construire <span>SGFS-ME</span><br />Le livre du projet</h1>
        <p class="tagline">Apprendre le développement logiciel à travers une vraie application
        de gestion scolaire : React, TypeScript, Rust, Tauri, SQLite et synchronisation hors ligne.</p>
        <div class="meta">
          Édition 1 — octobre 2026 · 22 chapitres · 5 annexes ·
          sources Markdown dans <code>livre/</code>
        </div>
      </header>
      ${chaptersHtml.join('\n')}
    </div>
    <a class="backtop" href="#top">↑ Sommaire</a>
  </main>
</div>
</body>
</html>
`

fs.writeFileSync(path.join(OUT_DIR, 'SGFS-ME-livre.html'), html, 'utf8')

/* ─────────────────────────────── rapport ──────────────────────────────── */

const stats = {
  fichiers: chapterFiles.length,
  'LIVRE-COMPLET.md (Ko)': Math.round(Buffer.byteLength(fullMd) / 1024),
  'SGFS-ME-livre.html (Ko)': Math.round(Buffer.byteLength(html) / 1024),
  mots: fullMd.split(/\s+/).filter(Boolean).length,
}
console.log('Livre construit :')
for (const [k, v] of Object.entries(stats)) {
  console.log(`  ${k.padEnd(28)} ${v}`)
}
