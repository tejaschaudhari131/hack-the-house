import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { mergeNeighborhoods, retainNeighborhoods, visibleNeighborhoods } from '../lib/studioData.js'

export { loadNeighborhood as fetchNeighborhood } from '../lib/neighborhoodLoader.js'
import { loadNeighborhood as fetchNeighborhood } from '../lib/neighborhoodLoader.js'

export default function useNeighborhoodData(manifest, initialChunk, requiredIds, viewport, extraIds = []) {
  const cache = useRef(new Map([[initialChunk.id, initialChunk.data]]))
  const [chunks, setChunks] = useState(cache.current), [error, setError] = useState(null), [pending, setPending] = useState(false), [attempt, setAttempt] = useState(0)
  const visibleKey = visibleNeighborhoods(manifest, viewport).join('|')
  const wantedKey = [...new Set([...requiredIds, ...extraIds, ...visibleKey.split('|').filter(Boolean)])].sort().join('|')
  useEffect(() => {
    const ids = wantedKey.split('|').filter(Boolean), controller = new AbortController()
    const missing = ids.filter(id => !cache.current.has(id))
    // Touch needed entries to keep a small least-recently-used cache when panning back.
    for (const id of ids) if (cache.current.has(id)) { const data = cache.current.get(id); cache.current.delete(id); cache.current.set(id, data) }
    setError(null); setPending(missing.length > 0)
    const publish = () => { cache.current = retainNeighborhoods(cache.current, ids); setChunks(new Map(cache.current)) }
    if (!missing.length) { publish(); return () => controller.abort() }
    Promise.allSettled(missing.map(async id => {
      const descriptor = manifest.neighborhoods.find(n => n.id === id)
      const data = await fetchNeighborhood(descriptor, controller.signal)
      if (!controller.signal.aborted) cache.current.set(id, data)
    })).then(results => {
      if (controller.signal.aborted) return
      publish(); setPending(false)
      setError(results.find(r => r.status === 'rejected')?.reason?.message || null)
    })
    return () => controller.abort()
  }, [wantedKey, attempt, manifest])
  const parcels = useMemo(() => mergeNeighborhoods([...chunks.values()], 'parcels'), [chunks])
  const visibleChunks = useMemo(() => visibleKey.split('|').map(id => chunks.get(id)).filter(Boolean), [visibleKey, chunks])
  const mapParcels = useMemo(() => mergeNeighborhoods(visibleChunks, 'parcels'), [visibleChunks])
  const mapBuildings = useMemo(() => mergeNeighborhoods(visibleChunks, 'buildings'), [visibleChunks])
  const retry = useCallback(() => setAttempt(n => n + 1), [])
  return { chunks, parcels, mapParcels, mapBuildings, pending, error, retry }
}
