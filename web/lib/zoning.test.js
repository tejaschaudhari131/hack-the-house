import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

import { dropZoningBadge, resolveZoning } from "./zoning.js"

const rules = JSON.parse(readFileSync(new URL("../public/data/zoning.json", import.meta.url)))

test("§911.02 is cited and still needs expert review", () => {
  const info = resolveZoning("R1A-H", rules)
  assert.equal(info.status, "use_table")
  assert.equal(info.codeSection, "§911.02")
  assert.equal(info.needsExpertReview, true)
  assert.equal(rules.districts["R1A-H"].use_table_read, true)
  assert.equal(rules.districts["R1A-H"].base_column, "R1A")
  assert.equal(info.allowed.has("single_family"), true)
  assert.equal(info.allowed.has("large_apartment"), false)
  assert.match(dropZoningBadge("single_family", info).detail, /§911\.02/)
})

test("a cited section is required before an allowance list filters", () => {
  const info = resolveZoning("R1A-H", {
    districts: {
      "R1A-H": {
        allowed: ["single_family"],
        use_table_read: true,
        code_section: null,
        needs_expert_review: true,
        notes: "section missing",
      },
    },
  })
  assert.equal(info.status, "use_table_unread")
  assert.equal(info.allowed, null)
})

test("an unread use table is not labeled prohibited", () => {
  const info = resolveZoning("R1A-H", {
    districts: {
      "R1A-H": {
        allowed: [],
        use_table_read: false,
        code_section: null,
        needs_expert_review: true,
        notes: "not read",
      },
    },
  })
  const badge = dropZoningBadge("large_apartment", info)
  assert.equal(badge.id, "unreviewed")
  assert.match(badge.detail, /not marked prohibited/)
  assert.match(badge.detail, /Needs expert review/)
})

test("A and S are special approval, and a blank cell is not allowed", () => {
  const district = {
    allowed: ["single_family"],
    partial: [],
    variance_or_exception: [{ type: "townhouse_duplex", letter: "S" }],
    use_notes: {},
    use_table_read: true,
    code_section: "§911.02",
    needs_expert_review: true,
    notes: "example only",
  }
  const info = resolveZoning("R1D-M", { districts: { "R1D-M": district } })
  assert.equal(dropZoningBadge("single_family", info).id, "allowed")
  const approval = dropZoningBadge("townhouse_duplex", info)
  assert.equal(approval.id, "approval")
  assert.match(approval.label, /Needs special approval \(S\)/)
  assert.match(approval.detail, /§911\.02/)
  assert.equal(dropZoningBadge("large_apartment", info).label, "Not allowed")
  assert.match(dropZoningBadge("large_apartment", info).detail, /Needs expert review/)
})

test("R1D attached houses are P/S and two-unit is not permitted", () => {
  const info = resolveZoning("R1D-M", rules)
  const badge = dropZoningBadge("townhouse_duplex", info)
  assert.equal(badge.id, "approval")
  assert.match(badge.label, /P\/S/)
  assert.match(badge.detail, /35 feet/)
  assert.match(badge.detail, /Two-Unit is not permitted/)
  assert.equal(info.allowed.has("townhouse_duplex"), false)
})

test("R3 says a triplex is allowed and 4+ units are not", () => {
  const info = resolveZoning("R3-M", rules)
  const badge = dropZoningBadge("small_apartment", info)
  assert.equal(badge.id, "partial")
  assert.match(badge.label, /Triplex allowed, 4\+ units not/)
  assert.equal(info.allowed.has("small_apartment"), true)
  assert.equal(dropZoningBadge("large_apartment", info).id, "not_allowed")
})

test("districts outside §911.02 are not marked prohibited", () => {
  const info = resolveZoning("SP-10", rules)
  assert.equal(info.status, "not_in_use_table")
  assert.equal(info.allowed, null)
  assert.equal(rules.districts["SP-10"].not_in_use_table, true)
  assert.deepEqual(rules.districts["SP-10"].allowed, [])
  const badge = dropZoningBadge("large_apartment", info)
  assert.equal(badge.id, "unreviewed")
  assert.match(badge.label, /Check with the city/)
  assert.doesNotMatch(badge.label, /Not allowed/)
})
