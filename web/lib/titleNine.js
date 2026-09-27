import { BUILDINGS } from './buildings.js'
import { resolveZoning, unitPermission } from './zoning.js'
import { geometryCenter } from './plannerGeometry.js'
import { CODE, codeLink, districtStandards, TITLE_NINE_VERSION } from './titleNineRules.js'

const number = x => typeof x === 'number' && Number.isFinite(x)
const nonnegative = x => number(x) && x >= 0
const count = x => nonnegative(x) && Number.isInteger(x)
const FT = 1 / .3048, SQFT = FT * FT
const show = x => number(x) ? Math.round(x * 10) / 10 : 'Unknown'

/** Studio's combined colour family must not stand in for two different legal uses. */
export function housingSpec(option) {
  const spec = BUILDINGS[option.typeId]
  if (!spec) throw new Error('Unknown building type')
  if (option.typeId !== 'townhouse_duplex') return spec
  return option.residentialForm === 'attached'
    ? { ...spec, label: 'Attached house (1 unit)', units: 1, useRow: 'Single-Unit Attached' }
    : { ...spec, label: 'Duplex (2 units)', useRow: 'Two-Unit' }
}

/** Minimum distance to any parcel edge, including holes. Not legal street frontage. */
export function boundaryClearanceFeet(parcel, building) {
  const origin = geometryCenter(parcel)
  if (!origin || !building) return null
  const rings = g => g.type === 'Polygon' ? g.coordinates : g.type === 'MultiPolygon' ? g.coordinates.flat() : []
  const project = p => [(p[0] - origin[0]) * 111320 * Math.cos(origin[1] * Math.PI / 180), (p[1] - origin[1]) * 111320]
  const edges = g => rings(g).flatMap(r => r.slice(1).map((p, i) => [project(r[i]), project(p)]))
  const pointDistance = (p, a, b) => {
    const dx = b[0] - a[0], dy = b[1] - a[1], d = dx * dx + dy * dy
    const t = d ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / d)) : 0
    return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy)
  }
  const a = edges(parcel), b = edges(building)
  if (!a.length || !b.length) return null
  return Math.min(...a.flatMap(([p, q]) => b.map(([r, s]) => Math.min(pointDistance(p, r, s), pointDistance(q, r, s), pointDistance(r, p, q), pointDistance(s, p, q))))) * FT
}

/** Checks are independent of priorities. Inputs are scenario assumptions, never approvals.
 * members includes this candidate exactly once; per-lot totals and the whole-project IZ
 * trigger are re-evaluated for every alternative. No change to source observations.
 */
export function evaluateTitleNine({ option, feature, zoning, massing, existingBuildings = null, members, siteInputs = {}, projectInputs = {} }) {
  const props = feature.properties, spec = housingSpec(option), code = props.zoning_code
  const permission = unitPermission(spec.scoreType, spec.useRow, resolveZoning(code, zoning), spec.units)
  const checks = [], district = districtStandards(code), inputs = siteInputs
  const add = (id, label, source, status, detail, section = CODE[source][0], blocking = true) => checks.push({ id, label, section, url: codeLink(source), status, detail, blocking })
  const compare = (id, label, source, actual, limit, mode = 'max', section) => {
    const known = nonnegative(actual) && number(limit)
    add(id, label, source, !known ? 'unknown' : (mode === 'max' ? actual <= limit + 1e-7 : actual + 1e-7 >= limit) ? 'pass' : 'conflict',
      `${known ? show(actual) : 'Unknown'}; ${mode === 'max' ? 'maximum' : 'minimum'} ${show(limit)}.`, section)
  }
  add('use', 'Residential use', 'use', permission.category === 'permitted' ? 'pass' : permission.category === 'not_permitted' ? 'conflict' : permission.category === 'special' ? 'conditional' : 'unknown', `${spec.useRow}: ${permission.label}. ${permission.detail || ''}`)
  const floors = option.floors ?? spec.floors
  add('dimensions', 'Valid proposal dimensions', 'measurements', [option.width, option.depth, option.height].every(x => number(x) && x > 0) && count(floors) && floors > 0 ? 'pass' : 'conflict', 'Positive width, depth and height; a positive whole-number story count. Height means zoning height above grade, not roof elevation.', '925.07')
  if (option.residentialForm === 'attached' && option.typeId === 'townhouse_duplex') {
    add('attached-form', 'Shared wall and separate lot', 'use', 'unknown', 'An attached house needs a shared party wall and its own lot. This detached massing tool cannot establish that configuration.', '911.04.A.69A')
    if (code?.startsWith('R1D-')) add('attached-width', 'Attached-house lot width', 'use', !nonnegative(inputs.lotWidthFt) ? 'unknown' : inputs.lotWidthFt <= 35 ? 'pass' : 'conditional', 'Lot width ≤35 ft: permitted by right; greater width needs a special exception. Measure at the required front setback, not the map bounding box.', '911.04.A.69A')
  }
  if (code === 'H' || code === 'UI') add('use-conditions', 'District-specific residential conditions', 'use', 'unknown', 'Hillside use conditions / UI ground-floor residential review require a site-specific determination.', code === 'H' ? '911.04.A.69' : '911.04.A.85')
  const all = members || [{ option, feature, massing }]
  const local = all.filter(m => m.feature.properties.pin === props.pin)
  const totalUnits = all.reduce((n, m) => n + housingSpec(m.option).units, 0)
  const localUnits = local.reduce((n, m) => n + housingSpec(m.option).units, 0)
  const lot = number(inputs.lotSqft) && inputs.lotSqft > 0 ? inputs.lotSqft : number(props.lot_sqft) && props.lot_sqft > 0 ? props.lot_sqft : null
  const footprint = local.reduce((n, m) => n + m.option.width * m.option.depth * SQFT, 0)
  const floorArea = local.reduce((n, m) => n + m.option.width * m.option.depth * (m.option.floors ?? housingSpec(m.option).floors) * SQFT, 0)
  const empty = existingBuildings !== null && existingBuildings.length === 0
  const existingGfa = nonnegative(inputs.existingGfaSqft) ? inputs.existingGfaSqft : empty ? 0 : null
  const existingFootprint = nonnegative(inputs.existingFootprintSqft) ? inputs.existingFootprintSqft : empty ? 0 : null
  if (!district) add('district', 'Base district dimensions', 'special', 'unknown', `${code || 'Unknown district'} needs its own adopted standards, height map or development plan. No generic district rules are substituted.`)
  else {
    compare('height', 'Height (ft)', district.source, option.height * FT, district.height, 'max', district.section)
    if (district.stories) compare('stories', 'Stories', district.source, count(floors) ? floors : null, district.stories, 'max', district.section)
    if (district.minLot) compare('lot', 'Lot area (sq ft)', district.source, lot, district.minLot, 'min', district.section)
    if (district.far) compare('far', 'Total floor-area ratio on this lot', district.source, lot > 0 && (existingGfa !== null || floorArea / lot > district.far) ? ((existingGfa ?? 0) + floorArea) / lot : null, district.far, 'max', district.section)
    if (district.coverage) compare('coverage', 'Total lot coverage (%)', district.source, lot > 0 && (existingFootprint !== null || footprint / lot * 100 > district.coverage) ? ((existingFootprint ?? 0) + footprint) / lot * 100 : null, district.coverage, 'max', district.section)
    if (district.disturbance) compare('disturbance', 'Site disturbance (%)', district.source, inputs.disturbancePercent, district.disturbance, 'max', district.section)
    const clearance = massing.fits ? boundaryClearanceFeet(feature.geometry, massing.geometry) : null
    const required = Math.max(...district.yards)
    // Sufficient test only: do not assign front/rear roles from compass directions.
    add('setbacks', 'Base yards / setbacks', district.source, !massing.fits ? 'conflict' : clearance !== null && clearance + 1e-5 >= required ? 'pass' : 'unknown',
      clearance !== null && clearance + 1e-5 >= required ? `At least ${show(clearance)} ft from every mapped edge; clears the largest base yard (${required} ft).`
        : `Needs legal frontage and edge classification. Base front/rear/exterior/interior yards: ${district.yards.join('/')} ft. Contextual and party-wall exceptions are not assumed.`, district.section)
    const needsReview = code?.startsWith('RM-') && spec.units >= 4 || ['NDO', 'LNC', 'NDI', 'UNC'].includes(code) && lot >= 2400 || ['HC', 'GI', 'UI'].includes(code) && lot >= 8000
    if (needsReview) add('site-plan', 'Site plan review', district.source, 'conditional', 'Administrative site plan review is required for this proposal. A screening pass is not a permit.', district.section, false)
  }
  const compatibility = /^RM-(M|H|VH)$/.test(code || '') || ['NDO', 'LNC', 'NDI', 'UNC', 'HC', 'GI', 'UI', 'P'].includes(code)
  if (compatibility) {
    add('compatibility', 'Residential compatibility', 'compatibility', 'unknown', 'Adjacent/across-street relationships, protected district boundaries, yards, screening, light and noise lack sufficient evidence.', '916.01–916.07')
  }
  // Proxies can trigger review, but cannot certify an overlay absent.
  add('overlays', 'Overlay coverage', 'overlays', inputs.overlayStatus === 'none' ? 'pass' : inputs.overlayStatus === 'present' ? 'conditional' : 'unknown', inputs.overlayStatus === 'none' ? 'User assumes no §906 overlay applies. Positive mapped hazard signals still require review below.' : 'Confirm adopted floodplain, landslide, undermining, view-protection and steep-slope overlays. Parcel hazard proxies are not the overlay map.')
  for (const [key, label, section] of [['sfha_overlap', 'Floodplain', '906.02'], ['steep_slope_overlap', 'Steep-slope proxy', '906.08'], ['undermined_overlap', 'Undermining', '906.05']]) {
    if (number(props[key]) && props[key] > 0) add(key, label, 'overlays', 'conditional', 'Mapped overlap triggers site review; it does not prohibit every building on the parcel. Engineering, exact footprint and required approvals remain unresolved.', section)
  }
  const izMembers = all.filter(m => m.izStatus === 'inside' || m.feature.properties.pin === props.pin && inputs.izStatus === 'inside')
  const izUnknown = all.some(m => !['inside', 'outside'].includes(m.izStatus ?? (m.feature.properties.pin === props.pin ? inputs.izStatus : undefined)))
  if (totalUnits < 20) add('iz', 'Inclusionary housing trigger', 'inclusionary', 'not_applicable', `${totalUnits} proposed homes in this plan; the project trigger is 20. Related phases, existing conversions and sleeping rooms must be included if applicable.`)
  else if (!izMembers.length && !izUnknown) add('iz', 'Inclusionary housing district', 'inclusionary', 'not_applicable', 'Every project parcel is assumed outside the mapped IZ district.')
  else if (izUnknown) add('iz', 'Inclusionary housing district', 'inclusionary', 'unknown', `${totalUnits} homes in the plan. Confirm IZ coverage for every project parcel; do not use neighborhood names as boundaries.`)
  else if (izMembers.length !== all.length) add('iz', 'Mixed IZ project boundary', 'inclusionary', 'unknown', 'The project includes parcels inside and outside IZ. Staff must establish which units count before applying a percentage.')
  else {
    const required = Math.ceil(totalUnits * .1)
    compare('iz-units', 'On-site income-restricted homes', 'inclusionary', count(projectInputs.affordableUnits) ? projectInputs.affordableUnits : null, required, 'min', '907.04.A.6')
    add('iz-covenant', 'IZ affordability and project review', 'inclusionary', 'conditional', 'On-site route: 35-year affordability; rental at 50% AMI / ownership at 80% AMI, official household-size and utility allowances, unit mix and recorded covenants. Target household income in Studio is not this legal test. Mixed-boundary projects need staff review; off-site alternatives are not modeled.')
  }
  // Baseline residential schedule. No unverified transit or bicycle reductions.
  const minParking = local.reduce((n, m) => n + (housingSpec(m.option).useRow === 'Single-Unit Attached' ? 0 : housingSpec(m.option).units), 0)
  const maxParking = local.reduce((n, m) => n + housingSpec(m.option).units * (['Single-Unit Detached', 'Single-Unit Attached'].includes(housingSpec(m.option).useRow) ? 4 : 2), 0)
  const parkingKnown = inputs.parkingRegime === 'base'
  add('parking-regime', 'Parking schedule / exemptions', 'parking', parkingKnown ? 'pass' : 'unknown', parkingKnown ? 'User assumes the base residential schedule, with no area exemption, approved alternative plan or reduction.' : 'Confirm area exemptions and any approved parking plan. A simulated bus stop or service increase gives no automatic credit.', '914.02–914.04')
  if (parkingKnown) compare('parking-min', 'On-lot car spaces', 'parking', count(inputs.parkingSpaces) ? inputs.parkingSpaces : null, minParking, 'min', '914.02')
  if (parkingKnown) compare('parking-max', 'On-lot car spaces', 'parking', count(inputs.parkingSpaces) ? inputs.parkingSpaces : null, maxParking, 'max', '914.02')
  const bikeRequired = local.reduce((n, m) => n + (housingSpec(m.option).units >= 12 ? Math.ceil(housingSpec(m.option).units / 3) : 0), 0)
  if (bikeRequired) {
    compare('bikes', 'Bicycle spaces', 'parking', count(inputs.bikeSpaces) ? inputs.bikeSpaces : null, bikeRequired, 'min', '914.05')
    compare('protected-bikes', 'Protected bicycle spaces', 'parking', count(inputs.protectedBikeSpaces) ? inputs.protectedBikeSpaces : null, count(inputs.bikeSpaces) ? Math.round(inputs.bikeSpaces * .6) : null, 'min', '914.05.D')
  }
  if (localUnits >= 4) add('accessible-parking', 'Accessible parking / access layout', 'parking', 'unknown', 'Accessible spaces, van access, dimensions, driveway and loading design need a site plan. Space counts alone do not establish compliance.', '914.06–914.10')
  if (inputs.grading === false) add('grading', 'Cut/fill and retaining walls', 'environment', 'not_applicable', 'User assumes no grading or retaining-wall work.', '915.02.A')
  else if (inputs.grading !== true) add('grading', 'Grading scope', 'environment', 'unknown', 'Confirm whether construction involves grading or retaining walls.', '915.02.A')
  else {
    compare('cut-fill', 'Cut/fill slope (%)', 'environment', inputs.cutFillSlopePercent, 25, 'max', '915.02.A')
    if (nonnegative(inputs.cutFillSlopePercent) && inputs.cutFillSlopePercent > 25) {
      const check = checks.at(-1); check.status = 'conditional'; check.detail += ' A geotechnical certification and approved stabilization can authorize a steeper slope.'
    }
    compare('grading-clearance', 'Cut/fill clearance (ft)', 'environment', inputs.gradingClearanceFt, 5, 'min', '915.02.A')
    compare('retaining', 'Retaining-wall height (ft)', 'environment', inputs.retainingWallHeightFt, 10, 'max', '915.02.A')
    add('slope-planting', 'Planting on exposed slopes >15%', 'environment', 'unknown', 'If created/exposed slopes exceed 15%, calculate the §915.02.B planting schedule from the affected area. The general 15% finished-grade target is encouraged, not a prohibition.', '915.02.B')
  }
  if (!number(lot) || lot > 10890) add('tree-survey', 'Tree survey', 'environment', inputs.treeSurvey === true ? 'pass' : 'unknown', 'Sites larger than ¼ acre (10,890 sq ft) require a tree survey. “Provided” records an assumption, not City acceptance.', '915.02.C')
  if (inputs.matureTreesRemoved === false) add('trees', 'Trees ≥12-inch diameter', 'environment', 'pass', 'User assumes no qualifying tree is removed; survey still applies where required.', '915.02.D')
  else if (inputs.matureTreesRemoved === true) compare('tree-replacement', 'Replacement total diameter (in)', 'environment', inputs.replacementDiameterIn, inputs.removedDiameterIn, 'min', '915.02.D')
  else add('trees', 'Tree preservation / replacement', 'environment', 'unknown', 'Inventory trees ≥12 inches diameter measured 4 ft above grade; preserve or replace the combined removed diameter.', '915.02.D')
  if (inputs.tif === true || inputs.cityProject === true) add('public-energy', 'Public-project energy requirements', 'environment', 'conditional', 'TIF projects require the §915.06 LEED standard; qualifying City projects require §915.08 energy standards. Current City ownership alone does not establish applicability.', '915.06 / 915.08')
  if (inputs.landscapeReview === 'required') {
    compare('street-trees', 'Street trees', 'landscape', count(inputs.streetTrees) ? inputs.streetTrees : null, nonnegative(inputs.frontageFt) ? Math.ceil(inputs.frontageFt / 30) : null, 'min', '918.02')
    if (count(inputs.parkingSpaces) && inputs.parkingSpaces > 4) {
      compare('parking-landscape', 'Parking landscape area (sq ft)', 'landscape', inputs.parkingLandscapeSqft, inputs.parkingSpaces * (inputs.parkingSpaces > 100 ? 30 : 25), 'min', '918.02')
      compare('parking-trees', 'Parking trees', 'landscape', count(inputs.parkingTrees) ? inputs.parkingTrees : null, Math.ceil(inputs.parkingSpaces / 5), 'min', '918.02')
    }
    add('landscape-design', 'Landscape layout and screening', 'landscape', 'unknown', 'Placement, planting strips, buffers and §918.03 screening require a site design; quantity checks alone are insufficient.')
  } else add('landscape', 'Landscape review applicability', 'landscape', inputs.landscapeReview === 'not_required' && !checks.some(c => c.id === 'site-plan') ? 'not_applicable' : 'unknown', 'Chapter 918 applies to site plan review, PDP and FLDP proposals. Parking exceptions do not waive every landscape requirement.')
  // Unsupported / discretionary rules are explicitly excluded, not failures or passes.
  const assessed = checks.filter(c => ['pass', 'conflict'].includes(c.status))
  const excluded = checks.filter(c => !['pass', 'conflict', 'not_applicable'].includes(c.status))
  const conflict = assessed.some(c => c.status === 'conflict')
  return { version: TITLE_NINE_VERSION, district: code || null, permission, checks,
    status: conflict ? 'conflict' : excluded.length ? 'partial' : 'pass',
    eligible: !conflict, conflict, assessed: assessed.map(c => c.id), excluded: excluded.map(c => c.id),
    totals: { lotSqft: lot ?? null, proposedFootprintSqft: footprint, proposedGfaSqft: floorArea, lotUnits: localUnits, projectUnits: totalUnits },
    assumptions: ['Mapped parcel treated as one zoning lot; all placed buildings treated as one project.', 'Floor area = width × depth × entered stories, plus stated existing GFA. Height uses entered zoning height.', 'Site inputs are user assumptions. Base standards only; bonuses, contextual exceptions, variances and approvals are not granted by this tool.'],
  }
}
