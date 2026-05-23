// =====================================================================
// VIBEDOWNLOADER - RENDERER LOGIC
// Handles all UI interactions, DOM updates, and IPC bridge communication
// =====================================================================

// --- STATE VARIABLES ---
let pendingUrl = '';             // Holds a URL temporarily if a decryption key is missing
let downloadQueue = [];          // Master array holding all active and pending downloads
let currentTreeData = null;      // Holds parsed folder object while tree modal is open
let currentEditingId = null;     // Tracks if the tree modal is editing an existing item
let globalSavePath = '';         // User's default save path from Settings

// --- UTILITIES ---
const formatBytes = (bytes) => (bytes / (1024 * 1024)).toFixed(2) + ' MB';
const formatSpeed = (bytes) => (bytes / (1024 * 1024)).toFixed(2) + ' MB/s';

// --- DOM ELEMENTS ---
// Inputs & Core Panels
const linkInput = document.getElementById('link-input');
const addBtn = document.getElementById('add-btn');
const queueContainer = document.getElementById('queue-container');
const completedContainer = document.getElementById('completed-container');
const startQueueBtn = document.getElementById('start-queue-btn');

// Missing Key Modal
const keyModal = document.getElementById('key-modal');
const keyInput = document.getElementById('key-input');
const submitKeyBtn = document.getElementById('submit-key-btn');
const cancelKeyBtn = document.getElementById('cancel-key-btn');

// Folder Tree Modal
const treeModal = document.getElementById('tree-modal');
const treeContainer = document.getElementById('tree-container');
const confirmTreeBtn = document.getElementById('confirm-tree-btn');
const cancelTreeBtn = document.getElementById('cancel-tree-btn');
const treeTitle = document.getElementById('tree-title');

// Batch Links Modal
const batchBtn = document.getElementById('batch-btn');
const batchModal = document.getElementById('batch-modal');
const batchInput = document.getElementById('batch-input');
const submitBatchBtn = document.getElementById('submit-batch-btn');
const cancelBatchBtn = document.getElementById('cancel-batch-btn');

// Sidebar Tabs & Settings
const tabLinks = document.querySelectorAll('.tab-link');
const viewPanels = document.querySelectorAll('.view-panel');
const globalSavePathInput = document.getElementById('global-save-path');
const setGlobalPathBtn = document.getElementById('set-global-path-btn');
const clearGlobalPathBtn = document.getElementById('clear-global-path-btn');


// =====================================================================
// NAVIGATION & SETTINGS LOGIC
// =====================================================================

// Handle Sidebar Tab Switching
tabLinks.forEach(link => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    // Reset active classes
    tabLinks.forEach(t => t.classList.remove('active'));
    viewPanels.forEach(p => p.classList.remove('active'));
    
    // Set clicked tab and target panel to active
    link.classList.add('active');
    const targetId = link.getAttribute('data-target');
    document.getElementById(targetId).classList.add('active');
  });
});

// Set Global Path via IPC dialog
setGlobalPathBtn.addEventListener('click', async () => {
  const path = await window.megaAPI.selectDirectory();
  if (path) {
    globalSavePath = path;
    globalSavePathInput.value = path;
  }
});

// Clear Global Path
clearGlobalPathBtn.addEventListener('click', () => {
  globalSavePath = '';
  globalSavePathInput.value = '';
});

// Helper function to resolve where to save files
async function getDirectory() {
  if (globalSavePath) return globalSavePath;
  return await window.megaAPI.selectDirectory(); // Ask user if global is not set
}


// =====================================================================
// BATCH MODAL LOGIC
// =====================================================================

batchBtn.addEventListener('click', () => {
  batchModal.classList.add('active');
  batchInput.focus();
});

cancelBatchBtn.addEventListener('click', () => {
  batchModal.classList.remove('active');
  batchInput.value = '';
});

submitBatchBtn.addEventListener('click', async () => {
  const links = batchInput.value.split('\n').map(l => l.trim()).filter(l => l);
  batchModal.classList.remove('active');
  batchInput.value = '';

  if (links.length > 0 && !globalSavePath) {
    alert("Pro-tip: For batch adding, set a 'Global Save Directory' in Settings first, otherwise you'll be asked where to save every single item!");
  }

  // Process sequentially to avoid overlapping prompts
  for (const link of links) {
    await processUrl(link);
  }
});


// =====================================================================
// CORE LINK PROCESSING & MISSING KEYS
// =====================================================================

addBtn.addEventListener('click', () => {
  const url = linkInput.value.trim();
  if (url) processUrl(url);
});

// Missing Key Flow
submitKeyBtn.addEventListener('click', () => {
  const key = keyInput.value.trim();
  keyModal.classList.remove('active');
  if (key) processUrl(pendingUrl, key);
  keyInput.value = ''; 
});
cancelKeyBtn.addEventListener('click', () => { 
  keyModal.classList.remove('active'); 
  pendingUrl = ''; 
  keyInput.value = ''; 
});

async function processUrl(url, key = null) {
  const result = await window.megaAPI.processLink(url, key);
  
  if (result.error === 'missing_key') {
    pendingUrl = url; 
    keyModal.classList.add('active'); 
    return;
  }
  if (result.error === 'unavailable') {
    alert("Link is dead or invalid."); 
    return;
  }

  const safeId = btoa(url).replace(/[^a-zA-Z0-9]/g, ''); 
  result.safeId = safeId;

  if (result.type === 'file') {
    // Single file logic
    const savePath = await getDirectory();
    if (!savePath) return; // User cancelled
    
    createQueueUI(result, savePath, safeId, "File");
    downloadQueue.push({ fileData: result, savePath, status: 'pending', id: safeId });
    linkInput.value = '';

  } else if (result.type === 'folder') {
    // Folder logic - Open tree modal first
    currentTreeData = result;
    currentEditingId = null; 
    treeTitle.innerText = `Folder: ${result.name}`;
    renderTree(result.children, treeContainer, []);
    treeModal.classList.add('active');
  }
}


// =====================================================================
// FOLDER TREE VIEW LOGIC
// =====================================================================

function renderTree(children, container, existingSelections = []) {
  container.innerHTML = ''; 
  
  children.forEach(item => {
    if (item.type === 'folder') {
      const details = document.createElement('details');
      details.open = true; 
      
      const summary = document.createElement('summary');
      summary.innerHTML = `<input type="checkbox" class="tree-cb folder-cb"> <span>${item.name}</span>`;
      details.appendChild(summary);
      
      const subContainer = document.createElement('div');
      renderTree(item.children, subContainer, existingSelections);
      details.appendChild(subContainer);
      container.appendChild(details);

      // Wire parent checkbox to toggle all its children
      const folderCb = summary.querySelector('.folder-cb');
      folderCb.addEventListener('change', (e) => {
        const childCbs = subContainer.querySelectorAll('.tree-cb');
        childCbs.forEach(cb => cb.checked = e.target.checked);
      });

    } else {
      const div = document.createElement('div');
      div.className = 'tree-file';
      const isChecked = existingSelections.some(f => f.path === item.path) ? 'checked' : '';
      div.innerHTML = `<input type="checkbox" class="tree-cb file-cb" data-path="${item.path}" data-size="${item.size}" ${isChecked}> 
                       <span style="flex-grow: 1;">${item.name}</span> 
                       <small>${formatBytes(item.size)}</small>`;
      container.appendChild(div);
    }
  });
}

confirmTreeBtn.addEventListener('click', async () => {
  // Extract all checked files
  const checkboxes = document.querySelectorAll('.file-cb:checked');
  const selectedFiles = Array.from(checkboxes).map(cb => ({
    path: cb.getAttribute('data-path'),
    size: parseInt(cb.getAttribute('data-size'))
  }));

  if (selectedFiles.length === 0) {
    alert("You didn't select any files!"); return;
  }

  currentTreeData.selectedFiles = selectedFiles;
  const totalSize = selectedFiles.reduce((acc, f) => acc + f.size, 0);
  currentTreeData.size = totalSize; 

  treeModal.classList.remove('active');

  // If editing an existing item, just update memory and text
  if (currentEditingId) {
    const queueItem = downloadQueue.find(i => i.id === currentEditingId);
    queueItem.fileData = currentTreeData;
    document.getElementById(`size-${currentEditingId}`).innerHTML = `${selectedFiles.length} items <br><small style="color:#888">${formatBytes(totalSize)}</small>`;
    return;
  }

  // New folder - get directory and add to queue
  const savePath = await getDirectory();
  if (!savePath) return;

  createQueueUI(currentTreeData, savePath, currentTreeData.safeId, `${selectedFiles.length} items`);
  downloadQueue.push({ fileData: currentTreeData, savePath, status: 'pending', id: currentTreeData.safeId });
  linkInput.value = '';
});

cancelTreeBtn.addEventListener('click', () => { 
  treeModal.classList.remove('active'); 
});


// =====================================================================
// QUEUE BUILDER & DOWNLOAD CONTROLS
// =====================================================================

function createQueueUI(result, savePath, safeId, itemContext) {
  const queueDiv = document.createElement('div');
  queueDiv.className = 'queue-item';
  queueDiv.id = `queue-${safeId}`;
  
  const detailsBtnHtml = result.type === 'folder' ? 
    `<button id="details-btn-${safeId}" class="btn-secondary btn-small">Edit</button>` : '';

  queueDiv.innerHTML = `
    <div class="item-info">
      <strong class="truncate" title="${result.name}">${result.name}</strong>
      <small class="truncate" title="${savePath}" style="color: var(--text-muted);">${savePath}</small>
    </div>
    <div id="size-${safeId}" style="font-size: 14px;">${itemContext} <br><small style="color:#888">${formatBytes(result.size)}</small></div>
    <div id="speed-${safeId}" style="font-size: 14px;">
      Pending... <span id="percent-${safeId}" style="color: var(--accent);"></span>
    </div>
    <div id="actions-${safeId}" style="display: flex; gap: 8px; justify-content: flex-end;">
      ${detailsBtnHtml}
      <button id="pause-${safeId}" class="btn-secondary btn-small" style="display: none;">Pause</button>
      <button id="remove-${safeId}" class="btn-danger btn-small">X</button>
    </div>
    <div class="progress-bar" id="prog-bar-container-${safeId}"><div class="progress-fill" id="bar-${safeId}"></div></div>
  `;
  
  queueContainer.appendChild(queueDiv);

  // Wire up "Edit" button for folders
  if (result.type === 'folder') {
    document.getElementById(`details-btn-${safeId}`).addEventListener('click', () => {
      const queueItem = downloadQueue.find(i => i.id === safeId);
      currentTreeData = queueItem.fileData;
      currentEditingId = safeId;
      treeTitle.innerText = `Edit: ${result.name}`;
      renderTree(currentTreeData.children, treeContainer, currentTreeData.selectedFiles);
      treeModal.classList.add('active');
    });
  }

  // Wire up the Remove / Kill Button
  document.getElementById(`remove-${safeId}`).addEventListener('click', () => {
    const idx = downloadQueue.findIndex(i => i.id === safeId);
    if (idx !== -1) {
      const item = downloadQueue[idx];
      // Send kill signal to Node if it's currently downloading or paused
      if (item.status === 'downloading' || item.status === 'paused') {
        window.megaAPI.cancelDownload(safeId);
      }
      downloadQueue.splice(idx, 1); 
    }
    queueDiv.remove(); // Nuke from UI
  });
}

// Start All Pending Items
startQueueBtn.addEventListener('click', () => {
  downloadQueue.forEach(item => {
    if (item.status === 'pending') {
      item.status = 'downloading';
      
      // Update UI state
      const detailsBtn = document.getElementById(`details-btn-${item.id}`);
      if (detailsBtn) detailsBtn.style.display = 'none'; // Lock editing once started
      
      const pauseBtn = document.getElementById(`pause-${item.id}`);
      pauseBtn.style.display = 'inline-block';
      document.getElementById(`bar-${item.id}`).classList.add('active-pulse'); // Start glowing
      
      // Tell Node to start streaming
      window.megaAPI.startDownload(item.fileData, item.savePath);
      
      // Wire up Pause/Resume toggle
      pauseBtn.addEventListener('click', () => {
        if (item.status === 'downloading') {
          window.megaAPI.pauseDownload(item.id);
          item.status = 'paused'; 
          pauseBtn.innerText = 'Resume'; 
          pauseBtn.style.background = '#444';
          document.getElementById(`speed-${item.id}`).innerText = "Paused";
          document.getElementById(`bar-${item.id}`).classList.remove('active-pulse'); // Stop glowing
        } else if (item.status === 'paused') {
          window.megaAPI.resumeDownload(item.id);
          item.status = 'downloading'; 
          pauseBtn.innerText = 'Pause'; 
          pauseBtn.style.background = '';
          document.getElementById(`bar-${item.id}`).classList.add('active-pulse'); // Resume glowing
        }
      });
    }
  });
});


// =====================================================================
// IPC STREAM LISTENERS (Data flowing from Node.js)
// =====================================================================

// Progress Updates
window.megaAPI.onProgress((data) => {
  const percentEl = document.getElementById(`percent-${data.id}`);
  if (percentEl) percentEl.innerText = `(${data.percent}%)`;
  
  const speedEl = document.getElementById(`speed-${data.id}`);
  if (speedEl) speedEl.innerText = formatSpeed(data.speed);
  
  const barEl = document.getElementById(`bar-${data.id}`);
  if (barEl) barEl.style.width = `${data.percent}%`;
});

// Download Complete Router
window.megaAPI.onComplete((safeId) => {
  const queueItem = downloadQueue.find(item => item.id === safeId);
  if (queueItem) queueItem.status = 'completed';

  const uiElement = document.getElementById(`queue-${safeId}`);
  if (uiElement) {
    // 1. Move DOM node to the Completed View
    completedContainer.appendChild(uiElement);
    
    // 2. Visual Cleanup
    const progContainer = document.getElementById(`prog-bar-container-${safeId}`);
    if (progContainer) progContainer.style.display = 'none'; // Hide the bar track entirely
    
    document.getElementById(`speed-${safeId}`).innerHTML = '<span style="color:#00ff88;">✓ Completed</span>';
    uiElement.style.borderLeftColor = '#00ff88'; // Turn accent edge green
    
    // 3. Button Cleanup (Remove Pause/Edit, keep Remove button to clear history)
    const actionsDiv = document.getElementById(`actions-${safeId}`);
    const removeBtn = document.getElementById(`remove-${safeId}`);
    if (actionsDiv && removeBtn) {
      actionsDiv.innerHTML = ''; 
      actionsDiv.appendChild(removeBtn); 
    }
  }
});