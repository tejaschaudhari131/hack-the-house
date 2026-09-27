import test from "node:test"
import assert from "node:assert/strict"

import {
  DEFAULT_SITE_FILTERS,
  EXAMPLE_QUERIES,
  SITE_CAVEAT,
  filtersFor,
  findSites,
  passesRecordFilters,
  permissionPasses,
  sitesCsv,
  typePermission,
} from "./sites.js"
import { DEFAULT_WEIGHTS } from "./rank.js"
import { resolveZoning } from "./zoning.js"

const RULES = {
  meta: {},
  districts: {
    LNC: {
      use_table_read: true,
      code_section: "§911.02",
      allowed: ["single_family", "townhouse_duplex", "small_apartment", "large_apartment"],
      partial: [],
      variance_or_exception: [],
      use_rows: { "Three-Unit": "P", "Multi-Unit": "P" },
    },
    "R1D-M": {
      use_table_read: true,
      code_section: "§911.02",
      allowed: ["single_family"],
      partial: [],
      variance_or_exception: [{ type: "townhouse_duplex", letter: "P/S" }],
      use_rows: { "Three-Unit": "", "Multi-Unit": "" },
    },
    UI: {
      use_table_read: true,
      code_section: "§911.02",
      allowed: [],
      partial: [],
      variance_or_exception: [{ type: "small_apartment", letter: "S" }],
      use_rows: { "Three-Unit": "", "Multi-Unit": "S" },
    },
  },
}

function scores(value, displacement = 50) {
  const row = { demand: value, transit: value, equity: value, climate_risk: 0, displacement_risk: displacement, carbon_index: 40 }
  return { single_family: row, townhouse_duplex: row, small_apartment: row, large_apartment: row }
}

function parcel(pin, overrides = {}) {
  return {
    properties: {
      pin,
      address: `${pin} Test St`,
      neighborhood: "Hazelwood",
      area: "Hazelwood",
      zoning_code: "LNC",
      lot_sqft: 4000,
      vacant_lot: true,
      city_owned: true,
      city_open_space: false,
      city_status: "available",
      tax_delinquent: false,
      tax_delinquent_prior_years: false,
      condemned_or_dead_end: false,
      sfha_overlap: 0,
      flood_02_overlap: 0,
      steep_slope_overlap: 0,
      undermined_overlap: 0,
      walk_min_frequent: 4,
      qct_2026: true,
      scores: scores(60),
      ...overrides,
    },
  }
}

test("triplex permission reads the Three-Unit row", () => {
  assert.equal(typePermission("triplex", resolveZoning("LNC", RULES)), "by_right")
  assert.equal(typePermission("triplex", resolveZoning("R1D-M", RULES)), "not_allowed")
  assert.equal(typePermission("triplex", resolveZoning("SP-10", RULES)), "unknown")
  assert.equal(typePermission("townhouse_duplex", resolveZoning("R1D-M", RULES)), "special")
  assert.equal(typePermission("small_apartment", resolveZoning("UI", RULES)), "special")
})

test("permission filter levels", () => {
  assert.ok(permissionPasses("by_right", "by_right"))
  assert.ok(permissionPasses("partial", "by_right"))
  assert.ok(!permissionPasses("special", "by_right"))
  assert.ok(permissionPasses("special", "by_right_or_special"))
  assert.ok(!permissionPasses("unknown", "by_right_or_special"))
  assert.ok(permissionPasses("not_allowed", "any"))
})

test("record flags combine with all or any, and unknown data fails a filter that asks", () => {
  const props = parcel("A", { tax_delinquent: true }).properties
  assert.ok(passesRecordFilters(props, { ...DEFAULT_SITE_FILTERS, vacant: true, cityOwned: true }))
  assert.ok(!passesRecordFilters(props, { ...DEFAULT_SITE_FILTERS, condemned: true, cityOwned: true }))
  assert.ok(passesRecordFilters(props, { ...DEFAULT_SITE_FILTERS, condemned: true, cityOwned: true, combine: "any" }))
  assert.ok(!passesRecordFilters({ ...props, city_owned: null }, { ...DEFAULT_SITE_FILTERS, cityOwned: true }))
  assert.ok(!passesRecordFilters({ ...props, walk_min_frequent: null }, { ...DEFAULT_SITE_FILTERS, maxWalkMin: 10 }))
  assert.ok(!passesRecordFilters({ ...props, sfha_overlap: null }, { ...DEFAULT_SITE_FILTERS, flood: "none" }))
})

test("greenways and parks are excluded by default", () => {
  const green = parcel("G", { city_open_space: true }).properties
  assert.ok(!passesRecordFilters(green, DEFAULT_SITE_FILTERS))
  assert.ok(passesRecordFilters(green, { ...DEFAULT_SITE_FILTERS, excludeOpenSpace: false }))
})

test("hazard, walk, lot, and displacement filters", () => {
  const base = parcel("B").properties
  const f = DEFAULT_SITE_FILTERS
  assert.ok(!passesRecordFilters({ ...base, flood_02_overlap: 0.2 }, { ...f, flood: "none" }))
  assert.ok(passesRecordFilters({ ...base, flood_02_overlap: 0.2 }, { ...f, flood: "no_sfha" }))
  assert.ok(!passesRecordFilters({ ...base, steep_slope_overlap: 0.3 }, { ...f, maxSlopePct: 10 }))
  assert.ok(!passesRecordFilters({ ...base, undermined_overlap: 0.01 }, { ...f, excludeUndermined: true }))
  assert.ok(!passesRecordFilters({ ...base, walk_min_frequent: 12 }, { ...f, maxWalkMin: 10 }))
  assert.ok(!passesRecordFilters({ ...base, lot_sqft: 2000 }, { ...f, minLotSqft: 3000 }))
  assert.ok(passesRecordFilters({ ...base, scores: scores(60, 70) }, { ...f, displacement: "high" }))
  assert.ok(!passesRecordFilters({ ...base, scores: scores(60, 30) }, { ...f, displacement: "high" }))
  assert.ok(passesRecordFilters({ ...base, scores: scores(60, 30) }, { ...f, displacement: "not_high" }))
})

test("findSites ranks by the weighted score and applies the zoning filter", () => {
  const features = [
    parcel("LOW", { scores: scores(40) }),
    parcel("HIGH", { scores: scores(80) }),
    parcel("R1D", { zoning_code: "R1D-M", scores: scores(90) }),
  ]
  const triplex = findSites(features, filtersFor(EXAMPLE_QUERIES[0]), DEFAULT_WEIGHTS, RULES)
  assert.deepEqual(triplex.map((row) => row.pin), ["HIGH", "LOW"])
  assert.equal(triplex[0].scoreType, "small_apartment")
  const any = findSites(features, DEFAULT_SITE_FILTERS, DEFAULT_WEIGHTS, RULES)
  assert.equal(any[0].pin, "R1D")
  const byLot = findSites(
    [parcel("SMALL", { lot_sqft: 1000 }), parcel("BIG", { lot_sqft: 9000 })],
    DEFAULT_SITE_FILTERS,
    DEFAULT_WEIGHTS,
    RULES,
    "lot",
  )
  assert.equal(byLot[0].pin, "BIG")
})

test("CSV export carries the caveat and no owner fields", () => {
  const rows = findSites([parcel("X")], DEFAULT_SITE_FILTERS, DEFAULT_WEIGHTS, RULES)
  const csv = sitesCsv(rows)
  assert.ok(csv.includes(SITE_CAVEAT.slice(0, 40)))
  assert.ok(csv.split("\n")[1].startsWith("pin,address"))
  assert.ok(!/owner|billing|amount/i.test(csv.split("\n")[1]))
})

test("each example query names its filters", () => {
  assert.equal(EXAMPLE_QUERIES.length, 3)
  for (const example of EXAMPLE_QUERIES) {
    assert.ok(example.label.length > 20)
    for (const key of Object.keys(example.filters)) assert.ok(key in DEFAULT_SITE_FILTERS, key)
  }
})
