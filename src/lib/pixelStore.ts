// key = "x,y", value = hex color string (e.g. '#1a1a1a')
const _pixels = new Map<string, string>()

const key = (x: number, y: number) => `${x},${y}`

export function getPixel(x: number, y: number): string | undefined {
  return _pixels.get(key(x, y))
}

export function setPixel(x: number, y: number, color: string): void {
  _pixels.set(key(x, y), color)
}

export function deletePixel(x: number, y: number): void {
  _pixels.delete(key(x, y))
}

export function getAllUserPixels(): Map<string, string> {
  return _pixels
}
