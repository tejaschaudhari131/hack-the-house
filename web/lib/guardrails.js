import { createHash } from "node:crypto"

/** Sliding-window limiter. In memory, so it is per server instance, which is enough to blunt casual abuse. */
export function createRateLimiter({ limit, windowMs, maxKeys = 5000 }) {
  const hits = new Map()
  return function check(key, now = Date.now()) {
    const recent = (hits.get(key) || []).filter((time) => now - time < windowMs)
    if (recent.length >= limit) {
      hits.set(key, recent)
      return { ok: false, remaining: 0, retryAfterMs: windowMs - (now - recent[0]) }
    }
    recent.push(now)
    hits.delete(key)
    hits.set(key, recent)
    if (hits.size > maxKeys) hits.delete(hits.keys().next().value)
    return { ok: true, remaining: limit - recent.length, retryAfterMs: 0 }
  }
}

/** Least-recently-set cache with a TTL. */
export function createTtlCache({ max, ttlMs }) {
  const entries = new Map()
  return {
    get(key, now = Date.now()) {
      const entry = entries.get(key)
      if (!entry) return null
      if (now - entry.at > ttlMs) {
        entries.delete(key)
        return null
      }
      return entry.value
    },
    set(key, value, now = Date.now()) {
      entries.delete(key)
      entries.set(key, { value, at: now })
      if (entries.size > max) entries.delete(entries.keys().next().value)
    },
    get size() {
      return entries.size
    },
  }
}

export function hashKey(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex")
}

export function clientIp(headers) {
  const forwarded = headers.get("x-forwarded-for")
  if (forwarded) return forwarded.split(",")[0].trim()
  return headers.get("x-real-ip") || "unknown"
}
