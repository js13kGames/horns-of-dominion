import * as esbuild from 'esbuild'
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, statSync } from 'fs'
import { execSync } from 'child_process'
import http from 'http'

const LIMIT = 13312
const DEV = process.argv.includes('--dev')
const QUIET = process.argv.includes('--quiet')

function minifyHtml (h) {
  return h
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\n\s*/g, '')
    .trim()
}

function minifyCss (c) {
  return c
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s*([{}:;,>])\s*/g, '$1')
    .replace(/;}/g, '}')
    .replace(/\s+/g, ' ')
    .trim()
}

async function bundle () {
  const out = await esbuild.build({
    entryPoints: ['src/main.js'],
    bundle: true,
    minify: !DEV,
    format: 'iife',
    target: 'es2020',
    write: false,
    legalComments: 'none'
  })
  return out.outputFiles[0].text
}

async function build () {
  const js = await bundle()
  const css = readFileSync('src/style.css', 'utf8')
  let html = readFileSync('src/index.html', 'utf8')
  if (!DEV) html = minifyHtml(html)
  html = html.replace('/*CSS*/', DEV ? css : minifyCss(css)).replace('/*JS*/', () => js)

  mkdirSync('dist', { recursive: true })
  writeFileSync('dist/index.html', html)

  const raw = Buffer.byteLength(html)
  rmSync('dist/game.zip', { force: true })
  execSync('zip -9 -q -j dist/game.zip dist/index.html')
  for (const packer of ['advzip -z -4 dist/game.zip', 'ect -9 -zip dist/game.zip']) {
    try { execSync(packer + ' >/dev/null 2>&1') } catch {}
  }
  const zipped = statSync('dist/game.zip').size
  const left = LIMIT - zipped
  const pct = ((zipped / LIMIT) * 100).toFixed(1)

  if (!QUIET) {
    console.log(`  raw    ${raw.toLocaleString()} B`)
    console.log(`  zipped ${zipped.toLocaleString()} B / ${LIMIT.toLocaleString()} B  (${pct}%)`)
    console.log(left >= 0 ? `  headroom ${left.toLocaleString()} B` : `  OVER BUDGET by ${(-left).toLocaleString()} B`)
  } else {
    console.log(`${zipped} / ${LIMIT} (${pct}%)`)
  }
  return left
}

if (DEV) {
  const ctx = await esbuild.context({
    entryPoints: ['src/main.js'],
    bundle: true,
    write: false,
    format: 'iife',
    target: 'es2020',
    plugins: [{
      name: 'rebuild-html',
      setup (b) {
        b.onEnd(async () => {
          try { await build(); console.log('  rebuilt', new Date().toTimeString().slice(0, 8)) } catch (e) { console.error(e.message) }
        })
      }
    }]
  })
  await ctx.watch()
  http.createServer((req, res) => {
    const p = req.url === '/' ? 'dist/index.html' : 'dist' + req.url.split('?')[0]
    if (!existsSync(p)) { res.writeHead(404); return res.end('nope') }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
    res.end(readFileSync(p))
  }).listen(8080)
  console.log('  dev  http://localhost:8080')
} else {
  const left = await build()
  process.exit(left >= 0 ? 0 : 1)
}
