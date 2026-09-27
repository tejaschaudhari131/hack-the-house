"use client"

export const AI_LABEL = "AI-generated summary of the scores above; check sources"

const PROVIDERS = { gateway: "Vercel AI Gateway", "openai-compatible": "an OpenAI-compatible API" }

export function providerLabel(provider) {
  return PROVIDERS[provider] || "an AI provider"
}

const SECTION = /^(What the data shows|What depends on your weights|Zoning \(§911\.02\)|Limits and next step):\s*/

function Paragraph({ text }) {
  const match = text.match(SECTION)
  if (!match) return <p>{text}</p>
  return (
    <p>
      <strong>{match[1]}:</strong> {text.slice(match[0].length)}
    </p>
  )
}

export default function Explanation({ explanation }) {
  if (!explanation) return null
  const ai = explanation.source === "ai"
  const paragraphs = explanation.text.split("\n").map((line) => line.trim()).filter(Boolean)
  return (
    <div className={`explanation ${ai ? "is-ai" : "is-template"}`} aria-live="polite" aria-busy={explanation.streaming}>
      <p className="explain-label">
        <span className={`badge ${ai ? "ai" : "template"}`}>{ai ? AI_LABEL : "Template explanation (no AI)"}</span>
        <span className="hint">
          {ai
            ? `${explanation.model} via ${providerLabel(explanation.provider)}${explanation.cached ? " · cached answer" : ""}. It sees only the scores, weights, zoning reading, and sourced inputs on this screen.`
            : "Written by fixed rules from the same numbers. No language model was used."}
        </span>
      </p>
      {explanation.notice ? <p className="warning">{explanation.notice}</p> : null}
      {paragraphs.map((paragraph, index) => (
        <Paragraph key={index} text={paragraph} />
      ))}
      {explanation.streaming ? <p className="hint">Writing…</p> : null}
      {ai && !explanation.streaming ? (
        <p className="hint">
          A language model can still misstate a number. Check it against the score cards and the sources in the
          README. Decision support only: take a real decision to City Planning / the Zoning Administrator or a
          qualified professional.
        </p>
      ) : null}
    </div>
  )
}
