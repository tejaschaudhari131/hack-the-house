import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

import { MockLanguageModelV4, simulateReadableStream } from "ai/test"

import { buildCompareContext, buildParcelContext, explainCompareTemplate } from "./explainFacts.js"
import { DEFAULT_MODEL, aiConfig, createExplainHandler, parseExplainRequest } from "./explainHandler.js"
import { SYSTEM_PROMPT, buildComparePrompt, buildParcelPrompt } from "./explainPrompt.js"
import { createRateLimiter, createTtlCache } from "./guardrails.js"
import { DEFAULT_WEIGHTS, rankTypes } from "./rank.js"
import { buildSitesContext, explainSitesTemplate } from "./explainSites.js"
import { findSites } from "./sites.js"

const zoning = JSON.parse(readFileSync(new URL("../public/data/zoning.json", import.meta.url)))
const sources = JSON.parse(readFileSync(new URL("../public/data/sources.json", import.meta.url)))
const summary = { county_median_income: 78548, sale_cutoff: "2021-09-26", transit_service_date: "2026-09-25" }
const WEIGHTS = { ...DEFAULT_WEIGHTS }

function square(lon, lat) {
  const d = 0.0002
  return {
    type: "Polygon",
    coordinates: [[[lon, lat], [lon + d, lat], [lon + d, lat + d], [lon, lat + d], [lon, lat]]],
  }
}

function parcel(pin, overrides = {}) {
  return {
    type: "Feature",
    geometry: square(-79.94, 40.41),
    properties: {
      pin,
      address: "100 EXAMPLE ST",
      neighborhood: "Hazelwood",
      land_use: "SINGLE FAMILY",
      lot_sqft: 4200,
      zoning_code: "R1D-L",
      zoning_label: "SINGLE-UNIT DETACHED RESIDENTIAL LOW DENSITY",
      census_geography: "block_group",
      median_income: 40250,
      income_moe: 12000,
      rent_burden_share: 0.581,
      chas_rent_burden_share: 0.72,
      chas_tract_geoid: "42003562300",
      sfha_overlap: 0,
      flood_02_overlap: 0,
      steep_slope_overlap: 0.334,
      undermined_overlap: 0.125,
      flood_zones: [],
      trips_within_400m: 420,
      nearest_stop_m: 180,
      nearest_stop_name: "SECOND AVE + TECUMSEH",
      routes_within_400m: ["56"],
      confidence: 0.8,
      confidence_label: "high",
      confidence_notes: [],
      owner_name: "SHOULD NEVER APPEAR",
      factors: { price_per_sqft: 153.1, turnover_per_100: 2.06, valid_sales: 74 },
      renter_share: 0.49,
      rent_change_vs_county: -0.29,
      qct_2026: false,
      vacant_lot: true,
      city_owned: true,
      walk_min_frequent: 6,
      scores: {
        single_family: { demand: 52, transit: 61.2, equity: 38, climate_risk: 22, displacement_risk: 30.3, carbon_index: 61.3 },
        townhouse_duplex: { demand: 58, transit: 61.2, equity: 44, climate_risk: 23, displacement_risk: 30.3, carbon_index: 40.5 },
        small_apartment: { demand: 40, transit: 61.2, equity: 55, climate_risk: 25, displacement_risk: 30.3, carbon_index: 36.2 },
        large_apartment: { demand: 30, transit: 61.2, equity: 57, climate_risk: 27, displacement_risk: 30.3, carbon_index: 28.3 },
      },
      ...overrides,
    },
  }
}

const featureA = parcel("0055A00100000000")
const featureB = parcel("0049B00013000000", {
  address: "176 44TH ST",
  neighborhood: "Central Lawrenceville",
  zoning_code: "R1A-VH",
  steep_slope_overlap: 0,
  undermined_overlap: 0,
})
const data = { byPin: new Map([featureA, featureB].map((f) => [f.properties.pin, f])), zoning, sources, summary, stops: null }
const loadData = async () => data

function mockModel(chunks, calls = { count: 0 }) {
  return new MockLanguageModelV4({
    modelId: "mock-model",
    doStream: async () => {
      calls.count += 1
      return {
        stream: simulateReadableStream({
          chunks: [
            { type: "stream-start", warnings: [] },
            { type: "text-start", id: "t" },
            ...chunks.map((delta) => ({ type: "text-delta", id: "t", delta })),
            { type: "text-end", id: "t" },
            {
              type: "finish",
              finishReason: { unified: "stop", raw: "stop" },
              usage: {
                inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
                outputTokens: { total: 5, text: 5, reasoning: 0 },
              },
            },
          ],
        }),
      }
    },
  })
}

function post(body, ip = "203.0.113.5") {
  return new Request("http://localhost/api/explain", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  })
}

test("request parsing rejects bad weights, pins, and housing types", () => {
  assert.ok(parseExplainRequest({ pin: "0055A00100000000", weights: { ...WEIGHTS, equity: 101 } }).error)
  assert.ok(parseExplainRequest({ pin: "not a pin; drop table", weights: WEIGHTS }).error)
  assert.ok(parseExplainRequest({ kind: "compare", weights: WEIGHTS, a: { pin: "0055A00100000000", typeId: "castle" }, b: {} }).error)
  const ok = parseExplainRequest({ pin: "0055A00100000000", weights: { ...WEIGHTS, demand: 40.4 }, whatIf: "yes" })
  assert.equal(ok.kind, "parcel")
  assert.equal(ok.weights.demand, 40)
  assert.equal(ok.whatIf, false)
})

test("parcel facts carry scores, §911.02 zoning, special approval, sources, and no owner fields", () => {
  const { facts } = buildParcelContext({ props: featureA.properties, weights: WEIGHTS, zoningRules: zoning, sources, summary })
  const json = JSON.stringify(facts)
  assert.doesNotMatch(json, /SHOULD NEVER APPEAR|owner/i)
  assert.equal(facts.ranking.length, 4)
  assert.equal(facts.ranking[0].rank, 1)
  assert.equal(facts.zoning.status, "use_table")
  assert.match(facts.zoning.citation, /§911\.02/)
  assert.equal(facts.zoning.needs_expert_review, true)
  const townhouse = facts.ranking.find((row) => row.type === "townhouse_duplex")
  assert.equal(townhouse.zoning.needs_special_approval, true)
  assert.equal(facts.inputs.equity.acs_renters_paying_30pct_or_more_percent, 58)
  assert.equal(facts.inputs.equity.chas_low_income_renters_paying_over_30pct_percent, 72)
  assert.equal(facts.inputs.steep_slope.overlap_percent, 33)
  assert.match(facts.inputs.equity.sources[0].vintage, /2020–2024/)
  assert.match(facts.inputs.equity.sources[1].vintage, /2018–2022/)
  assert.match(facts.inputs.transit.source.vintage, /2026-09-25/)
  assert.equal(facts.inputs.flood.source.name, "FEMA National Flood Hazard Layer flood zones")
  assert.ok(facts.inputs.flood.source.caveat)
  assert.equal(facts.weights.equity, 25)
})

test("prompt builders embed only the facts JSON and the system prompt sets the ground rules", () => {
  const { facts } = buildParcelContext({ props: featureA.properties, weights: WEIGHTS, zoningRules: zoning, sources, summary })
  const prompt = buildParcelPrompt(facts)
  assert.deepEqual(JSON.parse(prompt.split("FACTS (JSON):\n")[1]), facts)
  for (const rule of [/Every number you write must appear/, /value judgments/, /§911\.02/, /special approval/, /not a variance/, /uncertainty/i, /City Planning/, /qualified professional/, /Never state a legal conclusion/]) {
    assert.match(SYSTEM_PROMPT, rule)
  }
  const compare = buildCompareContext({ a: { pin: featureA.properties.pin, typeId: "small_apartment" }, b: { pin: featureB.properties.pin, typeId: "townhouse_duplex" }, featureA, featureB, weights: WEIGHTS, zoningRules: zoning, stops: null, sources, summary })
  const comparePrompt = buildComparePrompt(compare.facts)
  assert.match(comparePrompt, /scenario A and scenario B/)
  assert.equal(JSON.parse(comparePrompt.split("FACTS (JSON):\n")[1]).scenario_b.housing_type, "Townhouse / duplex")
  const template = explainCompareTemplate(compare)
  assert.match(template, /Building A, Small apartment/)
  assert.match(template, /Building B, Townhouse/)
  assert.match(template, /Zoning Administrator/)
})

test("ai config uses the default gateway model, AI_MODEL overrides, and no credentials means template", () => {
  assert.equal(DEFAULT_MODEL, "anthropic/claude-haiku-4.5")
  assert.deepEqual(aiConfig({}).enabled, false)
  assert.equal(aiConfig({ AI_GATEWAY_API_KEY: "k" }).enabled, true)
  assert.equal(aiConfig({ VERCEL: "1", AI_MODEL: "openai/gpt-5.4-mini" }).model, "openai/gpt-5.4-mini")
  assert.equal(aiConfig({ VERCEL: "1", AI_EXPLANATIONS: "off" }).enabled, false)
})

test("without credentials the handler returns the template and says so", async () => {
  const handle = createExplainHandler({ loadData, env: {} })
  const response = await handle(post({ pin: featureA.properties.pin, weights: WEIGHTS }))
  assert.equal(response.status, 200)
  assert.equal(response.headers.get("x-explain-source"), "template")
  assert.match(decodeURIComponent(response.headers.get("x-explain-notice")), /No AI Gateway credentials/)
  const text = await response.text()
  assert.match(text, /screening aid/)
  assert.match(text, /§911\.02/)
})

test("with a model the handler streams AI text, then serves the cache", async () => {
  const calls = { count: 0 }
  const handle = createExplainHandler({ loadData, model: mockModel(["What the data shows: ", "demand 58."], calls) })
  const first = await handle(post({ pin: featureA.properties.pin, weights: WEIGHTS }))
  assert.equal(first.headers.get("x-explain-source"), "ai")
  assert.equal(first.headers.get("x-explain-model"), "mock-model")
  assert.equal(first.headers.get("x-explain-cache"), "miss")
  assert.equal(await first.text(), "What the data shows: demand 58.")
  const second = await handle(post({ pin: featureA.properties.pin, weights: WEIGHTS }))
  assert.equal(second.headers.get("x-explain-cache"), "hit")
  assert.equal(await second.text(), "What the data shows: demand 58.")
  assert.equal(calls.count, 1)
})

test("a model error falls back to the template with a notice", async () => {
  const broken = new MockLanguageModelV4({
    doStream: async () => {
      throw Object.assign(new Error("Unauthorized"), { statusCode: 401 })
    },
  })
  const handle = createExplainHandler({ loadData, model: broken })
  const response = await handle(post({ kind: "compare", weights: WEIGHTS, a: { pin: featureA.properties.pin, typeId: "small_apartment" }, b: { pin: featureB.properties.pin, typeId: "townhouse_duplex" } }))
  assert.equal(response.headers.get("x-explain-source"), "template")
  assert.match(decodeURIComponent(response.headers.get("x-explain-notice")), /AI summary is unavailable/)
  assert.match(await response.text(), /Building A/)
})

test("per-IP rate limit switches to the template, and bad input is rejected", async () => {
  const handle = createExplainHandler({ loadData, model: mockModel(["ok"]) })
  const sources = []
  for (let demand = 0; demand < 7; demand += 1) {
    const response = await handle(post({ pin: featureA.properties.pin, weights: { ...WEIGHTS, demand } }, "198.51.100.9"))
    sources.push(response.headers.get("x-explain-source"))
    await response.text()
  }
  assert.deepEqual(sources, ["ai", "ai", "ai", "ai", "ai", "ai", "template"])
  assert.equal((await handle(post({ pin: "0000000000000000", weights: WEIGHTS }))).status, 404)
  assert.equal((await handle(post({ pin: featureA.properties.pin }))).status, 400)
})

test("guardrail helpers expire and evict", () => {
  const limit = createRateLimiter({ limit: 2, windowMs: 1000 })
  assert.equal(limit("ip", 0).ok, true)
  assert.equal(limit("ip", 10).ok, true)
  assert.equal(limit("ip", 20).ok, false)
  assert.equal(limit("ip", 1500).ok, true)
  const cache = createTtlCache({ max: 2, ttlMs: 100 })
  cache.set("a", 1, 0)
  cache.set("b", 2, 0)
  cache.set("c", 3, 0)
  assert.equal(cache.get("a", 1), null)
  assert.equal(cache.get("c", 1), 3)
  assert.equal(cache.get("c", 200), null)
})

test("the six-factor weights reach the server, and displacement and carbon are labeled in the facts", async () => {
  assert.deepEqual(Object.keys(WEIGHTS).sort(), ["carbon", "climate", "demand", "displacement", "equity", "transit"])
  const fourKeys = { demand: 25, transit: 25, equity: 25, climate: 25 }
  assert.ok(parseExplainRequest({ pin: featureA.properties.pin, weights: fourKeys }).error)
  const { facts } = buildParcelContext({ props: featureA.properties, weights: WEIGHTS, zoningRules: zoning, sources, summary })
  const ui = rankTypes(featureA.properties.scores, WEIGHTS, { allowed: new Set(["single_family"]) })
  assert.deepEqual(facts.ranking.map((row) => row.weighted_total), ui.map((row) => row.composite))
  const top = facts.ranking[0]
  assert.equal(top.displacement_risk_screen, 30.3)
  assert.equal(top.marginal_carbon_index_estimate, 61.3)
  assert.equal(facts.weights.displacement, 15)
  assert.equal(facts.weights.carbon, 15)
  assert.match(facts.inputs.displacement.meaning, /screening signal/)
  assert.match(facts.inputs.displacement.meaning, /Not a prediction/)
  assert.match(facts.inputs.carbon.meaning, /Not tonnes/)
  assert.equal(facts.inputs.displacement.tract_renter_share_percent, 49)
  assert.equal(facts.inputs.displacement.tract_rent_change_vs_county_points, -29)
  assert.match(SYSTEM_PROMPT, /Always call it a screening signal/)
  assert.match(SYSTEM_PROMPT, /relative carbon-related proxy/)
  assert.match(SYSTEM_PROMPT, /zero weight is never a driver/)
  assert.match(SYSTEM_PROMPT, /public record .* is not availability/)
})

test("Find Sites: filters are validated, and the top sites are explained from server-side rows", async () => {
  assert.ok(parseExplainRequest({ kind: "sites", weights: WEIGHTS, filters: { flood: "sometimes" } }).error)
  assert.ok(parseExplainRequest({ kind: "sites", weights: WEIGHTS, filters: { vacant: "yes" } }).error)
  const ok = parseExplainRequest({ kind: "sites", weights: WEIGHTS, filters: { vacant: true, maxWalkMin: "10" }, sort: "nonsense" })
  assert.equal(ok.kind, "sites")
  assert.equal(ok.filters.maxWalkMin, 10)
  assert.equal(ok.sort, "score")

  const features = [featureA, featureB]
  const rows = findSites(features, ok.filters, WEIGHTS, zoning, "score")
  const context = buildSitesContext({ rows, filters: ok.filters, sort: "score", weights: WEIGHTS, sources, summary, zoningRules: zoning })
  assert.equal(context.facts.matches, rows.length)
  assert.ok(context.facts.filters_applied.includes("vacant land-use record"))
  assert.match(context.facts.public_record_caveat, /not availability/)
  assert.equal(context.facts.top_sites[0].scores.displacement_risk_screen, 30.3)
  const template = explainSitesTemplate(context)
  assert.match(template, /parcels match/)
  assert.match(template, /displacement screen 30.3/)
  assert.match(template, /not availability/)

  const handle = createExplainHandler({ loadData: async () => ({ ...data, features }), model: mockModel(["What the data shows: ", "the top site."]) })
  const response = await handle(post({ kind: "sites", weights: WEIGHTS, filters: { vacant: true } }, "192.0.2.44"))
  assert.equal(response.headers.get("x-explain-source"), "ai")
  assert.equal(await response.text(), "What the data shows: the top site.")
  const none = await createExplainHandler({ loadData: async () => ({ ...data, features }), env: {} })(
    post({ kind: "sites", weights: WEIGHTS, filters: { condemned: true } }, "192.0.2.45"),
  )
  assert.equal(none.headers.get("x-explain-source"), "template")
  assert.match(await none.text(), /No parcels match/)
})

test("a triplex keeps three-unit semantics in the compare facts and the Find Sites export", async () => {
  const { sitesCsv } = await import("./sites.js")
  const r3 = parcel("0055A00100000000", { zoning_code: "R3-L" })
  const context = buildCompareContext({
    a: { pin: r3.properties.pin, typeId: "triplex" },
    b: { pin: r3.properties.pin, typeId: "small_apartment" },
    featureA: r3,
    featureB: r3,
    weights: WEIGHTS,
    zoningRules: zoning,
    stops: null,
    sources,
    summary,
  })
  const a = context.facts.scenario_a
  const b = context.facts.scenario_b
  assert.equal(a.homes_shown, 3)
  assert.equal(a.zoning.this_type.use_row, "Three-Unit")
  assert.equal(a.zoning.this_type.category, "permitted")
  assert.equal(b.homes_shown, 12)
  assert.equal(b.zoning.this_type.category, "not_permitted")
  assert.match(a.score_basis, /small apartment \(3–19 units\) score/)
  assert.equal(context.facts.comparison.contributions.length, 6)
  assert.ok(parseExplainRequest({ kind: "compare", weights: WEIGHTS, a: { pin: r3.properties.pin, typeId: "triplex" }, b: { pin: r3.properties.pin, typeId: "townhouse_duplex" } }).kind)
  const rows = findSites([r3], { vacant: true, typeId: "triplex", permission: "by_right" }, WEIGHTS, zoning, "score")
  assert.equal(rows.length, 1)
  assert.match(sitesCsv(rows), /Triplex \(3 units, §911\.02 Three-Unit row\)/)
})

test("provider plan: gateway key first; else LLM_* first then OIDC gateway; none gives the template", async () => {
  const { providerPlan } = await import("./explainHandler.js")
  const llm = { LLM_API_KEY: "sk-test-secret-value-123456", LLM_BASE_URL: "https://llm.example/v1", LLM_MODEL: "gpt-4o-mini" }
  assert.deepEqual(providerPlan({ AI_GATEWAY_API_KEY: "g", ...llm }).providers.map((p) => p.id), ["gateway", "openai-compatible"])
  assert.deepEqual(providerPlan({ ...llm, VERCEL: "1" }).providers.map((p) => p.id), ["openai-compatible", "gateway"])
  assert.deepEqual(providerPlan({ ...llm }).providers.map((p) => p.id), ["openai-compatible"])
  assert.deepEqual(providerPlan({ VERCEL: "1" }).providers.map((p) => p.id), ["gateway"])
  assert.equal(providerPlan({ LLM_API_KEY: "x" }).providers.length, 0)
  assert.equal(providerPlan({ ...llm, AI_EXPLANATIONS: "off" }).providers.length, 0)
  assert.equal(providerPlan({ ...llm, LLM_MODEL: "" }).providers[0].model, "gpt-4o-mini")
})

test("without a gateway key the LLM_* endpoint answers; a gateway 401 falls through; all failing gives the template", async () => {
  const llm = { LLM_API_KEY: "sk-test-secret-value-123456", LLM_BASE_URL: "https://llm.example/v1", LLM_MODEL: "gpt-4o-mini" }
  const rejecting = (status) =>
    new MockLanguageModelV4({
      doStream: async () => {
        throw Object.assign(new Error(`Unauthorized: bad key sk-test-secret-value-123456`), { statusCode: status })
      },
    })
  const logs = []
  const original = console.error
  console.error = (...args) => logs.push(args.join(" "))
  try {
    const first = createExplainHandler({ loadData, env: { ...llm, VERCEL: "1" }, models: { "openai-compatible": mockModel(["from the LLM endpoint"]), gateway: rejecting(401) } })
    const response = await first(post({ pin: featureA.properties.pin, weights: WEIGHTS }, "192.0.2.60"))
    assert.equal(response.headers.get("x-explain-source"), "ai")
    assert.equal(response.headers.get("x-explain-provider"), "openai-compatible")
    assert.equal(response.headers.get("x-explain-model"), "gpt-4o-mini")
    assert.equal(await response.text(), "from the LLM endpoint")

    const second = createExplainHandler({ loadData, env: { AI_GATEWAY_API_KEY: "gw-key-1234567890", ...llm }, models: { gateway: rejecting(401), "openai-compatible": mockModel(["fallback text"]) } })
    const fell = await second(post({ pin: featureA.properties.pin, weights: WEIGHTS }, "192.0.2.61"))
    assert.equal(fell.headers.get("x-explain-provider"), "openai-compatible")
    assert.equal(await fell.text(), "fallback text")
    const gatewayLog = logs.find((line) => line.includes('"provider":"gateway"'))
    assert.match(gatewayLog, /"status":401/)
    assert.doesNotMatch(logs.join("\n"), /sk-test-secret-value-123456|gw-key-1234567890/)

    const third = createExplainHandler({ loadData, env: { ...llm, VERCEL: "1" }, models: { "openai-compatible": rejecting(403), gateway: rejecting(401) } })
    const failed = await third(post({ pin: featureA.properties.pin, weights: WEIGHTS }, "192.0.2.62"))
    assert.equal(failed.headers.get("x-explain-source"), "template")
    const notice = decodeURIComponent(failed.headers.get("x-explain-notice"))
    assert.match(notice, /OpenAI-compatible API rejected the credentials; then Vercel AI Gateway rejected the credentials/)
    assert.match(await failed.text(), /screening aid/)
  } finally {
    console.error = original
  }
})
