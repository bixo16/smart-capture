import { app, type BrowserWindow } from 'electron'
import { autoUpdater } from 'electron-updater'
import { spawn } from 'node:child_process'
import type { UpdateState } from '../shared/types'
import { finishRecording, notify } from './capture'
import { createWindow, send } from './windows'

// Updates come from GitHub Releases ("publish" in package.json): latest.yml + the NSIS installer, sha512-verified.
let state: UpdateState = { status: app.isPackaged ? 'idle' : 'unsupported', version: app.getVersion() }
/** Set while the launch splash is up: a finished download installs right away instead of waiting for a click. */
let finishStartup: (() => void) | null = null

function set(patch: Partial<UpdateState>): void {
  state = { ...state, ...patch }
  send('update-state', state)
}

export const getUpdateState = () => state

export function initUpdater(): void {
  if (!app.isPackaged) return // dev builds have no installer to update
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = false
  autoUpdater.on('checking-for-update', () => set({ status: 'checking', error: undefined }))
  autoUpdater.on('update-available', (info) => set({ status: 'downloading', latest: info.version, percent: 0 }))
  autoUpdater.on('update-not-available', () => set({ status: 'latest' }))
  autoUpdater.on('download-progress', (p) => set({ status: 'downloading', percent: Math.round(p.percent) }))
  autoUpdater.on('update-downloaded', (info) => {
    if (finishStartup) return void installNow()
    set({ status: 'ready', latest: info.version })
    notify('Atualização pronta', `A versão ${info.version} está pronta. Clica aqui ou no botão da barra lateral para reiniciar e atualizar.`, installUpdate)
  })
  autoUpdater.on('error', (e) => set({ status: 'error', error: e?.message ?? String(e) }))
  setInterval(checkForUpdates, 6 * 60 * 60 * 1000)
}

export function checkForUpdates(): void {
  if (!app.isPackaged || ['checking', 'downloading', 'ready', 'installing'].includes(state.status)) return
  autoUpdater.checkForUpdates().catch(() => {}) // failures arrive via the 'error' event
}

async function installNow(): Promise<void> {
  set({ status: 'installing' })
  await finishRecording() // never lose an in-progress recording to the restart
  relaunchAfterInstaller()
  autoUpdater.quitAndInstall(true, true) // silent install, then relaunch
}

/**
 * NSIS `--force-run` does not relaunch when the update replaces an existing install (seen on Windows 11),
 * so a hidden helper waits for the installer (and the old uninstaller it spawns) to exit, then starts the app.
 * If NSIS relaunches too, the single-instance lock drops the duplicate.
 */
function relaunchAfterInstaller(): void {
  const exe = process.execPath.replace(/'/g, "''")
  spawn('powershell.exe', ['-NoProfile', '-WindowStyle', 'Hidden', '-Command',
    `Start-Sleep 3; Wait-Process -Name 'SmartCapture-Setup','old-uninstaller' -ErrorAction SilentlyContinue; Start-Process -FilePath '${exe}'`],
  { detached: true, stdio: 'ignore', windowsHide: true }).unref()
}

/** Button/notification action: restart into a downloaded update, or retry a failed/pending download. */
export function installUpdate(): void {
  if (!app.isPackaged) return
  if (state.status === 'ready') void installNow()
  else if (state.status === 'error' || state.status === 'available') {
    set({ status: 'downloading', percent: 0, error: undefined })
    autoUpdater.checkForUpdates().catch(() => {}) // autoDownload restarts the download
  }
}

/** Skip button on the splash: open the app now, keep downloading in the background. */
export const skipStartupUpdate = () => finishStartup?.()

/**
 * Launch gate: shows a small splash, checks GitHub and, if there is a new version, downloads and installs it
 * before the app opens. Resolves when the app should open normally (no update, offline, error, or skipped).
 */
export function startupUpdate(): Promise<void> {
  if (!app.isPackaged) return Promise.resolve()
  return new Promise((resolve) => {
    const splash: BrowserWindow = createWindow('splash', {
      width: 380,
      height: 150,
      frame: false,
      transparent: true,
      resizable: false,
      maximizable: false,
      fullscreenable: false,
      center: true,
      hasShadow: false,
      alwaysOnTop: true,
      title: 'Smart Capture'
    })
    splash.once('ready-to-show', () => splash.show())
    // Never block launch on a slow/offline check; once a download starts the user sees progress and can skip.
    const timeout = setTimeout(() => finishStartup?.(), 8000)
    const onAvailable = () => clearTimeout(timeout)
    const finish = () => {
      clearTimeout(timeout)
      autoUpdater.off('update-available', onAvailable)
      autoUpdater.off('update-not-available', finish)
      autoUpdater.off('error', finish)
      finishStartup = null
      if (!splash.isDestroyed()) splash.destroy()
      resolve()
    }
    finishStartup = finish
    autoUpdater.on('update-available', onAvailable)
    autoUpdater.on('update-not-available', finish)
    autoUpdater.on('error', finish)
    checkForUpdates()
  })
}
