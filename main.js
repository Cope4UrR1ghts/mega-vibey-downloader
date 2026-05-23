const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { File } = require('megajs');
const fse = require('fs-extra'); 

let mainWindow;
const activeDownloads = new Map();

process.on('uncaughtException', (err) => console.log('[Global Error Shield]:', err.message));
process.on('unhandledRejection', (reason) => console.log('[Global Error Shield]:', reason));

app.on('ready', () => {
  mainWindow = new BrowserWindow({
    width: 1100, height: 750,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true },
    titleBarStyle: 'hiddenInset'
  });
  mainWindow.loadFile('index.html');
});

ipcMain.handle('select-directory', async () => {
  const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] });
  return result.filePaths ? result.filePaths[0] : null;
});

// Helper: Recursively map Mega folder structure into a frontend-friendly object
function buildTreeMap(node, currentPath = '') {
  if (!node.children) return [];
  return node.children.map(c => {
    const itemPath = currentPath ? `${currentPath}/${c.name}` : c.name;
    // THE FIX: megajs uses .directory, not .isDirectory
    if (c.directory) {
      return { name: c.name, type: 'folder', path: itemPath, children: buildTreeMap(c, itemPath) };
    } else {
      return { name: c.name, type: 'file', path: itemPath, size: c.size || 0 };
    }
  });
}

ipcMain.handle('process-link', async (event, url, key = null) => {
  try {
    let cleanUrl = url.split('#')[0];
    const fullUrl = key ? `${cleanUrl}#${key}` : url;
    
    const file = File.fromURL(fullUrl);
    await file.loadAttributes();

    // THE FIX: megajs uses .directory
    if (file.directory) {
      return { 
        type: 'folder', name: file.name, url: fullUrl, 
        children: buildTreeMap(file) 
      };
    } else {
      return { type: 'file', name: file.name, size: file.size, url: fullUrl };
    }
  } catch (err) {
    const errorMsg = err.message ? err.message.toLowerCase() : '';
    if (errorMsg.includes('key') || errorMsg.includes('decrypt') || errorMsg.includes('mac verification') || errorMsg.includes('no hash')) { 
      return { error: 'missing_key', url: url };
    }
    return { error: 'unavailable', details: errorMsg };
  }
});

// Stream Manager
ipcMain.on('start-download', async (event, fileData, savePath) => {
  
  if (fileData.type === 'file') {
    const file = File.fromURL(fileData.url);
    const dest = path.join(savePath, fileData.name);
    startStream(file, dest, fileData.size, fileData.safeId, event);
  } 
  
  else if (fileData.type === 'folder') {
    const rootFile = File.fromURL(fileData.url);
    await rootFile.loadAttributes();

    const totalSelectedSize = fileData.selectedFiles.reduce((acc, f) => acc + f.size, 0);
    let totalDownloadedPrevious = 0; 

    // BATCH LOOP
    for (const target of fileData.selectedFiles) {
      const parts = target.path.split('/');
      let currentNode = rootFile;
      for (const part of parts) {
        if (currentNode.children) currentNode = currentNode.children.find(c => c.name === part);
      }
      
      if (!currentNode) continue; 
      const dest = path.join(savePath, target.path);
      await fse.ensureDir(path.dirname(dest));

      await new Promise((resolve) => {
        const stream = currentNode.download();
        const writeStream = fse.createWriteStream(dest);
        
        let lastTime = Date.now();
        let lastDownloaded = 0;

        activeDownloads.set(fileData.safeId, { stream, writeStream });

        stream.pipe(writeStream);

        stream.on('progress', (stats) => {
          const now = Date.now();
          const timeDiff = (now - lastTime) / 1000;
          if (timeDiff >= 1 || stats.bytesLoaded === 0) {
            const speed = timeDiff > 0 ? (stats.bytesLoaded - lastDownloaded) / timeDiff : 0;
            const overallBytes = totalDownloadedPrevious + stats.bytesLoaded;
            
            event.sender.send('download-progress', {
              id: fileData.safeId, percent: ((overallBytes / totalSelectedSize) * 100).toFixed(1),
              downloaded: overallBytes, total: totalSelectedSize, speed: speed
            });

            lastTime = now; lastDownloaded = stats.bytesLoaded;
          }
        });

        writeStream.on('finish', () => {
          totalDownloadedPrevious += currentNode.size;
          resolve();
        });
        
        // Catch stream destruction from cancel button cleanly
        stream.on('error', () => resolve()); 
      });

      // If user clicked remove, the stream is destroyed and removed from map. Break the loop.
      if (!activeDownloads.has(fileData.safeId)) break; 
    }

    // Only send complete if it wasn't cancelled
    if (activeDownloads.has(fileData.safeId)) {
      activeDownloads.delete(fileData.safeId);
      event.sender.send('download-progress', { id: fileData.safeId, percent: 100.0, downloaded: totalSelectedSize, total: totalSelectedSize, speed: 0 });
      event.sender.send('download-complete', fileData.safeId);
    }
  }
});

function startStream(fileNode, destPath, totalSize, safeId, event) {
  const stream = fileNode.download();
  const writeStream = fse.createWriteStream(destPath);
  let lastTime = Date.now(); let lastDownloaded = 0;
  
  activeDownloads.set(safeId, { stream, writeStream });
  stream.pipe(writeStream);

  stream.on('progress', (stats) => {
    const now = Date.now(); const timeDiff = (now - lastTime) / 1000;
    if (timeDiff >= 1 || stats.bytesLoaded === 0) {
      const speed = timeDiff > 0 ? (stats.bytesLoaded - lastDownloaded) / timeDiff : 0;
      event.sender.send('download-progress', { id: safeId, percent: ((stats.bytesLoaded / totalSize) * 100).toFixed(1), downloaded: stats.bytesLoaded, total: totalSize, speed: speed });
      lastTime = now; lastDownloaded = stats.bytesLoaded;
    }
  });

  writeStream.on('finish', () => {
    activeDownloads.delete(safeId);
    event.sender.send('download-progress', { id: safeId, percent: 100.0, downloaded: totalSize, total: totalSize, speed: 0 });
    event.sender.send('download-complete', safeId);
  });
  
  stream.on('error', () => {}); // Catch cancel destruction
}

ipcMain.on('pause-download', (event, id) => {
  const dl = activeDownloads.get(id);
  if (dl) { dl.stream.unpipe(dl.writeStream); dl.stream.pause(); }
});

ipcMain.on('resume-download', (event, id) => {
  const dl = activeDownloads.get(id);
  if (dl) { dl.stream.pipe(dl.writeStream); dl.stream.resume(); }
});

// NEW KILL SWITCH
ipcMain.on('cancel-download', (event, id) => {
  const dl = activeDownloads.get(id);
  if (dl) {
    dl.stream.unpipe();
    dl.stream.destroy();
    dl.writeStream.destroy();
    activeDownloads.delete(id); // Deleting it here breaks the folder loop
  }
});