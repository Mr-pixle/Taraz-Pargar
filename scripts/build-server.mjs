// Bundles the server (server/main.ts + the shared domain in src/lib) into server-dist/main.mjs with rolldown.
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { readdirSync } from 'node:fs'
const dir = readdirSync('node_modules/.pnpm').find((d) => d.startsWith('rolldown@'))
const { build } = await import(pathToFileURL(path.resolve('node_modules/.pnpm', dir, 'node_modules/rolldown/dist/index.mjs')).href)
await build({
  input: 'server/main.ts', platform: 'node', logLevel: 'warn',
  external: ['pg', /^node:/],
  resolve: { alias: { '@': path.resolve('src') } },
  output: { file: path.resolve('server-dist/main.mjs'), format: 'esm', banner: '// Taraz server — built from server/ and src/lib by scripts/build-server.mjs' },
})
console.log('server-dist/main.mjs')
