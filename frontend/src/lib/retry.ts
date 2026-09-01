/**
 * Retries a read on rate-limit errors only. GenLayer's `gen_call` limit is
 * shared and tight enough that even sequential reads trip it under load, so
 * this turns a transient throttle into a slightly slower page rather than an
 * error. Anything else is rethrown immediately - a genuine failure should not
 * be retried into a four-second delay.
 */
export async function withRetry<T>(fn: () => Promise<T>, retries = 4, baseDelayMs = 700): Promise<T> {
  let lastError: unknown
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error
      const message = error instanceof Error ? error.message : String(error)
      if (!/rate limit|too many requests/i.test(message) || attempt === retries) throw error
      await new Promise((resolve) => setTimeout(resolve, baseDelayMs * 2 ** attempt))
    }
  }
  throw lastError
}

/**
 * Runs `fn` over `items` a few at a time, with a small gap between dispatches.
 * Used for the board, which reads every job individually - a full fan-out
 * would trip the rate limit on the first load.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let cursor = 0
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++
      results[index] = await fn(items[index], index)
      await new Promise((resolve) => setTimeout(resolve, 120))
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}
