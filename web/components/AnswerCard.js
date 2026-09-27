"use client"

import { PERMISSION_PLAIN, plainSummary } from "../lib/comparison.js"

const PERMISSION_MARK = { permitted: "✓", partial: "~", special: "!", not_permitted: "✕", unknown: "?" }

function Option({ side, leading }) {
  const category = side.permission.category
  return (
    <article className={`option-card${leading ? " leading" : ""}`} aria-label={`Option ${side.slot}`}>
      <p className="option-slot">
        Option {side.slot}
        {leading ? <span className="leading-tag">Higher score</span> : null}
      </p>
      <p className="option-name">{side.label}</p>
      <p className="option-score" aria-label={`Score ${side.composite ?? "none"} out of 100`}>
        {side.composite ?? "—"}
        <span> / 100</span>
      </p>
      <p className={`permit permit-${category}`} title={side.permission.detail}>
        <span aria-hidden="true">{PERMISSION_MARK[category]}</span> {PERMISSION_PLAIN[category]}
      </p>
    </article>
  )
}

/** The default answer: which option scores higher, whether each is allowed, and one sentence of why. */
export default function AnswerCard({ result, robustness, onBrief }) {
  if (!result) return null
  const summary = plainSummary(result)
  const leader = result.winner === "A" || result.winner === "B" ? result.winner : null
  return (
    <div className="answer">
      <p className="answer-kicker">
        {result.sameParcel ? `Two options on ${result.a.address || result.a.pin}` : "Two options on two lots"}
      </p>
      <h2 className="answer-headline">{summary.headline}</h2>
      {summary.why ? <p className="answer-why">{summary.why}</p> : null}
      <div className="option-pair">
        <Option side={result.a} leading={leader === "A"} />
        <Option side={result.b} leading={leader === "B"} />
      </div>
      {robustness?.current ? (
        <p className="answer-note">
          Checked against 5 example priorities: the same option comes out ahead under {robustness.agree} of {robustness.total}.
          {summary.close ? " The scores are close, so your priorities decide it." : ""}
        </p>
      ) : null}
      <p className="answer-note">
        Zoning shown from the city use table (§911.02) and still needs expert review. Scores rank; they are not a permit.
      </p>
      {onBrief ? (
        <button type="button" className="explain" onClick={onBrief}>
          Next: get the brief →
        </button>
      ) : null}
    </div>
  )
}
