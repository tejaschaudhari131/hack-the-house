"use client"

import { useId } from "react"

import { SWEEP, VERDICT_LABELS, describeFlip, describeRobustness } from "../lib/robustness.js"

function shortLabel(label) {
  return (label || "n/a").replace(/ \(.*\)$/, "")
}

/** Shows whether the #1 result holds under the presets and single-slider changes. */
export default function Robustness({ analysis, title = "How stable is #1?", note = null, secondary = null, sweep = null, sweepNote = null }) {
  const headingId = useId()
  if (!analysis) return null
  const flips = []
  const seen = new Set()
  for (const flip of analysis.flips) {
    if (seen.has(flip.key)) continue
    seen.add(flip.key)
    flips.push(flip)
    if (flips.length === 3) break
  }
  return (
    <section className={`robustness ${analysis.verdict}`} aria-labelledby={headingId}>
      <h3 id={headingId}>
        {title} <span className={`badge verdict ${analysis.verdict}`}>{VERDICT_LABELS[analysis.verdict]}</span>
      </h3>
      <p>
        <strong>{describeRobustness(analysis)}</strong>
      </p>
      {note ? <p className="hint">{note}</p> : null}
      <ul className="preset-results" aria-label="#1 under each preset">
        {analysis.presets.map((row) => (
          <li key={row.id} className={row.same ? "same" : "differs"}>
            <span>{row.label}</span>
            <strong>
              {shortLabel(row.winner?.label)}
              <span className="sr-only">{row.same ? " (same as now)" : " (different from now)"}</span>
            </strong>
          </li>
        ))}
      </ul>
      {flips.length > 1 ? (
        <ul className="flips">
          {flips.slice(1).map((flip) => (
            <li key={`${flip.key}-${flip.direction}`}>{describeFlip(flip)}</li>
          ))}
        </ul>
      ) : null}
      {secondary}
      {sweep ? (
        <details className="sweep">
          <summary>
            One-factor sweep: move one raw weight from {SWEEP.min} to {SWEEP.max} (step {SWEEP.step}), others fixed
          </summary>
          {sweepNote ? <p className="hint">{sweepNote}</p> : null}
          <table className="contrib-table">
            <thead>
              <tr>
                <th scope="col">Factor</th>
                <th scope="col">Now</th>
                <th scope="col">Result</th>
              </tr>
            </thead>
            <tbody>
              {sweep.map((row) => (
                <tr key={row.id}>
                  <th scope="row">{row.label}</th>
                  <td>{row.weight}</td>
                  <td className="sweep-text">{row.text}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="hint">
            A solved crossing is where the two unrounded scores are exactly equal. The sampled change is the first step
            where the displayed (one-decimal) result changes, so it can show a tie first.
          </p>
        </details>
      ) : null}
      <p className="hint">
        <span className="tag measured">Data</span> The scores stay fixed here.{" "}
        <span className="tag choice">Value judgment</span> Only the weights change. A result that flips under a small
        weight change is a values question, not a data finding.
      </p>
    </section>
  )
}
