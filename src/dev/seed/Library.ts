// Asset library backed by localStorage. See SPRINT-13.md Step 5.

import type { ConvertOptions } from './Converter'

export const STORAGE_KEY = 'dev-seed-library'

export interface SavedAsset {
  id: string
  name: string
  width: number
  height: number
  pixels: Array<{ x: number; y: number; color: string }>
  source: string         // 'file:foo.png', 'url:https://…', 'text:Hello'
  settings: ConvertOptions
  createdAt: number
}

function uuid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

export function newAssetId(): string {
  return uuid()
}

export function loadLibrary(): SavedAsset[] {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as SavedAsset[]) : []
  } catch {
    return []
  }
}

export function saveLibrary(library: SavedAsset[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(library))
}

export function addAsset(asset: SavedAsset): SavedAsset[] {
  const library = loadLibrary()
  library.push(asset)
  saveLibrary(library)
  return library
}

export function deleteAsset(id: string): SavedAsset[] {
  const library = loadLibrary().filter(a => a.id !== id)
  saveLibrary(library)
  return library
}

export function exportLibrary(): string {
  return JSON.stringify(loadLibrary(), null, 2)
}

export function importLibrary(json: string): boolean {
  try {
    const parsed = JSON.parse(json)
    if (!Array.isArray(parsed)) return false
    saveLibrary(parsed)
    return true
  } catch {
    return false
  }
}

export function downloadLibraryFile(filename = 'dev-seed-library.json'): void {
  const blob = new Blob([exportLibrary()], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
