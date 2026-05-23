const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('megaAPI', {
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  processLink: (url, key) => ipcRenderer.invoke('process-link', url, key),
  startDownload: (fileData, savePath) => ipcRenderer.send('start-download', fileData, savePath),
  pauseDownload: (id) => ipcRenderer.send('pause-download', id),
  resumeDownload: (id) => ipcRenderer.send('resume-download', id),
  cancelDownload: (id) => ipcRenderer.send('cancel-download', id), // NEW KILL SWITCH
  onProgress: (callback) => ipcRenderer.on('download-progress', (_event, data) => callback(data)),
  onComplete: (callback) => ipcRenderer.on('download-complete', (_event, id) => callback(id)),
  onInterceptedLink: (callback) => ipcRenderer.on('intercepted-link', (_event, url) => callback(url))
});