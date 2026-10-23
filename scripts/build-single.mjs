import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { build } from 'vite'

const root = fileURLToPath(new URL('../', import.meta.url))
const favicon = await readFile(join(root, 'public/favicon.svg'))
const faviconUrl = `data:image/svg+xml;base64,${favicon.toString('base64')}`

const result = await build({
  root,
  base: './',
  plugins: [{
    name: 'single-file-favicon',
    transformIndexHtml: {
      order: 'pre',
      handler: html => html.replace('href="%BASE_URL%favicon.svg"', `href="${faviconUrl}"`),
    },
  }],
  build: {
    write: false,
    copyPublicDir: false,
    assetsInlineLimit: Infinity,
    cssCodeSplit: false,
    modulePreload: false,
    sourcemap: false,
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
})

const files = new Map(result.output.map(file => [file.fileName, file]))
const document = files.get('index.html')
if (document?.type !== 'asset') throw new Error('Vite did not produce index.html.')
files.delete('index.html')

function consumeAsset(url) {
  const filename = url.replace(/^\.\//, '')
  const file = files.get(filename)
  if (!file) throw new Error(`Cannot inline ${url}.`)
  files.delete(filename)
  return file
}

let html = String(document.source)
html = html.replace(/<script\b[^>]*\bsrc="([^"]+)"[^>]*><\/script>/g, (_tag, url) => {
  const file = consumeAsset(url)
  if (file.type !== 'chunk' || file.imports.length || file.dynamicImports.length) {
    throw new Error(`Expected self-contained JavaScript: ${url}.`)
  }
  return `<script type="module">${file.code.replace(/<\/script/gi, '<\\/script')}</script>`
})
html = html.replace(/<link\b(?=[^>]*\brel="stylesheet")[^>]*\bhref="([^"]+)"[^>]*>/g, (_tag, url) => {
  const file = consumeAsset(url)
  if (file.type !== 'asset') throw new Error(`Expected a stylesheet: ${url}.`)
  return `<style>${String(file.source).replace(/<\/style/gi, '<\\/style')}</style>`
})
if (files.size) throw new Error(`Assets remain outside the HTML: ${[...files.keys()].join(', ')}`)

const outputDir = join(root, 'dist-single')
await mkdir(outputDir, { recursive: true })
await writeFile(join(outputDir, 'index.html'), html)
console.log(`Single-file bundle: dist-single/index.html (${(Buffer.byteLength(html) / 1024).toFixed(1)} KiB)`)
