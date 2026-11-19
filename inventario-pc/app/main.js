// Inventario de bodega — versión 1.2.0, conectada a AS SYSTEMS.
// La ventana principal verifica la licencia en AS SYSTEMS y abre el inventario en la nube (el mismo de la web, el APK y los demás PC).
// El inventario anterior de este equipo (archivo local y carpeta compartida) se conserva y se abre desde Archivo → Inventario anterior.
const { app, BrowserWindow, ipcMain, dialog, shell, Menu, session } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Rutas (las variables INV_* solo se usan en pruebas)
app.commandLine.appendSwitch('lang', 'es');
if (process.env.INV_USERDATA) app.setPath('userData', process.env.INV_USERDATA);
const UD = app.getPath('userData');
const CFG_PATH = path.join(UD, 'config.json');
const LOCAL_PATH = path.join(UD, 'inventario.json');
const BACKUP_DIR = path.join(UD, 'copias');
const SUBDIR = 'InventarioAraucana_datos';
const PREFIX = 'inventario_';
const NUBE = 'https://glp-adg.github.io/as-systems/';
// Programa anterior (1.0/1.1): el actualizador lo conserva intacto como anterior.asar
const ANTERIOR = path.join(process.resourcesPath, 'anterior.asar', 'app');

let win = null;
let winAnt = null;
let cfg = { pcId: '', dataDir: '', preguntado: false };
let lastPushed = null;
let lastSig = null;

const readText = p => { try { return fs.readFileSync(p, 'utf8'); } catch (e) { return null; } };
function writeAtomic(p, text) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = p + '.tmp';
  fs.writeFileSync(tmp, text, 'utf8');
  try { fs.renameSync(tmp, p); }
  catch (e) { fs.writeFileSync(p, text, 'utf8'); try { fs.unlinkSync(tmp); } catch (e2) {} } // p. ej. archivo retenido por OneDrive
}
function loadCfg() {
  try { Object.assign(cfg, JSON.parse(fs.readFileSync(CFG_PATH, 'utf8'))); } catch (e) {}
  if (!cfg.pcId) cfg.pcId = Math.random().toString(36).slice(2, 8);
  if (process.env.INV_DATADIR !== undefined) { cfg.dataDir = process.env.INV_DATADIR; cfg.preguntado = true; }
  saveCfg();
}
function saveCfg() { try { writeAtomic(CFG_PATH, JSON.stringify(cfg, null, 1)); } catch (e) {} }
const pcName = () => (process.env.INV_PCNAME || os.hostname() || 'PC').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 24) || 'PC';
const ownFile = () => `${PREFIX}${pcName()}_${cfg.pcId}.json`;
// Todos los equipos eligen la misma carpeta; los datos quedan en una subcarpeta propia del programa
const normDir = d => (path.basename(d) === SUBDIR ? d : path.join(d, SUBDIR));
const pubCfg = () => ({ dataDir: cfg.dataDir, pcName: pcName(), pcId: cfg.pcId, backupDir: BACKUP_DIR, version: app.getVersion() });

// Copia automática: una por día (el estado con que arrancó el día), se conservan 30
function dailyBackup() {
  try {
    if (!fs.existsSync(LOCAL_PATH)) return;
    const d = new Date(Date.now() - 5 * 3600e3).toISOString().slice(0, 10);
    const dest = path.join(BACKUP_DIR, `inventario_${d}.json`);
    if (fs.existsSync(dest)) return;
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    fs.copyFileSync(LOCAL_PATH, dest);
    const all = fs.readdirSync(BACKUP_DIR).filter(f => /^inventario_\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
    all.slice(0, Math.max(0, all.length - 30)).forEach(f => { try { fs.unlinkSync(path.join(BACKUP_DIR, f)); } catch (e) {} });
  } catch (e) {}
}

function listShared() {
  return fs.readdirSync(cfg.dataDir).filter(f => f.startsWith(PREFIX) && f.endsWith('.json'));
}
function sharedSig() {
  if (!cfg.dataDir) return '';
  try {
    return listShared().filter(f => f !== ownFile()).map(f => {
      try { const s = fs.statSync(path.join(cfg.dataDir, f)); return `${f}:${s.mtimeMs}:${s.size}`; } catch (e) { return f; }
    }).sort().join('|');
  } catch (e) { return 'ERR'; }
}
function notify() { if (winAnt && !winAnt.isDestroyed()) winAnt.webContents.send('inv:sharedChanged'); }

async function chooseDir() {
  const r = await dialog.showOpenDialog(winAnt || win, {
    title: 'Carpeta compartida del inventario',
    message: 'Elija la carpeta sincronizada (Drive, OneDrive o red) que comparten los computadores',
    buttonLabel: 'Usar esta carpeta',
    defaultPath: cfg.dataDir ? path.dirname(cfg.dataDir) : app.getPath('documents'),
    properties: ['openDirectory', 'createDirectory']
  });
  if (r.canceled || !r.filePaths[0]) return null;
  const dir = normDir(r.filePaths[0]);
  try { fs.mkdirSync(dir, { recursive: true }); fs.accessSync(dir, fs.constants.W_OK); }
  catch (e) { dialog.showMessageBoxSync(winAnt || win, { type: 'error', title: 'Carpeta compartida', message: 'No se puede escribir en esa carpeta.', detail: String(e.message || e) }); return null; }
  cfg.dataDir = dir; cfg.preguntado = true; saveCfg(); lastPushed = null; lastSig = null;
  return pubCfg();
}

// ---------- comunicación con la ventana ----------
ipcMain.on('inv:init', e => { e.returnValue = { local: readText(LOCAL_PATH), cfg: pubCfg() }; });
ipcMain.on('inv:saveLocal', (e, text) => {
  try { dailyBackup(); writeAtomic(LOCAL_PATH, text); e.returnValue = true; }
  catch (err) { e.returnValue = String(err.message || err); }
});
ipcMain.handle('inv:readShared', async () => {
  if (!cfg.dataDir) return { dir: '', ok: true, files: [] };
  try {
    await fs.promises.mkdir(cfg.dataDir, { recursive: true });
    const files = [];
    for (const f of listShared()) {
      let text = null;
      try { text = await fs.promises.readFile(path.join(cfg.dataDir, f), 'utf8'); } catch (e) {}
      files.push({ name: f, own: f === ownFile(), text });
    }
    lastSig = sharedSig();
    return { dir: cfg.dataDir, ok: true, files };
  } catch (err) { return { dir: cfg.dataDir, ok: false, error: String(err.message || err), files: [] }; }
});
ipcMain.handle('inv:pushShared', async (e, text) => {
  if (!cfg.dataDir) return { ok: true, skipped: true };
  try {
    const p = path.join(cfg.dataDir, ownFile());
    if (text === lastPushed && fs.existsSync(p)) return { ok: true, same: true };
    writeAtomic(p, text); lastPushed = text;
    return { ok: true };
  } catch (err) { return { ok: false, error: String(err.message || err) }; }
});
ipcMain.handle('inv:chooseDir', async () => chooseDir());
ipcMain.handle('inv:clearDir', async () => { cfg.dataDir = ''; saveCfg(); lastPushed = null; lastSig = null; return pubCfg(); });
ipcMain.handle('inv:cfg', async () => pubCfg());
ipcMain.handle('inv:open', async (e, what) => {
  const p = what === 'copias' ? BACKUP_DIR : cfg.dataDir;
  if (!p) return false;
  try { fs.mkdirSync(p, { recursive: true }); } catch (err) {}
  return (await shell.openPath(p)) === '';
});

// ---------- ventana ----------
function buildMenu() {
  const t = [
    { label: 'Archivo', submenu: [
      { label: 'Inventario en la nube (AS SYSTEMS)', click: () => { if (win) win.loadFile(path.join(__dirname, 'inicio.html')); } },
      { label: 'Inventario anterior de este equipo (consulta y exportar)', click: () => abrirAnterior() },
      { label: 'Cambiar código de licencia…', click: async () => { if (!win) return; await session.defaultSession.clearStorageData({ origin: 'file://', storages: ['localstorage'] }); win.loadFile(path.join(__dirname, 'inicio.html')); } },
      { type: 'separator' },
      { label: 'Carpeta compartida (inventario anterior)…', click: async () => { if (await chooseDir()) notify(); } },
      { label: 'Abrir carpeta compartida', click: () => { if (cfg.dataDir) shell.openPath(cfg.dataDir); } },
      { label: 'Abrir copias automáticas', click: () => { try { fs.mkdirSync(BACKUP_DIR, { recursive: true }); } catch (e) {} shell.openPath(BACKUP_DIR); } },
      { type: 'separator' }, { label: 'Salir', role: 'quit' } ] },
    { label: 'Ver', submenu: [
      { label: 'Actualizar', role: 'reload' }, { type: 'separator' },
      { label: 'Acercar', role: 'zoomIn' }, { label: 'Alejar', role: 'zoomOut' }, { label: 'Tamaño normal', role: 'resetZoom' },
      { type: 'separator' }, { label: 'Pantalla completa', role: 'togglefullscreen' } ] },
    { label: 'Ayuda', submenu: [
      { label: 'Acerca de', click: () => dialog.showMessageBox(win, { type: 'info', title: 'Inventario Araucana de Gases',
        message: 'Inventario de bodega — administrado por AS SYSTEMS',
        detail: `Versión ${app.getVersion()}\nInventario en la nube: ${NUBE}\nEquipo: ${pcName()}\nInventario anterior: ${UD}\nCarpeta compartida anterior: ${cfg.dataDir || 'sin configurar'}` }) } ] }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(t));
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280, height: 820, minWidth: 380, minHeight: 600, show: false, backgroundColor: '#ffffff',
    title: 'Inventario Araucana de Gases · AS SYSTEMS', icon: path.join(ANTERIOR, 'icon.png'),
    webPreferences: { contextIsolation: true, nodeIntegration: false, spellcheck: false }
  });
  win.once('ready-to-show', () => { win.maximize(); win.show(); });
  // Enlaces a otros sitios o aplicativos: se abren en el navegador
  win.webContents.setWindowOpenHandler(({ url }) => { if (!url.startsWith(NUBE)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith(NUBE) && !url.startsWith('file:')) { e.preventDefault(); shell.openExternal(url); } });
  win.webContents.on('did-fail-load', (e, code, desc, url, principal) => {
    if (!principal || code === -3 || !String(url).startsWith(NUBE)) return;
    dialog.showMessageBox(win, { type: 'warning', title: 'Sin conexión', message: 'No hay conexión a internet y el inventario en la nube aún no se ha abierto en este equipo.',
      detail: 'Conéctese una vez para que quede guardado; después funciona también sin señal. Mientras tanto puede consultar el inventario anterior en Archivo.' });
  });
  win.loadFile(path.join(__dirname, 'inicio.html'));
  win.on('closed', () => { win = null; });
}

// Programa anterior, tal cual (con su archivo local y carpeta compartida)
function abrirAnterior() {
  if (winAnt && !winAnt.isDestroyed()) { winAnt.focus(); return; }
  winAnt = new BrowserWindow({
    width: 1200, height: 780, minWidth: 900, minHeight: 600, backgroundColor: '#f3f7f3',
    title: 'Inventario anterior de este equipo (antes de AS SYSTEMS)', icon: path.join(ANTERIOR, 'icon.png'),
    webPreferences: { preload: path.join(ANTERIOR, 'preload.js'), contextIsolation: true, nodeIntegration: false, spellcheck: false }
  });
  winAnt.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  winAnt.webContents.on('will-navigate', e => e.preventDefault());
  winAnt.on('page-title-updated', e => e.preventDefault());
  winAnt.loadFile(path.join(ANTERIOR, 'index.html'));
  winAnt.on('closed', () => { winAnt = null; });
}

if (!process.env.INV_USERDATA && !app.requestSingleInstanceLock()) { app.quit(); }
else {
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  app.whenReady().then(async () => {
    loadCfg(); buildMenu();
    if (!cfg.avisoNube) {
      dialog.showMessageBoxSync({ type: 'info', title: 'Inventario Araucana de Gases 1.2.0', noLink: true,
        message: 'El inventario ahora está en la nube de AS SYSTEMS',
        detail: 'Desde esta versión todos los computadores, la web y los celulares ven el mismo inventario al instante.\n\n1. La primera vez se pide el código de licencia que entrega el administrador de AS SYSTEMS.\n2. Luego entre con su usuario y contraseña de AS SYSTEMS.\n\nEl inventario que había en este equipo no se borra: queda en Archivo → Inventario anterior, para consultarlo o exportarlo a Excel.',
        buttons: ['Entendido'] });
      cfg.avisoNube = true; saveCfg();
    }
    // Descargas (Excel, copias): propone la carpeta Descargas; INV_DLDIR solo para pruebas
    session.defaultSession.on('will-download', (e, item) => {
      if (process.env.INV_DLDIR) item.setSavePath(path.join(process.env.INV_DLDIR, item.getFilename()));
      else item.setSaveDialogOptions({ title: 'Guardar archivo', defaultPath: path.join(app.getPath('downloads'), item.getFilename()) });
    });
    createWindow();
    if (process.env.INV_ABRIR_ANTERIOR) abrirAnterior(); // solo pruebas
    // Revisa cada 5 s si otro equipo guardó cambios en la carpeta compartida
    setInterval(() => { if (!cfg.dataDir) return; const s = sharedSig(); if (s !== lastSig) { lastSig = s; notify(); } }, 5000);
  });
  app.on('window-all-closed', () => app.quit());
}
