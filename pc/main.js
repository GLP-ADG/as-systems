// AS SYSTEMS para Windows: abre el aplicativo raíz en su propia ventana.
// Carga la versión publicada en la nube, así que siempre está actualizado y comparte los datos con la web y el APK.
// Sin internet abre lo último guardado (la app trabaja sin señal y sincroniza al volver la conexión).
const { app, BrowserWindow, shell } = require('electron');
const URL_APP = 'https://glp-adg.github.io/as-systems/';

if (!app.requestSingleInstanceLock()) app.quit();

let ventana;
function crear() {
  ventana = new BrowserWindow({
    width: 1366, height: 860, minWidth: 380, minHeight: 600, title: 'AS SYSTEMS',
    autoHideMenuBar: true, backgroundColor: '#ffffff',
    webPreferences: { contextIsolation: true, nodeIntegration: false, spellcheck: false }
  });
  ventana.loadURL(URL_APP);
  // Los enlaces a otros aplicativos (AS Mantenimiento, etc.) se abren en el navegador
  ventana.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(URL_APP)) { shell.openExternal(url); return { action: 'deny' }; }
    return { action: 'allow' };
  });
  ventana.webContents.on('did-fail-load', (e, code, desc, url, principal) => {
    if (!principal || code === -3) return;
    ventana.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(`<!doctype html><meta charset="utf-8">
      <body style="font-family:Segoe UI,Arial;display:grid;place-items:center;height:100vh;margin:0;background:#f3f5f8;text-align:center;color:#1b2430">
      <div><h2 style="color:#173260">AS SYSTEMS</h2><p>No hay conexión a internet y es la primera vez que se abre en este equipo.</p>
      <p>Conéctese una vez para que quede guardado; después funciona también sin señal.</p>
      <button onclick="location.href='${URL_APP}'" style="background:#173260;color:#fff;border:0;border-radius:8px;padding:10px 18px;font-size:15px;cursor:pointer">Reintentar</button></div></body>`));
  });
}
app.on('second-instance', () => { if (ventana) { if (ventana.isMinimized()) ventana.restore(); ventana.focus(); } });
app.whenReady().then(crear);
app.on('window-all-closed', () => app.quit());
