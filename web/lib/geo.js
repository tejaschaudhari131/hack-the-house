import { WALK_RADIUS_M } from "./buildings.js"

const M_PER_DEG_LAT = 111_320

export function haversineMeters(lon1, lat1, lon2, lat2) {
  const toRad = (degrees) => (degrees * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * 6_371_000 * Math.asin(Math.sqrt(a))
}

function outerRing(geometry) {
  if (!geometry) return null
  if (geometry.type === "Polygon") return geometry.coordinates?.[0] || null
  if (geometry.type === "MultiPolygon") {
    let best = []
    for (const polygon of geometry.coordinates || []) {
      const ring = polygon?.[0] || []
      if (ring.length > best.length) best = ring
    }
    return best.length ? best : null
  }
  return null
}

/** Mean of the outer ring. Parcels are small, so this stays on the lot. */
export function featurePoint(geometry) {
  const ring = outerRing(geometry)
  if (!ring?.length) return null
  let lon = 0
  let lat = 0
  let count = 0
  for (const coord of ring) {
    if (!Array.isArray(coord) || coord.length < 2) continue
    lon += Number(coord[0])
    lat += Number(coord[1])
    count += 1
  }
  if (!count) return null
  return [lon / count, lat / count]
}

export function circlePolygon(lon, lat, radiusMeters = WALK_RADIUS_M, steps = 64) {
  const dLat = radiusMeters / M_PER_DEG_LAT
  const dLon = radiusMeters / (M_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180))
  const ring = []
  for (let step = 0; step <= steps; step += 1) {
    const angle = (2 * Math.PI * step) / steps
    ring.push([lon + dLon * Math.cos(angle), lat + dLat * Math.sin(angle)])
  }
  return {
    type: "Polygon",
    coordinates: [ring],
  }
}

export function stopsWithin(collection, lon, lat, radiusMeters = WALK_RADIUS_M) {
  const hits = []
  for (const feature of collection?.features || []) {
    const coords = feature.geometry?.coordinates
    if (!coords) continue
    const distance = haversineMeters(lon, lat, coords[0], coords[1])
    if (distance <= radiusMeters) {
      hits.push({
        ...feature.properties,
        distanceM: Math.round(distance),
      })
    }
  }
  hits.sort((a, b) => a.distanceM - b.distanceM)
  const trips = hits.reduce((sum, stop) => sum + Number(stop.weekday_trips || 0), 0)
  const routes = []
  for (const stop of hits) {
    for (const route of stop.routes || []) {
      if (!routes.includes(route)) routes.push(route)
    }
  }
  return { count: hits.length, trips, routes: routes.slice(0, 8), stops: hits }
}
