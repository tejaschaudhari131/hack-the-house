import { PLANNER_FACTORS } from './plannerState.js'
const ids = PLANNER_FACTORS.map(f => f.id)
const weight = value => Number.isFinite(value) && value > 0 ? value : 0

/** Fractions of the weighted score, over shared evidence only. Raw weights are relative. */
export function priorityShares(weights, included = ids) {
  const eligible = new Set(included)
  const sum = ids.reduce((n, id) => n + (eligible.has(id) ? weight(weights[id]) : 0), 0)
  return Object.fromEntries(ids.map(id => [id, sum && eligible.has(id) ? weight(weights[id]) / sum : 0]))
}

/** Multiplying every priority by the same positive number preserves the preset. */
export function samePriorityRatios(left, right) {
  const a = priorityShares(left), b = priorityShares(right)
  return ids.every(id => Math.abs(a[id] - b[id]) < 1e-9)
}
