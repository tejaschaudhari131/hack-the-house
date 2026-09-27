import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

test('committed building context has provenance, unique footprints and honest heights', () => {
  const raw = readFileSync(new URL('../public/data/existing-buildings.geojson', import.meta.url))
  const data = JSON.parse(raw)
  const manifest = JSON.parse(readFileSync(new URL('../public/data/existing-buildings.sources.json', import.meta.url)))
  assert.equal(createHash('sha256').update(raw).digest('hex'), manifest.sha256)
  assert.equal(data.features.length, manifest.count)
  assert.equal(new Set(data.features.map(f => f.id)).size, manifest.count)
  assert.ok(manifest.by_area.Hazelwood > 0 && manifest.by_area.Lawrenceville > 0)
  const counts = { stories_estimate: 0, placeholder: 0 }
  for (const f of data.features) {
    const p = f.properties
    assert.ok(['Polygon', 'MultiPolygon'].includes(f.geometry.type))
    assert.ok(Object.hasOwn(counts, p.height_method))
    counts[p.height_method]++
    if (p.height_method === 'stories_estimate') {
      assert.ok(p.stories >= 1 && p.pin)
      assert.equal(p.height_m, p.stories * 3 + 1.5)
    } else {
      assert.equal(p.height_m, 9)
      assert.equal(p.stories, null)
    }
    assert.ok(!Object.keys(p).some(key => /owner|mailing/i.test(key)))
  }
  assert.deepEqual(counts, manifest.height_methods)
})
