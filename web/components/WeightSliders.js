"use client"

import { WEIGHT_LABELS } from "../lib/rank.js"

export default function WeightSliders({ weights, onWeights }) {
  return (
    <>
      {Object.entries(weights).map(([key, value]) => (
        <label key={key} className="slider">
          <span>
            {WEIGHT_LABELS[key] || key} <strong>{value}</strong>
          </span>
          <input
            type="range"
            min="0"
            max="100"
            value={value}
            onChange={(event) => onWeights({ ...weights, [key]: Number(event.target.value) })}
          />
        </label>
      ))}
    </>
  )
}
