import { formatEther, parseEther } from 'viem'

export const shortAddress = (address?: string): string =>
  !address ? '' : `${address.slice(0, 6)}…${address.slice(-4)}`

/**
 * Wei to a readable GEN figure. **Lossy: display only.**
 *
 * It truncates to six decimals, so it must never be used to seed an editable
 * amount: round-tripping display → `toWei` silently rewrites the number. That
 * bug shipped here once, in the counter-offer form, where opening a counter and
 * submitting it unchanged quietly altered the agreed price. Use `weiToInput`
 * for anything a user can edit and send back.
 */
export function formatGen(wei: string | bigint, { suffix = true } = {}): string {
  const value = typeof wei === 'bigint' ? wei : BigInt(wei || '0')
  const full = formatEther(value)
  const [whole, decimals = ''] = full.split('.')
  const trimmed = decimals.replace(/0+$/, '').slice(0, 6)
  const text = trimmed ? `${whole}.${trimmed}` : whole
  // Say so rather than rounding in silence: a truncated figure that looks exact
  // is worse than one that admits it is not.
  const truncated = decimals.replace(/0+$/, '').length > 6
  const shown = truncated ? `≈${text}` : text
  return suffix ? `${shown} GEN` : shown
}

/** Wei to an exact, editable decimal string. Lossless: `toWei(weiToInput(x)) === x`. */
export const weiToInput = (wei: string | bigint): string =>
  formatEther(typeof wei === 'bigint' ? wei : BigInt(wei || '0'))

export const toWei = (gen: string): bigint => parseEther(gen as `${number}`)

export const sameAddress = (a?: string, b?: string): boolean =>
  Boolean(a && b && a.toLowerCase() === b.toLowerCase())

export function formatDate(unixSeconds: number): string {
  if (!unixSeconds) return 'not set'
  return new Date(unixSeconds * 1000).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export function formatDateTime(unixSeconds: number): string {
  if (!unixSeconds) return 'not set'
  return new Date(unixSeconds * 1000).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** "in 3 days" / "2 hours ago" - relative to now, for deadlines and windows. */
export function relativeTime(unixSeconds: number): string {
  if (!unixSeconds) return 'not set'
  const deltaSeconds = unixSeconds - Math.floor(Date.now() / 1000)
  const past = deltaSeconds < 0
  let remaining = Math.abs(deltaSeconds)
  const units: [number, string][] = [
    [86400, 'day'],
    [3600, 'hour'],
    [60, 'minute'],
    [1, 'second'],
  ]
  for (const [size, name] of units) {
    if (remaining >= size || size === 1) {
      const count = Math.floor(remaining / size)
      const label = `${count} ${name}${count === 1 ? '' : 's'}`
      return past ? `${label} ago` : `in ${label}`
    }
    remaining %= size
  }
  return 'not set'
}

/** A rough word-level redline between two texts, for counter-offers. */
export function redline(before: string, after: string): { text: string; kind: 'same' | 'add' | 'del' }[] {
  const a = before.split(/(\s+)/)
  const b = after.split(/(\s+)/)
  const lengths: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0))
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lengths[i][j] = a[i] === b[j] ? lengths[i + 1][j + 1] + 1 : Math.max(lengths[i + 1][j], lengths[i][j + 1])
    }
  }
  const out: { text: string; kind: 'same' | 'add' | 'del' }[] = []
  let i = 0
  let j = 0
  const push = (text: string, kind: 'same' | 'add' | 'del') => {
    const last = out[out.length - 1]
    if (last && last.kind === kind) last.text += text
    else out.push({ text, kind })
  }
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) push(a[i++], 'same'), j++
    else if (lengths[i + 1][j] >= lengths[i][j + 1]) push(a[i++], 'del')
    else push(b[j++], 'add')
  }
  while (i < a.length) push(a[i++], 'del')
  while (j < b.length) push(b[j++], 'add')
  return out
}
