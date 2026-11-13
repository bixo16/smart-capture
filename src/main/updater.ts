import { app } from 'electron'
import { autoUpdater } from 'electron-updater'
import type { UpdateState } from '../shared/types'
import { finishRecording } from './capture'
import { send } from './windows'

// Updates come from GitHub Releases ("publish" in package.json): latest.yml + the NSIS installer, sha512-verified.
let state: UpdateState = { status: app.isPackaged ? 'idle' : 'unsupported', version: app.getVersion() }

function set(patch: Partial<UpdateState>): void {
  state = { ...state, ...patch }
  send('update-state', state)
}

export const getUpdateState = () => state

export function initUpdater(): void {
  if (!app.isPackaged) return // dev builds have no installer to update
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false
  autoUpdater.on('checking-for-update', () => set({ status: 'checking', error: undefined }))
  autoUpdater.on('update-available', (info) => set({ status: 'available', latest: info.version }))
  autoUpdater.on('update-not-available', () => set({ status: 'latest' }))
  autoUpdater.on('download-progress', (p) => set({ status: 'downloading', percent: Math.round(p.percent) }))
  autoUpdater.on('update-downloaded', async () => {
    set({ status: 'installing' })
    await finishRecording() // never lose an in-progress recording to the restart
    autoUpdater.quitAndInstall(true, true) // silent install, then relaunch
  })
  autoUpdater.on('error', (e) => set({ status: 'error', error: e?.message ?? String(e) }))
  checkForUpdates()
  setInterval(checkForUpdates, 6 * 60 * 60 * 1000)
}

export function checkForUpdates(): void {
  if (!app.isPackaged || state.status === 'downloading' || state.status === 'installing') return
  autoUpdater.checkForUpdates().catch(() => {}) // failures arrive via the 'error' event
}

export function installUpdate(): void {
  if (!app.isPackaged || !state.latest || state.status === 'downloading' || state.status === 'installing') return
  set({ status: 'downloading', percent: 0, error: undefined })
  autoUpdater.downloadUpdate().catch(() => {})
}
