import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import type { HistoryItem, Settings } from '../shared/types'

const dataDir = app.getPath('userData')

function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(path.join(dataDir, file), 'utf8'))
  } catch {
    return fallback
  }
}

// Write-then-rename so a crash mid-write never corrupts the history file.
function writeJson(file: string, data: unknown): void {
  const p = path.join(dataDir, file)
  fs.mkdirSync(dataDir, { recursive: true })
  fs.writeFileSync(p + '.tmp', JSON.stringify(data, null, 2))
  fs.renameSync(p + '.tmp', p)
}

export const defaultSettings: Settings = {
  saveFolder: path.join(app.getPath('pictures'), 'Smart Capture'),
  imageFormat: 'png',
  videoFormat: 'mp4',
  quality: 'high',
  fps: 30,
  defaultDuration: 30,
  audioEnabled: false,
  audioDevice: '',
  copyToClipboard: true,
  theme: 'system',
  // Win+Shift+S is reserved by Windows for its own Snipping Tool, so the default avoids it.
  shortcuts: { capture: 'Alt+Shift+S', record: 'Ctrl+Alt+R', pause: 'Alt+Shift+P' }
}

const saved = readJson<Partial<Settings>>('settings.json', {})
let settings: Settings = {
  ...defaultSettings,
  ...saved,
  shortcuts: { ...defaultSettings.shortcuts, ...saved.shortcuts }
}

export function getSettings(): Settings {
  return settings
}

const allowed: { [K in keyof Settings]?: (v: any) => boolean } = {
  saveFolder: (v) => typeof v === 'string' && path.isAbsolute(v),
  imageFormat: (v) => v === 'png' || v === 'jpg',
  videoFormat: (v) => v === 'mp4' || v === 'webm',
  quality: (v) => ['high', 'medium', 'low'].includes(v),
  fps: (v) => v === 30 || v === 60,
  defaultDuration: (v) => Number.isInteger(v) && v >= 0 && v <= 24 * 3600,
  audioEnabled: (v) => typeof v === 'boolean',
  audioDevice: (v) => typeof v === 'string',
  copyToClipboard: (v) => typeof v === 'boolean',
  theme: (v) => ['system', 'light', 'dark'].includes(v),
  shortcuts: (v) => v && ['capture', 'record', 'pause'].every((k) => typeof v[k] === 'string')
}

export function updateSettings(patch: Partial<Settings>): Settings {
  const next: any = { ...settings }
  for (const [k, v] of Object.entries(patch)) {
    const check = allowed[k as keyof Settings]
    if (check?.(v)) next[k] = v
  }
  settings = next
  writeJson('settings.json', settings)
  return settings
}

let history: HistoryItem[] = readJson<HistoryItem[]>('history.json', [])

/** Drops entries whose file was deleted outside the app. */
export function listHistory(): HistoryItem[] {
  const before = history.length
  history = history.filter((h) => fs.existsSync(h.path))
  if (history.length !== before) writeJson('history.json', history)
  return history
}

export function getItem(id: string): HistoryItem | undefined {
  return history.find((h) => h.id === id)
}

export function addItem(item: HistoryItem): void {
  history = [item, ...history]
  writeJson('history.json', history)
}

export function removeItem(id: string): void {
  history = history.filter((h) => h.id !== id)
  writeJson('history.json', history)
}

/** "Screenshot 2026-11-13 15-30-12.png", suffixed if it already exists. */
export function newFilePath(prefix: string, ext: string): string {
  const folder = settings.saveFolder
  fs.mkdirSync(folder, { recursive: true })
  const d = new Date()
  const p2 = (n: number) => String(n).padStart(2, '0')
  const base = `${prefix} ${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}-${p2(d.getMinutes())}-${p2(d.getSeconds())}`
  let file = path.join(folder, `${base}.${ext}`)
  for (let i = 2; fs.existsSync(file); i++) file = path.join(folder, `${base} (${i}).${ext}`)
  return file
}
