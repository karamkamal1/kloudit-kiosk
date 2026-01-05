const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const os = require('os'); 

let mainWindow;

// --- STORAGE PATHS ---
const USER_DATA = app.getPath('userData');
const CONFIG_PATH = path.join(USER_DATA, 'config.json');
const UPLOAD_DIR = path.join(USER_DATA, 'screensaver');

if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// --- DEFAULT CONFIG ---
const DEFAULT_CONFIG = {
    JELLYFIN_URL: "",
    JELLYFIN_API_KEY: "",
    JELLYSEER_URL: "",
    JELLYSEER_API_KEY: "",
    ANDROID_TV_ID: "",
    ACCENT_COLOR: "#8a2be2",
    BG_THEME: "black",
    ENABLE_REQUESTS: true,
    ENABLE_LIVETV: true,
    ENABLE_SCREENSAVER: true,
    SCREENSAVER_TIMEOUT: 2,
    SCREENSAVER_ORDER: [],
    LIVETV_TABS: [{ id: 'main', name: 'Live TV', type: 'dynamic', channels: [] }],
    TERMS_ACCEPTED: false
};

// --- CONFIG MANAGER ---
function loadConfig() {
    try {
        if (fs.existsSync(CONFIG_PATH)) {
            const loaded = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
            return { ...DEFAULT_CONFIG, ...loaded };
        }
    } catch (e) { console.error("Config Load Error:", e); }
    return DEFAULT_CONFIG;
}

function saveConfig(newSettings) {
    try {
        const current = loadConfig();
        const merged = { ...current, ...newSettings };
        
        if (current.TERMS_ACCEPTED) merged.TERMS_ACCEPTED = true;
        if (merged.SCREENSAVER_TIMEOUT) merged.SCREENSAVER_TIMEOUT = parseInt(merged.SCREENSAVER_TIMEOUT);

        fs.writeFileSync(CONFIG_PATH, JSON.stringify(merged, null, 2));
        if (mainWindow) mainWindow.webContents.send('config-updated', merged);
    } catch (e) { console.error("Write Error:", e); }
}

function getLocalIp() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) return iface.address;
        }
    }
    return "127.0.0.1";
}

// --- EXPRESS SERVER ---
const server = express();
const upload = multer({ dest: UPLOAD_DIR });

server.use(cors()); 
server.use(express.json());
server.use('/photos', express.static(UPLOAD_DIR));

server.get('/api/ip', (req, res) => { res.json({ ip: getLocalIp() }); });
server.get('/api/settings', (req, res) => res.json(loadConfig()));

server.post('/api/settings', (req, res) => {
    saveConfig(req.body);
    res.sendStatus(200);
});

server.post('/api/reload', (req, res) => {
    if (mainWindow) mainWindow.reload();
    res.sendStatus(200);
});

// --- NEW: DEVICE SCANNER API ---
server.get('/api/scan', async (req, res) => {
    const config = loadConfig();
    if (!config.JELLYFIN_URL || !config.JELLYFIN_API_KEY) {
        return res.status(400).json({ error: "Jellyfin Config Missing" });
    }

    try {
        // Clean URL
        const cleanUrl = config.JELLYFIN_URL.endsWith('/') ? config.JELLYFIN_URL.slice(0, -1) : config.JELLYFIN_URL;
        
        const response = await fetch(`${cleanUrl}/Sessions`, {
            headers: { 
                'X-Emby-Token': config.JELLYFIN_API_KEY,
                'X-Emby-Authorization': `MediaBrowser Client="KloudIT Admin", Device="Server", DeviceId="admin-01", Version="1.0.0"`
            }
        });

        if (!response.ok) throw new Error("Jellyfin connection failed");

        const sessions = await response.json();
        
        // Filter and Map
        const devices = sessions.map(s => ({
            name: s.DeviceName || "Unknown Device",
            id: s.DeviceId,
            app: s.Client,
            isControllable: s.SupportsRemoteControl
        }));

        res.json(devices);
    } catch (e) {
        console.error("Scan Error:", e);
        res.status(500).json({ error: e.message });
    }
});

// Photo Management
server.get('/api/photos', (req, res) => {
    const files = fs.readdirSync(UPLOAD_DIR);
    const config = loadConfig();
    let order = config.SCREENSAVER_ORDER || [];
    order = order.filter(f => files.includes(f));
    files.forEach(f => { if (!order.includes(f)) order.push(f); });
    
    if (JSON.stringify(order) !== JSON.stringify(config.SCREENSAVER_ORDER)) {
        saveConfig({ SCREENSAVER_ORDER: order });
    }
    res.json(order);
});

server.post('/api/photos/reorder', (req, res) => {
    const { order } = req.body;
    if (Array.isArray(order)) {
        saveConfig({ SCREENSAVER_ORDER: order });
        res.sendStatus(200);
    } else { res.sendStatus(400); }
});

server.post('/api/upload', upload.single('photo'), (req, res) => {
    const files = fs.readdirSync(UPLOAD_DIR);
    if (files.length >= 10) { 
        if(req.file) fs.unlinkSync(req.file.path);
        return res.send('<script>alert("Max 10 photos! Delete some first."); window.location="/";</script>');
    }
    const ext = path.extname(req.file.originalname) || '.jpg';
    const filename = Date.now() + ext;
    fs.renameSync(req.file.path, path.join(UPLOAD_DIR, filename));
    
    const config = loadConfig();
    const order = config.SCREENSAVER_ORDER || [];
    order.push(filename);
    saveConfig({ SCREENSAVER_ORDER: order });

    res.redirect('/');
});

server.delete('/api/photos/:name', (req, res) => {
    try {
        const name = req.params.name;
        fs.unlinkSync(path.join(UPLOAD_DIR, name));
        const config = loadConfig();
        const order = (config.SCREENSAVER_ORDER || []).filter(f => f !== name);
        saveConfig({ SCREENSAVER_ORDER: order });
        res.sendStatus(200);
    } catch(e) { res.sendStatus(500); }
});

// DASHBOARD UI
server.get('/', (req, res) => {
    const config = loadConfig();
    // Safety: Escape JSON for script injection
    const safeConfig = JSON.stringify(config).replace(/</g, '\\u003c');
    
    res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <title>KloudIT Admin</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <script src="https://cdn.jsdelivr.net/npm/sortablejs@latest/Sortable.min.js"></script>
        <style>
            :root { --accent: ${config.ACCENT_COLOR}; --bg: #141414; --card: #222; --text: #eee; }
            body { background: var(--bg); color: var(--text); font-family: -apple-system, sans-serif; margin: 0; padding: 20px; }
            .container { max-width: 600px; margin: 0 auto; }
            h1 { color: var(--accent); text-align: center; }
            .card { background: var(--card); padding: 25px; border-radius: 16px; margin-bottom: 20px; box-shadow: 0 4px 20px rgba(0,0,0,0.3); }
            h2 { margin-top: 0; border-bottom: 1px solid #333; padding-bottom: 10px; font-size: 1.2rem; }
            .input-group { margin-bottom: 15px; }
            label { display: block; font-size: 0.9rem; color: #aaa; margin-bottom: 5px; font-weight: bold; }
            input[type="text"], input[type="color"], input[type="number"] { width: 100%; padding: 12px; background: #111; border: 1px solid #444; color: white; border-radius: 8px; box-sizing: border-box; font-family: monospace; }
            input:focus { border-color: var(--accent); outline: none; }
            .btn { width: 100%; padding: 15px; background: var(--accent); border: none; color: white; font-weight: bold; border-radius: 8px; font-size: 1rem; cursor: pointer; margin-top: 10px; transition: transform 0.1s; }
            .btn:active { transform: scale(0.98); }
            .btn.secondary { background: #444; }
            .btn.small { padding: 8px 15px; font-size: 0.9rem; width: auto; margin-top: 0; }
            
            /* DEVICE LIST STYLES */
            .scan-row { display: flex; gap: 10px; align-items: center; }
            .device-list { margin-top: 10px; max-height: 200px; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; }
            .device-item { 
                background: #333; padding: 12px; border-radius: 8px; cursor: pointer; 
                display: flex; justify-content: space-between; align-items: center;
                border: 1px solid transparent; transition: all 0.2s;
            }
            .device-item:hover { background: #444; border-color: var(--accent); }
            .device-info { display: flex; flex-direction: column; }
            .device-name { font-weight: bold; color: white; }
            .device-app { font-size: 0.8rem; color: #aaa; }
            .status-dot { width: 10px; height: 10px; border-radius: 50%; background: #e74c3c; box-shadow: 0 0 5px #e74c3c; }
            .status-dot.online { background: #2ecc71; box-shadow: 0 0 5px #2ecc71; }

            .photo-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 15px; }
            .photo-item { position: relative; aspect-ratio: 16/9; cursor: grab; }
            .photo-item img { width: 100%; height: 100%; object-fit: cover; border-radius: 6px; }
            .delete-x { position: absolute; top: -5px; right: -5px; background: #e74c3c; color: white; border-radius: 50%; width: 24px; height: 24px; text-align: center; line-height: 24px; cursor: pointer; font-weight: bold; box-shadow: 0 2px 5px black; border: 2px solid white; }
            .switch-row { display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-bottom: 1px solid #333; }
            input[type="checkbox"] { transform: scale(1.5); accent-color: var(--accent); }
            p.hint { font-size: 0.8rem; color: #777; text-align: center; margin-top: 5px; }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>KloudIT Kiosk</h1>
            <div class="card"><button class="btn secondary" onclick="fetch('/api/reload', {method:'POST'})">Reload Kiosk Screen</button></div>
            <form id="settingsForm">
                <div class="card">
                    <h2>Connection</h2>
                    <div class="input-group"><label>Jellyfin URL</label><input type="text" name="JELLYFIN_URL" value="${config.JELLYFIN_URL}"></div>
                    <div class="input-group"><label>Jellyfin API Key</label><input type="text" name="JELLYFIN_API_KEY" value="${config.JELLYFIN_API_KEY}"></div>
                    <div class="input-group"><label>Jellyseerr URL</label><input type="text" name="JELLYSEER_URL" value="${config.JELLYSEER_URL}"></div>
                    <div class="input-group"><label>Jellyseerr API Key</label><input type="text" name="JELLYSEER_API_KEY" value="${config.JELLYSEER_API_KEY}"></div>
                    
                    <div class="input-group">
                        <label>Target Device</label>
                        <div class="scan-row">
                            <input type="text" id="targetId" name="ANDROID_TV_ID" value="${config.ANDROID_TV_ID}" style="margin:0">
                            <button type="button" class="btn small" onclick="scanDevices()">Scan</button>
                        </div>
                        <div id="deviceList" class="device-list"></div>
                    </div>
                </div>
                <div class="card">
                    <h2>Customization</h2>
                    <div class="input-group"><label>Accent Color</label><input type="color" name="ACCENT_COLOR" value="${config.ACCENT_COLOR}" style="height:50px"></div>
                    <div class="switch-row"><span>Enable Requests</span><input type="checkbox" name="ENABLE_REQUESTS" ${config.ENABLE_REQUESTS ? 'checked' : ''}></div>
                    <div class="switch-row"><span>Enable Live TV</span><input type="checkbox" name="ENABLE_LIVETV" ${config.ENABLE_LIVETV ? 'checked' : ''}></div>
                    <div class="switch-row"><span>Enable Screensaver</span><input type="checkbox" name="ENABLE_SCREENSAVER" ${config.ENABLE_SCREENSAVER ? 'checked' : ''}></div>
                    <div class="input-group" style="margin-top:10px"><label>Screensaver Timeout (Minutes)</label><input type="number" name="SCREENSAVER_TIMEOUT" value="${config.SCREENSAVER_TIMEOUT || 2}" min="1"></div>
                    <button type="button" class="btn" onclick="saveSettings()">Save & Apply</button>
                </div>
            </form>
            <div class="card">
                <h2>Screensaver Photos</h2>
                <form action="/api/upload" method="post" enctype="multipart/form-data">
                    <input type="file" name="photo" accept="image/*" required style="color: #aaa">
                    <button type="submit" class="btn secondary">Upload Photo</button>
                </form>
                <div id="grid" class="photo-grid"></div>
                <p class="hint">Drag and drop to reorder</p>
            </div>
        </div>
        <script>
            async function scanDevices() {
                const list = document.getElementById('deviceList');
                list.innerHTML = '<div style="color:#aaa; text-align:center; padding:10px;">Scanning...</div>';
                
                try {
                    const res = await fetch('/api/scan');
                    const devices = await res.json();
                    
                    if(devices.error) {
                        list.innerHTML = '<div style="color:red; text-align:center;">'+devices.error+'</div>';
                        return;
                    }

                    if(devices.length === 0) {
                        list.innerHTML = '<div style="color:#aaa; text-align:center;">No devices found</div>';
                        return;
                    }

                    list.innerHTML = devices.map(d => \`
                        <div class="device-item" onclick="selectDevice('\${d.id}')">
                            <div class="device-info">
                                <span class="device-name">\${d.name}</span>
                                <span class="device-app">\${d.app}</span>
                            </div>
                            <div class="status-dot \${d.isControllable ? 'online' : ''}"></div>
                        </div>
                    \`).join('');
                } catch(e) {
                    list.innerHTML = '<div style="color:red; text-align:center;">Scan Failed</div>';
                }
            }

            function selectDevice(id) {
                document.getElementById('targetId').value = id;
                document.getElementById('deviceList').innerHTML = ''; // Clear list
            }

            async function saveSettings() {
                const form = document.getElementById('settingsForm');
                const data = ${safeConfig};
                new FormData(form).forEach((value, key) => data[key] = value);
                data.ENABLE_REQUESTS = form.querySelector('[name=ENABLE_REQUESTS]').checked;
                data.ENABLE_LIVETV = form.querySelector('[name=ENABLE_LIVETV]').checked;
                data.ENABLE_SCREENSAVER = form.querySelector('[name=ENABLE_SCREENSAVER]').checked;
                
                await fetch('/api/settings', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data) });
                alert('Saved!'); fetch('/api/reload', {method:'POST'});
            }
            async function loadPhotos() {
                const res = await fetch('/api/photos');
                const photos = await res.json();
                const grid = document.getElementById('grid');
                grid.innerHTML = photos.map(p => 
                    '<div class="photo-item" data-id="'+p+'"><img src="/photos/'+p+'"><div class="delete-x" onclick="delPhoto(\\''+p+'\\')">×</div></div>'
                ).join('');
                new Sortable(grid, {
                    animation: 150,
                    onEnd: async function () {
                        const newOrder = Array.from(grid.children).map(item => item.getAttribute('data-id'));
                        await fetch('/api/photos/reorder', {
                            method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ order: newOrder })
                        });
                    }
                });
            }
            async function delPhoto(name) { if(confirm('Delete?')) { await fetch('/api/photos/'+name, {method:'DELETE'}); loadPhotos(); } }
            loadPhotos();
        </script>
    </body>
    </html>
    `);
});

const serverPort = 3000;
const serverInstance = server.listen(serverPort, '0.0.0.0', () => console.log(`Server running on port ${serverPort}`));

// Handle Port Conflicts Gracefully
serverInstance.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`Port ${serverPort} is busy. Admin UI might fail.`);
    } else {
        console.error(err);
    }
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280, 
    height: 720, 
    kiosk: true, 
    webPreferences: { 
        nodeIntegration: false, // SECURITY FIX
        contextIsolation: true, // CRITICAL FIX FOR CRASH
        webSecurity: false,
        preload: path.join(__dirname, 'preload.js') // Ensure this file exists!
    },
  });
  
  // Wait for Vite build or dev server
  const distIndex = path.join(__dirname, 'dist', 'index.html');
  if (fs.existsSync(distIndex)) {
      mainWindow.loadFile(distIndex);
  } else {
      // Fallback for dev mode (if you run 'npm start' without building first)
      console.log("Dist not found, loading localhost:5173");
      mainWindow.loadURL('http://localhost:5173');
  }

  if (app.isPackaged) autoUpdater.checkForUpdatesAndNotify();
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
