// Lectura flexible de Excel: reconoce hojas de catálogo/existencias, entradas, salidas,
// préstamos, celulares y técnicos por el nombre de la hoja y por los títulos de las columnas.
import * as XLSX from 'xlsx';

const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

// Orden importa: la primera regla que calce se queda con la columna
const CAMPOS = [
  ['anulado', /anulad/],
  ['registro', /^registr/],
  ['imei', /imei|serial|n.? ?de ?serie/],
  ['codigo', /^cod|codigo|referencia|^ref\b|item/],
  ['marca', /marca/],
  ['modelo', /modelo/],
  ['color', /color/],
  ['linea', /linea|numero (celular|telefono)|n.? ?celular|sim/],
  ['fecha', /fecha/],
  ['tecnico', /tecnico|responsable|recibe|recibio|entregado a|asignado|funcionario|trabajador/],
  ['cedula', /cedula|c\.c|documento de identidad|identificacion/],
  ['cargo', /cargo/],
  ['telefono', /telefono|celular|contacto/],
  ['nombre', /descripcion|nombre|producto|material|articulo|elemento|herramienta|equipo/],
  ['unidad', /^unidad|^und|^u\.?m|medida/],
  ['categoria', /categoria|grupo|familia|clase|linea de/],
  ['minimo', /minim|^min\b/],
  ['maximo', /^alto|maxim|^max\b/],
  ['valor', /valor|precio|costo/],
  ['cantidad', /cant|stock|existencia|saldo|inventario|^total|inicial|disponible/],
  ['tipo', /tipo|movimiento|^mov/],
  ['destino', /obra|destino|direccion|proyecto|sector|barrio|usuario|suscriptor/],
  ['doc', /factura|remision|documento|soporte|orden|^doc|consecutivo|vale/],
  ['proveedor', /proveedor/],
  ['estado', /estado/],
  ['obs', /observ|nota|coment/],
];

export const TIPOS = {
  productos: 'Catálogo / existencias',
  entrada: 'Entradas de bodega',
  salida: 'Salidas de bodega',
  movimientos: 'Movimientos (columna tipo)',
  prestamos: 'Préstamos de herramientas',
  celulares: 'Celulares',
  tecnicos: 'Técnicos',
  ignorar: 'No importar'
};

function mapearEncabezado(fila) {
  const map = {}; let hits = 0;
  fila.forEach((c, i) => {
    const t = norm(c); if (!t) return;
    for (const [campo, re] of CAMPOS) {
      if (map[campo] === undefined && re.test(t)) { map[campo] = i; hits++; break; }
    }
  });
  return { map, hits };
}

function clasificar(nombreHoja, map) {
  const n = norm(nombreHoja);
  if (map.imei !== undefined || /celular|telefono|movil/.test(n)) return 'celulares';
  if (/prestamo|herramienta/.test(n)) return 'prestamos';
  if (/entrada|ingreso|compra/.test(n)) return 'entrada';
  if (/salida|despacho|consumo/.test(n)) return 'salida';
  if (/tecnico|personal|trabajador/.test(n)) return 'tecnicos';
  if (/movim|kardex/.test(n) && map.tipo !== undefined) return 'movimientos';
  if (map.codigo !== undefined && map.nombre !== undefined) return 'productos';
  if (map.nombre !== undefined && (map.cedula !== undefined || map.cargo !== undefined)) return 'tecnicos';
  return 'ignorar';
}

function aFecha(v) {
  if (v === null || v === undefined || v === '') return '';
  if (v instanceof Date && !isNaN(v)) return v.toISOString().slice(0, 10);
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    const d = XLSX.SSF.parse_date_code(v); return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if (m) { const y = m[3].length === 2 ? '20' + m[3] : m[3]; return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; }
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return m[0];
  return s;
}
const num = v => { if (typeof v === 'number') return v; const n = parseFloat(String(v ?? '').replace(/\s/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.')); return isNaN(n) ? 0 : n; };
const txt = v => (v === null || v === undefined) ? '' : (typeof v === 'number' && Number.isInteger(v) ? String(v) : String(v).trim());
const limpiaNombre = s => txt(s).replace(/\s+/g, ' ').toUpperCase();

export async function leerExcel(file) {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array', cellDates: true });
  const hojas = [];
  for (const nombre of wb.SheetNames) {
    const filas = XLSX.utils.sheet_to_json(wb.Sheets[nombre], { header: 1, raw: true, defval: null, blankrows: false });
    let mejor = { idx: -1, map: {}, hits: 0 };
    for (let i = 0; i < Math.min(filas.length, 15); i++) {
      const r = mapearEncabezado(filas[i] || []);
      if (r.hits > mejor.hits) mejor = { idx: i, ...r };
    }
    if (mejor.hits < 2) { hojas.push({ nombre, tipo: 'ignorar', filas: [], map: {}, total: 0 }); continue; }
    const datos = filas.slice(mejor.idx + 1).filter(f => f && f.some(c => c !== null && String(c).trim() !== ''));
    const tipo = clasificar(nombre, mejor.map);
    const registros = datos.map(f => {
      const o = {}; for (const [k, i] of Object.entries(mejor.map)) o[k] = f[i]; return o;
    });
    hojas.push({ nombre, tipo, registros, map: mejor.map, total: registros.length,
      columnas: Object.keys(mejor.map) });
  }
  return hojas;
}

// Convierte las hojas en operaciones para guardar. ctx: {productos, tecnicos, celulares} actuales, usuario
export function prepararImportacion(hojas, ctx, opciones) {
  const { idCodigo, slug, nuevoId } = ctx.util;
  const ops = []; const resumen = { productos: 0, movimientos: 0, prestamos: 0, celulares: 0, tecnicos: 0, omitidas: 0 };
  const tecnicos = new Map(ctx.tecnicos.map(t => [slug(t.nombre), t]));
  const productos = new Map(ctx.productos.map(p => [idCodigo(p.codigo), { ...p }]));
  const porNombre = new Map(ctx.productos.map(p => [norm(p.nombre), p]));
  const celulares = new Map(ctx.celulares.filter(c => c.imei).map(c => [String(c.imei), c]));
  const deltas = new Map();
  const ahora = Date.now();

  const tecnico = nombre => {
    const n = limpiaNombre(nombre); if (!n) return null;
    const id = slug(n);
    if (!tecnicos.has(id)) {
      const t = { id, nombre: n, activo: true, creado: ahora, origen: 'importado' };
      tecnicos.set(id, t); ops.push({ col: 'tecnicos', id, data: { nombre: n, activo: true, creado: ahora, origen: 'importado' } });
      resumen.tecnicos++;
    }
    return tecnicos.get(id);
  };
  const productoDe = r => {
    if (txt(r.codigo)) { const p = productos.get(idCodigo(txt(r.codigo))); if (p) return p; }
    if (txt(r.nombre)) { const p = porNombre.get(norm(r.nombre)); if (p) return p; }
    if (!txt(r.codigo) && !txt(r.nombre)) return null;
    // Producto que no estaba en catálogo: se crea
    const codigo = txt(r.codigo) || ('IMP-' + slug(r.nombre).slice(0, 20).toUpperCase());
    const p = { codigo, nombre: txt(r.nombre) || codigo, unidad: txt(r.unidad) || 'UND', categoria: txt(r.categoria) || 'SIN CATEGORÍA', tipo: 'material', stock: 0, minimo: 0 };
    productos.set(idCodigo(codigo), p); porNombre.set(norm(p.nombre), p);
    ops.push({ col: 'productos', id: idCodigo(codigo), data: { ...p, creado: ahora } }); resumen.productos++;
    return p;
  };

  for (const h of hojas) {
    if (h.tipo === 'ignorar') continue;
    for (const r of h.registros) {
      if (r.anulado !== undefined && r.anulado !== null && r.anulado !== '' && !/^(no|false|0)$/i.test(txt(r.anulado))) { resumen.omitidas++; continue; }
      if (h.tipo === 'productos') {
        if (!txt(r.codigo) && !txt(r.nombre)) { resumen.omitidas++; continue; }
        const codigo = txt(r.codigo) || ('IMP-' + slug(r.nombre).slice(0, 20).toUpperCase());
        const id = idCodigo(codigo); const prev = productos.get(id);
        const data = {
          codigo, nombre: txt(r.nombre) || prev?.nombre || codigo,
          unidad: txt(r.unidad) || prev?.unidad || 'UND',
          categoria: txt(r.categoria) || prev?.categoria || 'SIN CATEGORÍA',
          tipo: prev?.tipo || (/herramient|equipo/i.test(h.nombre) ? 'herramienta' : 'material'),
          act: ahora
        };
        if (r.minimo !== undefined && r.minimo !== null && r.minimo !== '') data.minimo = num(r.minimo);
        if (r.maximo !== undefined && r.maximo !== null && r.maximo !== '') data.maximo = num(r.maximo);
        if (opciones.stockDesdeExcel && r.cantidad !== undefined && r.cantidad !== null && r.cantidad !== '') data.stock = num(r.cantidad);
        else if (!prev) data.stock = 0;
        if (!prev) data.creado = ahora;
        productos.set(id, { ...prev, ...data }); porNombre.set(norm(data.nombre), { ...prev, ...data });
        ops.push({ col: 'productos', id, data }); resumen.productos++;
      }
      else if (h.tipo === 'entrada' || h.tipo === 'salida' || h.tipo === 'movimientos') {
        let tipo = h.tipo;
        if (tipo === 'movimientos') { const t = norm(r.tipo); tipo = /sal|desp|cons|egr/.test(t) ? 'salida' : /ent|ing|comp|inic/.test(t) ? 'entrada' : /devol/.test(t) ? 'devolucion' : /ajus/.test(t) ? 'ajuste' : /prest/.test(t) ? 'prestamo' : ''; }
        const p = productoDe(r);
        const cant = tipo === 'ajuste' ? num(r.cantidad) : Math.abs(num(r.cantidad));
        if (!tipo || !p || !cant) { resumen.omitidas++; continue; }
        const t = tecnico(r.tecnico);
        const mov = {
          tipo, codigo: p.codigo, producto: p.nombre, unidad: p.unidad || '', cantidad: cant,
          tecnico: t?.nombre || '', tecnicoId: t?.id || '', destino: txt(r.destino), doc: txt(r.doc),
          proveedor: txt(r.proveedor), obs: txt(r.obs), valor: num(r.valor) || 0, fecha: aFecha(r.fecha) || new Date().toISOString().slice(0, 10),
          uid: ctx.usuario.uid, usuario: txt(r.registro) || ctx.usuario.nombre, ts: ahora + resumen.movimientos, importado: true
        };
        ops.push({ col: 'movimientos', id: nuevoId(), data: mov, merge: false }); resumen.movimientos++;
        if (opciones.movAjustanStock) {
          const id = idCodigo(p.codigo); deltas.set(id, (deltas.get(id) || 0) + (tipo === 'entrada' || tipo === 'devolucion' || tipo === 'ajuste' ? cant : -cant));
        }
      }
      else if (h.tipo === 'prestamos') {
        const nombre = txt(r.nombre) || txt(r.codigo); if (!nombre) { resumen.omitidas++; continue; }
        const t = tecnico(r.tecnico);
        const est = norm(r.estado);
        ops.push({ col: 'prestamos', id: nuevoId(), merge: false, data: {
          herramienta: nombre, codigo: txt(r.codigo), cantidad: num(r.cantidad) || 1,
          tecnico: t?.nombre || '', tecnicoId: t?.id || '', fechaSalida: aFecha(r.fecha) || new Date().toISOString().slice(0, 10),
          estado: /devuel|entreg|cerr/.test(est) ? 'devuelto' : 'prestado', obs: txt(r.obs), importado: true,
          uid: ctx.usuario.uid, usuario: ctx.usuario.nombre, ts: ahora
        } }); resumen.prestamos++;
      }
      else if (h.tipo === 'celulares') {
        const imei = txt(r.imei); if (!imei && !txt(r.marca)) { resumen.omitidas++; continue; }
        const t = tecnico(r.tecnico);
        const prev = imei ? celulares.get(imei) : null;
        const id = prev?.id || (imei ? 'imei-' + imei.replace(/\D/g, '') : nuevoId());
        const data = {
          marca: limpiaNombre(r.marca), modelo: limpiaNombre(r.modelo).replace(/\s/g, ''), color: limpiaNombre(r.color),
          imei, linea: txt(r.linea), tecnico: t?.nombre || '', tecnicoId: t?.id || '',
          estado: t ? 'asignado' : (txt(r.estado).toLowerCase() || 'disponible'), obs: txt(r.obs), act: ahora
        };
        if (!prev) { data.creado = ahora; data.historial = t ? [{ fecha: new Date().toISOString().slice(0, 10), tecnico: t.nombre, accion: 'Asignado (importado)' }] : []; }
        celulares.set(imei, { id, ...data });
        ops.push({ col: 'celulares', id, data }); resumen.celulares++;
      }
      else if (h.tipo === 'tecnicos') {
        const n = limpiaNombre(r.nombre || r.tecnico); if (!n) { resumen.omitidas++; continue; }
        const id = slug(n); const existe = tecnicos.has(id);
        const data = { nombre: n, activo: true, act: ahora };
        if (txt(r.cedula)) data.cedula = txt(r.cedula);
        if (txt(r.cargo)) data.cargo = limpiaNombre(r.cargo);
        if (txt(r.telefono)) data.telefono = txt(r.telefono);
        if (!existe) { data.creado = ahora; resumen.tecnicos++; }
        tecnicos.set(id, { id, ...data }); ops.push({ col: 'tecnicos', id, data });
      }
    }
  }
  // Ajuste de stock por movimientos (solo si se pidió)
  for (const [id, d] of deltas) {
    const p = productos.get(id); const nuevo = +((Number(p?.stock) || 0) + d).toFixed(4);
    ops.push({ col: 'productos', id, data: { stock: nuevo, act: ahora } });
  }
  return { ops, resumen };
}

export function exportarExcel(nombreArchivo, hojas) {
  const wb = XLSX.utils.book_new();
  for (const [nombre, filas] of Object.entries(hojas)) {
    const ws = XLSX.utils.json_to_sheet(filas.length ? filas : [{ 'Sin datos': '' }]);
    const cols = Object.keys(filas[0] || { a: 1 });
    ws['!cols'] = cols.map(c => ({ wch: Math.min(45, Math.max(10, c.length + 2, ...filas.slice(0, 200).map(f => String(f[c] ?? '').length + 1))) }));
    XLSX.utils.book_append_sheet(wb, ws, nombre.slice(0, 31));
  }
  XLSX.writeFile(wb, nombreArchivo);
}
