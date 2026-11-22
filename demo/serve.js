// A tiny static server for the demo: `npm run demo`, then open http://localhost:8000/demo/
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const port = Number(process.env.PORT) || 8000
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' }

createServer(async (request, response) => {
  let path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname)
  if (path === '/') path = '/demo/'
  if (path.endsWith('/')) path += 'index.html'
  const file = normalize(join(root, path))
  if (!file.startsWith(root.endsWith(sep) ? root : root + sep)) return response.writeHead(403).end()
  try {
    const body = await readFile(file)
    response.writeHead(200, { 'Content-Type': (types[extname(file)] ?? 'application/octet-stream') + '; charset=utf-8' })
    response.end(body)
  } catch {
    response.writeHead(404).end('Not found')
  }
}).listen(port, () => console.log(`Demo: http://localhost:${port}/demo/`))
