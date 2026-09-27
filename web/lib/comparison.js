/** Deterministic two-scenario comparison. The UI, the template, the report, and the AI facts all read this object. */

import { BUILDINGS, scoreProxyNote } from "./buildings.js"
import { FACTORS, breakdown, coverageText, round1 } from "./factors.js"
import { resolveZoning, unitPermission } from "./zoning.js"

/** Gaps below this many points (0–100 scale) are described as close. It is a wording threshold, not a statistical test. */
export const CLOSE_GAP = 1

const EPSILON = 1e-9

/** One scenario: a building (type + unit count) on one parcel. */
export function buildScenario(slot, buildingId, props, zoningRules) {
  const spec = BUILDINGS[buildingId]
  const zoningInfo = resolveZoning(props.zoning_code, zoningRules)
  return {
    slot,
    buildingId,
    label: spec?.label || buildingId,
    units: spec?.units ?? null,
    scoreType: spec?.scoreType || buildingId,
    scoreNote: scoreProxyNote(buildingId),
    pin: props.pin,
    address: props.address || null,
    neighborhood: props.neighborhood || null,
    zoningCode: props.zoning_code || null,
    scores: props.scores?.[spec?.scoreType || buildingId] || {},
    permission: unitPermission(spec?.scoreType || buildingId, spec?.useRow || null, zoningInfo, spec?.units),
  }
}

function place(scenario) {
  return `${scenario.label} at ${scenario.address || scenario.pin}`
}

/** Scores, contributions, drivers, coverage, and permission for scenario A versus scenario B. */
export function compareScenarios(a, b, weights) {
  const ra = breakdown(a.scores, weights)
  const rb = breakdown(b.scores, weights)
  const factors = FACTORS.map((factor, index) => {
    const x = ra.rows[index]
    const y = rb.rows[index]
    return {
      id: factor.id,
      label: factor.label,
      direction: factor.direction,
      weight: x.weight,
      a: { value: x.value, suitability: x.suitability, contribution: x.contribution },
      b: { value: y.value, suitability: y.suitability, contribution: y.contribution },
      difference: (x.contribution ?? 0) - (y.contribution ?? 0),
      heldConstant: x.value !== null && x.value === y.value,
      coverageDiffers: x.available !== y.available,
    }
  })
  const ranked = ra.exact !== null && rb.exact !== null
  const gap = ranked ? ra.exact - rb.exact : null
  const shownGap = ranked ? round1(ra.composite - rb.composite) : null
  let winner = null
  if (ranked) winner = Math.abs(gap) < EPSILON || shownGap === 0 ? "tie" : gap > 0 ? "A" : "B"
  const drivers = factors.filter((row) => row.weight > 0 && !row.coverageDiffers && Math.abs(row.difference) > EPSILON)
  const sameCoverage = ra.availableIds.join() === rb.availableIds.join()
  const permitted = (scenario) => scenario.permission.category === "permitted" || scenario.permission.category === "partial"
  return {
    a: { ...a, composite: ra.composite, exact: ra.exact, coverage: coverageText(ra), availableIds: ra.availableIds, missingIds: ra.missingIds, noScoreReason: ra.noScoreReason },
    b: { ...b, composite: rb.composite, exact: rb.exact, coverage: coverageText(rb), availableIds: rb.availableIds, missingIds: rb.missingIds, noScoreReason: rb.noScoreReason },
    sameParcel: a.pin === b.pin,
    ranked,
    gap,
    shownGap,
    winner,
    close: ranked && winner !== "tie" && Math.abs(gap) < CLOSE_GAP,
    factors,
    favorA: drivers.filter((row) => row.difference > 0).sort((x, y) => y.difference - x.difference),
    favorB: drivers.filter((row) => row.difference < 0).sort((x, y) => x.difference - y.difference),
    heldConstant: factors.filter((row) => row.heldConstant && row.weight > 0).map((row) => row.id),
    sameCoverage,
    coverageWarning: sameCoverage
      ? null
      : "The two scenarios have different evidence coverage, so part of the gap comes from which factors are available, not from an observed advantage.",
    permissionDiffers: a.permission.category !== b.permission.category,
    neitherPermitted: !permitted(a) && !permitted(b),
  }
}

function points(value) {
  return `${value > 0 ? "+" : ""}${round1(value)}`
}

/** Plain sentences from the comparison object. No claims beyond what was computed. */
export function describeComparison(result) {
  const { a, b } = result
  const lines = []
  if (!result.ranked) {
    const missing = [a, b].filter((side) => side.exact === null).map((side) => `${side.slot} (${side.noScoreReason})`)
    lines.push(`${place(a)} and ${place(b)} are not ranked against each other: ${missing.join("; ")}`)
  } else if (result.winner === "tie") {
    lines.push(`${place(a)} and ${place(b)} are tied at ${a.composite} under the current weights.`)
  } else {
    const [hi, lo] = result.winner === "A" ? [a, b] : [b, a]
    const favorHi = result.winner === "A" ? result.favorA : result.favorB
    const favorLo = result.winner === "A" ? result.favorB : result.favorA
    lines.push(
      `${hi.slot}, ${place(hi)}, scores ${hi.composite} and ${lo.slot}, ${place(lo)}, scores ${lo.composite}: a gap of ${round1(Math.abs(result.gap))} points${result.close ? ", which is close under the current weights" : ""}.`,
    )
    if (favorHi.length) {
      lines.push(
        `Weighted contributions favoring ${hi.slot}: ${favorHi
          .slice(0, 3)
          .map((row) => `${row.label} (${points(Math.abs(row.difference))})`)
          .join(", ")}.`,
      )
    }
    if (favorLo.length) {
      lines.push(
        `Favoring ${lo.slot}: ${favorLo
          .slice(0, 3)
          .map((row) => `${row.label} (${points(Math.abs(row.difference))})`)
          .join(", ")}.`,
      )
    }
  }
  if (result.heldConstant.length) {
    const names = result.factors.filter((row) => result.heldConstant.includes(row.id)).map((row) => row.label)
    lines.push(`Held constant (same value for both): ${names.join(", ")}.`)
  }
  if (result.coverageWarning) lines.push(result.coverageWarning)
  lines.push(
    `Permission is separate from the score: ${a.slot} is "${a.permission.label}"; ${b.slot} is "${b.permission.label}".${
      result.neitherPermitted ? " Neither scenario is permitted by right under the checked rows, so neither is a recommendation." : ""
    }`,
  )
  return lines.join(" ")
}
