import { useMemo, useRef } from 'react'
import { preparedEmptySiteIndex } from '../lib/emptySiteData.js'
import { hasMapDetail } from '../lib/studioData.js'

const EMPTY = { matches: [], pending: false, error: null }

export default function useEmptySites(enabled, chunks, visibleIds, viewport) {
  const indexes = useRef(new WeakMap())
  const scope = visibleIds.join('|')
  return useMemo(() => {
    if (!enabled || !hasMapDetail(viewport)) return EMPTY
    const matches = [], seen = new Set()
    try {
      for (const id of scope.split('|').filter(Boolean)) {
        const chunk = chunks.get(id)
        if (!chunk) continue
        if (!indexes.current.has(chunk)) indexes.current.set(chunk, preparedEmptySiteIndex(chunk))
        for (const match of indexes.current.get(chunk).query(viewport.bounds)) {
          if (!seen.has(match.pin)) { seen.add(match.pin); matches.push(match) }
        }
      }
      return { matches, pending: false, error: null }
    } catch (error) { return { ...EMPTY, error: error.message } }
  }, [enabled, chunks, scope, viewport])
}
