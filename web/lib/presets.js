import { DEFAULT_WEIGHTS } from "./rank.js"

/** One-click weight profiles. These are value judgments about what matters, not data. Every preset lists a
 * value for each dimension the app might rank on; only the keys in DEFAULT_WEIGHTS are used.
 */
export const PRESETS = [
  {
    id: "balanced",
    label: "Balanced",
    blurb: "The app's default relative weights.",
    weights: { demand: 25, transit: 25, equity: 25, climate: 25, displacement: 15, carbon: 15 },
  },
  {
    id: "transit",
    label: "Transit emphasis",
    blurb: "Transit access counts twice as much as the other core factors.",
    weights: { demand: 20, transit: 50, equity: 20, climate: 20, displacement: 15, carbon: 15 },
  },
  {
    id: "housing_need",
    label: "Housing-need emphasis",
    blurb: "Equity (measured need plus the team's type multipliers) counts most; market activity counts least.",
    weights: { demand: 10, transit: 25, equity: 50, climate: 20, displacement: 15, carbon: 10 },
  },
  {
    id: "lower_hazard",
    label: "Lower-hazard emphasis",
    blurb: "Lower mapped climate hazard counts most.",
    weights: { demand: 15, transit: 20, equity: 20, climate: 50, displacement: 15, carbon: 15 },
  },
  {
    id: "lower_carbon",
    label: "Lower-carbon emphasis",
    blurb: "A lower carbon-related proxy counts most.",
    weights: { demand: 15, transit: 20, equity: 20, climate: 20, displacement: 15, carbon: 50 },
  },
]

export const PRESET_NOTE =
  "These priorities are team-authored illustrations, not measured stakeholder preferences. They only move the sliders; the scores underneath do not change."

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
