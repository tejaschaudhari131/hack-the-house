"use client"

import { useCallback, useEffect, useRef, useState } from "react"

function readMeta(response) {
  const notice = response.headers.get("x-explain-notice")
  return {
    source: response.headers.get("x-explain-source") === "ai" ? "ai" : "template",
    model: response.headers.get("x-explain-model"),
    provider: response.headers.get("x-explain-provider"),
    cached: response.headers.get("x-explain-cache") === "hit",
    notice: notice ? decodeURIComponent(notice) : null,
  }
}

/** Only the newest request may update the screen. A new request or a reset makes older tokens stale. */
export function createRequestGuard() {
  let current = 0
  return {
    begin() {
      current += 1
      return current
    },
    isCurrent(token) {
      return token === current
    },
    invalidate() {
      current += 1
    },
  }
}

/** Stream one /api/explain response. onUpdate receives { source, model, cached, notice, text, streaming }. */
export async function streamExplanation({ body, signal, onUpdate, fetchImpl = fetch }) {
  const response = await fetchImpl("/api/explain", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
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
    onUpdate({ ...meta, text, streaming: true })
  }
  text += decoder.decode()
  onUpdate({ ...meta, text, streaming: false })
}

/** Streams /api/explain. `fallback()` returns template text built in the browser if the request fails. */
export function useExplanation(resetKey) {
  const [explanation, setExplanation] = useState(null)
  const [explaining, setExplaining] = useState(false)
  const controller = useRef(null)
  const guard = useRef(createRequestGuard())

  const reset = useCallback(() => {
    guard.current.invalidate()
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
    const token = guard.current.begin()
    setExplaining(true)
    setExplanation(null)
    try {
      await streamExplanation({
        body,
        signal: current.signal,
        onUpdate: (next) => {
          if (guard.current.isCurrent(token)) setExplanation(next)
        },
      })
    } catch (error) {
      if (current.signal.aborted || !guard.current.isCurrent(token)) return
      setExplanation({
        source: "template",
        model: null,
        cached: false,
        streaming: false,
        notice: `${error.message}. This is the template explanation, written in your browser from the same numbers.`,
        text: fallback(),
      })
    } finally {
      if (guard.current.isCurrent(token)) setExplaining(false)
    }
  }, [])

  return { explanation, explaining, run, reset }
}
