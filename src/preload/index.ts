import { contextBridge, ipcRenderer } from 'electron'
import type { Api } from '../shared/types'

const invoke = (channel: string) => (...args: unknown[]) => ipcRenderer.invoke(channel, ...args)

const methods = [
  'getSettings', 'setSettings', 'suspendShortcuts', 'chooseFolder', 'openFolder', 'listAudioDevices', 'startCapture',
  'selectRegion', 'cancelCapture', 'listHistory', 'openItem', 'showItem', 'copyItem', 'saveItemAs', 'deleteItem', 'renameItem', 'trimItem',
  'recorderToggle', 'recorderStop', 'recorderCancel', 'getUpdateState', 'checkForUpdates', 'installUpdate'
] as const

const api = Object.fromEntries(methods.map((m) => [m, invoke(m)])) as unknown as Api
api.startDrag = (id) => ipcRenderer.send('startDrag', id)
api.on = (channel, cb) => {
  const listener = (_e: unknown, data: unknown) => cb(data)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

contextBridge.exposeInMainWorld('api', api)
