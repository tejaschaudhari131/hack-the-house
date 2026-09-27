import { haversineMeters } from './geo.js'
import { geometryCenter, rectangleAt } from './plannerGeometry.js'
import { endpointCoordinates, graphWithJunctions, traverseGraph } from './networkRouting.js'

const finite = Number.isFinite
const clamp = n => Math.max(0, Math.min(100, n))
export const NETWORK_RULES = { originSnapM: 100, editSnapM: 35, parkSnapM: 50, maxConnectionM: 500, walkMPerMin: 80 }

export function nearestNode(network, coordinates, maxDistance = NETWORK_RULES.originSnapM) {
  if (!network || !coordinates?.every(finite)) return null
  let best = null
  network.nodes.forEach((point, node) => {
    if (!network.ground[node]) return
    const distance = haversineMeters(...coordinates, ...point)
    if (distance <= maxDistance && (!best || distance < best.distance)) best = { node, distance, coordinates: point }
  })
  return best
}

export function connectionGeometry(network, connection) {
  const a = endpointCoordinates(network, connection.from), b = endpointCoordinates(network, connection.to)
  if (!a || !b) return null
  const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], sx = 111320 * Math.cos(mid[1] * Math.PI / 180)
  const dx = (b[0] - a[0]) * sx, dy = (b[1] - a[1]) * 111320, length = Math.hypot(dx, dy)
  if (!length) return null
  const ox = -dy / length * connection.width / 2 / sx, oy = dx / length * connection.width / 2 / 111320
  const ring = [[a[0] + ox, a[1] + oy], [b[0] + ox, b[1] + oy], [b[0] - ox, b[1] - oy], [a[0] - ox, a[1] - oy]]
  return { type: 'Polygon', coordinates: [[...ring, ring[0]]] }
}

export function validateConnection(network, c) {
  const a = endpointCoordinates(network, c.from), b = endpointCoordinates(network, c.to)
  if (!a || !b) return 'Both endpoints must join existing ground-level roads or paths.'
  if (!['path', 'street'].includes(c.kind) || !finite(c.width) || c.width < 2 || c.width > 30) return 'Choose a connection type and width from 2 to 30 metres.'
  const length = haversineMeters(...a, ...b)
  if (c.from === c.to || length < 2 || length > NETWORK_RULES.maxConnectionM) return 'Choose distinct endpoints 2–500 metres apart.'
  return null
}

export function validatePark(network, park) {
  if (!park.coordinates?.every(finite) || park.coordinates.length !== 2 || !finite(park.width) || !finite(park.depth) || park.width < 5 || park.width > 100 || park.depth < 5 || park.depth > 100) return 'Park dimensions must be 5–100 metres.'
  if (!Number.isInteger(park.node) || !network?.nodes[park.node] || !network.ground[park.node]) return 'The park must reference a ground-level walking node.'
  if (haversineMeters(...park.coordinates, ...network.nodes[park.node]) > NETWORK_RULES.parkSnapM) return 'The assumed park entrance connector must be within 50 metres of the network.'
  return null
}

export function prepareNetwork(network) {
  const adjacency = Array.from({ length: network.nodes.length }, () => [])
  for (const [from, to, minutes] of network.edges) if (adjacency[from] && adjacency[to] && finite(minutes) && minutes >= 0) adjacency[from].push([to, minutes])
  return { network, adjacency }
}

export function shortestPaths(prepared, origin, connections = []) {
  const valid = connections.filter(c => !validateConnection(prepared.network, c))
  const graph = valid.length ? graphWithJunctions(prepared, [], valid) : { nodes: prepared.network.nodes, neighbors: node => prepared.adjacency[node] || [] }
  return traverseGraph(graph, origin)
}

function routeCoordinates(network, previous, origin, target) {
  const path = [target]
  while (path.at(-1) !== origin && path.length <= network.nodes.length) {
    const parent = previous[path.at(-1)]
    if (parent < 0) return null
    path.push(parent)
  }
  return path.reverse().map(node => network.nodes[node])
}

export function networkAccess(prepared, feature, stop, scenario, proposed = false) {
  if (!prepared) return { available: false, reason: 'Walking network is loading or unavailable.', walkMinutes: null, parkMinutes: null, parkScore: null, route: null }
  const { network } = prepared, point = geometryCenter(feature.geometry), origin = nearestNode(network, point)
  if (!origin) return { available: false, reason: 'No ground-level walking node within 100 m of the parcel centre.', walkMinutes: null, parkMinutes: null, parkScore: null, route: null }
  const connections = proposed ? scenario.connections || [] : []
  const { distances, previous, nodes } = shortestPaths(prepared, origin.node, connections)
  const originTime = origin.distance / 80, target = stop && nearestNode(network, stop.coordinates)
  const walkMinutes = target && finite(distances[target.node]) ? originTime + distances[target.node] + target.distance / 80 : null
  const route = walkMinutes === null ? null : [point, ...routeCoordinates({ nodes }, previous, origin.node, target.node), stop.coordinates]
  let parkMinutes = Infinity, parkName = null, parkNode = null
  for (const park of network.parks || []) for (const node of park.nodes) if (originTime + distances[node] < parkMinutes) { parkMinutes = originTime + distances[node]; parkName = park.name; parkNode = node }
  for (const park of proposed ? scenario.parks || [] : []) if (!validatePark(network, park)) {
    const minutes = originTime + distances[park.node] + haversineMeters(...park.coordinates, ...network.nodes[park.node]) / 80
    if (minutes < parkMinutes) { parkMinutes = minutes; parkName = park.name || 'Proposed park'; parkNode = park.node }
  }
  const inventory = (network.parks?.length || 0) + (proposed ? (scenario.parks || []).filter(p => !validatePark(network, p)).length : 0)
  return { available: true, walkMinutes, route, parkMinutes: finite(parkMinutes) ? parkMinutes : null, parkName, parkRoute: parkNode === null ? null : [point, ...routeCoordinates({ nodes }, previous, origin.node, parkNode)], parkScore: inventory ? finite(parkMinutes) ? clamp(100 * (1 - parkMinutes / 15)) : 0 : null, originConnectorM: origin.distance, stopConnectorM: target?.distance ?? null,
    reason: walkMinutes === null ? 'Selected stop has no routed connection in this extract (or lies beyond the 100 m snap limit).' : 'Walking network plus assumed last-metre connectors; slopes and safe crossings are not verified.' }
}

export function infrastructureReservations(network, scenario) {
  if (!network) return []
  return [
    ...(scenario.connections || []).filter(c => !validateConnection(network, c)).map(c => ({ type: 'Feature', properties: { id: c.id, kind: c.kind }, geometry: connectionGeometry(network, c) })),
    ...(scenario.parks || []).filter(p => !validatePark(network, p)).map(p => ({ type: 'Feature', properties: { id: p.id, kind: 'park' }, geometry: rectangleAt(p.coordinates, p.width, p.depth) })),
  ]
}
