function place(row) {
  const where = row.address || row.pin
  return `${row.typeLabel} at ${where} in ${row.neighborhood}`
}

const GAPS = [
  ["demand", "demand"],
  ["transit", "transit access"],
  ["equity", "equity"],
  ["climate_suitability", "lower climate hazard"],
]

/** One sentence on why two dropped buildings rank differently. Screening language only. */
export function compareDrops(left, right) {
  if (!left || !right) return ""
  if (left.composite === null || left.composite === undefined || right.composite === null || right.composite === undefined) {
    return `${place(left)} and ${place(right)} are missing a score, so they are not ranked against each other.`
  }
  const better = left.composite >= right.composite ? left : right
  const worse = better === left ? right : left
  const gap = Math.round((better.composite - worse.composite) * 10) / 10
  if (gap < 0.5) {
    return `${place(left)} and ${place(right)} are essentially tied near ${better.composite}. A small weight change can flip them. This is a screening comparison, not a recommendation.`
  }
  let widest = null
  for (const [key, name] of GAPS) {
    if (better[key] === null || better[key] === undefined || worse[key] === null || worse[key] === undefined) continue
    const size = better[key] - worse[key]
    if (!widest || size > widest.size) widest = { name, size, high: better[key], low: worse[key] }
  }
  const because =
    widest && widest.size > 0.5
      ? ` The widest gap is ${widest.name} (${widest.high} versus ${widest.low}).`
      : ""
  const transit =
    left.pin === right.pin
      ? " Transit matches because both sit on the same parcel."
      : " Transit describes each place, not the building."
  return `${place(better)} ranks higher (${better.composite} versus ${worse.composite}).${because}${transit} The weights are a choice. This is a screening comparison, not a recommendation.`
}
