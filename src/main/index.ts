import { app, clipboard, dialog, globalShortcut, ipcMain, Menu, nativeImage, nativeTheme, protocol, shell, Tray } from 'electron'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { Readable } from 'node:stream'
import type { CaptureMode, Settings } from '../shared/types'
import {
  cancelSelection, copyImageFile, dragGifPath, finishRecording, prepareDragGif, removeDragGif, handleSelection, isRecording, probeDurationMs, recorderCancel, recorderStop,
  recorderToggle, runFfmpeg, startSelection
} from './capture'
import { parseDshowAudio, trimArgs } from './ffmpeg-args'
import { addItem, getItem, getSettings, listHistory, removeItem, updateItem, updateSettings } from './store'
import { checkForUpdates, getUpdateState, initUpdater, installUpdate, skipStartupUpdate, startupUpdate } from './updater'
import { createWindow, getMainWindow, iconPath, send, setMainWindow } from './windows'

if (!app.requestSingleInstanceLock()) app.quit()
app.setAppUserModelId('com.smartcapture.app')

protocol.registerSchemesAsPrivileged([
  { scheme: 'media', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }
])

let tray: Tray | null = null
let quitting = false
let shortcutErrors: string[] = []

const THEME = {
  light: { color: '#f3f3f3', symbolColor: '#1a1a1a' },
  dark: { color: '#202020', symbolColor: '#ffffff' }
}
const titleBarColors = () => THEME[nativeTheme.shouldUseDarkColors ? 'dark' : 'light']

function updateTitleBar(): void {
  const main = getMainWindow()
  if (main) {
    main.setTitleBarOverlay({ ...titleBarColors(), height: 40 })
    main.setBackgroundColor(titleBarColors().color)
  }
}

function registerShortcuts(): string[] {
  globalShortcut.unregisterAll()
  const errors: string[] = []
  const { capture, record } = getSettings().shortcuts
  const reg = (acc: string, fn: () => void) => {
    if (!acc) return
    let ok = false
    try {
      ok = globalShortcut.register(acc, fn)
    } catch {
      /* invalid accelerator */
    }
    if (!ok) errors.push(acc)
  }
  reg(capture, () => startSelection('choose'))
  reg(record, () => startSelection('record'))
  return errors
}

function createMainWindow(): void {
  const main = createWindow('main', {
    width: 1040,
    height: 720,
    minWidth: 760,
    minHeight: 540,
    title: 'Smart Capture',
    titleBarStyle: 'hidden',
    titleBarOverlay: { ...titleBarColors(), height: 40 },
    backgroundColor: titleBarColors().color
  })
  setMainWindow(main)
  main.once('ready-to-show', () => {
    if (!process.argv.includes('--hidden')) main.show()
  })
  // Closing hides to the tray so global shortcuts keep working.
  main.on('close', (e) => {
    if (!quitting) {
      e.preventDefault()
      main.hide()
    }
  })
}

function showMain(): void {
  const main = getMainWindow()
  if (!main) return
  if (main.isMinimized()) main.restore()
  main.show()
  main.focus()
}

function createTray(): void {
  tray = new Tray(nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 }))
  tray.setToolTip('Smart Capture')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Nova captura', click: () => startSelection('choose') },
      { label: 'Screenshot', click: () => startSelection('screenshot') },
      { label: 'Gravar região', click: () => startSelection('record') },
      { type: 'separator' },
      { label: 'Abrir Smart Capture', click: showMain },
      { label: 'Sair', click: () => app.quit() }
    ])
  )
  tray.on('click', showMain)
}

/** Serves history files to the renderer (only files that are in the history), with Range support for video seeking. */
function registerMediaProtocol(): void {
  protocol.handle('media', async (req) => {
    const id = new URL(req.url).hostname
    const item = getItem(id)
    if (!item || !fs.existsSync(item.path)) return new Response('Not found', { status: 404 })
    const size = fs.statSync(item.path).size
    const type = { '.png': 'image/png', '.jpg': 'image/jpeg', '.mp4': 'video/mp4', '.webm': 'video/webm' }[
      path.extname(item.path).toLowerCase()
    ] ?? 'application/octet-stream'
    const m = /bytes=(\d*)-(\d*)/.exec(req.headers.get('range') ?? '')
    if (!m) {
      const body = Readable.toWeb(fs.createReadStream(item.path)) as ReadableStream
      return new Response(body, { headers: { 'Content-Type': type, 'Content-Length': String(size), 'Accept-Ranges': 'bytes' } })
    }
    const start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]))
    const end = m[1] && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1
    if (start > end || start >= size) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } })
    const body = Readable.toWeb(fs.createReadStream(item.path, { start, end })) as ReadableStream
    return new Response(body, {
      status: 206,
      headers: {
        'Content-Type': type,
        'Content-Length': String(end - start + 1),
        'Content-Range': `bytes ${start}-${end}/${size}`,
        'Accept-Ranges': 'bytes'
      }
    })
  })
}

function itemOrThrow(id: string) {
  const item = getItem(String(id))
  if (!item) throw new Error('Captura não encontrada.')
  return item
}

function registerIpc(): void {
  const result = () => ({ settings: getSettings(), shortcutErrors })
  ipcMain.handle('getSettings', result)
  ipcMain.handle('setSettings', (_e, patch: Partial<Settings>) => {
    const prev = getSettings()
    const next = updateSettings(patch ?? {})
    if (next.theme !== prev.theme) nativeTheme.themeSource = next.theme
    if (next.shortcuts !== prev.shortcuts) shortcutErrors = registerShortcuts()
    send('settings-changed')
    return result()
  })
  ipcMain.handle('suspendShortcuts', (_e, suspend: boolean) => {
    if (suspend) globalShortcut.unregisterAll()
    else shortcutErrors = registerShortcuts()
  })
  ipcMain.handle('chooseFolder', async () => {
    const win = getMainWindow()!
    const r = await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'], defaultPath: getSettings().saveFolder })
    return r.canceled ? null : r.filePaths[0]
  })
  ipcMain.handle('openFolder', () => {
    fs.mkdirSync(getSettings().saveFolder, { recursive: true })
    return shell.openPath(getSettings().saveFolder)
  })
  ipcMain.handle('listAudioDevices', async () => {
    // ffmpeg exits non-zero for the dummy input; the device list is in stderr either way.
    const out = await runFfmpeg(['-hide_banner', '-list_devices', 'true', '-f', 'dshow', '-i', 'dummy']).catch((e: Error) => e.message)
    return parseDshowAudio(out)
  })
  ipcMain.handle('startCapture', (_e, mode: CaptureMode) => {
    if (['choose', 'screenshot', 'record'].includes(mode)) startSelection(mode)
  })
  ipcMain.handle('selectRegion', (_e, req) => handleSelection(req))
  ipcMain.handle('cancelCapture', () => cancelSelection())
  ipcMain.handle('listHistory', () => listHistory())
  ipcMain.handle('openItem', (_e, id) => shell.openPath(itemOrThrow(id).path))
  ipcMain.handle('showItem', (_e, id) => shell.showItemInFolder(itemOrThrow(id).path))
  ipcMain.handle('copyItem', (_e, id) => {
    const item = itemOrThrow(id)
    return item.kind === 'image' ? copyImageFile(item.path) : clipboard.writeText(item.path)
  })
  ipcMain.handle('saveItemAs', async (_e, id) => {
    const item = itemOrThrow(id)
    const ext = path.extname(item.path).slice(1)
    const r = await dialog.showSaveDialog(getMainWindow()!, {
      defaultPath: path.basename(item.path),
      filters: [{ name: ext.toUpperCase(), extensions: [ext] }]
    })
    if (!r.canceled && r.filePath) await fs.promises.copyFile(item.path, r.filePath)
  })
  // Native OS file drag (Word, Explorer, Teams…). Must use `on`/send: it has to run while the drag gesture is live.
  // Videos are dragged as their looping GIF (Word autoplays GIFs inline, not local MP4s); Alt drags the original.
  ipcMain.on('startDrag', (e, id, original: unknown) => {
    const item = getItem(String(id))
    if (!item || !fs.existsSync(item.path)) return
    const gif = item.kind === 'video' && !original ? dragGifPath(item) : null
    const file = gif && fs.existsSync(gif) ? gif : item.path
    if (gif && file !== gif) void prepareDragGif(item) // not ready yet: this drag is the MP4, the next one the GIF
    const preview = item.kind === 'image' ? nativeImage.createFromPath(item.path) : nativeImage.createFromPath(iconPath)
    e.sender.startDrag({ file, icon: preview.isEmpty() ? iconPath : preview.resize({ width: item.kind === 'image' ? 160 : 64 }) })
  })
  ipcMain.handle('prepareDrag', (_e, id) => {
    const item = getItem(String(id))
    return item ? prepareDragGif(item) : undefined
  })
  ipcMain.handle('renameItem', async (_e, id, name: unknown) => {
    const item = itemOrThrow(id)
    const ext = path.extname(item.path)
    const base = String(name ?? '').trim().replace(new RegExp(`\\${ext}$`, 'i'), '').trim()
    if (!base || base.length > 200 || /[<>:"/\\|?*\x00-\x1f]/.test(base) || /[. ]$/.test(base)) {
      throw new Error('Nome inválido. Não uses < > : " / \\ | ? * nem termines com ponto.')
    }
    const target = path.join(path.dirname(item.path), base + ext)
    if (target === item.path) return
    // Case-only renames (a.png → A.png) hit the same file on Windows; that's fine.
    if (fs.existsSync(target) && target.toLowerCase() !== item.path.toLowerCase()) {
      throw new Error('Já existe um ficheiro com esse nome.')
    }
    await fs.promises.rename(item.path, target)
    updateItem(item.id, { path: target })
    send('history-changed')
  })
  ipcMain.handle('trimItem', async (_e, id, start: unknown, end: unknown) => {
    const item = itemOrThrow(id)
    const s = Number(start)
    const t = Number(end)
    if (item.kind !== 'video' || !Number.isFinite(s) || !Number.isFinite(t) || s < 0 || t - s < 0.1) {
      throw new Error('Intervalo inválido.')
    }
    const ext = path.extname(item.path)
    const format = ext.toLowerCase() === '.webm' ? 'webm' : 'mp4'
    const stem = path.join(path.dirname(item.path), path.basename(item.path, ext) + ' (aparado)')
    let out = stem + ext
    for (let i = 2; fs.existsSync(out); i++) out = `${stem} ${i}${ext}`
    await runFfmpeg(trimArgs(item.path, s, t, out, format, getSettings().quality))
    addItem({
      ...item,
      id: randomUUID(),
      path: out,
      createdAt: Date.now(),
      durationMs: (await probeDurationMs(out)) ?? Math.round((t - s) * 1000),
      size: fs.statSync(out).size
    })
    send('history-changed')
  })
  ipcMain.handle('deleteItem', async (_e, id) => {
    const item = itemOrThrow(id)
    await shell.trashItem(item.path).catch(() => fs.promises.rm(item.path, { force: true }))
    removeItem(item.id)
    removeDragGif(item.id)
    send('history-changed')
  })
  ipcMain.handle('getUpdateState', () => getUpdateState())
  ipcMain.handle('checkForUpdates', () => checkForUpdates())
  ipcMain.handle('installUpdate', () => installUpdate())
  ipcMain.handle('skipStartupUpdate', () => skipStartupUpdate())
  ipcMain.handle('recorderToggle', () => recorderToggle())
  ipcMain.handle('recorderStop', () => recorderStop())
  ipcMain.handle('recorderCancel', () => recorderCancel())
}

app.on('second-instance', showMain)

app.whenReady().then(async () => {
  registerMediaProtocol()
  registerIpc()
  nativeTheme.themeSource = getSettings().theme
  nativeTheme.on('updated', updateTitleBar)
  initUpdater()
  await startupUpdate() // check (and install) updates before the app opens
  createMainWindow()
  createTray()
  shortcutErrors = registerShortcuts()
})

app.on('before-quit', (e) => {
  quitting = true
  // Never lose an in-progress recording on quit: save it first.
  if (isRecording()) {
    e.preventDefault()
    void finishRecording().then(() => app.quit())
  }
})

app.on('will-quit', () => globalShortcut.unregisterAll())
// Keep running in the tray when all windows are closed/hidden.
app.on('window-all-closed', () => {})
