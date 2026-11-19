// Capa de datos de AS SYSTEMS.
// - Con window.FIREBASE_CONFIG: usa Firebase (Auth + Firestore en tiempo real, con caché sin señal).
// - Sin configuración: modo de prueba local (solo este navegador), útil para revisar la app.
import { initializeApp, deleteApp } from 'firebase/app';
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  signOut, sendPasswordResetEmail
} from 'firebase/auth';
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager, collection, doc,
  onSnapshot, query, orderBy, limit, setDoc, updateDoc, deleteDoc, getDoc, runTransaction, writeBatch
} from 'firebase/firestore';

export const COLS = ['productos', 'movimientos', 'prestamos', 'celulares', 'tecnicos', 'usuarios', 'config'];

export function slug(s) {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120) || 'x';
}
export function idCodigo(c) { return String(c).trim().replace(/[\/#?\[\]]/g, '-').replace(/\s+/g, ' ') || 'sin-codigo'; }
const nuevoId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

/* ------------------------------------------------------------------ Firebase */
function firebaseBackend(cfg) {
  const app = initializeApp(cfg);
  const auth = getAuth(app);
  const db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
  const ref = (c, id) => doc(db, c, id);

  return {
    modo: 'nube',
    onUser(cb) { return onAuthStateChanged(auth, u => cb(u ? { uid: u.uid, email: u.email } : null)); },
    login: (e, p) => signInWithEmailAndPassword(auth, e, p),
    logout: () => signOut(auth),
    reset: e => sendPasswordResetEmail(auth, e),
    async registrarAdmin(e, p, nombre) {
      const pub = await getDoc(ref('config', 'publico')).catch(() => null);
      if (pub && pub.exists()) throw new Error('El sistema ya tiene administrador. Pídale a él que le cree el usuario.');
      const cred = await createUserWithEmailAndPassword(auth, e, p);
      await setDoc(ref('usuarios', cred.user.uid), { nombre, correo: e, rol: 'admin', activo: true, creado: Date.now() });
      await setDoc(ref('config', 'general'), { admin: cred.user.uid, creado: Date.now(), empresa: 'Araucana de Gases S.A.S. E.S.P.' });
      await setDoc(ref('config', 'publico'), { inicializado: true });
    },
    async sistemaIniciado() {
      try { const d = await getDoc(ref('config', 'publico')); return d.exists(); } catch { return true; }
    },
    async crearUsuario(e, p, perfil) {
      // App secundaria para no cerrar la sesión del administrador
      const sec = initializeApp(cfg, 'sec' + Date.now());
      try {
        const cred = await createUserWithEmailAndPassword(getAuth(sec), e, p);
        await setDoc(ref('usuarios', cred.user.uid), { ...perfil, correo: e, activo: true, creado: Date.now() });
        await signOut(getAuth(sec));
      } finally { await deleteApp(sec); }
    },
    perfil: async uid => { const d = await getDoc(ref('usuarios', uid)); return d.exists() ? { id: d.id, ...d.data() } : null; },
    escuchar(col, cb, opts = {}) {
      let q = collection(db, col);
      if (opts.orden) q = query(q, orderBy(opts.orden, 'desc'), limit(opts.limite || 1000));
      return onSnapshot(q, s => cb(s.docs.map(d => ({ id: d.id, ...d.data() }))), err => { console.warn(col, err); cb([], err); });
    },
    guardar: (col, id, data) => setDoc(ref(col, id || nuevoId()), data, { merge: true }),
    actualizar: (col, id, data) => updateDoc(ref(col, id), data),
    borrar: (col, id) => deleteDoc(ref(col, id)),
    // Movimiento de inventario atómico: ajusta el stock y deja el registro con el saldo resultante
    async movimiento(mov, { permitirNegativo = false } = {}) {
      const pid = idCodigo(mov.codigo);
      return runTransaction(db, async tx => {
        const pref = ref('productos', pid);
        const p = await tx.get(pref);
        if (!p.exists()) throw new Error('El producto ' + mov.codigo + ' no existe en el catálogo.');
        const stock = Number(p.data().stock || 0);
        const nuevo = +(stock + mov.delta).toFixed(4);
        if (nuevo < 0 && !permitirNegativo) throw new Error(`No hay existencias suficientes de ${p.data().nombre}: hay ${stock}.`);
        tx.update(pref, { stock: nuevo, act: Date.now() });
        const id = nuevoId();
        const { delta, _prestamo, ...resto } = mov;
        tx.set(ref('movimientos', id), { ...resto, saldo: nuevo, ts: Date.now() });
        if (mov._prestamo) tx.set(ref('prestamos', mov._prestamo.id), mov._prestamo.data, { merge: true });
        return nuevo;
      });
    },
    async lote(ops, progreso) { // ops: [{col,id,data,merge}] en bloques de 400
      for (let i = 0; i < ops.length; i += 400) {
        const b = writeBatch(db);
        for (const o of ops.slice(i, i + 400)) b.set(ref(o.col, o.id || nuevoId()), o.data, { merge: o.merge !== false });
        await b.commit(); progreso && progreso(Math.min(i + 400, ops.length), ops.length);
      }
    }
  };
}

/* ------------------------------------------------------------------ Local (prueba) */
function localBackend() {
  const KEY = 'assys_local_v1';
  let st; try { st = JSON.parse(localStorage.getItem(KEY)); } catch { }
  st = st || { users: [], session: null, data: {} };
  COLS.forEach(c => st.data[c] = st.data[c] || {});
  const subs = []; let userCb = null;
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch { } };
  const emitir = col => subs.filter(s => s.col === col).forEach(s => s.cb(lista(col, s.opts)));
  const lista = (col, opts = {}) => {
    let a = Object.entries(st.data[col]).map(([id, v]) => ({ id, ...v }));
    if (opts.orden) a = a.sort((x, y) => (y[opts.orden] || 0) - (x[opts.orden] || 0)).slice(0, opts.limite || 1000);
    return a;
  };
  const set = (col, id, data, merge = true) => { st.data[col][id] = merge ? { ...(st.data[col][id] || {}), ...data } : data; };
  const userObj = () => st.session ? { uid: st.session, email: st.users.find(u => u.uid === st.session)?.email } : null;
  return {
    modo: 'local',
    onUser(cb) { userCb = cb; setTimeout(() => cb(userObj()), 0); return () => { }; },
    async login(e, p) {
      const u = st.users.find(u => u.email === e.toLowerCase());
      if (!u || u.p !== p) throw { code: 'auth/invalid-credential' };
      st.session = u.uid; save(); userCb && userCb(userObj());
    },
    async logout() { st.session = null; save(); userCb && userCb(null); },
    async reset() { },
    async registrarAdmin(e, p, nombre) {
      if (st.data.config.publico) throw new Error('El sistema ya tiene administrador.');
      const uid = nuevoId(); st.users.push({ uid, email: e.toLowerCase(), p });
      set('usuarios', uid, { nombre, correo: e, rol: 'admin', activo: true, creado: Date.now() });
      set('config', 'general', { admin: uid }); set('config', 'publico', { inicializado: true });
      st.session = uid; save(); userCb && userCb(userObj());
    },
    async sistemaIniciado() { return !!st.data.config.publico; },
    async crearUsuario(e, p, perfil) {
      if (st.users.some(u => u.email === e.toLowerCase())) throw { code: 'auth/email-already-in-use' };
      const uid = nuevoId(); st.users.push({ uid, email: e.toLowerCase(), p });
      set('usuarios', uid, { ...perfil, correo: e, activo: true, creado: Date.now() }); save(); emitir('usuarios');
    },
    async perfil(uid) { const v = st.data.usuarios[uid]; return v ? { id: uid, ...v } : null; },
    escuchar(col, cb, opts = {}) {
      const s = { col, cb, opts }; subs.push(s); setTimeout(() => cb(lista(col, opts)), 0);
      return () => subs.splice(subs.indexOf(s), 1);
    },
    async guardar(col, id, data) { set(col, id || nuevoId(), data); save(); emitir(col); },
    async actualizar(col, id, data) { set(col, id, data); save(); emitir(col); },
    async borrar(col, id) { delete st.data[col][id]; save(); emitir(col); },
    async movimiento(mov, { permitirNegativo = false } = {}) {
      const pid = idCodigo(mov.codigo); const p = st.data.productos[pid];
      if (!p) throw new Error('El producto ' + mov.codigo + ' no existe en el catálogo.');
      const stock = Number(p.stock || 0); const nuevo = +(stock + mov.delta).toFixed(4);
      if (nuevo < 0 && !permitirNegativo) throw new Error(`No hay existencias suficientes de ${p.nombre}: hay ${stock}.`);
      p.stock = nuevo; p.act = Date.now();
      const { delta, _prestamo, ...resto } = mov;
      set('movimientos', nuevoId(), { ...resto, saldo: nuevo, ts: Date.now() });
      if (mov._prestamo) set('prestamos', mov._prestamo.id, mov._prestamo.data);
      save(); ['productos', 'movimientos', 'prestamos'].forEach(emitir); return nuevo;
    },
    async lote(ops, progreso) {
      ops.forEach(o => set(o.col, o.id || nuevoId(), o.data, o.merge !== false)); save();
      [...new Set(ops.map(o => o.col))].forEach(emitir); progreso && progreso(ops.length, ops.length);
    }
  };
}

export function crearBackend() {
  const cfg = window.FIREBASE_CONFIG;
  return cfg && cfg.apiKey ? firebaseBackend(cfg) : localBackend();
}
export { nuevoId };
