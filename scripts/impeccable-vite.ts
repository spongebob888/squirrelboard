import { readFileSync } from 'node:fs'
import { request } from 'node:http'
import { resolve } from 'node:path'
import type { Plugin } from 'vite'

// Keep the helper on loopback; remote browsers use Vite's development origin.
export function impeccableLan(): Plugin {
  const prefix = '/__impeccable'
  return {
    name: 'impeccable-lan',
    transformIndexHtml(html, context) {
      if (!context.server) {
        return html.replace(/<!-- impeccable-live-start -->[\s\S]*?<!-- impeccable-live-end -->\s*/g, '')
      }
      return html.replace(/http:\/\/localhost:\d+\/live\.js\?/g, `${prefix}/live.js?`)
    },
    configureServer(server) {
      server.middlewares.use(prefix, (req, res) => {
        let port: number
        try {
          const state = JSON.parse(readFileSync(resolve(server.config.root, '.impeccable/live/server.json'), 'utf8'))
          port = state.port
          if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid helper port')
        } catch {
          res.writeHead(503).end('Impeccable live mode is not running.')
          return
        }

        const upstream = request({
          hostname: '127.0.0.1', port, path: req.url, method: req.method,
          headers: { ...req.headers, host: `localhost:${port}`, origin: `http://localhost:${port}` },
        }, response => {
          const headers = { ...response.headers }
          if (headers['content-type']?.includes('javascript')) {
            const chunks: Buffer[] = []
            response.on('data', chunk => chunks.push(Buffer.from(chunk)))
            response.on('end', () => {
              const source = Buffer.concat(chunks).toString('utf8')
                .replace(/(['"])http:\/\/localhost:\1\s*\+\s*PORT/g, `location.origin + '${prefix}'`)
                .replaceAll('http://localhost:${PORT}', `\${location.origin}${prefix}`)
              delete headers['content-length']
              res.writeHead(response.statusCode || 502, headers).end(source)
            })
          } else {
            res.writeHead(response.statusCode || 502, headers)
            response.pipe(res)
            res.on('close', () => response.destroy())
          }
        })
        upstream.on('error', () => {
          if (!res.headersSent) res.writeHead(502)
          res.end('Impeccable helper is unavailable.')
        })
        req.pipe(upstream)
      })
    },
  }
}
