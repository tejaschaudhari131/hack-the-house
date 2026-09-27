/** The guided example: shortlist -> compare two options on one parcel -> brief. Chosen from committed data, not hardcoded. */

import { BUILDINGS } from "./buildings.js"
import { buildScenario, compareScenarios } from "./comparison.js"
import { EXAMPLE_QUERIES, filtersFor, findSites } from "./sites.js"

export const GUIDE_QUERY_ID = "city-triplex"

/** Building to drop for a Find Sites type filter; the triplex keeps its three-unit semantics. */
export function buildingForSiteType(typeId) {
  return BUILDINGS[typeId] ? typeId : "townhouse_duplex"
}

/** A second option on the same parcel: the best-scoring other building that is permitted by right, else a townhouse. */
export function alternativeBuilding(props, primary, zoning, weights) {
  const others = Object.keys(BUILDINGS).filter((id) => id !== primary && BUILDINGS[id].scoreType !== BUILDINGS[primary]?.scoreType)
  const scored = others
    .map((id) => {
      const scenario = buildScenario("B", id, props, zoning)
      const result = compareScenarios(buildScenario("A", primary, props, zoning), scenario, weights)
      return { id, permitted: scenario.permission.category === "permitted", score: result.b.exact ?? -1 }
    })
    .sort((x, y) => Number(y.permitted) - Number(x.permitted) || y.score - x.score || x.id.localeCompare(y.id))
  return scored[0]?.id || "townhouse_duplex"
}

/** Resolve the guided example from the data. Returns null when nothing matches (the UI then says so). */
export function resolveGuide(features, zoning, weights) {
  const query = EXAMPLE_QUERIES.find((item) => item.id === GUIDE_QUERY_ID)
  const filters = filtersFor(query)
  const rows = findSites(features, filters, weights, zoning, "score")
  const top = rows[0]
  if (!top) return { query, filters, count: 0, pin: null }
  const primary = buildingForSiteType(filters.typeId)
  return {
    query,
    filters,
    count: rows.length,
    pin: top.pin,
    address: top.props.address,
    a: { slot: "A", pin: top.pin, typeId: primary },
    b: { slot: "B", pin: top.pin, typeId: alternativeBuilding(top.props, primary, zoning, weights) },
  }
}
