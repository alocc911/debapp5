// electron/main.cjs
// Minimal Electron main process to package your Vite React debate map as a desktop app.
const { app, BrowserWindow, shell } = require('electron')
const path = require('path')

const isDev = !!process.env.VITE_DEV_SERVER_URL

function createWindow() {
  const win = new BrowserWindow({
    width: 1240,
    height: 800,
    webPreferences: {
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs')
    },
    show: false
  })

  win.once('ready-to-show', () => win.show())

  // Load Vite dev server in dev, else load built index.html
  const url = isDev
    ? process.env.VITE_DEV_SERVER_URL
    : 'file://' + path.join(__dirname, '..', 'dist', 'index.html')

  win.loadURL(url)

  if (isDev) {
    win.webContents.openDevTools({ mode: 'detach' })
  }

  // Security: open external links in default browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
}

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
