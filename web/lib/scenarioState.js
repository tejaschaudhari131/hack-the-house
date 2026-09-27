/** Versioned, compact scenario state for share links and JSON export. Only ids, types, weights, and toggles; no free text. */

import { BUILDINGS } from "./buildings.js"
import { DEFAULT_SITE_FILTERS } from "./sites.js"
import { PIN_PATTERN, parseSiteFilters, parseSort, parseWeights } from "./validate.js"

export const STATE_VERSION = 1
export const MAX_ENCODED_LENGTH = 4000
const MODES = ["inspect", "drop", "sites"]

export function makeState({ mode, pin, whatIf, weights, drops, siteFilters, siteSort, modelVersion, dataVersion }) {
  const state = { v: STATE_VERSION, model: modelVersion ?? null, data: dataVersion ?? null, mode, weights, whatIf: Boolean(whatIf) }
  if (mode === "inspect" && pin) state.pin = pin
  if (mode === "drop" && drops?.length) state.drops = drops.map((drop) => ({ slot: drop.slot, pin: drop.pin, typeId: drop.typeId }))
  if (mode === "sites" || (mode === "drop" && siteFilters)) {
    const changed = Object.fromEntries(Object.entries(siteFilters || {}).filter(([key, value]) => value !== DEFAULT_SITE_FILTERS[key]))
    state.sites = { filters: changed, sort: siteSort || "score" }
  }
  return state
}

function toBase64Url(text) {
  const bytes = new TextEncoder().encode(text)
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

function fromBase64Url(text) {
  const binary = atob(text.replace(/-/g, "+").replace(/_/g, "/"))
  return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)))
}

export function encodeState(state) {
  return toBase64Url(JSON.stringify(state))
}

export function decodeState(encoded) {
  if (typeof encoded !== "string" || !encoded || encoded.length > MAX_ENCODED_LENGTH || !/^[A-Za-z0-9_-]+$/.test(encoded)) {
    throw new Error("The scenario link is not valid.")
  }
  return JSON.parse(fromBase64Url(encoded))
}

/**
 * Validate an imported state against the loaded data. Returns { ok, state, errors, warnings }.
 * hasPin(pin) says whether the parcel exists. Version differences are warnings, not errors.
 */
export function validateState(raw, { hasPin, modelVersion, dataVersion }) {
  const errors = []
  const warnings = []
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, state: null, errors: ["The scenario is not an object."], warnings }
  if (raw.v !== STATE_VERSION) return { ok: false, state: null, errors: [`Unsupported scenario version ${JSON.stringify(raw.v)}; this app reads version ${STATE_VERSION}.`], warnings }
  const mode = MODES.includes(raw.mode) ? raw.mode : null
  if (!mode) errors.push("Unknown mode.")
  const weights = parseWeights(raw.weights)
  if (!weights) errors.push("Weights must include all six factors, each from 0 to 100.")
  if (raw.whatIf !== undefined && typeof raw.whatIf !== "boolean") errors.push("whatIf must be true or false.")
  const state = { mode, weights, whatIf: raw.whatIf === true, pin: null, drops: [], sites: null }
  if (raw.pin !== undefined) {
    if (typeof raw.pin !== "string" || !PIN_PATTERN.test(raw.pin)) errors.push("The parcel id is not valid.")
    else if (!hasPin(raw.pin)) errors.push(`Parcel ${raw.pin} is not in this dataset.`)
    else state.pin = raw.pin
  }
  if (raw.drops !== undefined) {
    if (!Array.isArray(raw.drops) || raw.drops.length > 2) errors.push("drops must be a list of at most two scenarios.")
    else {
      for (const drop of raw.drops) {
        const slotOk = drop?.slot === "A" || drop?.slot === "B"
        const pinOk = typeof drop?.pin === "string" && PIN_PATTERN.test(drop.pin) && hasPin(drop.pin)
        const typeOk = Boolean(BUILDINGS[drop?.typeId])
        if (!slotOk || !pinOk || !typeOk) {
          errors.push(`Scenario ${drop?.slot ?? "?"} has an unknown slot, parcel, or building type.`)
          continue
        }
        if (state.drops.some((item) => item.slot === drop.slot)) errors.push(`Scenario ${drop.slot} appears twice.`)
        else state.drops.push({ slot: drop.slot, pin: drop.pin, typeId: drop.typeId })
      }
    }
  }
  if (raw.sites !== undefined) {
    const filters = parseSiteFilters(raw.sites?.filters || {})
    if (!filters) errors.push("Find Sites filters use unknown keys or values.")
    else state.sites = { filters, sort: parseSort(raw.sites?.sort) }
  }
  if (modelVersion !== undefined && raw.model !== modelVersion) {
    warnings.push(`This scenario was saved with score model v${raw.model ?? "?"}; the app now uses v${modelVersion}. Scores may differ.`)
  }
  if (dataVersion !== undefined && raw.data !== dataVersion) {
    warnings.push(`This scenario was saved with data pulled ${raw.data ?? "?"}; the app now uses data pulled ${dataVersion}. Scores may differ.`)
  }
  return { ok: errors.length === 0, state: errors.length ? null : state, errors, warnings }
}
