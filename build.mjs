import * as esbuild from 'esbuild'
import { Packer } from 'roadroller'
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, statSync } from 'fs'
import { execSync } from 'child_process'
import http from 'http'

const LIMIT = 13312
const DEV = process.argv.includes('--dev')
const QUIET = process.argv.includes('--quiet')
const RAW = process.argv.includes('--raw')     // skip roadroller, to compare

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

// Roadroller re-encodes the bundle as a self-extracting payload. It costs a
// couple of seconds of search, so dev builds skip it — they are already
// unminified and their size means nothing anyway.
async function pack (js) {
  if (DEV || RAW) return js
  const p = new Packer([{ data: js, type: 'js', action: 'eval' }], {})
  await p.optimize(1)
  const { firstLine, secondLine } = p.makeDecoder()
  return firstLine + secondLine
}

async function build () {
  const css = readFileSync('src/style.css', 'utf8')
  const fold = !DEV && !RAW              // stylesheet inside the packed payload?
  let bundled = await bundle()
  if (fold) {
    bundled = 'document.head.appendChild(document.createElement("style")).innerHTML=' +
      JSON.stringify(minifyCss(css)) + ';' + bundled
  }
  const js = await pack(bundled)
  let html = readFileSync('src/index.html', 'utf8')
  if (!DEV) html = minifyHtml(html)
  html = html
    .replace('/*CSS*/', fold ? 'body{background:#0b0a12}' : (DEV ? css : minifyCss(css)))
    .replace('/*JS*/', () => js)

  mkdirSync('dist', { recursive: true })
  writeFileSync('dist/index.html', html)

  const raw = Buffer.byteLength(html)
  rmSync('dist/game.zip', { force: true })
  execSync('zip -9 -q -j dist/game.zip dist/index.html')
  let recompressed = ''
  for (const packer of ['advzip -z -4', 'ect -9 -zip']) {
    try { execSync(`${packer} dist/game.zip >/dev/null 2>&1`); recompressed = packer.split(' ')[0]; break } catch {}
  }
  const zipped = statSync('dist/game.zip').size
  const left = LIMIT - zipped
  const pct = ((zipped / LIMIT) * 100).toFixed(1)

  if (!QUIET) {
    console.log(`  raw    ${raw.toLocaleString()} B` +
      (DEV || RAW ? '' : '  (roadroller-packed)'))
    console.log(recompressed
      ? `  zip    -9 then ${recompressed}`
      : '  zip    -9 only — no advzip or ect on PATH, bytes are being left behind')
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
