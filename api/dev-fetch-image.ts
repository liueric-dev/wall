// Vercel serverless function — dev-only image proxy for the /dev/seed tool.
// Returns 404 in production. Intended to be reached under `vercel dev`.
//
// Spec: SPRINT-13.md, Step 1.

interface VercelRequest {
  query: { [k: string]: string | string[] | undefined }
}
interface VercelResponse {
  status(code: number): VercelResponse
  json(body: unknown): VercelResponse
  send(body: Buffer | string): VercelResponse
  setHeader(name: string, value: string): void
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<VercelResponse | void> {
  if (process.env.NODE_ENV !== 'development') {
    return res.status(404).json({ error: 'Not found' })
  }

  const rawUrl = req.query.url
  const url = Array.isArray(rawUrl) ? rawUrl[0] : rawUrl
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'url query param required' })
  }

  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return res.status(400).json({ error: 'Invalid URL' })
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return res.status(400).json({ error: 'Only http(s) URLs allowed' })
  }

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10_000)

    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'TheWall-DevTool/1.0' },
    })
    clearTimeout(timeout)

    if (!response.ok) {
      return res.status(502).json({ error: `Source returned ${response.status}` })
    }

    const contentType = response.headers.get('content-type') || 'application/octet-stream'
    if (!contentType.startsWith('image/')) {
      return res.status(400).json({ error: 'URL did not return an image' })
    }

    const buffer = await response.arrayBuffer()
    res.setHeader('Content-Type', contentType)
    res.setHeader('Cache-Control', 'no-store')
    return res.send(Buffer.from(buffer))
  } catch (error) {
    const err = error as { name?: string; message?: string }
    if (err.name === 'AbortError') {
      return res.status(504).json({ error: 'Request timed out' })
    }
    return res.status(500).json({ error: err.message || 'Unknown error' })
  }
}
