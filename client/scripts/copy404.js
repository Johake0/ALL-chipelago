import { copyFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// GitHub Pages has no server-side rewrites, so client-side routes (e.g.
// /admin) 404 on direct load/refresh. Pages does serve a custom 404.html
// though, so shipping a copy of index.html under that name lets the SPA
// boot and take over routing itself. Done in Node (not a shell `cp`) so
// `npm run build` works the same on Windows and Linux/macOS.
const distDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist')

copyFileSync(join(distDir, 'index.html'), join(distDir, '404.html'))
