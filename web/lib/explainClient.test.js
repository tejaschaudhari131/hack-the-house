import test from "node:test"
import assert from "node:assert/strict"

import { createRequestGuard, streamExplanation } from "./explainClient.js"

function slowFetch(text, delayMs) {
  return async () => {
    await new Promise((resolve) => setTimeout(resolve, delayMs))
    return new Response(text, { headers: { "x-explain-source": "ai", "x-explain-model": "mock" } })
  }
}

test("an older response that finishes last cannot overwrite the newer explanation (L.10)", async () => {
  const guard = createRequestGuard()
  let shown = null
  const run = (text, delay) => {
    const token = guard.begin()
    return streamExplanation({
      body: { kind: "compare", scenario: text },
      fetchImpl: slowFetch(text, delay),
      onUpdate: (next) => {
        if (guard.isCurrent(token)) shown = next
      },
    })
  }
  const scenarioA = run("Explanation for scenario A", 60)
  const scenarioB = run("Explanation for scenario B", 5)
  await Promise.all([scenarioA, scenarioB])
  assert.equal(shown.text, "Explanation for scenario B")
  assert.equal(shown.streaming, false)
})

test("a weights or scenario change invalidates an in-flight explanation", async () => {
  const guard = createRequestGuard()
  let shown = null
  const token = guard.begin()
  const pending = streamExplanation({
    body: {},
    fetchImpl: slowFetch("Stale text for the old weights", 20),
    onUpdate: (next) => {
      if (guard.isCurrent(token)) shown = next
    },
  })
  guard.invalidate()
  await pending
  assert.equal(shown, null)
})
