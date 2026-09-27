"use client"

import { PRESETS, PRESET_NOTE, matchPreset, presetWeights } from "../lib/presets.js"

export default function WeightPresets({ weights, onWeights }) {
  const active = matchPreset(weights)
  return (
    <div className="presets">
      <p className="presets-label" id="presets-label">
        Start from a viewpoint
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
        {active ? `${active.label}: ${active.blurb} ` : "Custom weights. "}
        <span className="tag choice">Value judgment</span> {PRESET_NOTE}
      </p>
    </div>
  )
}
