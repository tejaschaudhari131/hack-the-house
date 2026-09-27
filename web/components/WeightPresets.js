"use client"

import { FACTORS } from "../lib/factors.js"
import { PRESETS, PRESET_NOTE, matchPreset, presetWeights } from "../lib/presets.js"

export default function WeightPresets({ weights, onWeights, onAntiDisplacement = null }) {
  const active = matchPreset(weights)
  return (
    <div className="presets">
      <p className="presets-label" id="presets-label">
        Pick a starting point
      </p>
      <div className="preset-row" role="group" aria-labelledby="presets-label">
        {PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className={active?.id === preset.id ? "on" : ""}
            aria-pressed={active?.id === preset.id}
            title={preset.blurb}
            onClick={() => onWeights(presetWeights(preset))}
          >
            {preset.label}
          </button>
        ))}
      </div>
      <p className="hint">
        {active ? `${active.label}: ${active.blurb}` : "Custom priorities."} <span className="tag choice">A choice, not data</span>
      </p>
      <details className="preset-weights more">
        <summary>What do these buttons change?</summary>
        <p className="hint">{PRESET_NOTE}</p>
        <table className="contrib-table">
          <thead>
            <tr>
              <th scope="col">Priority</th>
              {FACTORS.map((factor) => (
                <th scope="col" key={factor.id}>
                  {factor.label.split(" (")[0]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PRESETS.map((preset) => {
              const values = presetWeights(preset)
              return (
                <tr key={preset.id}>
                  <th scope="row">{preset.label}</th>
                  {FACTORS.map((factor) => (
                    <td key={factor.id}>{values[factor.id]}</td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
        <p className="hint">Raw weights are relative, not percentages. Each score divides by the sum of the weights in use.</p>
      </details>
      {onAntiDisplacement ? (
        <p className="hint">
          <button type="button" className="text-button" onClick={onAntiDisplacement}>
            CDC anti-displacement example
          </button>{" "}
          targets high displacement-risk tracts on purpose and sets the displacement weight to 0, so the ranking does not
          push those places down. It is a different objective, not a lower risk.
        </p>
      ) : null}
    </div>
  )
}
