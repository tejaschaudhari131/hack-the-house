import { explainTemplate } from "../../../lib/explainTemplate.js"

export const runtime = "nodejs"

function fallback(body, notice) {
  return Response.json({
    text: explainTemplate(body),
    source: "template",
    model: null,
    notice,
  })
}

async function explainWithModel(body, apiKey) {
  const base = (process.env.LLM_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "")
  const model = process.env.LLM_MODEL || "gpt-4o-mini"
  const response = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      max_tokens: 500,
      messages: [
        {
          role: "system",
          content:
            "You explain a housing decision-support screen in plain language for a planner or resident. Use only the JSON facts. Do not invent statistics, zoning permissions, prices, or risks. Separate what was measured from value judgments (weights, lot-fit rules, equity type factors). Say clearly that this is not legal, zoning, or financial advice. Two short paragraphs and at most four bullets.",
        },
        { role: "user", content: JSON.stringify(body) },
      ],
    }),
    signal: AbortSignal.timeout(20000),
  })
  if (!response.ok) {
    throw new Error(`Language model HTTP ${response.status}`)
  }
  const payload = await response.json()
  const text = payload.choices?.[0]?.message?.content?.trim()
  if (!text) throw new Error("Language model returned no text")
  return { text, model }
}

export async function POST(request) {
  let body
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "Expected JSON." }, { status: 400 })
  }
  if (!body?.parcel || !Array.isArray(body?.ranked) || !body.ranked.length) {
    return Response.json({ error: "Parcel and ranked types are required." }, { status: 400 })
  }
  const apiKey = process.env.LLM_API_KEY
  if (!apiKey) {
    return fallback(body, null)
  }
  try {
    const result = await explainWithModel(body, apiKey)
    return Response.json({ text: result.text, source: "llm", model: result.model, notice: null })
  } catch (error) {
    return fallback(body, `The language model request failed (${error.message}), so this is the template explanation.`)
  }
}
