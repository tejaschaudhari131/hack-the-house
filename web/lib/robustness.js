/** Does the #1 result survive other reasonable weights? The scores (data) stay fixed; only weights move. */

import { PRESETS, presetWeights, weightKeys } from "./presets.js"
import { TYPE_LABELS, rankTypes } from "./rank.js"

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

/** Which of two dropped buildings has the higher weighted total. Ties go to A, as in compareDrops. */
export function compareWinner(a, b) {
  return (weights) => {
    const left = rankTypes(a.scores, weights).find((row) => row.id === a.typeId)
    const right = rankTypes(b.scores, weights).find((row) => row.id === b.typeId)
    if (left?.composite == null || right?.composite == null) return null
    return left.composite >= right.composite
      ? { id: "A", label: `Building A (${TYPE_LABELS[a.typeId]})`, score: left.composite }
      : { id: "B", label: `Building B (${TYPE_LABELS[b.typeId]})`, score: right.composite }
  }
}

function shortType(label) {
  return label.replace(/ \(.*\)$/, "")
}

export function describeFlip(flip) {
  const name = flip.key
  const verb = flip.direction === "up" ? "rises to" : "falls to"
  return `Flips to ${shortType(flip.to.label)} if the ${name} weight ${verb} ${flip.at} (now ${flip.from}).`
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
