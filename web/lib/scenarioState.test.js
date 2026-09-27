import test from "node:test"
import assert from "node:assert/strict"

import { DEFAULT_WEIGHTS } from "./rank.js"
import { MAX_ENCODED_LENGTH, decodeState, encodeState, makeState, validateState } from "./scenarioState.js"

const pins = new Set(["0056F00338000000", "0049B00237000000"])
const context = { hasPin: (pin) => pins.has(pin), modelVersion: 1, dataVersion: "2026-09-27" }

test("a comparison round-trips through a share link with unit counts and what-if", () => {
  const state = makeState({
    mode: "drop",
    weights: { ...DEFAULT_WEIGHTS, equity: 50 },
    whatIf: true,
    drops: [
      { slot: "A", pin: "0056F00338000000", typeId: "triplex" },
      { slot: "B", pin: "0056F00338000000", typeId: "townhouse_duplex" },
    ],
    siteFilters: { vacant: true, cityOwned: true, typeId: "triplex" },
    siteSort: "score",
    modelVersion: 1,
    dataVersion: "2026-09-27",
  })
  const encoded = encodeState(state)
  assert.ok(encoded.length < MAX_ENCODED_LENGTH)
  const result = validateState(decodeState(encoded), context)
  assert.equal(result.ok, true)
  assert.deepEqual(result.warnings, [])
  assert.equal(result.state.weights.equity, 50)
  assert.equal(result.state.whatIf, true)
  assert.equal(result.state.drops[0].typeId, "triplex")
  assert.equal(result.state.sites.filters.typeId, "triplex")
})

test("bad input is rejected and version differences warn", () => {
  assert.throws(() => decodeState("not base64!"))
  assert.throws(() => decodeState("A".repeat(MAX_ENCODED_LENGTH + 1)))
  assert.equal(validateState({ v: 2 }, context).ok, false)
  const bad = validateState(
    {
      v: 1,
      mode: "drop",
      weights: { ...DEFAULT_WEIGHTS, carbon: 500 },
      drops: [{ slot: "A", pin: "0000000000000000", typeId: "castle" }],
      sites: { filters: { flood: "<script>" } },
      model: 1,
      data: "2026-09-27",
    },
    context,
  )
  assert.equal(bad.ok, false)
  assert.equal(bad.errors.length, 3)
  const missing = validateState({ v: 1, mode: "inspect", weights: DEFAULT_WEIGHTS, pin: "9999X99999999999", model: 1, data: "2026-09-27" }, context)
  assert.match(missing.errors[0], /not in this dataset/)
  const old = validateState({ v: 1, mode: "inspect", weights: DEFAULT_WEIGHTS, pin: "0049B00237000000", model: 0, data: "2026-01-01", extra: "ignored" }, context)
  assert.equal(old.ok, true)
  assert.equal(old.warnings.length, 2)
  assert.equal(old.state.extra, undefined)
})
