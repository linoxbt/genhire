/**
 * Committing to evidence content at submission time.
 *
 * The contract re-fetches every evidence URL on each adjudication, including
 * the re-adjudication that answers a dispute. Without a commitment, whoever
 * controls the page could change what is judged between a ruling and its
 * appeal, so a sha256 taken now is what makes the appeal judge the same bytes.
 */

/** ipfs:// and ar:// references are already hashes of their content. */
export const isContentAddressed = (url: string): boolean =>
  url.startsWith('ipfs://') || url.startsWith('ar://')

/** The hash the contract expects: sha256 of the page's text, lowercase hex. */
async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export interface EvidenceCommitment {
  urls: string[]
  hashes: string[]
  /** URLs the browser could not read, so the freelancer must paste the hash. */
  unreachable: string[]
}

/**
 * Fetch each mutable URL and hash what comes back.
 *
 * Best-effort by nature: the browser may be blocked by CORS where the
 * validators are not, so anything unreachable is reported rather than guessed
 * at, because submitting a wrong hash would make the contract refuse the evidence at
 * adjudication, which is worse than being told to supply it manually.
 */
export async function commitEvidence(urls: string[]): Promise<EvidenceCommitment> {
  const hashes: string[] = []
  const unreachable: string[] = []

  for (const url of urls) {
    if (isContentAddressed(url)) {
      hashes.push('')
      continue
    }
    try {
      const response = await fetch(url)
      if (!response.ok) throw new Error(String(response.status))
      hashes.push(await sha256Hex(await response.text()))
    } catch {
      hashes.push('')
      unreachable.push(url)
    }
  }

  return { urls, hashes, unreachable }
}
