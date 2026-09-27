import { mkdir, copyFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'

// MapLibre 6's ESM worker imports its sibling shared module. Publish both at
// stable same-origin URLs instead of relying on its bundled import.meta.url.
const require = createRequire(import.meta.url)
const source = path.dirname(require.resolve('maplibre-gl/package.json'))
const target = new URL('../public/vendor/maplibre/', import.meta.url)
await mkdir(target, { recursive: true })
for (const name of ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs']) {
  await copyFile(path.join(source, 'dist', name), new URL(name, target))
}
await copyFile(path.join(source, 'LICENSE.txt'), new URL('LICENSE.txt', target))
