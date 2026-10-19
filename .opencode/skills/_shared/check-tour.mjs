#!/usr/bin/env node
// Validates a generated tour page against _shared/design-system.md.
// Usage: node check-tour.mjs <path-to-index.html> [--stops N]
// Exit 0 and print OK, or exit 1 and print every failure.
// No dependencies. Run it before delivering any page; a page that fails this is not delivered.

import { readFileSync } from 'node:fs'

const file = process.argv[2]
if (!file) {
  console.error('usage: check-tour.mjs <path-to-index.html> [--stops N]')
  process.exit(2)
}
const expectStopsFlag = process.argv.indexOf('--stops')
const expectStops = expectStopsFlag > -1 ? Number(process.argv[expectStopsFlag + 1]) : null

const html = readFileSync(file, 'utf8')
const fail = []
const note = (message) => fail.push(message)

// 1. The document is complete.
if (!html.trimEnd().endsWith('</html>')) note('TRUNCATED: the file does not end with </html>. Rebuild it, do not patch it.')

// 2. Exactly one script, and it parses.
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)]
if (scripts.length !== 1) note(`SCRIPT COUNT: expected exactly 1 <script>, found ${scripts.length}`)
else {
  try { new Function(scripts[0][1]) } catch (error) { note(`SCRIPT SYNTAX: ${error.message}`) }
  if (!/updateProgress\(\)\s*(\/\/|$|\n)/m.test(scripts[0][1]))
    note('SCRIPT INIT: updateProgress() is never called at the top level, so the counter and the active link are wrong until the first scroll')
}

// 3. Nothing is fetched from anywhere.
for (const pattern of [/https?:\/\//, /\/\/cdn/, /@import/, /<link\b/]) {
  if (pattern.test(html.replace(/<a\s+href="#/g, ''))) note(`EXTERNAL REFERENCE: found ${pattern}`)
}

// 4. The full token set is present, in both colour schemes.
const TOKENS = ['--bg', '--surface', '--ink', '--muted', '--line', '--accent', '--accent-vivid',
  '--accent-soft', '--on-accent', '--signal', '--focus', '--code', '--code-ink']
const root = html.match(/:root\s*\{([^}]*)\}/)
const dark = html.match(/prefers-color-scheme:\s*dark[^{]*\{\s*:root\s*\{([^}]*)\}/)
if (!root) note('NO :root BLOCK: the CSS baseline was not copied')
if (!dark) note('NO DARK BLOCK: the page will be unreadable in dark mode')
for (const token of TOKENS) {
  if (root && !root[1].includes(token + ':')) note(`MISSING TOKEN in :root: ${token}. Copy the baseline verbatim; do not abbreviate the token set.`)
  if (dark && !dark[1].includes(token + ':')) note(`MISSING TOKEN in dark block: ${token}`)
}
// The palette itself, not just the names.
const PALETTE = { '--accent': '#c2410c', '--accent-vivid': '#ea580c', '--accent-soft': '#ffedd5', '--signal': '#0f766e', '--bg': '#f6f7f5' }
for (const [token, value] of Object.entries(PALETTE)) {
  if (root && !new RegExp(token + ':\\s*' + value, 'i').test(root[1]))
    note(`WRONG PALETTE: ${token} should be ${value} in light mode. This page is not using the house style.`)
}

// 5. The component structure is the one in the design system.
const REQUIRED = ['layout', 'cover', 'lede', 'facts', 'stop', 'eyebrow', 'map', 'route', 'number', 'rule', 'path-wrap', 'copy', 'counter', 'next']
for (const cls of REQUIRED) {
  if (!new RegExp(`class="[^"]*\\b${cls}\\b`).test(html)) note(`MISSING COMPONENT: no element with class "${cls}"`)
}

// 6. Stops.
const stops = [...html.matchAll(/<section class="stop"[^>]*id="([^"]+)"/g)].map((m) => m[1])
if (stops.length === 0) note('NO STOPS: the page has no section.stop elements at all')
if (expectStops !== null && stops.length !== expectStops) note(`STOP COUNT: expected ${expectStops}, found ${stops.length}`)
if (stops.length > 12) note(`TOO MANY STOPS: ${stops.length}. Twelve is the ceiling for one page; split into a series.`)
if (new Set(stops).size !== stops.length) note('DUPLICATE STOP IDS: navigation and fragments will land on the wrong section')

// 7. Checkpoints: one closed <details> per stop.
const stopBlocks = html.split(/<section class="stop"/).slice(1)
stopBlocks.forEach((block, index) => {
  if (!/<details(?![^>]*\bopen\b)/.test(block)) note(`STOP ${index + 1} (${stops[index]}): no closed <details> checkpoint`)
  if (/<details[^>]*\bopen\b/.test(block)) note(`STOP ${index + 1} (${stops[index]}): a checkpoint is open by default; the answer must be hidden until clicked`)
})

// 8. Copy chips say what they copy.
for (const [, value, text] of html.matchAll(/data-copy="([^"]*)"[^>]*>([^<]*)</g)) {
  if (text.trim() === 'copy' || text.trim() === 'copied') continue
  if (text.trim() && value !== text.trim()) note(`COPY MISMATCH: data-copy="${value}" but the visible text is "${text.trim()}"`)
}

// 9. Route steppers point at nodes that exist in the same stop.
stopBlocks.forEach((block, index) => {
  const targets = [...block.matchAll(/<button[^>]*data-node="([^"]+)"/g)].map((m) => m[1])
  const nodes = [...block.matchAll(/<(?:rect|g|circle)[^>]*data-node="([^"]+)"/g)].map((m) => m[1])
  for (const target of targets) {
    if (!nodes.includes(target)) note(`STOP ${index + 1} (${stops[index]}): route step targets data-node="${target}", which is not in that stop's diagram`)
  }
})

// 10. SVG marker ids are unique across the document.
const markers = [...html.matchAll(/<marker[^>]*id="([^"]+)"/g)].map((m) => m[1])
if (new Set(markers).size !== markers.length) note('DUPLICATE SVG MARKER IDS: ids are document-wide, so every arrow will point at the first definition')

// 11. Every SVG is described.
for (const [tag] of html.matchAll(/<svg[^>]*>/g)) {
  if (!/role="img"/.test(tag) || !/aria-label=/.test(tag)) note('SVG without role="img" and aria-label')
}

// 12. The simulator, if present.
if (/class="sim"/.test(html)) {
  if (!/class="sim-steps"/.test(html)) note('SIMULATOR: no .sim-steps element. The step data must ship as markup, not as a JavaScript array.')
  const steps = [...html.matchAll(/<li[^>]*data-node="[^"]*"[^>]*>/g)].map((m) => m[0])
  if (steps.length === 0) note('SIMULATOR: .sim-steps contains no <li> steps, so there is nothing for JS to read or for print to show')
  steps.forEach((step, index) => {
    const label = step.match(/data-label="([^"]*)"/)
    if (!label) note(`SIMULATOR: step ${index + 1} has no data-label, so the canvas has nothing reliable to draw and will render an empty node`)
    else if (!label[1].trim()) note(`SIMULATOR: step ${index + 1} has an empty data-label`)
  })
  if (/getPropertyValue\([^)]*\)\s*\.trim\(\)(?!\s*\|\|)/.test(html))
    note('SIMULATOR: a getPropertyValue read has no || fallback. An undefined token returns an empty string, the colour assignment is ignored, and nodes render blank.')
  if (/querySelector\(['"]h4['"]\)/.test(html))
    note('SIMULATOR: the node label is read with querySelector("h4"), which picks up the In/Out headings inside a step. Use data-label.')
  if (steps.length > 8) note(`SIMULATOR: ${steps.length} nodes. Eight is the ceiling; segment per chapter or collapse to unit level.`)
  const sources = [...html.matchAll(/class="sim-source"/g)]
  if (sources.length < steps.length) note(`SIMULATOR: ${sources.length} source lines for ${steps.length} steps. Every payload and error names the file it came from.`)
  for (const id of ['sim-play', 'sim-next', 'sim-back', 'sim-reset']) {
    if (!html.includes(`id="${id}"`)) note(`SIMULATOR: missing control #${id}`)
  }
  if (!/measureText/.test(html)) note('SIMULATOR: measureText is never called, so node labels were not fitted and will overflow')
  const whats = [...html.matchAll(/class="sim-what"[^>]*>([^<]+)</g)].map((m) => m[1].trim())
  if (whats.length > 1 && new Set(whats).size === 1)
    note(`SIMULATOR: every step has the same .sim-what text ("${whats[0].slice(0, 60)}..."). That is boilerplate, not what each node does.`)
  for (const text of whats) {
    if (/\b(this node|the boundary shown in the tour|as described|see above)\b/i.test(text))
      note(`SIMULATOR: placeholder text in .sim-what: "${text.slice(0, 70)}". Say what this node actually does, in the repository's own vocabulary.`)
  }
}

// 13. A series index, if this page is one.
if (/class="series"/.test(html)) {
  const cards = [...html.matchAll(/<a href="(\.\.\/[^"]+)"/g)]
  if (cards.length === 0) note('SERIES INDEX: .series contains no relative links to member tours')
  for (const [, href] of cards) {
    if (!href.endsWith('/index.html')) note(`SERIES INDEX: link "${href}" does not point at a member index.html`)
  }
  if (!/class="meta"/.test(html)) note('SERIES INDEX: no .meta on the cards. Each entry carries stop count, reading time, depth and date from the member manifest.')
}

// Report.
if (fail.length === 0) {
  console.log(`OK  ${file}`)
  console.log(`    ${stops.length} stops, ${/class="sim"/.test(html) ? 'simulator present' : 'no simulator'}, full token set, no external references`)
  process.exit(0)
}
console.error(`FAIL  ${file}  (${fail.length} problem${fail.length === 1 ? '' : 's'})`)
for (const message of fail) console.error('  - ' + message)
process.exit(1)
