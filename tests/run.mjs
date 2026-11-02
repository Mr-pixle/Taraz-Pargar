// Bundles a test file with rolldown (shipped with Vite) and runs it in Node.
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { readdirSync } from 'node:fs'
const dir = readdirSync('node_modules/.pnpm').find((d) => d.startsWith('rolldown@'))
const { build } = await import(pathToFileURL(path.resolve('node_modules/.pnpm', dir, 'node_modules/rolldown/dist/index.mjs')).href)


const entry = process.argv[2] ?? 'tests/phase1.test.ts'
const out = path.resolve('tests/.out/test.mjs')
await build({
  input: entry, platform: 'node', logLevel: 'warn',
  external: [/^react/, 'sonner', 'pg', /^node:/],
  resolve: { alias: { '@': path.resolve('src') } },
  output: { file: out, format: 'esm' },
})
await import(pathToFileURL(out).href)
