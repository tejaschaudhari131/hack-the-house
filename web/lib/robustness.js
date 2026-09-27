/** Does the #1 result survive other reasonable weights? The scores (data) stay fixed; only weights move. */

import { PRESETS, presetWeights, weightKeys } from "./presets.js"
import { TYPE_LABELS, composite, rankTypes } from "./rank.js"

/** Evaluate `winner(weights)` under each preset and under one-slider changes from the current weights. */
export function analyzeRobustness(winner, weights, { keys = weightKeys(), step = 1 } = {}) {
  const current = winner(weights)
  const presets = PRESETS.map((preset) => {
    const result = winner(presetWeights(preset, keys))
    return { id: preset.id, label: preset.label, winner: result, same: result?.id === current?.id }
  })
  const flips = []
  for (const key of keys) {
    const now = weights[key]
    for (const direction of [1, -1]) {
      for (let value = now + direction * step; value >= 0 && value <= 100; value += direction * step) {
        const result = winner({ ...weights, [key]: value })
        if (result && current && result.id !== current.id) {
          flips.push({ key, direction: direction > 0 ? "up" : "down", at: value, from: now, change: Math.abs(value - now), to: result })
          break
        }
      }
    }
  }
  flips.sort((a, b) => a.change - b.change)
  const agree = presets.filter((row) => row.same).length
  const nearest = flips[0]?.change ?? null
  let verdict = "robust"
  if (agree < presets.length - 1 || (nearest !== null && nearest <= 10)) verdict = "sensitive"
  else if (agree < presets.length || (nearest !== null && nearest <= 20)) verdict = "fairly_robust"
  return { current, presets, agree, total: presets.length, flips, verdict }
}

export const VERDICT_LABELS = {
  robust: "Stable across value choices",
  fairly_robust: "Mostly stable",
  sensitive: "Depends on value choices",
}

/** #1 housing type on one parcel, using the same zoning grouping as the ranked list. */
export function parcelWinner(scores, { allowed = null, whatIf = false } = {}) {
  return (weights) => {
    const top = rankTypes(scores, weights, { allowed, whatIf }).find((row) => row.composite !== null)
    return top ? { id: top.id, label: TYPE_LABELS[top.id], score: top.composite } : null
  }
}

/** Which of two scenarios (from comparison.buildScenario) has the higher weighted total. Equal totals are a tie. */
export function compareWinner(a, b) {
  return (weights) => {
    const left = composite(a.scores, weights)
    const right = composite(b.scores, weights)
    if (left === null || right === null) return null
    if (left === right) return { id: "tie", label: "A tie", score: left }
    return left > right
      ? { id: "A", label: `Building A (${a.label})`, score: left }
      : { id: "B", label: `Building B (${b.label})`, score: right }
  }
}

export const SHARED_FACTOR_NOTE =
  "Transit access and displacement risk describe the place, so they are the same for every option on one parcel. Changing only those weights cannot reorder options on the same parcel when data are complete."

function shortType(label) {
  return label.replace(/ \(.*\)$/, "")
}

export function describeFlip(flip) {
  const name = flip.key
  const verb = flip.direction === "up" ? "rises to" : "falls to"
  const outcome = flip.to.id === "tie" ? "Becomes a tie" : `Flips to ${shortType(flip.to.label)}`
  return `${outcome} if the ${name} weight ${verb} about ${flip.at} (now ${flip.from}; found by stepping that one weight by 1 with the others fixed).`
}

/** Robustness for one parcel, plus a zoning-off view when §911.02 leaves one type or none. */
export function parcelRobustness(scores, zoningInfo, weights, whatIf = false) {
  const allowed = whatIf ? null : zoningInfo?.allowed || null
  const analysis = analyzeRobustness(parcelWinner(scores, { allowed, whatIf }), weights)
  let note = null
  let whatIfAnalysis = null
  if (allowed && allowed.size <= 1) {
    const only = [...allowed][0]
    note =
      allowed.size === 1
        ? `§911.02 permits only ${TYPE_LABELS[only]} by right in ${zoningInfo.code}, so zoning, not the weights, puts it first.`
        : `§911.02 permits none of the four types by right in ${zoningInfo.code}, so this ranks types that need special approval or are not permitted.`
    whatIfAnalysis = analyzeRobustness(parcelWinner(scores, { allowed: null, whatIf: true }), weights)
  }
  return { analysis, note, whatIfAnalysis }
}

export function describeRobustness(analysis) {
  if (!analysis.current) return "No type has enough scores to rank, so robustness is not shown."
  const name = shortType(analysis.current.label)
  const stays = `${name} stays #1 under ${analysis.agree} of ${analysis.total} presets.`
  if (!analysis.flips.length) return `${stays} No single slider, moved anywhere from 0 to 100, changes the #1 result.`
  return `${stays} ${describeFlip(analysis.flips[0])}`
}
