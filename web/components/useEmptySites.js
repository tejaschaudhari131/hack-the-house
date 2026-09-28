import { useEffect, useRef, useState } from 'react'
import { emptySiteChunk } from '../lib/emptySites.js'
import { DETAIL_ZOOM } from '../lib/studioData.js'

const EMPTY = []

export default function useEmptySites(enabled, chunks, visibleIds, viewport, zoning) {
  const worker = useRef(null), sent = useRef(new Map()), revision = useRef(0)
  const [state, setState] = useState({ matches: EMPTY, pending: false, error: null })
  const scope = visibleIds.join('|')
  useEffect(() => {
    if (!enabled) return
    let w
    sent.current.clear()
    setState({ matches: EMPTY, pending: true, error: null })
    const fail = () => {
      w?.terminate(); worker.current = null
      setState({ matches: EMPTY, pending: false, error: 'Site highlighting unavailable. Toggle off and on to retry.' })
    }
    try {
      w = new Worker(new URL('../workers/emptySites.worker.js', import.meta.url), { type: 'module' })
      worker.current = w
      w.onerror = fail
      w.postMessage({ type: 'init', zoning })
    } catch { fail() }
    return () => { ++revision.current; w?.terminate(); worker.current = null; sent.current.clear() }
  }, [enabled, zoning])

  useEffect(() => {
    if (!enabled || !worker.current) return
    const nextRevision = ++revision.current
    const ids = scope.split('|').filter(id => id && chunks.has(id))
    const additions = []
    for (const id of sent.current.keys()) if (!ids.includes(id)) sent.current.delete(id)
    for (const id of ids) if (sent.current.get(id) !== chunks.get(id)) {
      additions.push([id, emptySiteChunk(chunks.get(id))]); sent.current.set(id, chunks.get(id))
    }
    setState({ matches: EMPTY, pending: true, error: null })
    // Install the response handler here so freshness includes the current viewport.
    worker.current.onmessage = ({ data }) => {
      if (data.revision !== revision.current) return
      setState({ matches: data.matches || EMPTY, pending: false, error: data.error ? 'Site screening failed. Toggle off and on to retry.' : null, viewport, scope, chunks })
    }
    worker.current.postMessage({ revision: nextRevision, ids, chunks: additions, bounds: viewport?.zoom >= DETAIL_ZOOM ? viewport.bounds : null })
  }, [enabled, chunks, scope, viewport, zoning])

  const fresh = state.viewport === viewport && state.scope === scope && state.chunks === chunks
  return { matches: enabled && fresh ? state.matches : EMPTY, pending: enabled && !state.error && (state.pending || !fresh), error: enabled ? state.error : null }
}
