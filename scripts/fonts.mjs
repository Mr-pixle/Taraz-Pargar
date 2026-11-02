// Self-hosted fonts for the server version (no request to an outside font service): Vazirmatn + JetBrains Mono.
import { copyFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
const out = 'web-dist/fonts'
mkdirSync(out, { recursive: true })
const vaz = 'node_modules/@fontsource-variable/vazirmatn/files'
for (const f of readdirSync(vaz).filter((x) => x.endsWith('.woff2'))) copyFileSync(`${vaz}/${f}`, `${out}/${f}`)
const mono = 'node_modules/@fontsource/jetbrains-mono/files'
let css = readFileSync('node_modules/@fontsource-variable/vazirmatn/index.css', 'utf8').replaceAll("'Vazirmatn Variable'", "'Vazirmatn'").replaceAll('./files/', './')
for (const w of [400, 500]) {
  copyFileSync(`${mono}/jetbrains-mono-latin-${w}-normal.woff2`, `${out}/jetbrains-mono-latin-${w}-normal.woff2`)
  css += `\n@font-face { font-family: 'JetBrains Mono'; font-style: normal; font-display: swap; font-weight: ${w}; src: url(./jetbrains-mono-latin-${w}-normal.woff2) format('woff2'); }\n`
}
writeFileSync(`${out}/fonts.css`, css)
