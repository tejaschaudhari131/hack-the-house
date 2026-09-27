import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

test('committed building context has provenance, unique footprints and honest heights', () => {
  const raw = readFileSync(new URL('../testdata/study/existing-buildings.geojson', import.meta.url))
  const data = JSON.parse(raw)
  const manifest = JSON.parse(readFileSync(new URL('../testdata/study/existing-buildings.sources.json', import.meta.url)))
  assert.equal(createHash('sha256').update(raw).digest('hex'), manifest.sha256)
  assert.equal(data.features.length, manifest.count)
  assert.equal(new Set(data.features.map(f => f.id)).size, manifest.count)
  assert.ok(manifest.by_area.Hazelwood > 0 && manifest.by_area.Lawrenceville > 0)
  const counts = { stories_estimate: 0, osm_height: 0, osm_levels: 0, typology_estimate: 0, placeholder: 0 }
  for (const f of data.features) {
    const p = f.properties
    assert.ok(['Polygon', 'MultiPolygon'].includes(f.geometry.type))
    assert.ok(Object.hasOwn(counts, p.height_method))
    assert.notEqual(p.status, 'demolished')
    assert.ok(Number.isFinite(p.height_m) && p.height_m > 0 && p.height_m <= 300)
    counts[p.height_method]++
    if (p.height_method === 'stories_estimate') {
      assert.ok(p.stories >= 1 && p.pin)
      assert.equal(p.height_m, p.stories * 3 + 1.5)
      assert.ok(['sole', 'dominant'].includes(p.footprint_role))
    } else if (p.height_method.startsWith('osm_')) {
      assert.match(p.height_ref, /^(way|relation)\/\d+$/)
      assert.ok(p.height_match >= .39 && p.height_match <= 1)
      if (p.height_method === 'osm_levels') assert.ok(p.stories >= 1)
    } else if (p.height_method === 'typology_estimate') {
      const profile = manifest.height_profiles[p.height_profile]
      assert.ok(profile)
      const expected = p.height_profile === 'residential' ? manifest.residential_median_heights_m[p.area] ?? profile.height_m : profile.height_m
      assert.equal(p.height_m, expected)
      assert.equal(p.stories, null)
    } else {
      assert.equal(p.height_m, 9)
      assert.equal(p.stories, null)
    }
    assert.ok(!Object.keys(p).some(key => /owner|mailing/i.test(key)))
  }
  assert.deepEqual(counts, manifest.height_methods)
  assert.equal(manifest.demolished_ids_omitted.length, manifest.demolished_footprints_omitted)
  assert.ok(manifest.demolished_ids_omitted.every(id => !data.features.some(f => f.id === id)))
  assert.equal(manifest.osm_height_source.license, 'ODbL-1.0')
})

test('relative massing differentiates large apartments, recorded houses and auxiliary buildings', () => {
  const data = JSON.parse(readFileSync(new URL('../testdata/study/existing-buildings.geojson', import.meta.url)))
  const byId = Object.fromEntries(data.features.map(f => [f.id, f.properties]))
  assert.ok(byId['600881'].height_m > byId['418309'].height_m)
  assert.equal(byId['600881'].height_method, 'typology_estimate')
  assert.equal(byId['418309'].height_method, 'stories_estimate')
  assert.ok(byId['503201'].height_m > byId['415299'].height_m)
  assert.equal(byId['415299'].height_profile, 'small_auxiliary')
})
