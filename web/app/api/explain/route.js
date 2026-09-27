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
            "You explain a housing decision-support screen in plain language for a planner or resident. Use only the JSON facts. Do not invent statistics, zoning permissions, prices, or risks. Separate what was measured from value judgments (weights, lot-fit rules, equity type factors, the flood/slope/undermined blend). Steep-slope overlap is a proxy for landslide risk, not a landslide inventory. Undermined-area overlap is a preliminary mine-subsidence screen, not a safety determination. Assessed value is not a fact in this JSON and is not market value. If chas_rent_burden_share is present, it is the HUD CHAS 2018-2022 tract share of renter households at or below 80% of HAMFI paying more than 30% of income. It is not the same measure as the ACS 2024 rent_burden_share, and it is several years older. If that CHAS field is null, say it is missing and do not invent it. Say clearly that this is a screening aid, not legal, zoning, or financial advice, and that a consequential decision should go to City Planning / the Zoning Administrator or a qualified professional. The zoning use table was not read unless the JSON says a code section was cited. Two short paragraphs and at most four bullets.",
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
