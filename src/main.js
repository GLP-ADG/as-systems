// AS SYSTEMS — Araucana de Gases S.A.S. E.S.P.
// Módulos: Inventario de bodega, Préstamo de herramientas, Celulares, Técnicos, Administración.
import { crearBackend, slug, idCodigo, nuevoId } from './backend.js';
import { leerExcel, prepararImportacion, exportarExcel as exportarExcelArchivo, TIPOS } from './importar.js';
// En el APK el visor interno no descarga archivos: las descargas de Excel se hacen desde el PC o el navegador
const exportarExcel = (n, h) => window.Capacitor?.isNativePlatform?.() ? toast('Para descargar Excel abra AS SYSTEMS en el PC o en el navegador del celular.', 'error') : exportarExcelArchivo(n, h);

const B = crearBackend();
const VERSION = '1.0.0';
const MANT_URL = 'https://willowy-brigadeiros-461d60.netlify.app';

const S = {
  user: null, perfil: null, listo: false,
  productos: [], movimientos: [], prestamos: [], celulares: [], tecnicos: [], usuarios: [], config: [],
  f: { q: '', cat: '', bajo: false, tipoMov: '', tecMov: '', desde: '', hasta: '', qCel: '', estPrest: 'prestado', qPrest: '', sub: 'existencias' }
};
let desuscribir = [];

/* ------------------------------------------------------------ utilidades */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const hoy = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
const fnum = n => (Number(n) || 0).toLocaleString('es-CO', { maximumFractionDigits: 2 });
const ffecha = s => { if (!s) return ''; const [y, m, d] = String(s).slice(0, 10).split('-'); return d ? `${d}/${m}/${y}` : s; };
const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const rol = () => S.perfil?.rol || 'consulta';
const esAdmin = () => rol() === 'admin';
const puedeOperar = () => rol() === 'admin' || rol() === 'bodega';
const yo = () => ({ uid: S.user?.uid || '', nombre: S.perfil?.nombre || S.user?.email || '' });
const cfg = () => S.config.find(c => c.id === 'general') || {};
const tecnicosActivos = () => S.tecnicos.filter(t => t.activo !== false).sort((a, b) => a.nombre.localeCompare(b.nombre));
const prodPorCodigo = c => S.productos.find(p => idCodigo(p.codigo) === idCodigo(c));
const ROLES = { admin: 'Administrador', bodega: 'Bodega / almacenista', consulta: 'Solo consulta' };

function toast(msg, tipo = 'ok') {
  const t = document.createElement('div'); t.className = 'toast ' + tipo; t.textContent = msg;
  document.body.appendChild(t); setTimeout(() => t.classList.add('ver'), 10);
  setTimeout(() => { t.classList.remove('ver'); setTimeout(() => t.remove(), 300); }, tipo === 'error' ? 5000 : 2800);
}
function errorTexto(e) {
  const c = e?.code || '';
  if (/invalid-credential|wrong-password|user-not-found/.test(c)) return 'Correo o contraseña incorrectos.';
  if (/email-already-in-use/.test(c)) return 'Ese correo ya tiene usuario.';
  if (/weak-password/.test(c)) return 'La contraseña debe tener mínimo 6 caracteres.';
  if (/invalid-email/.test(c)) return 'El correo no es válido.';
  if (/permission-denied/.test(c)) return 'Su usuario no tiene permiso para esta acción.';
  if (/network|unavailable/.test(c)) return 'Sin conexión. Se enviará cuando vuelva la señal.';
  if (/too-many-requests/.test(c)) return 'Demasiados intentos. Espere unos minutos.';
  return e?.message || String(e);
}

/* ------------------------------------------------------------ modales */
function modal(titulo, cuerpo, { ancho = '', botones = '' } = {}) {
  cerrarModal();
  const m = document.createElement('div'); m.className = 'modal-fondo'; m.id = 'modal';
  m.innerHTML = `<div class="modal ${ancho}"><div class="modal-cab"><h3>${titulo}</h3><button class="x" data-cerrar>×</button></div>
    <div class="modal-cuerpo">${cuerpo}</div>${botones ? `<div class="modal-pie">${botones}</div>` : ''}</div>`;
  m.addEventListener('click', e => { if (e.target === m || e.target.closest('[data-cerrar]')) cerrarModal(); });
  document.body.appendChild(m); document.body.classList.add('con-modal');
  setTimeout(() => { const i = $('input:not([type=hidden]),select,textarea', m); i && i.focus(); }, 50);
  return m;
}
function cerrarModal() { const m = $('#modal'); if (m) m.remove(); document.body.classList.remove('con-modal'); }
function confirmar(texto, { si = 'Sí, continuar', peligro = false } = {}) {
  return new Promise(res => {
    const m = modal('Confirmar', `<p>${texto}</p>`, { botones: `<button class="btn sec" data-r="0">Cancelar</button><button class="btn ${peligro ? 'rojo' : ''}" data-r="1">${si}</button>` });
    m.addEventListener('click', e => { const b = e.target.closest('[data-r]'); if (b) { cerrarModal(); res(b.dataset.r === '1'); } });
    m.addEventListener('click', e => { if (e.target === m || e.target.closest('[data-cerrar]')) res(false); });
  });
}
const ocupado = (btn, si) => { if (!btn) return; btn.disabled = si; if (si) { btn.dataset.t = btn.textContent; btn.textContent = 'Guardando…'; } else if (btn.dataset.t) btn.textContent = btn.dataset.t; };

/* Buscador de productos reutilizable */
function buscadorProducto(cont, { soloHerramientas = false, alElegir }) {
  cont.innerHTML = `<div class="buscador"><input type="search" placeholder="Buscar por código o nombre (ej.: tubería 1/2)" autocomplete="off"><div class="resultados"></div></div>`;
  const inp = $('input', cont), res = $('.resultados', cont);
  const pintar = () => {
    const q = norm(inp.value).split(/\s+/).filter(Boolean);
    let l = S.productos.filter(p => !soloHerramientas || p.tipo === 'herramienta');
    if (q.length) l = l.filter(p => { const t = norm(p.codigo + ' ' + p.nombre + ' ' + (p.categoria || '')); return q.every(w => t.includes(w)); });
    l = l.sort((a, b) => a.nombre.localeCompare(b.nombre)).slice(0, 60);
    res.innerHTML = l.length ? l.map(p => `<button type="button" class="res" data-c="${esc(p.codigo)}"><b>${esc(p.codigo)}</b> ${esc(p.nombre)} <span class="stk ${Number(p.stock) <= 0 ? 'cero' : ''}">${fnum(p.stock)} ${esc(p.unidad || '')}</span></button>`).join('')
      : `<div class="vacio-peq">${S.productos.length ? 'Sin resultados' : 'El catálogo está vacío. Importe el Excel o cree productos.'}</div>`;
  };
  inp.addEventListener('input', pintar); inp.addEventListener('focus', pintar);
  res.addEventListener('click', e => { const b = e.target.closest('.res'); if (b) { alElegir(prodPorCodigo(b.dataset.c)); inp.value = ''; res.innerHTML = ''; } });
  return { foco: () => inp.focus() };
}
const opcionesTecnicos = (sel = '', vacio = '— Seleccione técnico —') =>
  `<option value="">${vacio}</option>` + tecnicosActivos().map(t => `<option value="${esc(t.id)}" ${t.id === sel ? 'selected' : ''}>${esc(t.nombre)}</option>`).join('');

/* ------------------------------------------------------------ arranque y sesión */
function pantallaLogin(mensaje = '') {
  document.body.className = 'login';
  $('#app').innerHTML = `
  <div class="login-caja">
    <img src="img/logo-systems.png" alt="AS SYSTEMS" class="login-logo">
    <p class="sub">Araucana de Gases S.A.S. E.S.P.</p>
    ${B.modo === 'local' ? '<div class="aviso">Modo de prueba local: los datos quedan solo en este equipo. Para compartir en la nube, configure Firebase (ver guía).</div>' : ''}
    ${mensaje ? `<div class="aviso rojo">${esc(mensaje)}</div>` : ''}
    <form id="fLogin">
      <label>Correo<input type="email" name="e" required autocomplete="username"></label>
      <label>Contraseña<input type="password" name="p" required autocomplete="current-password"></label>
      <button class="btn grande">Ingresar</button>
    </form>
    <div class="login-links"><a href="#" id="lnkReset">Olvidé mi contraseña</a><a href="#" id="lnkAdmin" hidden>Primera vez: crear administrador</a></div>
    <p class="pie">Una empresa araucana al servicio de los araucanos · v${VERSION}</p>
  </div>`;
  B.sistemaIniciado().then(ok => { if (!ok) $('#lnkAdmin').hidden = false; });
  $('#fLogin').onsubmit = async e => {
    e.preventDefault(); const f = new FormData(e.target); const b = $('button', e.target); ocupado(b, true);
    try { await B.login(f.get('e').trim(), f.get('p')); } catch (er) { toast(errorTexto(er), 'error'); ocupado(b, false); }
  };
  $('#lnkReset').onclick = async e => {
    e.preventDefault(); const em = $('[name=e]').value.trim();
    if (!em) return toast('Escriba su correo arriba y vuelva a tocar el enlace.', 'error');
    try { await B.reset(em); toast('Le enviamos un correo para cambiar la contraseña.'); } catch (er) { toast(errorTexto(er), 'error'); }
  };
  $('#lnkAdmin').onclick = e => {
    e.preventDefault();
    const m = modal('Crear administrador', `<p class="nota">Esto se hace una sola vez. Quien cree esta cuenta queda como único administrador: el único que agrega o elimina técnicos y usuarios.</p>
      <form id="fAdm"><label>Nombre<input name="n" required value="Ing. Alejandro Sánchez"></label>
      <label>Correo<input type="email" name="e" required></label><label>Contraseña (mín. 6)<input type="password" name="p" minlength="6" required></label>
      <button class="btn">Crear y entrar</button></form>`);
    $('#fAdm', m).onsubmit = async ev => {
      ev.preventDefault(); const f = new FormData(ev.target); const b = $('button', ev.target); ocupado(b, true);
      try { await B.registrarAdmin(f.get('e').trim(), f.get('p'), f.get('n').trim()); cerrarModal(); toast('Administrador creado'); }
      catch (er) { toast(errorTexto(er), 'error'); ocupado(b, false); }
    };
  };
}

B.onUser(async u => {
  desuscribir.forEach(f => f && f()); desuscribir = [];
  S.user = u; S.perfil = null; S.listo = false;
  if (!u) return pantallaLogin();
  let p = null;
  for (let i = 0; i < 5 && !p; i++) { try { p = await B.perfil(u.uid); } catch { } if (!p) await new Promise(r => setTimeout(r, 600)); }
  if (!p || p.activo === false) { await B.logout(); return pantallaLogin(p ? 'Su usuario está desactivado. Hable con el administrador.' : 'Su usuario no está habilitado en AS SYSTEMS.'); }
  S.perfil = p;
  const subs = [['productos'], ['prestamos'], ['celulares'], ['tecnicos'], ['config'], ['movimientos', { orden: 'ts', limite: 3000 }]];
  if (esAdmin()) subs.push(['usuarios']);
  for (const [c, o] of subs) desuscribir.push(B.escuchar(c, d => { S[c] = d; if (c === 'usuarios') { const me = d.find(x => x.id === u.uid); if (me) S.perfil = me; } refrescar(); }, o));
  marco(); S.listo = true; ir();
});

let tRef = null;
function refrescar() { clearTimeout(tRef); tRef = setTimeout(() => S.listo && pintarVista(), 60); }

/* ------------------------------------------------------------ marco y navegación */
const MENU = [
  ['inicio', 'Inicio', '⌂'], ['inventario', 'Inventario', '▦'], ['prestamos', 'Préstamos', '⇄'],
  ['celulares', 'Celulares', '☏'], ['tecnicos', 'Técnicos', '☺'], ['admin', 'Administración', '⚙']
];
function marco() {
  document.body.className = 'app';
  $('#app').innerHTML = `
  <header class="barra">
    <div class="marca"><img src="img/logo-systems.png" alt="AS SYSTEMS"><small>Araucana de Gases</small></div>
    <div class="quien"><span>${esc(S.perfil.nombre || S.user.email)}</span><small>${ROLES[rol()]}${B.modo === 'local' ? ' · prueba local' : ''}</small></div>
    <button class="btn sec peq" id="btnSalir">Salir</button>
  </header>
  <nav class="menu">${MENU.filter(m => m[0] !== 'admin' || esAdmin()).map(m => `<a href="#${m[0]}" data-r="${m[0]}"><i>${m[2]}</i><span>${m[1]}</span></a>`).join('')}</nav>
  <main id="vista"></main>
  <div id="estadoRed" class="red" hidden>Sin conexión: los cambios se guardan y se envían al volver la señal</div>`;
  $('#btnSalir').onclick = () => B.logout();
  const red = () => { $('#estadoRed') && ($('#estadoRed').hidden = navigator.onLine); };
  addEventListener('online', red); addEventListener('offline', red); red();
}
addEventListener('hashchange', () => S.listo && ir());
function ruta() { const r = (location.hash || '#inicio').slice(1).split('/'); return { r: r[0] || 'inicio', p: r[1] }; }
function ir() { $$('.menu a').forEach(a => a.classList.toggle('activo', a.dataset.r === ruta().r)); pintarVista(true); }

function pintarVista(nueva = false) {
  const v = $('#vista'); if (!v) return;
  const { r } = ruta();
  const act = document.activeElement; const actId = act && act.id; const pos = act && act.selectionStart;
  const fn = { inicio: vInicio, inventario: vInventario, prestamos: vPrestamos, celulares: vCelulares, tecnicos: vTecnicos, admin: vAdmin }[r] || vInicio;
  if (r === 'admin' && !esAdmin()) { location.hash = '#inicio'; return; }
  v.innerHTML = fn();
  enlazar(r);
  if (nueva) window.scrollTo(0, 0);
  if (actId && $('#' + actId)) { const el = $('#' + actId); el.focus(); try { el.setSelectionRange(pos, pos); } catch { } }
}

/* ------------------------------------------------------------ INICIO */
function vInicio() {
  const bajos = S.productos.filter(p => Number(p.minimo) > 0 && Number(p.stock) <= Number(p.minimo));
  const prest = S.prestamos.filter(p => p.estado === 'prestado');
  const celAsig = S.celulares.filter(c => c.estado === 'asignado');
  const hoyMov = S.movimientos.filter(m => m.fecha === hoy());
  const enlaces = cfg().enlaces || [{ nombre: 'AS Mantenimiento', url: MANT_URL }];
  return `
  <section class="saludo"><h2>Hola, ${esc((S.perfil.nombre || '').split(' ').slice(0, 2).join(' '))}</h2><p>${new Date().toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p></section>
  <section class="mosaicos">
    <a class="mosaico" href="#inventario"><i>▦</i><b>Inventario de bodega</b><span>${S.productos.length} productos · ${hoyMov.length} movimientos hoy</span>${bajos.length ? `<em class="alerta">${bajos.length} bajo el mínimo</em>` : ''}</a>
    <a class="mosaico" href="#prestamos"><i>⇄</i><b>Préstamo de herramientas</b><span>${prest.length} herramientas/equipos prestados</span></a>
    <a class="mosaico" href="#celulares"><i>☏</i><b>Celulares</b><span>${S.celulares.length} equipos · ${celAsig.length} asignados</span></a>
    <a class="mosaico" href="#tecnicos"><i>☺</i><b>Técnicos</b><span>${tecnicosActivos().length} activos</span></a>
    ${enlaces.map(e => `<a class="mosaico externo" href="${esc(e.url)}" target="_blank" rel="noopener"><i>↗</i><b>${esc(e.nombre)}</b><span>Abrir aplicativo</span></a>`).join('')}
    ${esAdmin() ? `<a class="mosaico" href="#admin"><i>⚙</i><b>Administración</b><span>Usuarios, importar Excel, copias</span></a>` : ''}
  </section>
  <section class="dos">
    <div class="tarjeta"><h3>Últimos movimientos</h3>${tablaMovs(S.movimientos.slice(0, 8), true)}</div>
    <div class="tarjeta"><h3>Herramientas prestadas</h3>${prest.length ? `<ul class="lista">${prest.slice(0, 8).map(p => `<li><b>${esc(p.herramienta)}</b> × ${fnum(p.cantidad)}<small>${esc(p.tecnico)} · desde ${ffecha(p.fechaSalida)} (${diasDesde(p.fechaSalida)} días)</small></li>`).join('')}</ul>` : '<p class="vacio-peq">Nada prestado en este momento.</p>'}
    ${bajos.length ? `<h3 class="mt">Bajo el mínimo</h3><ul class="lista">${bajos.slice(0, 8).map(p => `<li><b>${esc(p.nombre)}</b><small>Hay ${fnum(p.stock)} ${esc(p.unidad || '')} · mínimo ${fnum(p.minimo)}</small></li>`).join('')}</ul>` : ''}</div>
  </section>`;
}
const diasDesde = f => f ? Math.max(0, Math.floor((Date.now() - new Date(f + 'T00:00:00')) / 864e5)) : 0;

/* ------------------------------------------------------------ INVENTARIO */
const TIPO_MOV = { entrada: 'Entrada', salida: 'Salida', prestamo: 'Préstamo', devolucion: 'Devolución', ajuste: 'Ajuste' };
function tablaMovs(l, corta = false) {
  if (!l.length) return '<p class="vacio-peq">Sin movimientos.</p>';
  return `<div class="tabla-cont"><table class="tabla"><thead><tr><th>Fecha</th><th>Tipo</th><th>Producto</th><th class="num">Cant.</th>${corta ? '' : '<th class="num">Saldo</th>'}<th>Técnico / proveedor</th>${corta ? '' : '<th>Destino / doc.</th><th>Registró</th>'}</tr></thead><tbody>
  ${l.map(m => `<tr><td>${ffecha(m.fecha)}</td><td><span class="tag ${m.tipo}">${TIPO_MOV[m.tipo] || m.tipo}</span></td><td><b>${esc(m.codigo)}</b> ${esc(m.producto)}</td>
  <td class="num">${m.tipo === 'ajuste' ? (m.cantidad > 0 ? '+' : '') : (m.tipo === 'entrada' || m.tipo === 'devolucion' ? '+' : '−')}${fnum(Math.abs(m.cantidad))}</td>${corta ? '' : `<td class="num">${m.importado && m.saldo === undefined ? '' : fnum(m.saldo)}</td>`}
  <td>${esc(m.tecnico || m.proveedor || '')}</td>${corta ? '' : `<td>${esc([m.destino, m.doc].filter(Boolean).join(' · '))}${m.obs ? `<small class="obs">${esc(m.obs)}</small>` : ''}</td><td><small>${esc(m.usuario || '')}${m.importado ? ' (importado)' : ''}</small></td>`}</tr>`).join('')}
  </tbody></table></div>`;
}
function vInventario() {
  const sub = S.f.sub;
  const cats = [...new Set(S.productos.map(p => p.categoria || 'SIN CATEGORÍA'))].sort();
  let cuerpo = '';
  if (sub === 'existencias') {
    const q = norm(S.f.q).split(/\s+/).filter(Boolean);
    let l = S.productos.filter(p => (!S.f.cat || (p.categoria || 'SIN CATEGORÍA') === S.f.cat) && (!S.f.bajo || (Number(p.minimo) > 0 && Number(p.stock) <= Number(p.minimo))));
    if (q.length) l = l.filter(p => { const t = norm(p.codigo + ' ' + p.nombre); return q.every(w => t.includes(w)); });
    l.sort((a, b) => (a.categoria || '').localeCompare(b.categoria || '') || a.nombre.localeCompare(b.nombre));
    cuerpo = `
    <div class="filtros">
      <input type="search" id="fq" placeholder="Buscar código o nombre…" value="${esc(S.f.q)}">
      <select id="fcat"><option value="">Todas las categorías</option>${cats.map(c => `<option ${c === S.f.cat ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
      <label class="chk"><input type="checkbox" id="fbajo" ${S.f.bajo ? 'checked' : ''}> Solo bajo mínimo</label>
      ${puedeOperar() ? '<button class="btn sec" id="bNuevoProd">+ Producto</button>' : ''}
    </div>
    <p class="conteo">${l.length} de ${S.productos.length} productos</p>
    ${l.length ? `<div class="tabla-cont"><table class="tabla"><thead><tr><th>Código</th><th>Descripción</th><th>Categoría</th><th>Und</th><th class="num">Existencia</th><th class="num">Mín.</th><th></th></tr></thead><tbody>
    ${l.map(p => { const bajo = Number(p.minimo) > 0 && Number(p.stock) <= Number(p.minimo);
      return `<tr class="${bajo ? 'bajo' : ''}"><td><b>${esc(p.codigo)}</b></td><td>${esc(p.nombre)}${p.tipo === 'herramienta' ? ' <span class="tag prestamo">herramienta</span>' : ''}</td><td><small>${esc(p.categoria || '')}</small></td><td>${esc(p.unidad || '')}</td>
      <td class="num"><b>${fnum(p.stock)}</b></td><td class="num">${p.minimo ? fnum(p.minimo) : ''}</td>
      <td class="acc"><button class="lnk" data-kardex="${esc(p.codigo)}">Kárdex</button>${puedeOperar() ? `<button class="lnk" data-editprod="${esc(p.codigo)}">Editar</button>` : ''}</td></tr>`; }).join('')}
    </tbody></table></div>` : `<div class="vacio"><p>${S.productos.length ? 'Sin resultados con ese filtro.' : 'Aún no hay productos.'}</p>${!S.productos.length && esAdmin() ? '<a class="btn" href="#admin">Importar el Excel del inventario</a>' : ''}</div>`}`;
  } else {
    let l = S.movimientos;
    if (S.f.tipoMov) l = l.filter(m => m.tipo === S.f.tipoMov);
    if (S.f.tecMov) l = l.filter(m => m.tecnicoId === S.f.tecMov);
    if (S.f.desde) l = l.filter(m => m.fecha >= S.f.desde);
    if (S.f.hasta) l = l.filter(m => m.fecha <= S.f.hasta);
    const q = norm(S.f.q).split(/\s+/).filter(Boolean);
    if (q.length) l = l.filter(m => { const t = norm([m.codigo, m.producto, m.destino, m.doc, m.tecnico, m.proveedor].join(' ')); return q.every(w => t.includes(w)); });
    cuerpo = `
    <div class="filtros">
      <input type="search" id="fq" placeholder="Producto, destino, documento…" value="${esc(S.f.q)}">
      <select id="ftipo"><option value="">Todos los tipos</option>${Object.entries(TIPO_MOV).map(([k, v]) => `<option value="${k}" ${k === S.f.tipoMov ? 'selected' : ''}>${v}</option>`).join('')}</select>
      <select id="ftec">${opcionesTecnicos(S.f.tecMov, 'Todos los técnicos')}</select>
      <label class="fch">Desde<input type="date" id="fdesde" value="${S.f.desde}"></label><label class="fch">Hasta<input type="date" id="fhasta" value="${S.f.hasta}"></label>
      <button class="btn sec" id="bExpMov">Exportar Excel</button>
    </div>
    <p class="conteo">${l.length} movimientos</p>${tablaMovs(l.slice(0, 500))}${l.length > 500 ? '<p class="nota">Se muestran 500. Use filtros o exporte a Excel para ver todos.</p>' : ''}`;
  }
  return `
  <div class="cab-vista"><h2>Inventario de bodega</h2>
    ${puedeOperar() ? `<div class="acciones"><button class="btn verde" id="bEntrada">+ Entrada</button><button class="btn naranja" id="bSalida">− Salida</button><button class="btn sec" id="bAjuste">Ajuste por conteo</button></div>` : ''}</div>
  <div class="pestanas"><button data-sub="existencias" class="${sub === 'existencias' ? 'act' : ''}">Existencias</button><button data-sub="movimientos" class="${sub === 'movimientos' ? 'act' : ''}">Movimientos</button></div>
  ${cuerpo}`;
}

function formMovimiento(tipo) {
  const esSal = tipo === 'salida';
  const lineas = [];
  const m = modal(esSal ? 'Salida de bodega' : 'Entrada a bodega', `
    <form id="fMov">
      <div class="g2">
        <label>Fecha<input type="date" name="fecha" value="${hoy()}" required></label>
        ${esSal ? `<label>Técnico que recibe<select name="tec" required>${opcionesTecnicos()}</select></label>`
               : `<label>Proveedor / origen<input name="proveedor" placeholder="Ej.: proveedor, traslado, devolución de obra"></label>`}
        <label>${esSal ? 'Destino / obra / dirección' : 'N.º factura o remisión'}<input name="${esSal ? 'destino' : 'doc'}"></label>
        <label>${esSal ? 'N.º vale u orden (opcional)' : 'Observación'}<input name="${esSal ? 'doc' : 'obs'}"></label>
      </div>
      ${esSal ? '<label>Observación<input name="obs"></label>' : ''}
      <h4>Materiales</h4><div id="busc"></div>
      <div id="lineas"></div>
    </form>`, { ancho: 'ancho', botones: `<button class="btn sec" data-cerrar>Cancelar</button><button class="btn ${esSal ? 'naranja' : 'verde'}" id="bGuardarMov">Registrar ${esSal ? 'salida' : 'entrada'}</button>` });
  const pintar = () => {
    $('#lineas', m).innerHTML = lineas.length ? `<table class="tabla lineas"><thead><tr><th>Producto</th><th class="num">Hay</th><th style="width:110px">Cantidad</th><th></th></tr></thead><tbody>
    ${lineas.map((l, i) => `<tr><td><b>${esc(l.p.codigo)}</b> ${esc(l.p.nombre)} <small>${esc(l.p.unidad || '')}</small></td><td class="num">${fnum(l.p.stock)}</td>
    <td><input type="number" step="any" min="0" data-cant="${i}" value="${l.cant}" required></td><td><button type="button" class="lnk rojo" data-quitar="${i}">Quitar</button></td></tr>`).join('')}</tbody></table>`
      : '<p class="vacio-peq">Busque y toque los materiales para agregarlos. Puede agregar varios en el mismo registro.</p>';
  };
  buscadorProducto($('#busc', m), { alElegir: p => { if (!lineas.some(l => l.p.codigo === p.codigo)) lineas.push({ p, cant: '' }); pintar(); setTimeout(() => { const i = $(`[data-cant="${lineas.findIndex(l => l.p.codigo === p.codigo)}"]`, m); i && i.focus(); }, 30); } });
  pintar();
  $('#lineas', m).addEventListener('input', e => { if (e.target.dataset.cant !== undefined) lineas[+e.target.dataset.cant].cant = e.target.value; });
  $('#lineas', m).addEventListener('click', e => { const q = e.target.dataset.quitar; if (q !== undefined) { lineas.splice(+q, 1); pintar(); } });
  $('#bGuardarMov', m).onclick = async () => {
    const f = new FormData($('#fMov', m));
    if (esSal && !f.get('tec')) return toast('Seleccione el técnico que recibe.', 'error');
    if (!lineas.length) return toast('Agregue al menos un material.', 'error');
    if (lineas.some(l => !(Number(l.cant) > 0))) return toast('Escriba la cantidad de cada material.', 'error');
    if (esSal) { const falta = lineas.find(l => Number(l.cant) > Number(prodPorCodigo(l.p.codigo)?.stock || 0)); if (falta) return toast(`No hay suficiente ${falta.p.nombre}: hay ${fnum(falta.p.stock)}.`, 'error'); }
    const t = S.tecnicos.find(x => x.id === f.get('tec'));
    const b = $('#bGuardarMov', m); ocupado(b, true);
    const vale = nuevoId(); let ok = 0;
    try {
      for (const l of lineas) {
        const c = Number(l.cant);
        await B.movimiento({ tipo, delta: esSal ? -c : c, codigo: l.p.codigo, producto: l.p.nombre, unidad: l.p.unidad || '', cantidad: c,
          fecha: f.get('fecha'), tecnico: t?.nombre || '', tecnicoId: t?.id || '', destino: f.get('destino') || '', doc: f.get('doc') || '',
          proveedor: f.get('proveedor') || '', obs: f.get('obs') || '', vale, ...yo(), usuario: yo().nombre });
        ok++;
      }
      cerrarModal(); toast(`${esSal ? 'Salida' : 'Entrada'} registrada (${ok} ítem${ok > 1 ? 's' : ''})`);
    } catch (e) { toast((ok ? `Se registraron ${ok}. ` : '') + errorTexto(e), 'error'); ocupado(b, false); lineas.splice(0, ok); pintar(); }
  };
}

function formAjuste() {
  let prod = null;
  const m = modal('Ajuste por conteo físico', `<p class="nota">Use esto cuando el conteo físico no cuadra con el sistema. Queda registrado quién lo hizo y la diferencia.</p>
    <div id="busc"></div><div id="sel"></div>`, { botones: `<button class="btn sec" data-cerrar>Cancelar</button><button class="btn" id="bAj">Guardar ajuste</button>` });
  buscadorProducto($('#busc', m), { alElegir: p => { prod = p; $('#sel', m).innerHTML = `<div class="sel-prod"><b>${esc(p.codigo)}</b> ${esc(p.nombre)}<br>En sistema: <b>${fnum(p.stock)} ${esc(p.unidad || '')}</b></div>
    <label>Cantidad contada en físico<input type="number" step="any" min="0" id="conteo" required></label><label>Motivo<input id="motivo" placeholder="Ej.: conteo mensual, pérdida, error de digitación"></label>`; $('#conteo', m).focus(); } });
  $('#bAj', m).onclick = async () => {
    if (!prod) return toast('Seleccione el producto.', 'error');
    const c = $('#conteo', m).value; if (c === '' || Number(c) < 0) return toast('Escriba la cantidad contada.', 'error');
    const actual = Number(prodPorCodigo(prod.codigo)?.stock || 0); const d = +(Number(c) - actual).toFixed(4);
    if (!d) return toast('El conteo coincide con el sistema. No hay nada que ajustar.');
    const b = $('#bAj', m); ocupado(b, true);
    try {
      await B.movimiento({ tipo: 'ajuste', delta: d, cantidad: d, codigo: prod.codigo, producto: prod.nombre, unidad: prod.unidad || '', fecha: hoy(),
        obs: $('#motivo', m).value || 'Ajuste por conteo', ...yo(), usuario: yo().nombre }, { permitirNegativo: false });
      cerrarModal(); toast('Ajuste guardado: ' + (d > 0 ? '+' : '') + fnum(d));
    } catch (e) { toast(errorTexto(e), 'error'); ocupado(b, false); }
  };
}

function formProducto(codigo) {
  const p = codigo ? prodPorCodigo(codigo) : null;
  const cats = [...new Set(S.productos.map(x => x.categoria).filter(Boolean))].sort();
  const m = modal(p ? 'Editar producto' : 'Nuevo producto', `<form id="fProd">
    <div class="g2"><label>Código<input name="codigo" required value="${esc(p?.codigo || '')}" ${p ? 'readonly' : ''}></label>
    <label>Unidad<input name="unidad" value="${esc(p?.unidad || 'UND')}" list="dlUnd"></label></div>
    <label>Descripción<input name="nombre" required value="${esc(p?.nombre || '')}"></label>
    <div class="g2"><label>Categoría<input name="categoria" list="dlCat" value="${esc(p?.categoria || '')}"></label>
    <label>Stock mínimo (alerta)<input type="number" step="any" min="0" name="minimo" value="${p?.minimo ?? ''}"></label></div>
    <label>Tipo<select name="tipo"><option value="material">Material (se consume)</option><option value="herramienta" ${p?.tipo === 'herramienta' ? 'selected' : ''}>Herramienta o equipo (se presta y se devuelve)</option></select></label>
    ${p ? '' : '<p class="nota">El producto se crea en cero. Para cargarle existencia use “+ Entrada”.</p>'}
    <datalist id="dlCat">${cats.map(c => `<option>${esc(c)}</option>`).join('')}</datalist>
    <datalist id="dlUnd"><option>UND</option><option>MT</option><option>ML</option><option>KG</option><option>GL</option><option>ROLLO</option><option>CAJA</option><option>PAR</option></datalist>
  </form>`, { botones: `${p && esAdmin() ? '<button class="btn rojo izq" id="bBorrarProd">Eliminar</button>' : ''}<button class="btn sec" data-cerrar>Cancelar</button><button class="btn" id="bGP">Guardar</button>` });
  $('#bGP', m).onclick = async () => {
    const f = new FormData($('#fProd', m)); const cod = f.get('codigo').trim().toUpperCase(); const nom = f.get('nombre').trim();
    if (!cod || !nom) return toast('Código y descripción son obligatorios.', 'error');
    if (!p && prodPorCodigo(cod)) return toast('Ya existe un producto con ese código.', 'error');
    const data = { codigo: p ? p.codigo : cod, nombre: nom.toUpperCase(), unidad: f.get('unidad').trim().toUpperCase() || 'UND', categoria: (f.get('categoria').trim() || 'SIN CATEGORÍA').toUpperCase(),
      minimo: Number(f.get('minimo')) || 0, tipo: f.get('tipo'), act: Date.now() };
    if (!p) { data.stock = 0; data.creado = Date.now(); }
    try { await B.guardar('productos', idCodigo(data.codigo), data); cerrarModal(); toast('Producto guardado'); } catch (e) { toast(errorTexto(e), 'error'); }
  };
  const bb = $('#bBorrarProd', m);
  if (bb) bb.onclick = async () => {
    if (Number(p.stock) !== 0 && !(await confirmar(`${esc(p.nombre)} tiene existencia de ${fnum(p.stock)}. ¿Eliminarlo de todas formas? Los movimientos anteriores se conservan.`, { peligro: true, si: 'Eliminar' }))) return;
    if (Number(p.stock) === 0 && !(await confirmar(`¿Eliminar ${esc(p.nombre)} del catálogo?`, { peligro: true, si: 'Eliminar' }))) return;
    try { await B.borrar('productos', idCodigo(p.codigo)); toast('Producto eliminado'); } catch (e) { toast(errorTexto(e), 'error'); }
  };
}
function verKardex(codigo) {
  const p = prodPorCodigo(codigo); const l = S.movimientos.filter(mv => idCodigo(mv.codigo) === idCodigo(codigo));
  modal(`Kárdex · ${esc(p?.codigo)} ${esc(p?.nombre)}`, `<p>Existencia actual: <b>${fnum(p?.stock)} ${esc(p?.unidad || '')}</b></p>${tablaMovs(l)}`, { ancho: 'ancho' });
}

/* ------------------------------------------------------------ PRÉSTAMOS */
function vPrestamos() {
  let l = S.prestamos.slice().sort((a, b) => (b.ts || 0) - (a.ts || 0));
  if (S.f.estPrest) l = l.filter(p => p.estado === S.f.estPrest);
  const q = norm(S.f.qPrest).split(/\s+/).filter(Boolean);
  if (q.length) l = l.filter(p => { const t = norm(p.herramienta + ' ' + p.tecnico + ' ' + (p.codigo || '')); return q.every(w => t.includes(w)); });
  const porTec = {}; S.prestamos.filter(p => p.estado === 'prestado').forEach(p => { porTec[p.tecnico] = (porTec[p.tecnico] || 0) + 1; });
  return `
  <div class="cab-vista"><h2>Préstamo de herramientas y equipos</h2>${puedeOperar() ? '<div class="acciones"><button class="btn naranja" id="bPrestar">Prestar a técnico</button></div>' : ''}</div>
  ${Object.keys(porTec).length ? `<div class="chips">${Object.entries(porTec).sort().map(([t, n]) => `<button class="chip" data-qp="${esc(t)}">${esc(t)} <b>${n}</b></button>`).join('')}</div>` : ''}
  <div class="filtros"><input type="search" id="fqp" placeholder="Herramienta o técnico…" value="${esc(S.f.qPrest)}">
    <select id="fest"><option value="prestado" ${S.f.estPrest === 'prestado' ? 'selected' : ''}>Prestadas (pendientes)</option><option value="devuelto" ${S.f.estPrest === 'devuelto' ? 'selected' : ''}>Devueltas</option><option value="" ${!S.f.estPrest ? 'selected' : ''}>Todas</option></select></div>
  <p class="conteo">${l.length} registros</p>
  ${l.length ? `<div class="tabla-cont"><table class="tabla"><thead><tr><th>Herramienta / equipo</th><th class="num">Cant.</th><th>Técnico</th><th>Salió</th><th>Devuelto</th><th>Estado</th><th></th></tr></thead><tbody>
  ${l.map(p => `<tr><td><b>${esc(p.herramienta)}</b>${p.codigo ? ` <small>${esc(p.codigo)}</small>` : ''}${p.obs ? `<small class="obs">${esc(p.obs)}</small>` : ''}</td><td class="num">${fnum(p.cantidad)}</td><td>${esc(p.tecnico)}</td>
  <td>${ffecha(p.fechaSalida)}${p.estado === 'prestado' ? `<small class="obs">${diasDesde(p.fechaSalida)} días</small>` : ''}</td><td>${ffecha(p.fechaDevolucion)}${p.recibio ? `<small class="obs">recibió ${esc(p.recibio)}</small>` : ''}</td>
  <td><span class="tag ${p.estado === 'prestado' ? 'salida' : 'entrada'}">${p.estado === 'prestado' ? 'Prestado' : 'Devuelto'}</span></td>
  <td class="acc">${p.estado === 'prestado' && puedeOperar() ? `<button class="btn peq verde" data-devolver="${p.id}">Recibir devolución</button>` : ''}${esAdmin() ? `<button class="lnk rojo" data-borrarprest="${p.id}">Borrar</button>` : ''}</td></tr>`).join('')}
  </tbody></table></div>` : '<div class="vacio"><p>No hay registros con ese filtro.</p></div>'}`;
}
function formPrestamo() {
  let prod = null;
  const m = modal('Prestar herramienta o equipo', `<form id="fPr">
    <div class="g2"><label>Técnico<select name="tec" required>${opcionesTecnicos()}</select></label><label>Fecha<input type="date" name="fecha" value="${hoy()}"></label></div>
    <label class="chk"><input type="checkbox" id="libre"> No está en el catálogo (escribir nombre)</label>
    <div id="zonaCat"><div id="busc"></div><div id="sel"></div></div>
    <div id="zonaLibre" hidden><label>Herramienta o equipo<input name="libre" placeholder="Ej.: Taladro DeWalt serie 1234"></label></div>
    <div class="g2"><label>Cantidad<input type="number" name="cant" value="1" min="1" step="any"></label><label>Observación<input name="obs" placeholder="Estado en que sale, accesorios…"></label></div>
  </form>`, { botones: `<button class="btn sec" data-cerrar>Cancelar</button><button class="btn naranja" id="bGPr">Registrar préstamo</button>` });
  buscadorProducto($('#busc', m), { soloHerramientas: !!S.productos.some(p => p.tipo === 'herramienta'), alElegir: p => { prod = p; $('#sel', m).innerHTML = `<div class="sel-prod"><b>${esc(p.codigo)}</b> ${esc(p.nombre)} · disponibles: <b>${fnum(p.stock)}</b></div>`; } });
  $('#libre', m).onchange = e => { $('#zonaCat', m).hidden = e.target.checked; $('#zonaLibre', m).hidden = !e.target.checked; };
  $('#bGPr', m).onclick = async () => {
    const f = new FormData($('#fPr', m)); const t = S.tecnicos.find(x => x.id === f.get('tec'));
    if (!t) return toast('Seleccione el técnico.', 'error');
    const libre = $('#libre', m).checked; const cant = Number(f.get('cant')) || 1;
    if (!libre && !prod) return toast('Seleccione la herramienta.', 'error');
    if (libre && !f.get('libre').trim()) return toast('Escriba la herramienta o equipo.', 'error');
    const id = nuevoId();
    const data = { herramienta: libre ? f.get('libre').trim().toUpperCase() : prod.nombre, codigo: libre ? '' : prod.codigo, cantidad: cant, tecnico: t.nombre, tecnicoId: t.id,
      fechaSalida: f.get('fecha'), estado: 'prestado', obs: f.get('obs') || '', ...yo(), usuario: yo().nombre, ts: Date.now() };
    const b = $('#bGPr', m); ocupado(b, true);
    try {
      if (libre) await B.guardar('prestamos', id, data);
      else await B.movimiento({ tipo: 'prestamo', delta: -cant, cantidad: cant, codigo: prod.codigo, producto: prod.nombre, unidad: prod.unidad || '', fecha: f.get('fecha'),
        tecnico: t.nombre, tecnicoId: t.id, obs: 'Préstamo', ...yo(), usuario: yo().nombre, _prestamo: { id, data } });
      cerrarModal(); toast('Préstamo registrado');
    } catch (e) { toast(errorTexto(e), 'error'); ocupado(b, false); }
  };
}
async function devolver(id) {
  const p = S.prestamos.find(x => x.id === id); if (!p) return;
  const m = modal('Recibir devolución', `<p><b>${esc(p.herramienta)}</b> × ${fnum(p.cantidad)}<br>Técnico: ${esc(p.tecnico)} · salió el ${ffecha(p.fechaSalida)}</p>
    <label>Fecha de devolución<input type="date" id="fdev" value="${hoy()}"></label><label>Estado en que llega / observación<input id="odev" placeholder="Bueno, con daño, incompleto…"></label>`,
    { botones: `<button class="btn sec" data-cerrar>Cancelar</button><button class="btn verde" id="bDev">Confirmar devolución</button>` });
  $('#bDev', m).onclick = async () => {
    const upd = { estado: 'devuelto', fechaDevolucion: $('#fdev', m).value, obsDevolucion: $('#odev', m).value, recibio: yo().nombre };
    const b = $('#bDev', m); ocupado(b, true);
    try {
      if (p.codigo && prodPorCodigo(p.codigo)) await B.movimiento({ tipo: 'devolucion', delta: p.cantidad, cantidad: p.cantidad, codigo: p.codigo, producto: p.herramienta, unidad: prodPorCodigo(p.codigo).unidad || '',
        fecha: upd.fechaDevolucion, tecnico: p.tecnico, tecnicoId: p.tecnicoId, obs: upd.obsDevolucion || 'Devolución de préstamo', ...yo(), usuario: yo().nombre, _prestamo: { id, data: upd } });
      else await B.actualizar('prestamos', id, upd);
      cerrarModal(); toast('Devolución registrada');
    } catch (e) { toast(errorTexto(e), 'error'); ocupado(b, false); }
  };
}

/* ------------------------------------------------------------ CELULARES */
const EST_CEL = { asignado: 'Asignado', disponible: 'En bodega', reparacion: 'En reparación', baja: 'De baja' };
function vCelulares() {
  const q = norm(S.f.qCel).split(/\s+/).filter(Boolean);
  let l = S.celulares.slice().sort((a, b) => (a.tecnico || 'zz').localeCompare(b.tecnico || 'zz'));
  if (q.length) l = l.filter(c => { const t = norm([c.marca, c.modelo, c.color, c.imei, c.tecnico, c.linea, EST_CEL[c.estado]].join(' ')); return q.every(w => t.includes(w)); });
  const cuenta = Object.keys(EST_CEL).map(k => [k, S.celulares.filter(c => (c.estado || 'disponible') === k).length]).filter(x => x[1]);
  return `
  <div class="cab-vista"><h2>Inventario de celulares</h2><div class="acciones">${puedeOperar() ? '<button class="btn" id="bNuevoCel">+ Celular</button>' : ''}<button class="btn sec" id="bExpCel">Exportar Excel</button></div></div>
  <div class="chips">${cuenta.map(([k, n]) => `<span class="chip est-${k}">${EST_CEL[k]} <b>${n}</b></span>`).join('')}</div>
  <div class="filtros"><input type="search" id="fqc" placeholder="IMEI, técnico, marca, línea…" value="${esc(S.f.qCel)}"></div>
  <p class="conteo">${l.length} de ${S.celulares.length} equipos</p>
  ${l.length ? `<div class="tabla-cont"><table class="tabla"><thead><tr><th>Equipo</th><th>Color</th><th>IMEI / serial</th><th>Línea</th><th>Técnico responsable</th><th>Estado</th><th></th></tr></thead><tbody>
  ${l.map(c => `<tr><td><b>${esc(c.marca)}</b> <small>${esc(c.modelo)}</small></td><td>${esc(c.color)}</td><td class="mono">${esc(c.imei)}</td><td>${esc(c.linea || '')}</td>
  <td>${esc(c.tecnico || '—')}</td><td><span class="tag est-${c.estado || 'disponible'}">${EST_CEL[c.estado] || 'En bodega'}</span></td>
  <td class="acc"><button class="lnk" data-histcel="${c.id}">Historial</button>${puedeOperar() ? `<button class="lnk" data-asigcel="${c.id}">Reasignar</button><button class="lnk" data-editcel="${c.id}">Editar</button>` : ''}</td></tr>`).join('')}
  </tbody></table></div>` : `<div class="vacio"><p>${S.celulares.length ? 'Sin resultados.' : 'No hay celulares registrados.'}</p>${!S.celulares.length && esAdmin() ? '<a class="btn" href="#admin">Cargar datos iniciales</a>' : ''}</div>`}`;
}
function formCelular(id) {
  const c = id ? S.celulares.find(x => x.id === id) : null;
  const m = modal(c ? 'Editar celular' : 'Nuevo celular', `<form id="fCel">
    <div class="g2"><label>Marca<input name="marca" required value="${esc(c?.marca || '')}" placeholder="OPPO A5"></label><label>Modelo<input name="modelo" value="${esc(c?.modelo || '')}" placeholder="CPH2727"></label></div>
    <div class="g2"><label>Color<input name="color" value="${esc(c?.color || '')}"></label><label>IMEI / serial<input name="imei" required inputmode="numeric" value="${esc(c?.imei || '')}"></label></div>
    <div class="g2"><label>Línea (número)<input name="linea" value="${esc(c?.linea || '')}"></label><label>Estado<select name="estado">${Object.entries(EST_CEL).map(([k, v]) => `<option value="${k}" ${(c?.estado || 'disponible') === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label></div>
    ${c ? '' : `<label>Técnico responsable<select name="tec">${opcionesTecnicos('', '— En bodega, sin asignar —')}</select></label>`}
    <label>Observación<input name="obs" value="${esc(c?.obs || '')}"></label>
  </form>`, { botones: `${c && esAdmin() ? '<button class="btn rojo izq" id="bBorrarCel">Eliminar</button>' : ''}<button class="btn sec" data-cerrar>Cancelar</button><button class="btn" id="bGC">Guardar</button>` });
  $('#bGC', m).onclick = async () => {
    const f = new FormData($('#fCel', m)); const imei = f.get('imei').trim();
    if (!f.get('marca').trim() || !imei) return toast('Marca e IMEI son obligatorios.', 'error');
    if (S.celulares.some(x => x.imei === imei && x.id !== c?.id)) return toast('Ya hay un celular con ese IMEI.', 'error');
    const data = { marca: f.get('marca').trim().toUpperCase(), modelo: f.get('modelo').trim().toUpperCase(), color: f.get('color').trim().toUpperCase(), imei, linea: f.get('linea').trim(), estado: f.get('estado'), obs: f.get('obs').trim(), act: Date.now() };
    if (!c) {
      const t = S.tecnicos.find(x => x.id === f.get('tec'));
      Object.assign(data, { tecnico: t?.nombre || '', tecnicoId: t?.id || '', creado: Date.now(), historial: [{ fecha: hoy(), accion: t ? 'Asignado' : 'Ingresó a bodega', tecnico: t?.nombre || '', por: yo().nombre }] });
      if (t) data.estado = 'asignado';
    }
    try { await B.guardar('celulares', c?.id || 'imei-' + imei.replace(/\W/g, ''), data); cerrarModal(); toast('Celular guardado'); } catch (e) { toast(errorTexto(e), 'error'); }
  };
  const bb = $('#bBorrarCel', m);
  if (bb) bb.onclick = async () => { if (await confirmar(`¿Eliminar el celular ${esc(c.marca)} IMEI ${esc(c.imei)}? Si se dañó o se perdió, mejor márquelo “De baja” para conservar el historial.`, { peligro: true, si: 'Eliminar' })) { try { await B.borrar('celulares', c.id); toast('Celular eliminado'); } catch (e) { toast(errorTexto(e), 'error'); } } };
}
function reasignarCelular(id) {
  const c = S.celulares.find(x => x.id === id);
  const m = modal('Reasignar celular', `<p><b>${esc(c.marca)} ${esc(c.modelo)}</b> · IMEI ${esc(c.imei)}<br>Actual: ${esc(c.tecnico || 'en bodega')}</p>
    <label>Nuevo responsable<select id="nt">${opcionesTecnicos(c.tecnicoId, '— Devolver a bodega —')}</select></label>
    <label>Estado<select id="ne">${Object.entries(EST_CEL).map(([k, v]) => `<option value="${k}" ${c.estado === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
    <label>Observación (estado del equipo, cargador, forro…)<input id="no"></label>`, { botones: `<button class="btn sec" data-cerrar>Cancelar</button><button class="btn" id="bRA">Guardar</button>` });
  $('#nt', m).onchange = e => { $('#ne', m).value = e.target.value ? 'asignado' : 'disponible'; };
  $('#bRA', m).onclick = async () => {
    const t = S.tecnicos.find(x => x.id === $('#nt', m).value); const est = $('#ne', m).value;
    const hist = [...(c.historial || []), { fecha: hoy(), accion: t ? (c.tecnicoId && c.tecnicoId !== t.id ? `Pasó de ${c.tecnico} a ${t.nombre}` : 'Asignado') : `Devuelto a bodega por ${c.tecnico || '—'}`, tecnico: t?.nombre || '', estado: EST_CEL[est], obs: $('#no', m).value, por: yo().nombre }];
    try { await B.guardar('celulares', c.id, { tecnico: t?.nombre || '', tecnicoId: t?.id || '', estado: est, historial: hist, act: Date.now() }); cerrarModal(); toast('Celular actualizado'); } catch (e) { toast(errorTexto(e), 'error'); }
  };
}
function historialCelular(id) {
  const c = S.celulares.find(x => x.id === id);
  modal(`Historial · ${esc(c.marca)} ${esc(c.imei)}`, (c.historial || []).length ? `<ul class="lista">${c.historial.slice().reverse().map(h => `<li><b>${ffecha(h.fecha)}</b> · ${esc(h.accion)}${h.estado ? ` (${esc(h.estado)})` : ''}<small>${esc(h.obs || '')}${h.por ? ' · registró ' + esc(h.por) : ''}</small></li>`).join('')}</ul>` : '<p class="vacio-peq">Sin historial.</p>');
}

/* ------------------------------------------------------------ TÉCNICOS */
function vTecnicos() {
  const l = S.tecnicos.slice().sort((a, b) => (b.activo !== false) - (a.activo !== false) || a.nombre.localeCompare(b.nombre));
  return `
  <div class="cab-vista"><h2>Técnicos</h2>${esAdmin() ? '<div class="acciones"><button class="btn" id="bNuevoTec">+ Agregar técnico</button></div>' : ''}</div>
  ${!esAdmin() ? '<p class="nota">Solo el administrador puede agregar, editar o eliminar técnicos.</p>' : ''}
  <div class="tarjetas">${l.map(t => {
    const cel = S.celulares.filter(c => c.tecnicoId === t.id); const pr = S.prestamos.filter(p => p.tecnicoId === t.id && p.estado === 'prestado');
    const sal = S.movimientos.filter(mv => mv.tecnicoId === t.id && mv.tipo === 'salida');
    return `<div class="tarjeta tec ${t.activo === false ? 'inactivo' : ''}"><div class="tec-cab"><div class="avatar">${esc(t.nombre.split(' ').map(x => x[0]).slice(0, 2).join(''))}</div>
    <div><b>${esc(t.nombre)}</b><small>${esc([t.cargo, t.cedula && 'C.C. ' + t.cedula, t.telefono].filter(Boolean).join(' · ') || 'Técnico')}</small>${t.activo === false ? '<span class="tag baja">Inactivo</span>' : ''}</div></div>
    <div class="tec-datos"><span>☏ ${cel.length ? cel.map(c => esc(c.marca)).join(', ') : 'Sin celular'}</span><span>⇄ ${pr.length} prestado${pr.length === 1 ? '' : 's'}</span><span>▦ ${sal.length} salidas</span></div>
    <div class="tec-acc"><button class="lnk" data-vertec="${t.id}">Ver detalle</button>${esAdmin() ? `<button class="lnk" data-edittec="${t.id}">Editar</button><button class="lnk rojo" data-borrartec="${t.id}">Eliminar</button>` : ''}</div></div>`; }).join('') || '<div class="vacio"><p>No hay técnicos registrados.</p></div>'}</div>`;
}
function formTecnico(id) {
  if (!esAdmin()) return toast('Solo el administrador puede hacer esto.', 'error');
  const t = id ? S.tecnicos.find(x => x.id === id) : null;
  const m = modal(t ? 'Editar técnico' : 'Agregar técnico', `<form id="fTec">
    <label>Nombre completo<input name="nombre" required value="${esc(t?.nombre || '')}"></label>
    <div class="g2"><label>Cédula<input name="cedula" inputmode="numeric" value="${esc(t?.cedula || '')}"></label><label>Teléfono<input name="telefono" inputmode="tel" value="${esc(t?.telefono || '')}"></label></div>
    <div class="g2"><label>Cargo<input name="cargo" value="${esc(t?.cargo || 'TÉCNICO')}"></label><label>Estado<select name="activo"><option value="1">Activo</option><option value="0" ${t?.activo === false ? 'selected' : ''}>Inactivo</option></select></label></div>
  </form>`, { botones: `<button class="btn sec" data-cerrar>Cancelar</button><button class="btn" id="bGT">Guardar</button>` });
  $('#bGT', m).onclick = async () => {
    const f = new FormData($('#fTec', m)); const nombre = f.get('nombre').trim().replace(/\s+/g, ' ').toUpperCase();
    if (!nombre) return toast('Escriba el nombre.', 'error');
    const nid = t?.id || slug(nombre);
    if (!t && S.tecnicos.some(x => x.id === nid)) return toast('Ya existe un técnico con ese nombre.', 'error');
    const data = { nombre, cedula: f.get('cedula').trim(), telefono: f.get('telefono').trim(), cargo: f.get('cargo').trim().toUpperCase(), activo: f.get('activo') === '1', act: Date.now() };
    if (!t) data.creado = Date.now();
    try {
      await B.guardar('tecnicos', nid, data);
      // Si cambió el nombre, se actualiza en celulares y préstamos abiertos
      if (t && t.nombre !== nombre) {
        const ops = [...S.celulares.filter(c => c.tecnicoId === t.id).map(c => ({ col: 'celulares', id: c.id, data: { tecnico: nombre } })),
          ...S.prestamos.filter(p => p.tecnicoId === t.id && p.estado === 'prestado').map(p => ({ col: 'prestamos', id: p.id, data: { tecnico: nombre } }))];
        if (ops.length) await B.lote(ops);
      }
      cerrarModal(); toast('Técnico guardado');
    } catch (e) { toast(errorTexto(e), 'error'); }
  };
}
async function borrarTecnico(id) {
  const t = S.tecnicos.find(x => x.id === id);
  const cel = S.celulares.filter(c => c.tecnicoId === id).length; const pr = S.prestamos.filter(p => p.tecnicoId === id && p.estado === 'prestado').length;
  const pend = cel || pr ? `<br><br><b>Ojo:</b> tiene ${cel} celular(es) y ${pr} herramienta(s) a su nombre. Recíbalos o reasígnelos primero; si lo elimina, esos registros quedan con su nombre pero sin técnico activo.` : '';
  if (!(await confirmar(`¿Eliminar a <b>${esc(t.nombre)}</b> de la lista de técnicos? Su historial de salidas se conserva.${pend}`, { peligro: true, si: 'Eliminar técnico' }))) return;
  try { await B.borrar('tecnicos', id); toast('Técnico eliminado'); } catch (e) { toast(errorTexto(e), 'error'); }
}
function verTecnico(id) {
  const t = S.tecnicos.find(x => x.id === id);
  const cel = S.celulares.filter(c => c.tecnicoId === id); const pr = S.prestamos.filter(p => p.tecnicoId === id && p.estado === 'prestado');
  const sal = S.movimientos.filter(mv => mv.tecnicoId === id && (mv.tipo === 'salida'));
  modal(esc(t.nombre), `
    <h4>Celular asignado</h4>${cel.length ? `<ul class="lista">${cel.map(c => `<li><b>${esc(c.marca)} ${esc(c.modelo)}</b> ${esc(c.color)}<small>IMEI ${esc(c.imei)}${c.linea ? ' · línea ' + esc(c.linea) : ''}</small></li>`).join('')}</ul>` : '<p class="vacio-peq">Ninguno.</p>'}
    <h4>Herramientas en su poder</h4>${pr.length ? `<ul class="lista">${pr.map(p => `<li><b>${esc(p.herramienta)}</b> × ${fnum(p.cantidad)}<small>desde ${ffecha(p.fechaSalida)} (${diasDesde(p.fechaSalida)} días)</small></li>`).join('')}</ul>` : '<p class="vacio-peq">Ninguna.</p>'}
    <h4>Materiales entregados (últimos)</h4>${tablaMovs(sal.slice(0, 40), true)}`, { ancho: 'ancho', botones: `<button class="btn sec" id="bExpTec">Exportar a Excel</button>` });
  $('#bExpTec').onclick = () => exportarExcel(`Tecnico_${slug(t.nombre)}_${hoy()}.xlsx`, {
    Celulares: cel.map(filaCel), 'Herramientas prestadas': pr.map(filaPrest), Salidas: sal.map(filaMov) });
}

/* ------------------------------------------------------------ ADMINISTRACIÓN */
function vAdmin() {
  const us = S.usuarios.slice().sort((a, b) => (a.rol === 'admin' ? -1 : 1) - (b.rol === 'admin' ? -1 : 1) || (a.nombre || '').localeCompare(b.nombre || ''));
  const enl = cfg().enlaces || [{ nombre: 'AS Mantenimiento', url: MANT_URL }];
  return `
  <div class="cab-vista"><h2>Administración</h2></div>
  <section class="tarjeta"><div class="cab-tarj"><h3>Usuarios que entran a AS SYSTEMS</h3><button class="btn" id="bNuevoUsr">+ Usuario</button></div>
    <p class="nota">Usted es el único administrador. Los demás pueden ser <b>Bodega</b> (registran entradas, salidas, préstamos y celulares) o <b>Solo consulta</b>. Los técnicos de la lista de técnicos no necesitan usuario.</p>
    <div class="tabla-cont"><table class="tabla"><thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Estado</th><th></th></tr></thead><tbody>
    ${us.map(u => `<tr><td><b>${esc(u.nombre)}</b></td><td>${esc(u.correo)}</td><td>${ROLES[u.rol] || u.rol}</td><td>${u.activo === false ? '<span class="tag baja">Inactivo</span>' : '<span class="tag entrada">Activo</span>'}</td>
    <td class="acc">${u.rol === 'admin' ? '' : `<button class="lnk" data-editusr="${u.id}">Editar</button>`}</td></tr>`).join('')}</tbody></table></div></section>

  <section class="tarjeta"><h3>Cargar información desde Excel</h3>
    <p class="nota">Aquí se sube el Excel que se exporte del inventario del computador de KarlaM (catálogo con existencias, entradas, salidas, préstamos), el inventario de celulares o una lista de técnicos. El sistema reconoce las hojas por su nombre y por los títulos de las columnas, y le muestra todo antes de guardar.</p>
    <label class="subir"><input type="file" id="fileImp" accept=".xlsx,.xlsm,.xls,.csv" hidden><span class="btn">Seleccionar archivo Excel…</span></label>
    <div id="previa"></div></section>

  <section class="tarjeta"><h3>Datos iniciales</h3>
    <p class="nota">Carga los técnicos de Arauca y los 8 celulares del inventario de equipos celulares (OPPO A5 y Vivo Y11d). No duplica: si ya existen, los actualiza.</p>
    <button class="btn sec" id="bSemilla">Cargar técnicos y celulares iniciales</button></section>

  <section class="tarjeta"><h3>Copia de seguridad</h3><p class="nota">Descarga toda la información en un Excel (existencias, movimientos, préstamos, celulares y técnicos).</p>
    <button class="btn sec" id="bExpTodo">Descargar copia en Excel</button></section>

  <section class="tarjeta"><h3>Aplicativos conectados</h3><p class="nota">Accesos que aparecen en el inicio de AS SYSTEMS.</p>
    <div id="enlaces">${enl.map((e, i) => `<div class="g2 enl"><input data-en="${i}" value="${esc(e.nombre)}" placeholder="Nombre"><input data-eu="${i}" value="${esc(e.url)}" placeholder="https://…"></div>`).join('')}</div>
    <button class="btn sec peq" id="bMasEnl">+ Otro aplicativo</button> <button class="btn peq" id="bGuardaEnl">Guardar accesos</button></section>
  <p class="nota centro">AS SYSTEMS v${VERSION} · ${B.modo === 'nube' ? 'Conectado a la nube (Firebase)' : 'Modo de prueba local'}</p>`;
}
function formUsuario(id) {
  const u = id ? S.usuarios.find(x => x.id === id) : null;
  const m = modal(u ? 'Editar usuario' : 'Nuevo usuario', `<form id="fUsr">
    <label>Nombre<input name="nombre" required value="${esc(u?.nombre || '')}"></label>
    ${u ? `<p>Correo: <b>${esc(u.correo)}</b></p>` : `<div class="g2"><label>Correo<input type="email" name="e" required></label><label>Contraseña inicial (mín. 6)<input name="p" minlength="6" required></label></div>`}
    <div class="g2"><label>Rol<select name="rol"><option value="bodega">Bodega / almacenista</option><option value="consulta" ${u?.rol === 'consulta' ? 'selected' : ''}>Solo consulta</option></select></label>
    ${u ? `<label>Estado<select name="activo"><option value="1">Activo</option><option value="0" ${u.activo === false ? 'selected' : ''}>Inactivo (no puede entrar)</option></select></label>` : ''}</div>
  </form>`, { botones: `<button class="btn sec" data-cerrar>Cancelar</button><button class="btn" id="bGU">Guardar</button>` });
  $('#bGU', m).onclick = async () => {
    const f = new FormData($('#fUsr', m)); const b = $('#bGU', m);
    if (!f.get('nombre').trim()) return toast('Escriba el nombre.', 'error');
    ocupado(b, true);
    try {
      if (u) await B.actualizar('usuarios', u.id, { nombre: f.get('nombre').trim(), rol: f.get('rol'), activo: f.get('activo') === '1' });
      else await B.crearUsuario(f.get('e').trim(), f.get('p'), { nombre: f.get('nombre').trim(), rol: f.get('rol') });
      cerrarModal(); toast(u ? 'Usuario actualizado' : 'Usuario creado. Ya puede entrar con su correo y contraseña.');
    } catch (e) { toast(errorTexto(e), 'error'); ocupado(b, false); }
  };
}

let HOJAS = null;
async function previaImportar(file) {
  const cont = $('#previa'); cont.innerHTML = '<p class="nota">Leyendo archivo…</p>';
  try { HOJAS = await leerExcel(file); } catch (e) { cont.innerHTML = ''; return toast('No se pudo leer el archivo: ' + e.message, 'error'); }
  const hayStock = HOJAS.some(h => h.tipo === 'productos' && h.columnas?.includes('cantidad'));
  cont.innerHTML = `<h4>${esc(file.name)}</h4>
  <div class="tabla-cont"><table class="tabla"><thead><tr><th>Hoja</th><th>Filas</th><th>Columnas reconocidas</th><th>Importar como</th></tr></thead><tbody>
  ${HOJAS.map((h, i) => `<tr><td><b>${esc(h.nombre)}</b></td><td class="num">${h.total || 0}</td><td><small>${(h.columnas || []).join(', ') || '—'}</small></td>
  <td><select data-hoja="${i}">${Object.entries(TIPOS).map(([k, v]) => `<option value="${k}" ${k === h.tipo ? 'selected' : ''}>${v}</option>`).join('')}</select></td></tr>`).join('')}</tbody></table></div>
  <label class="chk"><input type="checkbox" id="optStock" ${hayStock ? 'checked' : ''}> Tomar la existencia (cantidad/stock/saldo) del Excel como existencia actual</label>
  <label class="chk"><input type="checkbox" id="optMov" ${hayStock ? '' : 'checked'}> Las entradas y salidas del Excel suman y restan a la existencia</label>
  <p class="nota">Si el Excel trae el saldo actual y también el historial, deje marcada solo la primera opción: así el historial queda como consulta y no se descuenta dos veces.</p>
  <button class="btn verde" id="bImportar">Importar a AS SYSTEMS</button>`;
  $$('[data-hoja]', cont).forEach(s => s.onchange = () => { HOJAS[+s.dataset.hoja].tipo = s.value; });
  $('#bImportar').onclick = async () => {
    const { ops, resumen } = prepararImportacion(HOJAS, { productos: S.productos, tecnicos: S.tecnicos, celulares: S.celulares, usuario: yo(), util: { idCodigo, slug, nuevoId } },
      { stockDesdeExcel: $('#optStock').checked, movAjustanStock: $('#optMov').checked });
    if (!ops.length) return toast('No se encontró nada para importar. Revise el tipo de cada hoja.', 'error');
    const txt = `Se van a guardar: <b>${resumen.productos}</b> productos, <b>${resumen.movimientos}</b> movimientos, <b>${resumen.prestamos}</b> préstamos, <b>${resumen.celulares}</b> celulares y <b>${resumen.tecnicos}</b> técnicos nuevos.${resumen.omitidas ? ` Se omiten ${resumen.omitidas} filas vacías o incompletas.` : ''}`;
    if (!(await confirmar(txt, { si: 'Importar' }))) return;
    const b = $('#bImportar'); ocupado(b, true);
    try { await B.lote(ops, (a, t) => { b.textContent = `Guardando ${a} de ${t}…`; }); toast('Importación terminada'); $('#previa').innerHTML = `<div class="aviso verde">Importación terminada: ${txt.replace(/<\/?b>/g, '')}</div>`; HOJAS = null; }
    catch (e) { toast(errorTexto(e), 'error'); ocupado(b, false); }
  };
}

// Datos iniciales: técnicos de Arauca y el inventario de celulares (archivo "inventario de equipos celulares")
const SEMILLA_TECNICOS = ['WILLIAM BARRERA', 'DANILO HERNANDEZ', 'JESUS LOPEZ', 'ANDERSON MIRANDA', 'JAVIER MANCERA', 'JULIO GUALDRON', 'GERSON', 'GUSTAVO CAROPRESE', 'DAVID MOJICA', 'ANDRES GUALDRON'];
const SEMILLA_CEL = [
  ['OPPO A5', 'CPH2727', 'VERDE', '868635070735042', 'WILLIAM BARRERA'], ['OPPO A5', 'CPH2727', 'VERDE', '868635071063428', 'JAVIER MANCERA'],
  ['OPPO A5', 'CPH2727', 'VERDE', '868635071027969', 'DAVID MOJICA'], ['OPPO A5', 'CPH2727', 'VERDE', '868635070728948', 'ANDRES GUALDRON'],
  ['OPPO A5', 'CPH2727', 'VERDE', '868635070882414', 'JESUS LOPEZ'], ['OPPO A5', 'CPH2727', 'VERDE', '868635070868538', 'DANILO HERNANDEZ'],
  ['OPPO A5', 'CPH2727', 'VERDE', '868635070740547', 'ANDERSON MIRANDA'], ['VIVO Y11D', 'V2555', 'PLATA', '867155082241641', 'ANDRES GUALDRON']];
async function cargarSemilla() {
  if (!(await confirmar(`Se cargan ${SEMILLA_TECNICOS.length} técnicos y ${SEMILLA_CEL.length} celulares. Los que ya existan se actualizan, no se duplican.`, { si: 'Cargar' }))) return;
  const ahora = Date.now(); const ops = [];
  SEMILLA_TECNICOS.forEach(n => { const id = slug(n); const ya = S.tecnicos.find(t => t.id === id); ops.push({ col: 'tecnicos', id, data: ya ? { act: ahora } : { nombre: n, cargo: 'TÉCNICO', activo: true, creado: ahora } }); });
  SEMILLA_CEL.forEach(([marca, modelo, color, imei, tec]) => {
    const id = 'imei-' + imei; const ya = S.celulares.find(c => c.id === id || c.imei === imei);
    ops.push({ col: 'celulares', id: ya?.id || id, data: { marca, modelo, color, imei, tecnico: tec, tecnicoId: slug(tec), estado: 'asignado', act: ahora,
      ...(ya ? {} : { creado: ahora, linea: '', obs: '', historial: [{ fecha: hoy(), accion: 'Asignado (inventario inicial)', tecnico: tec, por: yo().nombre }] }) } });
  });
  try { await B.lote(ops); toast('Técnicos y celulares cargados'); } catch (e) { toast(errorTexto(e), 'error'); }
}

/* ------------------------------------------------------------ exportar */
const filaMov = m => ({ Fecha: ffecha(m.fecha), Tipo: TIPO_MOV[m.tipo] || m.tipo, Código: m.codigo, Producto: m.producto, Unidad: m.unidad, Cantidad: m.cantidad, Saldo: m.saldo ?? '', Técnico: m.tecnico, Proveedor: m.proveedor || '', 'Destino / obra': m.destino || '', Documento: m.doc || '', Observación: m.obs || '', Registró: m.usuario || '' });
const filaPrest = p => ({ Herramienta: p.herramienta, Código: p.codigo || '', Cantidad: p.cantidad, Técnico: p.tecnico, 'Fecha salida': ffecha(p.fechaSalida), Estado: p.estado, 'Fecha devolución': ffecha(p.fechaDevolucion), 'Recibió': p.recibio || '', Observación: [p.obs, p.obsDevolucion].filter(Boolean).join(' / ') });
const filaCel = c => ({ 'Marca del equipo': c.marca, Modelo: c.modelo, Color: c.color, 'IMEI-Serial': c.imei, Línea: c.linea || '', 'Técnico responsable': c.tecnico || '', Estado: EST_CEL[c.estado] || c.estado, Observación: c.obs || '' });
function exportarTodo() {
  exportarExcel(`AS_SYSTEMS_copia_${hoy()}.xlsx`, {
    Existencias: S.productos.slice().sort((a, b) => a.nombre.localeCompare(b.nombre)).map(p => ({ Código: p.codigo, Descripción: p.nombre, Categoría: p.categoria, Unidad: p.unidad, Tipo: p.tipo, Existencia: Number(p.stock) || 0, 'Stock mínimo': p.minimo || 0 })),
    Movimientos: S.movimientos.map(filaMov), Préstamos: S.prestamos.map(filaPrest), Celulares: S.celulares.map(filaCel),
    Técnicos: S.tecnicos.map(t => ({ Nombre: t.nombre, Cédula: t.cedula || '', Cargo: t.cargo || '', Teléfono: t.telefono || '', Estado: t.activo === false ? 'Inactivo' : 'Activo' }))
  });
}

/* ------------------------------------------------------------ eventos por vista */
function enlazar(r) {
  const on = (sel, ev, fn) => { const el = $(sel); if (el) el.addEventListener(ev, fn); };
  const v = $('#vista');
  v.onclick = e => {
    const d = e.target.closest('button,[data-sub]')?.dataset || {};
    if (d.sub) { S.f.sub = d.sub; S.f.q = ''; pintarVista(); }
    else if (d.kardex) verKardex(d.kardex);
    else if (d.editprod) formProducto(d.editprod);
    else if (d.devolver) devolver(d.devolver);
    else if (d.borrarprest) confirmar('¿Borrar este registro de préstamo? No cambia las existencias.', { peligro: true, si: 'Borrar' }).then(ok => ok && B.borrar('prestamos', d.borrarprest).then(() => toast('Registro borrado')).catch(er => toast(errorTexto(er), 'error')));
    else if (d.qp !== undefined) { S.f.qPrest = d.qp; S.f.estPrest = 'prestado'; pintarVista(); }
    else if (d.editcel) formCelular(d.editcel);
    else if (d.asigcel) reasignarCelular(d.asigcel);
    else if (d.histcel) historialCelular(d.histcel);
    else if (d.vertec) verTecnico(d.vertec);
    else if (d.edittec) formTecnico(d.edittec);
    else if (d.borrartec) borrarTecnico(d.borrartec);
    else if (d.editusr) formUsuario(d.editusr);
  };
  on('#bEntrada', 'click', () => formMovimiento('entrada'));
  on('#bSalida', 'click', () => formMovimiento('salida'));
  on('#bAjuste', 'click', formAjuste);
  on('#bNuevoProd', 'click', () => formProducto());
  on('#fq', 'input', e => { S.f.q = e.target.value; pintarVista(); });
  on('#fcat', 'change', e => { S.f.cat = e.target.value; pintarVista(); });
  on('#fbajo', 'change', e => { S.f.bajo = e.target.checked; pintarVista(); });
  on('#ftipo', 'change', e => { S.f.tipoMov = e.target.value; pintarVista(); });
  on('#ftec', 'change', e => { S.f.tecMov = e.target.value; pintarVista(); });
  on('#fdesde', 'change', e => { S.f.desde = e.target.value; pintarVista(); });
  on('#fhasta', 'change', e => { S.f.hasta = e.target.value; pintarVista(); });
  on('#bExpMov', 'click', () => {
    let l = S.movimientos; if (S.f.tipoMov) l = l.filter(m => m.tipo === S.f.tipoMov); if (S.f.tecMov) l = l.filter(m => m.tecnicoId === S.f.tecMov);
    if (S.f.desde) l = l.filter(m => m.fecha >= S.f.desde); if (S.f.hasta) l = l.filter(m => m.fecha <= S.f.hasta);
    exportarExcel(`Movimientos_${hoy()}.xlsx`, { Movimientos: l.map(filaMov) });
  });
  on('#bPrestar', 'click', formPrestamo);
  on('#fqp', 'input', e => { S.f.qPrest = e.target.value; pintarVista(); });
  on('#fest', 'change', e => { S.f.estPrest = e.target.value; pintarVista(); });
  on('#bNuevoCel', 'click', () => formCelular());
  on('#bExpCel', 'click', () => exportarExcel(`Celulares_${hoy()}.xlsx`, { Celulares: S.celulares.map(filaCel) }));
  on('#fqc', 'input', e => { S.f.qCel = e.target.value; pintarVista(); });
  on('#bNuevoTec', 'click', () => formTecnico());
  on('#bNuevoUsr', 'click', () => formUsuario());
  on('#fileImp', 'change', e => { const f = e.target.files[0]; if (f) previaImportar(f); e.target.value = ''; });
  on('#bSemilla', 'click', cargarSemilla);
  on('#bExpTodo', 'click', exportarTodo);
  on('#bMasEnl', 'click', () => { const i = $$('#enlaces .enl').length; $('#enlaces').insertAdjacentHTML('beforeend', `<div class="g2 enl"><input data-en="${i}" placeholder="Nombre"><input data-eu="${i}" placeholder="https://…"></div>`); });
  on('#bGuardaEnl', 'click', async () => {
    const enlaces = $$('#enlaces .enl').map(d => ({ nombre: $('[data-en]', d).value.trim(), url: $('[data-eu]', d).value.trim() })).filter(e => e.nombre && /^https?:\/\//.test(e.url));
    try { await B.guardar('config', 'general', { enlaces }); toast('Accesos guardados'); } catch (e) { toast(errorTexto(e), 'error'); }
  });
}

if ('serviceWorker' in navigator && location.protocol.startsWith('http') && !/localhost|127\.0\.0\.1/.test(location.hostname)) {
  navigator.serviceWorker.register('sw.js').catch(() => { });
}
