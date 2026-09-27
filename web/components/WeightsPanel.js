"use client"

import WeightPresets from "./WeightPresets.js"
import WeightSliders from "./WeightSliders.js"

/** "What matters most to you?": priority buttons first, sliders folded away, and a live cue when the ranking changes. */
export default function WeightsPanel({ weights, onWeights, onAntiDisplacement = null, cue = null, children = null }) {
  return (
    <section className="weights-panel" aria-labelledby="weights-heading">
      <h2 id="weights-heading">What matters most to you?</h2>
      <WeightPresets weights={weights} onWeights={onWeights} onAntiDisplacement={onAntiDisplacement} />
      <p className="ranking-cue" role="status" aria-live="polite">
        {cue}
      </p>
      <details className="more">
        <summary>Fine-tune with sliders</summary>
        <p className="hint">Each slider is a relative priority, not a percentage.</p>
        <WeightSliders weights={weights} onWeights={onWeights} />
        {children}
      </details>
    </section>
  )
}
