// electron/preload.cjs
// Keeping this minimal: no Node.js APIs are exposed by default.
const { contextBridge } = require('electron')
contextBridge.exposeInMainWorld('__app', { version: '1.0.0' })
