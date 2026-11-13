export type CaptureMode = 'choose' | 'screenshot' | 'record'
export type CaptureAction = 'screenshot' | 'record'

export interface Shortcuts {
  capture: string
  record: string
  pause: string
}

export interface Settings {
  saveFolder: string
  imageFormat: 'png' | 'jpg'
  videoFormat: 'mp4' | 'webm'
  quality: 'high' | 'medium' | 'low'
  fps: 30 | 60
  /** seconds; 0 = no limit */
  defaultDuration: number
  audioEnabled: boolean
  /** DirectShow audio device name (microphone or "Stereo Mix" for system audio) */
  audioDevice: string
  copyToClipboard: boolean
  /** show a small "name this capture" prompt right after each save */
  askName: boolean
  theme: 'system' | 'light' | 'dark'
  shortcuts: Shortcuts
}

export interface HistoryItem {
  id: string
  kind: 'image' | 'video'
  path: string
  createdAt: number
  width: number
  height: number
  durationMs?: number
  size: number
}

/** Rect in DIP, relative to the display's top-left corner. */
export interface SelectionRect {
  x: number
  y: number
  width: number
  height: number
}

export interface SelectionRequest {
  displayId: number
  rect: SelectionRect
  action: CaptureAction
  durationSec: number
}

export interface RecorderState {
  status: 'starting' | 'recording' | 'paused' | 'saving'
  /** ms recorded in finished segments */
  elapsedMs: number
  /** epoch ms when the current segment started capturing, null when not capturing */
  since: number | null
  limitMs: number | null
}

export interface UpdateState {
  status: 'unsupported' | 'idle' | 'checking' | 'latest' | 'available' | 'downloading' | 'ready' | 'installing' | 'error'
  /** installed version */
  version: string
  /** newest version on GitHub, once known */
  latest?: string
  percent?: number
  error?: string
}

export interface SettingsResult {
  settings: Settings
  shortcutErrors: string[]
}

export interface Api {
  getSettings(): Promise<SettingsResult>
  setSettings(patch: Partial<Settings>): Promise<SettingsResult>
  suspendShortcuts(suspend: boolean): Promise<void>
  chooseFolder(): Promise<string | null>
  openFolder(): Promise<void>
  listAudioDevices(): Promise<string[]>
  startCapture(mode: CaptureMode): Promise<void>
  selectRegion(req: SelectionRequest): Promise<void>
  cancelCapture(): Promise<void>
  listHistory(): Promise<HistoryItem[]>
  openItem(id: string): Promise<void>
  showItem(id: string): Promise<void>
  copyItem(id: string): Promise<void>
  saveItemAs(id: string): Promise<void>
  deleteItem(id: string): Promise<void>
  /** Starts a native file drag; videos go as a looping GIF unless `original` (Alt held). Call from dragstart. */
  startDrag(id: string, original?: boolean): void
  /** Pre-builds a video's drag GIF (call on hover) so the drag itself is instant. */
  prepareDrag(id: string): Promise<void>
  /** New base name, without extension. Rejects with a user-facing message. */
  renameItem(id: string, name: string): Promise<void>
  /** Saves [startSec, endSec] of a video as a new file next to the original. */
  trimItem(id: string, startSec: number, endSec: number): Promise<void>
  getUpdateState(): Promise<UpdateState>
  checkForUpdates(): Promise<void>
  /** Downloads the new version, then installs it silently and restarts the app. */
  installUpdate(): Promise<void>
  recorderToggle(): Promise<void>
  recorderStop(): Promise<void>
  recorderCancel(): Promise<void>
  /** Launch splash "Saltar": open the app now, keep downloading in the background. */
  skipStartupUpdate(): Promise<void>
  on(channel: 'history-changed' | 'settings-changed' | 'navigate' | 'recorder-state' | 'update-state', cb: (data: any) => void): () => void
}
