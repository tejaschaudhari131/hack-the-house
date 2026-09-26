import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

import { resolveZoning } from "./zoning.js"

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
