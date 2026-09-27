/** POST /api/explain. The server rebuilds every number from the committed data files; the client only
 * sends parcel ids, housing types, weights, and the what-if toggle.
 */

import { createOpenAICompatible } from "@ai-sdk/openai-compatible"
import { streamText } from "ai"

import { buildCompareContext, buildParcelContext, explainCompareTemplate } from "./explainFacts.js"
import { PROMPT_VERSION, SYSTEM_PROMPT, buildComparePrompt, buildParcelPrompt, buildSitesPrompt } from "./explainPrompt.js"
import { explainTemplate } from "./explainTemplate.js"
import { clientIp, createRateLimiter, createTtlCache, hashKey } from "./guardrails.js"
import { buildSitesContext, explainSitesTemplate } from "./explainSites.js"
import { DEFAULT_WEIGHTS } from "./rank.js"
import { findSites } from "./sites.js"
import { WEIGHT_KEYS, parseDrop, parsePin, parseSiteFilters, parseSort, parseWeights } from "./validate.js"

export const DEFAULT_MODEL = "anthropic/claude-haiku-4.5"

export const LIMITS = {
  maxBodyBytes: 4096,
  maxOutputTokens: 600,
  totalTimeoutMs: 15000,
  firstChunkTimeoutMs: 8000,
  perIpPerMinute: 6,
  perInstancePerMinute: 60,
  cacheMax: 500,
  cacheTtlMs: 6 * 60 * 60 * 1000,
}


export const DEFAULT_LLM_MODEL = "gpt-4o-mini"

export const PROVIDER_LABELS = { gateway: "Vercel AI Gateway", "openai-compatible": "OpenAI-compatible API", custom: "test model" }

/**
 * Providers to try, in order. With AI_GATEWAY_API_KEY: the gateway, then LLM_* if set. Without it: LLM_* first
 * (when LLM_API_KEY and LLM_BASE_URL are set), then the gateway through Vercel OIDC when running on Vercel.
 */
export function providerPlan(env = process.env) {
  if (["off", "0", "false"].includes(String(env.AI_EXPLANATIONS || "").trim().toLowerCase())) {
    return { providers: [], reason: "AI explanations are turned off (AI_EXPLANATIONS=off)." }
  }
  const gateway = { id: "gateway", model: (env.AI_MODEL || "").trim() || DEFAULT_MODEL }
  const llm = env.LLM_API_KEY && env.LLM_BASE_URL ? { id: "openai-compatible", model: (env.LLM_MODEL || "").trim() || DEFAULT_LLM_MODEL } : null
  const oidc = Boolean(env.VERCEL_OIDC_TOKEN || env.VERCEL)
  const ordered = env.AI_GATEWAY_API_KEY ? [gateway, llm] : llm ? [llm, oidc ? gateway : null] : [oidc ? gateway : null]
  const providers = ordered.filter(Boolean)
  return {
    providers,
    reason: providers.length ? null : "No AI Gateway credentials and no LLM_API_KEY / LLM_BASE_URL are configured.",
  }
}

export function aiConfig(env = process.env) {
  const plan = providerPlan(env)
  return { model: plan.providers[0]?.model || DEFAULT_MODEL, enabled: plan.providers.length > 0, reason: plan.reason, providers: plan.providers }
}

function createModel(provider, env) {
  if (provider.id === "gateway") return provider.model
  const client = createOpenAICompatible({ name: "llm", baseURL: String(env.LLM_BASE_URL).replace(/\/+$/, ""), apiKey: env.LLM_API_KEY })
  return client.chatModel(provider.model)
}

function redact(text, env) {
  let out = String(text ?? "").slice(0, 400)
  for (const secret of [env.LLM_API_KEY, env.AI_GATEWAY_API_KEY, env.VERCEL_OIDC_TOKEN]) {
    if (secret && secret.length > 6) out = out.split(secret).join("[redacted]")
  }
  return out.replace(/\b(sk|pk|key|bearer)[-_ ]?[A-Za-z0-9._-]{12,}/gi, "[redacted]")
}

/** Server log for Vercel: provider, model, status, and a redacted message. No request body, IP, or credentials. */
export function logProviderError(provider, error, env = process.env, stage = "start") {
  const status = error?.statusCode ?? error?.cause?.statusCode ?? null
  console.error(
    "[explain] provider error",
    JSON.stringify({ stage, provider: provider.id, model: provider.model, status, name: error?.name || "Error", message: redact(error?.message, env) }),
  )
}

export function parseExplainRequest(body) {
  const weights = parseWeights(body?.weights)
  if (!weights) return { error: `weights must have ${WEIGHT_KEYS.join(", ")}, each between 0 and 100.` }
  if (body?.kind === "sites") {
    const filters = parseSiteFilters(body.filters)
    if (!filters) return { error: "filters must use the Find Sites filter keys and choices." }
    const sort = parseSort(body.sort)
    return { kind: "sites", weights, filters, sort }
  }
  if (body?.kind === "compare") {
    const a = parseDrop(body.a)
    const b = parseDrop(body.b)
    if (!a || !b) return { error: "compare needs a and b, each with a parcel pin and a housing type." }
    return { kind: "compare", weights, a, b }
  }
  const pin = parsePin(body?.pin)
  if (!pin) return { error: "pin is required." }
  return { kind: "parcel", weights, pin, whatIf: body?.whatIf === true }
}

function textResponse(body, { source, model = null, provider = null, notice = null, cache = "none", status = 200 }) {
  const headers = {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Explain-Source": source,
    "X-Explain-Cache": cache,
  }
  if (model) headers["X-Explain-Model"] = model
  if (provider) headers["X-Explain-Provider"] = provider
  if (notice) headers["X-Explain-Notice"] = encodeURIComponent(notice)
  return new Response(body, { status, headers })
}

function jsonError(message, status) {
  return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } })
}

function describeError(error, label = "the AI Gateway") {
  const status = error?.statusCode ?? error?.cause?.statusCode
  const name = error?.name || "Error"
  if (name === "AbortError" || name === "TimeoutError" || /abort|timeout/i.test(String(error?.message))) {
    return `${label} did not answer within the time limit`
  }
  if (status === 401 || status === 403 || /auth|api key|oidc/i.test(String(error?.message))) {
    return `${label} rejected the credentials`
  }
  if (status === 402) return `${label} budget is used up`
  if (status === 429) return `${label} rate limit was reached`
  return status ? `${label} returned HTTP ${status}` : `the ${label} request failed`
}

/** Starts the model stream and waits for the first text so early failures can fall back cleanly. */
async function startModelStream({ model, prompt, signal, fallbackText, onComplete, onStreamError = () => {} }) {
  const result = streamText({
    model,
    instructions: SYSTEM_PROMPT,
    prompt,
    temperature: 0.2,
    maxOutputTokens: LIMITS.maxOutputTokens,
    maxRetries: 1,
    timeout: { totalMs: LIMITS.totalTimeoutMs, firstChunkMs: LIMITS.firstChunkTimeoutMs },
    abortSignal: signal,
    providerOptions: { gateway: { tags: ["feature:explain"] } },
    onError: ({ error }) => onStreamError(error),
  })
  const parts = result.fullStream[Symbol.asyncIterator]()
  let first = ""
  while (!first) {
    const { value, done } = await parts.next()
    if (done) throw new Error("The model returned no text.")
    if (value.type === "text-delta") first = value.text
    else if (value.type === "error") throw value.error instanceof Error ? value.error : new Error(String(value.error))
    else if (value.type === "abort") throw Object.assign(new Error("aborted"), { name: "AbortError" })
    else if (value.type === "finish") throw new Error("The model returned no text.")
  }

  const encoder = new TextEncoder()
  let full = first
  let closed = false
  const finishWith = (controller, tail) => {
    if (tail) controller.enqueue(encoder.encode(tail))
    closed = true
    controller.close()
  }
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(first))
    },
    async pull(controller) {
      if (closed) return
      try {
        while (true) {
          const { value, done } = await parts.next()
          if (done) {
            onComplete(full)
            return finishWith(controller)
          }
          if (value.type === "text-delta" && value.text) {
            full += value.text
            controller.enqueue(encoder.encode(value.text))
            return
          }
          if (value.type === "finish" && value.finishReason === "length") {
            return finishWith(controller, "\n\n[The AI summary hit its length limit and was cut off. Check the scores above.]")
          }
          if (value.type === "error" || value.type === "abort") {
            const reason = describeError(value.type === "abort" ? { name: "AbortError" } : value.error)
            return finishWith(
              controller,
              `\n\n[The AI summary stopped early because ${reason}. Template explanation from the same numbers:]\n\n${fallbackText}`,
            )
          }
        }
      } catch (error) {
        finishWith(
          controller,
          `\n\n[The AI summary stopped early because ${describeError(error)}. Template explanation from the same numbers:]\n\n${fallbackText}`,
        )
      }
    },
    async cancel() {
      await parts.return?.()
    },
  })
}

/**
 * @param {object} deps
 * @param {() => Promise<{byPin: Map, zoning: object, sources: object[], summary: object, stops: object}>} deps.loadData
 * @param {object} [deps.env]
 * @param {import('ai').LanguageModel} [deps.model] Overrides the gateway model string (tests).
 */
/**
 * @param {object} deps
 * @param {object} [deps.env]
 * @param {import('ai').LanguageModel} [deps.model] A single test model (replaces the plan).
 * @param {Record<string, import('ai').LanguageModel>} [deps.models] Test models by provider id ("gateway", "openai-compatible").
 */
export function createExplainHandler({ loadData, env = process.env, model: modelOverride, models = null } = {}) {
  const perIp = createRateLimiter({ limit: LIMITS.perIpPerMinute, windowMs: 60_000 })
  const perInstance = createRateLimiter({ limit: LIMITS.perInstancePerMinute, windowMs: 60_000 })
  const cache = createTtlCache({ max: LIMITS.cacheMax, ttlMs: LIMITS.cacheTtlMs })

  return async function handleExplain(request) {
    const raw = await request.text()
    if (raw.length > LIMITS.maxBodyBytes) return jsonError("Request body is too large.", 413)
    let body
    try {
      body = JSON.parse(raw)
    } catch {
      return jsonError("Expected JSON.", 400)
    }
    const input = parseExplainRequest(body)
    if (input.error) return jsonError(input.error, 400)

    let data
    try {
      data = await loadData()
    } catch (error) {
      return jsonError(`Parcel data did not load on the server (${error.message}).`, 500)
    }

    let context
    let templateText
    let prompt
    if (input.kind === "sites") {
      const rows = findSites(data.features || [...data.byPin.values()], input.filters, input.weights, data.zoning, input.sort)
      context = buildSitesContext({
        rows,
        filters: input.filters,
        sort: input.sort,
        weights: input.weights,
        sources: data.sources,
        summary: data.summary,
        zoningRules: data.zoning,
      })
      templateText = explainSitesTemplate(context)
      if (!rows.length) return textResponse(templateText, { source: "template", notice: "No parcels match, so there is nothing for the model to explain." })
      prompt = buildSitesPrompt(context.facts)
    } else if (input.kind === "compare") {
      const featureA = data.byPin.get(input.a.pin)
      const featureB = data.byPin.get(input.b.pin)
      if (!featureA || !featureB) return jsonError("Unknown parcel pin.", 404)
      context = buildCompareContext({
        a: input.a,
        b: input.b,
        featureA,
        featureB,
        weights: input.weights,
        zoningRules: data.zoning,
        stops: data.stops,
        sources: data.sources,
        summary: data.summary,
      })
      templateText = explainCompareTemplate(context)
      prompt = buildComparePrompt(context.facts)
    } else {
      const feature = data.byPin.get(input.pin)
      if (!feature) return jsonError("Unknown parcel pin.", 404)
      context = buildParcelContext({
        props: feature.properties,
        weights: input.weights,
        whatIf: input.whatIf,
        zoningRules: data.zoning,
        sources: data.sources,
        summary: data.summary,
      })
      templateText = explainTemplate(context.templateInput)
      prompt = buildParcelPrompt(context.facts)
    }

    const plan = modelOverride
      ? { providers: [{ id: "custom", model: modelOverride.modelId || "custom" }], reason: null }
      : providerPlan(env)
    if (!plan.providers.length) {
      return textResponse(templateText, { source: "template", notice: `${plan.reason} This is the template explanation.` })
    }
    const keyFor = (provider) => hashKey({ v: PROMPT_VERSION, provider: provider.id, model: provider.model, system: SYSTEM_PROMPT, prompt })
    for (const provider of plan.providers) {
      const cached = cache.get(keyFor(provider))
      if (cached) return textResponse(cached, { source: "ai", model: provider.model, provider: provider.id, cache: "hit" })
    }

    const ip = clientIp(request.headers)
    if (!perIp(ip).ok || !perInstance("all").ok) {
      return textResponse(templateText, {
        source: "template",
        notice: "Too many AI requests in the last minute, so this is the template explanation. Try again shortly.",
        status: 200,
      })
    }

    const failures = []
    for (const provider of plan.providers) {
      const label = PROVIDER_LABELS[provider.id] || provider.id
      let logged = false
      try {
        const model = modelOverride || models?.[provider.id] || createModel(provider, env)
        const stream = await startModelStream({
          model,
          prompt,
          signal: request.signal,
          fallbackText: templateText,
          onComplete: (text) => cache.set(keyFor(provider), text),
          onStreamError: (error) => {
            logged = true
            logProviderError(provider, error, env, "stream")
          },
        })
        return textResponse(stream, { source: "ai", model: provider.model, provider: provider.id, cache: "miss" })
      } catch (error) {
        if (!logged) logProviderError(provider, error, env, "start")
        failures.push(describeError(error, label))
        if (request.signal?.aborted) break
      }
    }
    return textResponse(templateText, {
      source: "template",
      notice: `The AI summary is unavailable because ${failures.join("; then ")}. This is the template explanation.`,
    })
  }
}
