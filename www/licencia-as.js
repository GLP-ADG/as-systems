/* Verificación de licencia de AS SYSTEMS (aplicativo madre).
 * Uso en cualquier aplicativo replicado, antes de su propio código:
 *   <script>window.AS_LICENCIA = 'AS-XXXX-XXXX-XXXX';</script>
 *   <script src="licencia-as.js"></script>
 * - Consulta la licencia en la nube de AS SYSTEMS al abrir.
 * - Si está suspendida, vencida o no existe: bloquea la pantalla con el mensaje configurado.
 * - Sin señal: deja trabajar hasta 15 días con la última verificación buena (trabajo en campo).
 * - Aplica el nombre y color personalizados de la licencia (window.AS_LICENCIA_INFO).
 */
(function () {
  var PROYECTO = 'as-systems-97612', API = 'AIzaSyB5mFy0n_jz3UlKdDVaKWuaO44WHsGBqAw', GRACIA_DIAS = 15;
  var codigo = (window.AS_LICENCIA || '').trim();
  if (!codigo) return;
  var KC = 'as_lic_' + codigo;
  function leerCache() { try { return JSON.parse(localStorage.getItem(KC)) || null; } catch (e) { return null; } }
  function guardarCache(v) { try { localStorage.setItem(KC, JSON.stringify(v)); } catch (e) { } }
  function bloquear(msg) {
    var pinta = function () {
      var d = document.createElement('div');
      d.setAttribute('style', 'position:fixed;inset:0;z-index:2147483647;background:#f3f5f8;display:flex;align-items:center;justify-content:center;font-family:system-ui,Segoe UI,Roboto,Arial,sans-serif;padding:24px;text-align:center');
      d.innerHTML = '<div style="max-width:420px;background:#fff;border-radius:14px;padding:28px;box-shadow:0 8px 30px rgba(0,0,0,.12)">' +
        '<div style="font-size:42px">🔒</div><h2 style="color:#173260;margin:.4em 0">Aplicativo bloqueado</h2>' +
        '<p style="color:#5d6672;line-height:1.5">' + String(msg).replace(/</g, '&lt;') + '</p>' +
        '<p style="color:#9aa3ad;font-size:12px;margin-top:18px">Licencia ' + codigo + ' · AS SYSTEMS</p></div>';
      document.body.appendChild(d);
    };
    if (document.body) pinta(); else document.addEventListener('DOMContentLoaded', pinta);
  }
  function campo(f, n) { var v = f && f[n]; return v ? (v.stringValue !== undefined ? v.stringValue : v.integerValue !== undefined ? Number(v.integerValue) : v.doubleValue) : undefined; }
  function evaluar(info) {
    window.AS_LICENCIA_INFO = info;
    var msg = info.mensaje || 'La licencia de este aplicativo no está activa. Comuníquese con el administrador de AS SYSTEMS.';
    if (!info.existe) return bloquear('El código de licencia no es válido. Comuníquese con el administrador de AS SYSTEMS.');
    if (info.estado === 'suspendida') return bloquear(msg);
    if (info.vence && new Date(info.vence + 'T23:59:59') < new Date()) return bloquear(msg);
    if (info.color) document.documentElement.style.setProperty('--as-color', info.color);
    if (info.nombreApp) document.title = info.nombreApp;
  }
  var url = 'https://firestore.googleapis.com/v1/projects/' + PROYECTO + '/databases/(default)/documents/licencias/' + encodeURIComponent(codigo) + '?key=' + API;
  fetch(url, { cache: 'no-store' }).then(function (r) {
    if (r.status === 404 || r.status === 403) return { existe: false };
    if (!r.ok) throw new Error('http ' + r.status);
    return r.json().then(function (j) {
      var f = j.fields || {};
      return { existe: true, estado: campo(f, 'estado'), vence: campo(f, 'vence'), mensaje: campo(f, 'mensaje'), nombreApp: campo(f, 'nombreApp'), color: campo(f, 'color'), cliente: campo(f, 'cliente'), usuariosMax: campo(f, 'usuariosMax') };
    });
  }).then(function (info) {
    guardarCache({ info: info, ts: Date.now() });
    evaluar(info);
  }).catch(function () {
    // Sin conexión: usa la última verificación si no tiene más de GRACIA_DIAS días
    var c = leerCache();
    if (c && Date.now() - c.ts < GRACIA_DIAS * 864e5) evaluar(c.info);
    else if (c) bloquear('No se ha podido verificar la licencia en ' + GRACIA_DIAS + ' días. Conéctese a internet y vuelva a abrir el aplicativo.');
    // Primera vez sin señal y sin caché: se deja entrar; se verifica en la próxima apertura con conexión
  });
})();
