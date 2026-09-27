import { DEFAULT_WEIGHTS } from "./rank.js"

/** One-click weight profiles. These are value judgments about what matters, not data. Every preset lists a
 * value for each dimension the app might rank on; only the keys in DEFAULT_WEIGHTS are used.
 */
export const PRESETS = [
  {
    id: "resident",
    label: "Resident",
    blurb: "Lower hazard and neighborhood stability count most; market demand counts least.",
    weights: { demand: 10, transit: 25, equity: 30, climate: 35, displacement: 30, carbon: 10 },
  },
  {
    id: "cdc",
    label: "CDC / affordability-first",
    blurb: "Equity counts most, then transit. Demand counts little.",
    weights: { demand: 10, transit: 25, equity: 50, climate: 15, displacement: 35, carbon: 10 },
  },
  {
    id: "planner",
    label: "Planner / balanced",
    blurb: "The app's default: equal weight on the four core scores.",
    weights: { demand: 25, transit: 25, equity: 25, climate: 25, displacement: 15, carbon: 15 },
  },
  {
    id: "developer",
    label: "Developer / demand-first",
    blurb: "Market demand counts most. This is not a pro forma.",
    weights: { demand: 55, transit: 20, equity: 10, climate: 15, displacement: 5, carbon: 5 },
  },
  {
    id: "climate",
    label: "Climate-first",
    blurb: "Lower mapped hazard counts most, then transit.",
    weights: { demand: 10, transit: 25, equity: 15, climate: 50, displacement: 10, carbon: 30 },
  },
]

export const PRESET_NOTE =
  "Presets are value judgments about what should matter, not data. They only move the sliders. The scores underneath do not change."

export function weightKeys() {
  return Object.keys(DEFAULT_WEIGHTS)
}

export function presetWeights(preset, keys = weightKeys()) {
  const weights = {}
  for (const key of keys) weights[key] = preset.weights[key] ?? DEFAULT_WEIGHTS[key] ?? 0
  return weights
}

export function matchPreset(weights, keys = weightKeys()) {
  return PRESETS.find((preset) => keys.every((key) => presetWeights(preset, keys)[key] === weights?.[key])) || null
}
