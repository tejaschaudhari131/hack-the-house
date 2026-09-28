import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createNeighborhoodDisplay, sameChunkMap, mergeNeighborhoods, neighborhoodId, retainNeighborhoods, visibleNeighborhoods } from '../lib/studioData.js'

export { loadNeighborhood as fetchNeighborhood } from '../lib/neighborhoodLoader.js'
import { loadNeighborhood as fetchNeighborhood, loadNeighborhoodBatch } from '../lib/neighborhoodLoader.js'

export default function useNeighborhoodData(manifest, initialChunk, requiredIds, viewport, extraIds = [], activeId = initialChunk.id, neighborhoods) {
  const cache = useRef(new Map([[initialChunk.id, initialChunk.data]]))
  const display = useRef(null)
  display.current ||= createNeighborhoodDisplay()
  const [chunks, setChunks] = useState(cache.current), [error, setError] = useState(null), [pending, setPending] = useState(false), [attempt, setAttempt] = useState(0)
  const boundaries = useMemo(() => new Map((neighborhoods?.features || []).map(f => [neighborhoodId(f.properties.name), f.geometry])), [neighborhoods])
  const visibleKey = useMemo(() => visibleNeighborhoods(manifest, viewport, activeId, boundaries).join('|'), [manifest, viewport, activeId, boundaries])
  const wantedKey = [...new Set([activeId, ...requiredIds, ...extraIds, ...visibleKey.split('|').filter(Boolean)])].join('|')
  useEffect(() => {
    const ids = wantedKey.split('|').filter(Boolean), controller = new AbortController()
    const missing = ids.filter(id => !cache.current.has(id))
    // Touch needed entries to keep a small least-recently-used cache when panning back.
    for (const id of ids) if (cache.current.has(id)) { const data = cache.current.get(id); cache.current.delete(id); cache.current.set(id, data) }
    setError(null); setPending(missing.length > 0)
    const publish = () => { cache.current = retainNeighborhoods(cache.current, ids); setChunks(old => sameChunkMap(old, cache.current) ? old : new Map(cache.current)) }
    if (!missing.length) { publish(); return () => controller.abort() }
    loadNeighborhoodBatch(missing, (id, signal) => fetchNeighborhood(manifest.neighborhoods.find(n => n.id === id), signal), controller.signal,
      (id, data) => cache.current.set(id, data)).then(errors => {
      if (controller.signal.aborted) return
      publish(); setPending(false)
      setError(errors[0]?.message || null)
    })
    return () => controller.abort()
  }, [wantedKey, attempt, manifest])
  const parcels = useMemo(() => mergeNeighborhoods([...chunks.values()], 'parcels'), [chunks])
  const mapIndexes = useMemo(() => display.current.get(chunks, visibleKey.split('|').filter(Boolean)), [chunks, visibleKey])
  const retry = useCallback(() => setAttempt(n => n + 1), [])
  return { chunks, parcels, ...mapIndexes, visibleIds: visibleKey.split('|').filter(Boolean), pending, error, retry }
}
