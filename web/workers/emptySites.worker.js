import { emptySiteIndex } from '../lib/emptySites.js'

const indexes = new Map()
let zoning, latest = 0
self.onmessage = async ({ data }) => {
  if (data.type === 'init') { zoning = data.zoning; return }
  const { revision, chunks, ids, bounds } = data
  latest = revision
  try {
    for (const id of indexes.keys()) if (!ids.includes(id)) indexes.delete(id)
    for (const [id, chunk] of chunks) indexes.set(id, emptySiteIndex(chunk, zoning))
    const matches = [], seen = new Set()
    let checked = 0
    if (bounds) for (const id of ids) for (const match of indexes.get(id)?.query(bounds) || []) {
      if (match && !seen.has(match.pin)) { seen.add(match.pin); matches.push(match) }
      // Allow a new viewport or cancellation to interrupt a long screening batch.
      if (++checked % 12 === 0) await new Promise(resolve => setTimeout(resolve, 0))
      if (revision !== latest) return
    }
    self.postMessage({ revision, matches })
  } catch (error) { self.postMessage({ revision, error: error.message }) }
}
