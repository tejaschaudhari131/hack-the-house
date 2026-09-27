import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

import { dropZoningBadge, resolveZoning } from "./zoning.js"

const rules = JSON.parse(readFileSync(new URL("../public/data/zoning.json", import.meta.url)))

test("unread use tables do not filter housing types", () => {
  const info = resolveZoning("R1A-H", rules)
  assert.equal(info.status, "use_table_unread")
  assert.equal(info.allowed, null)
  assert.equal(info.needsExpertReview, true)
  assert.match(info.note, /TODO/)
  assert.equal(rules.districts["R1A-H"].use_table_read, false)
  assert.equal(rules.districts["R1A-H"].code_section, null)
  assert.deepEqual(rules.districts["R1A-H"].allowed, [])
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
  const info = resolveZoning("R1A-H", rules)
  const badge = dropZoningBadge("large_apartment", info)
  assert.equal(badge.id, "unreviewed")
  assert.match(badge.detail, /not marked prohibited/)
  assert.match(badge.detail, /Needs expert review/)
})

test("cited rules drive the three zoning badges", () => {
  const district = {
    allowed: ["single_family"],
    variance_or_exception: ["townhouse_duplex"],
    use_table_read: true,
    code_section: "example-section",
    needs_expert_review: true,
    notes: "example only",
  }
  const info = resolveZoning("R1D-M", { districts: { "R1D-M": district } })
  assert.equal(dropZoningBadge("single_family", info).id, "allowed")
  assert.equal(dropZoningBadge("townhouse_duplex", info).id, "variance")
  assert.equal(dropZoningBadge("large_apartment", info).label, "Not allowed")
  assert.match(dropZoningBadge("large_apartment", info).detail, /Needs expert review/)
})

test("a cited section can filter and still needs expert review", () => {
  const info = resolveZoning("R1D-M", {
    districts: {
      "R1D-M": {
        allowed: ["single_family"],
        use_table_read: true,
        code_section: "TODO-replaced-by-a-real-section",
        needs_expert_review: true,
        notes: "example only",
      },
    },
  })
  assert.equal(info.status, "stub")
  assert.equal(info.needsExpertReview, true)
  assert.equal(info.allowed.has("single_family"), true)
  assert.equal(info.allowed.has("large_apartment"), false)
})
