/** Validation shared by the explain API and scenario import. Unknown keys are dropped; bad values are rejected. */

import { PITTSBURGH_NEIGHBORHOODS } from './pittsburgh.js'
import { BUILDING_IDS } from "./buildings.js"
import { DEFAULT_WEIGHTS } from "./rank.js"
import { DEFAULT_SITE_FILTERS, SORT_OPTIONS, TYPE_OPTIONS } from "./sites.js"

export const PIN_PATTERN = /^[0-9A-Z]{6,24}$/
export const WEIGHT_KEYS = Object.keys(DEFAULT_WEIGHTS)

export function parseWeights(raw) {
  if (!raw || typeof raw !== "object") return null
  const weights = {}
  for (const key of WEIGHT_KEYS) {
    const value = Number(raw[key])
    if (!Number.isFinite(value) || value < 0 || value > 100) return null
    weights[key] = Math.round(value)
  }
  return weights
}

export function parsePin(raw) {
  return typeof raw === "string" && PIN_PATTERN.test(raw) ? raw : null
}

export function parseDrop(raw) {
  const pin = parsePin(raw?.pin)
  const typeId = BUILDING_IDS.includes(raw?.typeId) ? raw.typeId : null
  return pin && typeId ? { pin, typeId } : null
}

const FILTER_CHOICES = {
  combine: ["all", "any"],
  typeId: TYPE_OPTIONS.map((option) => option.id),
  permission: ["any", "by_right", "by_right_or_special"],
  flood: ["any", "none", "no_sfha"],
  displacement: ["any", "high", "not_high"],
  area: ["", "Lawrenceville", ...PITTSBURGH_NEIGHBORHOODS],
}

/** Accepts only the Find Sites filter keys, with their default types and known choices. */
export function parseSiteFilters(raw) {
  if (!raw || typeof raw !== "object") return null
  const filters = {}
  for (const [key, fallback] of Object.entries(DEFAULT_SITE_FILTERS)) {
    const value = raw[key] === undefined ? fallback : raw[key]
    if (FILTER_CHOICES[key]) {
      if (!FILTER_CHOICES[key].includes(value)) return null
      filters[key] = value
    } else if (typeof fallback === "boolean") {
      if (typeof value !== "boolean") return null
      filters[key] = value
    } else if (value === null || value === "") {
      filters[key] = null
    } else {
      const number = Number(value)
      if (!Number.isFinite(number) || number < 0 || number > 10_000_000) return null
      filters[key] = number
    }
  }
  return filters
}


export function parseSort(raw) {
  return SORT_OPTIONS.some((option) => option.id === raw) ? raw : "score"
}
