import { BrowserWindow, clipboard, ClipboardItem, globalShortcut, nativeImage, Notification, screen, type Display, type Rectangle } from 'electron'
import { spawn, type ChildProcess } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import ffmpegStatic from 'ffmpeg-static'
import type { CaptureMode, RecorderState, SelectionRequest } from '../shared/types'
import { concatArgs, concatList, evenRegion, recordArgs, screenshotArgs, type Region } from './ffmpeg-args'
import { addItem, getSettings, newFilePath } from './store'
import { createWindow, getMainWindow, iconPath, send } from './windows'

// In a packaged app the binary lives outside the asar archive (see "asarUnpack" in package.json).
export const ffmpegPath = String(ffmpegStatic).replace('app.asar', 'app.asar.unpacked')

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export function runFfmpeg(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn(ffmpegPath, args, { windowsHide: true })
    let err = ''
    p.stderr.on('data', (d) => (err = (err + d).slice(-4000)))
    p.on('error', reject)
    p.on('close', (code) => (code === 0 ? resolve(err) : reject(new Error(err.trim() || `ffmpeg saiu com código ${code}`))))
  })
}

/** Real file duration (ffmpeg -i always "fails" without an output, but prints Duration). */
export async function probeDurationMs(file: string): Promise<number | null> {
  const info = await runFfmpeg(['-hide_banner', '-i', file]).catch((e: Error) => e.message)
  const d = /Duration: (\d+):(\d+):([\d.]+)/.exec(info)
  return d ? Math.round(((+d[1] * 60 + +d[2]) * 60 + +d[3]) * 1000) : null
}

export function copyImageFile(file: string): Promise<void> {
  const png = new Uint8Array(nativeImage.createFromPath(file).toPNG())
  return clipboard.write([new ClipboardItem({ 'image/png': new Blob([png], { type: 'image/png' }) })])
}

let lastNotification: Notification | null = null
export function notify(title: string, body: string, onClick?: () => void): void {
  lastNotification = new Notification({ title, body, icon: iconPath, silent: true })
  if (onClick) lastNotification.on('click', onClick)
  lastNotification.show()
}

function openHistory(): void {
  const main = getMainWindow()
  if (!main) return
  main.show()
  main.focus()
  main.webContents.send('navigate', 'history')
}

// ---------------------------------------------------------------- selection overlay

let overlays: BrowserWindow[] = []
let restoreMain = false

function restoreMainWindow(): void {
  if (restoreMain) getMainWindow()?.show()
  restoreMain = false
}

function closeOverlays(): void {
  globalShortcut.unregister('Escape')
  for (const w of overlays) if (!w.isDestroyed()) w.destroy()
  overlays = []
}

export function startSelection(mode: CaptureMode): void {
  if (recording) return recording.stop() // the capture hotkey doubles as "stop" while recording
  if (overlays.length) return
  const main = getMainWindow()
  restoreMain = !!main && main.isVisible() && !main.isMinimized()
  main?.hide()

  const cursor = screen.getCursorScreenPoint()
  // One overlay per display: each one renders at its own DPI, which a single spanning window can't do.
  for (const d of screen.getAllDisplays()) {
    const win = createWindow(`overlay?display=${d.id}&scale=${d.scaleFactor}&mode=${mode}`, {
      ...d.bounds,
      frame: false,
      transparent: true,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      hasShadow: false,
      enableLargerThanScreen: true,
      alwaysOnTop: true
    })
    win.setAlwaysOnTop(true, 'screen-saver')
    win.once('ready-to-show', () => {
      win.setBounds(d.bounds) // re-apply: Electron can mis-scale bounds on mixed-DPI setups
      const b = d.bounds
      if (cursor.x >= b.x && cursor.x < b.x + b.width && cursor.y >= b.y && cursor.y < b.y + b.height) {
        win.show()
        win.focus()
      } else win.showInactive()
    })
    overlays.push(win)
  }
  // Global Esc in case Windows refuses to give the overlay keyboard focus.
  globalShortcut.register('Escape', cancelSelection)
}

export function cancelSelection(): void {
  if (!overlays.length) return
  closeOverlays()
  restoreMainWindow()
}

export async function handleSelection(req: SelectionRequest): Promise<void> {
  const d = screen.getAllDisplays().find((x) => x.id === req.displayId)
  const r = req.rect
  if (!d || !overlays.length || ![r.x, r.y, r.width, r.height, req.durationSec].every(Number.isFinite)) return
  // Clamp to the display (input comes from the renderer).
  const x = Math.max(0, Math.min(r.x, d.bounds.width))
  const y = Math.max(0, Math.min(r.y, d.bounds.height))
  const dip: Rectangle = {
    x: Math.round(d.bounds.x + x),
    y: Math.round(d.bounds.y + y),
    width: Math.round(Math.min(r.width, d.bounds.width - x)),
    height: Math.round(Math.min(r.height, d.bounds.height - y))
  }
  if (dip.width < 2 || dip.height < 2) return
  const phys = screen.dipToScreenRect(null, dip)

  closeOverlays()
  await sleep(150) // let the compositor repaint the desktop without the dimmed overlay
  try {
    if (req.action === 'screenshot') {
      await takeScreenshot(phys)
      restoreMainWindow()
    } else {
      startRecording(phys, dip, d, Math.max(0, Math.round(req.durationSec * 1000)))
    }
  } catch (e) {
    console.error('capture failed', phys, e)
    notify('Falha na captura', (e as Error).message.slice(0, 200))
    restoreMainWindow()
  }
}

async function takeScreenshot(region: Region): Promise<void> {
  const s = getSettings()
  const out = newFilePath('Screenshot', s.imageFormat)
  await runFfmpeg(screenshotArgs(region, out, s.imageFormat))
  if (s.copyToClipboard) await copyImageFile(out)
  addItem({
    id: randomUUID(),
    kind: 'image',
    path: out,
    createdAt: Date.now(),
    width: Math.round(region.width),
    height: Math.round(region.height),
    size: fs.statSync(out).size
  })
  send('history-changed')
  notify('Screenshot guardado', s.copyToClipboard ? 'Copiado para a área de transferência.' : path.basename(out), openHistory)
}

// ---------------------------------------------------------------- recording

let recording: Recording | null = null
export const isRecording = () => recording !== null

const BAR_W = 360
const BAR_H = 56

/** Places the control bar next to (not over) the recorded region. */
function barBounds(dip: Rectangle, d: Display): Rectangle {
  const wa = d.workArea
  const gap = 12
  const x = Math.round(Math.min(Math.max(dip.x + dip.width / 2 - BAR_W / 2, wa.x + 8), wa.x + wa.width - BAR_W - 8))
  let y = dip.y + dip.height + gap
  if (y + BAR_H > wa.y + wa.height) y = dip.y - BAR_H - gap
  if (y < wa.y) y = dip.y + dip.height - BAR_H - gap // no room outside: overlap (excluded from capture anyway)
  return { x, y: Math.round(y), width: BAR_W, height: BAR_H }
}

function startRecording(phys: Region, dip: Rectangle, d: Display, limitMs: number): void {
  const bar = createWindow('recorder', {
    ...barBounds(dip, d),
    frame: false,
    transparent: true,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    alwaysOnTop: true
  })
  bar.setAlwaysOnTop(true, 'screen-saver')
  bar.setContentProtection(true) // keeps the bar out of any capture, including ours
  bar.once('ready-to-show', () => bar.showInactive())

  const pauseKey = getSettings().shortcuts.pause
  const rec = new Recording(phys, limitMs || null, (state) => {
    if (!bar.isDestroyed()) bar.webContents.send('recorder-state', state)
  })
  recording = rec
  bar.webContents.on('did-finish-load', () => bar.webContents.send('recorder-state', rec.state()))
  try {
    if (pauseKey) globalShortcut.register(pauseKey, () => rec.toggle())
  } catch {
    /* invalid accelerator: the bar's own Space key still works */
  }

  rec.done.then(
    (item) => {
      if (item) {
        addItem(item)
        send('history-changed')
        notify('Gravação guardada', `${path.basename(item.path)} · ${(item.durationMs! / 1000).toFixed(1)} s`, openHistory)
      }
    },
    (e: Error) => notify('Falha na gravação', e.message.slice(-300))
  ).finally(() => {
    recording = null
    try {
      if (pauseKey) globalShortcut.unregister(pauseKey)
    } catch {
      /* ignore */
    }
    if (!bar.isDestroyed()) bar.destroy()
    restoreMainWindow()
  })
}

export const recorderToggle = () => recording?.toggle()
export const recorderStop = () => recording?.stop()
export const recorderCancel = () => recording?.cancel()
/** Resolves once the active recording (if any) has been saved. */
export const finishRecording = async () => {
  const r = recording
  if (!r) return
  r.stop()
  await r.done.catch(() => {})
}

/**
 * Pause/resume is implemented as separate ffmpeg segments (gdigrab can't pause),
 * joined at the end with the concat demuxer — no re-encode, so no quality loss.
 * Each segment gets `-t <remaining>` so the total length matches the chosen duration exactly.
 */
class Recording {
  private segs: string[] = []
  private proc: ChildProcess | null = null
  private status: RecorderState['status'] = 'starting'
  private elapsed = 0
  private since: number | null = null
  private wantPause = false
  private cancelled = false
  private readonly s = getSettings()
  private readonly ext = this.s.videoFormat
  private readonly tag = randomUUID().slice(0, 8)
  private resolve!: (v: import('../shared/types').HistoryItem | null) => void
  private reject!: (e: Error) => void
  readonly done = new Promise<import('../shared/types').HistoryItem | null>((res, rej) => {
    this.resolve = res
    this.reject = rej
  })

  constructor(
    private region: Region,
    private limitMs: number | null,
    private onState: (s: RecorderState) => void
  ) {
    this.startSegment()
  }

  state(): RecorderState {
    return { status: this.status, elapsedMs: this.elapsed, since: this.since, limitMs: this.limitMs }
  }

  private emit(status: RecorderState['status']): void {
    this.status = status
    this.onState(this.state())
  }

  private startSegment(): void {
    const remainingMs = this.limitMs === null ? null : this.limitMs - this.elapsed
    if (remainingMs !== null && remainingMs <= 50) return void this.finalize()
    const seg = path.join(this.s.saveFolder, `.smartcapture-${this.tag}-${this.segs.length}.${this.ext}`)
    fs.mkdirSync(this.s.saveFolder, { recursive: true })
    const args = recordArgs({
      region: this.region,
      fps: this.s.fps,
      format: this.ext,
      quality: this.s.quality,
      audioDevice: this.s.audioEnabled && this.s.audioDevice ? this.s.audioDevice : null,
      durationSec: remainingMs === null ? null : remainingMs / 1000,
      out: seg
    })
    const p = spawn(ffmpegPath, args, { windowsHide: true, stdio: ['pipe', 'ignore', 'pipe'] })
    this.proc = p
    this.emit('starting')
    let err = ''
    p.stderr!.on('data', (d: Buffer) => {
      err = (err + d).slice(-4000)
      // ffmpeg prints this right as it enters the capture loop: start the clock here, not at spawn.
      if (this.since === null && err.includes('Press [q]')) {
        this.since = Date.now()
        this.emit('recording')
      }
    })
    p.on('error', (e) => this.fail(e))
    p.on('close', (code) => {
      this.proc = null
      if (this.since !== null) this.elapsed += Date.now() - this.since
      this.since = null
      if (this.cancelled) return
      const ok = fs.existsSync(seg) && fs.statSync(seg).size > 0
      if (ok) this.segs.push(seg)
      else if (code !== 0) return this.fail(new Error(lastLines(err)))
      if (this.wantPause) this.emit('paused')
      else void this.finalize() // stopped by user, or `-t` reached → auto-save
    })
  }

  toggle(): void {
    if (this.status === 'recording') {
      this.wantPause = true
      this.proc?.stdin?.write('q')
    } else if (this.status === 'paused') {
      this.wantPause = false
      this.startSegment()
    }
  }

  stop(): void {
    if (this.status === 'paused') return void this.finalize()
    this.wantPause = false
    if (this.proc) this.proc.stdin?.write('q')
  }

  cancel(): void {
    this.cancelled = true
    this.proc?.kill()
    setTimeout(() => this.cleanup(), 500) // give ffmpeg time to release the file handle
    this.resolve(null)
  }

  private async finalize(): Promise<void> {
    if (this.status === 'saving') return
    this.emit('saving')
    try {
      if (!this.segs.length) throw new Error('Nenhum frame foi gravado.')
      const out = newFilePath('Gravação', this.ext)
      if (this.segs.length === 1) fs.renameSync(this.segs[0], out)
      else {
        const list = path.join(this.s.saveFolder, `.smartcapture-${this.tag}.txt`)
        fs.writeFileSync(list, concatList(this.segs))
        await runFfmpeg(concatArgs(list, out, this.ext))
      }
      this.cleanup()
      const r = evenRegion(this.region)
      this.resolve({
        id: randomUUID(),
        kind: 'video',
        path: out,
        createdAt: Date.now(),
        width: r.width,
        height: r.height,
        durationMs: (await probeDurationMs(out)) ?? this.elapsed,
        size: fs.statSync(out).size
      })
    } catch (e) {
      this.fail(e as Error)
    }
  }

  private fail(e: Error): void {
    this.proc?.kill()
    this.cleanup()
    this.reject(e)
  }

  private cleanup(): void {
    for (const f of fs.readdirSync(this.s.saveFolder)) {
      if (f.startsWith(`.smartcapture-${this.tag}`)) fs.rmSync(path.join(this.s.saveFolder, f), { force: true })
    }
  }
}

function lastLines(s: string): string {
  return s.trim().split(/\r?\n/).slice(-3).join('\n') || 'ffmpeg terminou com erro.'
}
