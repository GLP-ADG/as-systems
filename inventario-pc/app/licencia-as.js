/* Licencia de AS SYSTEMS (aplicativo madre).
 * Uso, antes del código del aplicativo:
 *   <script>window.AS_APP = 'glp'; window.AS_LICENCIA = '';</script>   (vacío = se pide al instalar)
 *   <script src="licencia-as.js"></script>
 * - Si no hay código fijo, la primera vez pide el código de licencia y lo guarda en el equipo.
 * - Consulta la licencia en la nube de AS SYSTEMS cada vez que abre.
 * - Suspendida, vencida, de otro aplicativo o inexistente: bloquea la pantalla con el mensaje configurado.
 * - Sin señal: deja trabajar hasta 15 días con la última verificación buena (trabajo en campo).
 */
(function () {
  var PROYECTO = 'as-systems-97612', API = 'AIzaSyB5mFy0n_jz3UlKdDVaKWuaO44WHsGBqAw', GRACIA_DIAS = 15, KCOD = 'as_licencia_codigo';
  var APP = window.AS_APP || '';
  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { return null; } }
  var codigo = (window.AS_LICENCIA || ls(KCOD) || '').trim().toUpperCase();

  function capa(html) {
    var pinta = function () {
      var d = document.getElementById('as-lic') || document.createElement('div'); d.id = 'as-lic';
      d.setAttribute('style', 'position:fixed;inset:0;z-index:2147483647;background:#f3f5f8;display:flex;align-items:center;justify-content:center;font-family:system-ui,Segoe UI,Roboto,Arial,sans-serif;padding:24px;text-align:center');
      d.innerHTML = '<div style="max-width:420px;width:100%;background:#fff;border-radius:14px;padding:28px;box-shadow:0 8px 30px rgba(0,0,0,.12)">' + html +
        '<p style="color:#9aa3ad;font-size:12px;margin-top:18px">AS SYSTEMS</p></div>';
      // Se cuelga del <html> y no del <body>: así la app no la borra cuando redibuja su pantalla
      if (!d.parentNode) document.documentElement.appendChild(d);
    };
    pinta();
  }
  function quitarCapa() { var d = document.getElementById('as-lic'); if (d) d.remove(); }
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };

  function bloquear(msg, permitirCambio) {
    capa('<div style="font-size:42px">🔒</div><h2 style="color:#173260;margin:.4em 0">Aplicativo bloqueado</h2>' +
      '<p style="color:#5d6672;line-height:1.5">' + esc(msg) + '</p>' +
      (codigo ? '<p style="color:#9aa3ad;font-size:12px">Licencia ' + esc(codigo) + '</p>' : '') +
      (permitirCambio ? '<button id="as-cambiar" style="margin-top:10px;background:#fff;color:#173260;border:1px solid #c5cfdd;border-radius:8px;padding:.6rem 1rem;font:inherit;cursor:pointer">Ingresar otro código</button>' : ''));
    setTimeout(function () { var b = document.getElementById('as-cambiar'); if (b) b.onclick = function () { pedir(''); }; }, 0);
  }
  function pedir(error) {
    capa('<div style="font-size:42px">🔑</div><h2 style="color:#173260;margin:.4em 0">Activar aplicativo</h2>' +
      '<p style="color:#5d6672;line-height:1.5">Escriba el código de licencia que le entregó el administrador de AS SYSTEMS.</p>' +
      '<input id="as-cod" placeholder="AS-XXXX-XXXX-XXXX" autocomplete="off" style="width:100%;box-sizing:border-box;font:inherit;font-size:18px;text-align:center;letter-spacing:1px;padding:.7rem;border:1px solid #dde2e8;border-radius:8px;text-transform:uppercase">' +
      (error ? '<p style="color:#C62828;font-size:14px">' + esc(error) + '</p>' : '') +
      '<button id="as-act" style="margin-top:12px;width:100%;background:#173260;color:#fff;border:0;border-radius:8px;padding:.8rem;font:inherit;font-weight:600;cursor:pointer">Activar</button>');
    setTimeout(function () {
      var i = document.getElementById('as-cod'), b = document.getElementById('as-act'); if (!i) return; i.focus();
      var ir = function () {
        var c = i.value.trim().toUpperCase(); if (!c) return;
        b.disabled = true; b.textContent = 'Verificando…';
        consultar(c).then(function (info) {
          var falla = motivo(info);
          if (falla) { b.disabled = false; b.textContent = 'Activar'; pedir(falla); return; }
          codigo = c; ls(KCOD, c); ls('as_lic_' + c, JSON.stringify({ info: info, ts: Date.now() })); quitarCapa(); aplicar(info);
        }).catch(function () { pedir('No hay conexión a internet. La activación necesita señal la primera vez.'); });
      };
      b.onclick = ir; i.onkeydown = function (e) { if (e.key === 'Enter') ir(); };
    }, 0);
  }
  function campo(f, n) { var v = f && f[n]; return v ? (v.stringValue !== undefined ? v.stringValue : v.integerValue !== undefined ? Number(v.integerValue) : v.doubleValue) : undefined; }
  function consultar(c) {
    var url = 'https://firestore.googleapis.com/v1/projects/' + PROYECTO + '/databases/(default)/documents/licencias/' + encodeURIComponent(c) + '?key=' + API;
    return fetch(url, { cache: 'no-store' }).then(function (r) {
      if (r.status === 404 || r.status === 403) return { existe: false };
      if (!r.ok) throw new Error('http ' + r.status);
      return r.json().then(function (j) {
        var f = j.fields || {};
        return { existe: true, app: campo(f, 'app'), estado: campo(f, 'estado'), vence: campo(f, 'vence'), mensaje: campo(f, 'mensaje'), nombreApp: campo(f, 'nombreApp'), color: campo(f, 'color'), cliente: campo(f, 'cliente'), usuariosMax: campo(f, 'usuariosMax') };
      });
    });
  }
  function motivo(info) {
    var msg = info.mensaje || 'La licencia de este aplicativo no está activa. Comuníquese con el administrador de AS SYSTEMS.';
    if (!info.existe) return 'El código de licencia no es válido.';
    if (APP && info.app && info.app !== APP) return 'Ese código es de otro aplicativo.';
    if (info.estado === 'suspendida') return msg;
    if (info.vence && new Date(info.vence + 'T23:59:59') < new Date()) return msg;
    return '';
  }
  function aplicar(info) {
    window.AS_LICENCIA_INFO = info;
    if (info.color) document.documentElement.style.setProperty('--as-color', info.color);
    if (info.nombreApp) document.title = info.nombreApp;
    window.dispatchEvent(new Event('as-licencia-ok'));
  }
  function evaluar(info) { var f = motivo(info); if (f) bloquear(f, !window.AS_LICENCIA); else aplicar(info); }

  if (!codigo) { pedir(''); return; }
  var KC = 'as_lic_' + codigo;
  consultar(codigo).then(function (info) { ls(KC, JSON.stringify({ info: info, ts: Date.now() })); evaluar(info); })
    .catch(function () {
      var c = null; try { c = JSON.parse(ls(KC)); } catch (e) { }
      if (c && Date.now() - c.ts < GRACIA_DIAS * 864e5) evaluar(c.info);
      else if (c) bloquear('No se ha podido verificar la licencia en ' + GRACIA_DIAS + ' días. Conéctese a internet y vuelva a abrir el aplicativo.', false);
    });
})();
