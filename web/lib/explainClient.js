"use client"

import { useCallback, useEffect, useRef, useState } from "react"

function readMeta(response) {
  const notice = response.headers.get("x-explain-notice")
  return {
    source: response.headers.get("x-explain-source") === "ai" ? "ai" : "template",
    model: response.headers.get("x-explain-model"),
    cached: response.headers.get("x-explain-cache") === "hit",
    notice: notice ? decodeURIComponent(notice) : null,
  }
}

/** Streams /api/explain. `fallback()` returns template text built in the browser if the request fails. */
export function useExplanation(resetKey) {
  const [explanation, setExplanation] = useState(null)
  const [explaining, setExplaining] = useState(false)
  const controller = useRef(null)

  const reset = useCallback(() => {
    controller.current?.abort()
    controller.current = null
    setExplanation(null)
    setExplaining(false)
  }, [])

  useEffect(() => reset, [resetKey, reset])

  const run = useCallback(async (body, fallback) => {
    controller.current?.abort()
    const current = new AbortController()
    controller.current = current
    setExplaining(true)
    setExplanation(null)
    try {
      const response = await fetch("/api/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: current.signal,
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload.error || `The explanation service returned HTTP ${response.status}`)
      }
      const meta = readMeta(response)
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let text = ""
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        text += decoder.decode(value, { stream: true })
        if (controller.current === current) setExplanation({ ...meta, text, streaming: true })
      }
      text += decoder.decode()
      if (controller.current === current) setExplanation({ ...meta, text, streaming: false })
    } catch (error) {
      if (current.signal.aborted) return
      setExplanation({
        source: "template",
        model: null,
        cached: false,
        streaming: false,
        notice: `${error.message}. This is the template explanation, written in your browser from the same numbers.`,
        text: fallback(),
      })
    } finally {
      if (controller.current === current) setExplaining(false)
    }
  }, [])

  return { explanation, explaining, run, reset }
}
