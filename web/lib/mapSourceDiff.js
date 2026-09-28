/** Lossless MapLibre patches: retain unchanged features and their exact coordinates. */
export function mapSourceDiff(previous = new Map(), features, idProperty) {
  const next = new Map(), add = [], update = [], remove = []
  for (const feature of features) {
    const id = feature.properties[idProperty]
    if ((typeof id !== 'string' && typeof id !== 'number') || next.has(id)) throw new Error(`Map features need unique ${idProperty} values`)
    next.set(id, feature)
    if (!previous.has(id)) add.push(feature)
    else if (previous.get(id) !== feature) {
      // geojson-vt 6.1.1 returns early for removeAllProperties and drops the
      // replacement values. Explicit removals preserve IDs/heights in worker tiles.
      const removeProperties = Object.keys(previous.get(id).properties).filter(key => !Object.hasOwn(feature.properties, key))
      update.push({ id, newGeometry: feature.geometry, ...(removeProperties.length ? { removeProperties } : {}), addOrUpdateProperties: Object.entries(feature.properties).map(([key, value]) => ({ key, value })) })
    }
  }
  for (const id of previous.keys()) if (!next.has(id)) remove.push(id)
  const diff = !next.size && previous.size ? { removeAll: true }
    : add.length || update.length || remove.length ? { ...(add.length ? { add } : {}), ...(update.length ? { update } : {}), ...(remove.length ? { remove } : {}) } : null
  return { next, diff }
}
