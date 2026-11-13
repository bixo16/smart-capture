import { app, BrowserWindow, type BrowserWindowConstructorOptions } from 'electron'
import path from 'node:path'

export const iconPath = path.join(app.getAppPath(), 'resources', 'icon.png')

export function createWindow(route: string, opts: BrowserWindowConstructorOptions): BrowserWindow {
  const win = new BrowserWindow({
    show: false,
    icon: iconPath,
    ...opts,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      backgroundThrottling: false
    }
  })
  // Links never open inside the app.
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(`${process.env.ELECTRON_RENDERER_URL}#${route}`)
  else win.loadFile(path.join(__dirname, '../renderer/index.html'), { hash: route })
  return win
}

let mainWindow: BrowserWindow | null = null
export const getMainWindow = () => mainWindow
export const setMainWindow = (w: BrowserWindow | null) => (mainWindow = w)

export function send(channel: string, data?: unknown): void {
  for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send(channel, data)
}
