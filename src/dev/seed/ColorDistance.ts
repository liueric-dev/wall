// Weighted Euclidean RGB distance + nearest-color lookup.
// Used by the dev/seed image-conversion pipeline. See SPRINT-13.md Step 2.

export function colorDistance(
  r1: number, g1: number, b1: number,
  r2: number, g2: number, b2: number,
): number {
  const rmean = (r1 + r2) / 2
  const r = r1 - r2
  const g = g1 - g2
  const b = b1 - b2
  return Math.sqrt(
    (((512 + rmean) * r * r) >> 8) +
    4 * g * g +
    (((767 - rmean) * b * b) >> 8),
  )
}

export function hexToRgb(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return [r, g, b]
}

export function findNearestColor(
  r: number, g: number, b: number,
  palette: readonly string[],
): string {
  let nearest = palette[0]
  let minDist = Infinity
  for (const hex of palette) {
    const [pr, pg, pb] = hexToRgb(hex)
    const dist = colorDistance(r, g, b, pr, pg, pb)
    if (dist < minDist) {
      minDist = dist
      nearest = hex
    }
  }
  return nearest
}
