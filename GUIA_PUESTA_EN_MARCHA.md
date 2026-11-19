# AS SYSTEMS: guía de puesta en marcha

AS SYSTEMS es un solo aplicativo con estos módulos: **Inventario de bodega**, **Préstamo de herramientas**, **Celulares**, **Técnicos** y **Administración**. Desde el inicio también abre **AS Mantenimiento** y cualquier otro aplicativo que se agregue después.

Funciona igual en PC y en celular, y todos ven la misma información al instante porque los datos quedan en la nube (Firebase). GitHub guarda el código, publica la página web y compila el APK.

| Quién | Qué puede hacer |
|---|---|
| **Administrador** (solo usted) | Todo. Es el único que agrega, edita o elimina técnicos y usuarios, el único que borra registros e importa Excel. |
| **Bodega** (ej.: KarlaM) | Entradas, salidas, préstamos, devoluciones, ajustes por conteo y celulares. |
| **Solo consulta** | Ve todo, no modifica nada. |

Los técnicos de la lista **no** necesitan usuario. Esa regla está tanto en la app como en el servidor (archivo `firestore.rules`), así que nadie la puede saltar.

Tiempo estimado: 1 hora.

---

## 1. Crear la base de datos en Firebase

1. Entre a https://console.firebase.google.com con la cuenta de Araucana (la misma con la que se creó AS Mantenimiento).
2. **Agregar proyecto** → nombre `as-systems`. Analytics no hace falta. Plan **Spark (gratis)**.
3. **Compilación → Authentication → Comenzar → Correo electrónico/contraseña → Habilitar → Guardar.**
4. **Compilación → Firestore Database → Crear base de datos** → ubicación `nam5 (United States)` (igual que AS Mantenimiento) → modo **producción**.
5. En Firestore → pestaña **Reglas**: borre lo que hay, pegue todo el archivo `firestore.rules` y toque **Publicar**.
6. Engranaje → **Configuración del proyecto** → **Tus apps** → ícono web `</>` → apodo `AS SYSTEMS` → copie el bloque `firebaseConfig`.
7. Abra `www/firebase-config.js` y cambie `window.FIREBASE_CONFIG = null;` por:

```js
window.FIREBASE_CONFIG = {
  apiKey: "AIza…",
  authDomain: "as-systems-xxxx.firebaseapp.com",
  projectId: "as-systems-xxxx",
  storageBucket: "as-systems-xxxx.firebasestorage.app",
  messagingSenderId: "…",
  appId: "1:…:web:…"
};
```

8. **Usuarios y permisos** del proyecto: agregue su Gmail personal como **Propietario**.

> Esa configuración no es secreta. Lo que protege los datos son las reglas del paso 5 y el inicio de sesión.

Mientras el archivo siga en `null`, la app abre en **modo de prueba local**: sirve para mirarla, pero los datos no se comparten.

---

## 2. Subir a GitHub

El proyecto tiene muchos archivos y una carpeta oculta (`.github`), así que lo más fácil es **GitHub Desktop** (https://desktop.github.com).

1. En GitHub Desktop: **File → Add local repository** → elija la carpeta `as-systems` (ya viene lista como repositorio).
2. **Publish repository** → nombre `as-systems`.
   - Desmarque *Keep this code private* si quiere la página web gratis. En el código no hay datos ni contraseñas: la información vive en Firebase y está protegida por usuario.
   - Si lo deja privado, la web necesita GitHub Pro. En ese caso publique la carpeta `www` en Netlify arrastrándola, igual que AS Mantenimiento.
3. En github.com, en el repositorio: **Settings → Pages → Source: GitHub Actions.**
4. Pestaña **Actions**: corren solos dos procesos:
   - **Publicar web AS SYSTEMS** → al terminar muestra el enlace, algo como `https://SU-USUARIO.github.io/as-systems/`.
   - **Compilar APK AS SYSTEMS** → en 8 a 12 minutos deja el archivo **AS-SYSTEMS-apk-N** en *Artifacts*.

Cada vez que se cambie algo y se suba con GitHub Desktop (**Commit → Push**), la web se actualiza sola y se genera un APK nuevo.

---

## 3. Instalar en los equipos

**PC (el suyo, el de KarlaM y los demás):** abra el enlace de la web en Google Chrome → en la barra de dirección toque el ícono **Instalar AS SYSTEMS** → queda como programa con ícono en el escritorio y en el menú Inicio.

**Celulares Android:** descargue el *Artifact* (viene en .zip), saque `AS-SYSTEMS.apk`, páselo al celular e instálelo. Si Android lo pide, permita "instalar apps de origen desconocido".
También se puede abrir el enlace web en Chrome del celular → menú ⋮ → **Agregar a pantalla principal**.

> Las descargas de Excel se hacen desde el PC o desde el navegador. Dentro del APK no se descargan archivos.

---

## 4. Primer ingreso (hágalo usted antes que nadie)

1. Abra AS SYSTEMS → **Primera vez: crear administrador** → su nombre, correo y contraseña. **Quien haga esto queda como único administrador.**
2. **Administración → Datos iniciales → Cargar técnicos y celulares iniciales.** Quedan los 10 técnicos de Arauca y los 8 celulares del Excel (7 OPPO A5 y el Vivo Y11d), cada uno con su responsable.
3. **Administración → + Usuario** → cree a KarlaM con rol **Bodega** y una contraseña inicial.

---

## 5. Traer lo que está en el PC de KarlaM

1. En el PC de KarlaM, exporte el inventario actual a Excel: catálogo con existencias, entradas, salidas y préstamos.
   - Si el programa viejo no tiene botón de exportar, copie el archivo de datos de la carpeta compartida y envíemelo. Le preparo el Excel.
2. Desde su usuario: **Administración → Cargar información desde Excel → Seleccionar archivo.**
3. El sistema muestra cada hoja y cómo la va a cargar (catálogo, entradas, salidas, préstamos, celulares, técnicos). Si alguna está mal, cámbiela en la lista.
4. Opciones:
   - **Tomar la existencia del Excel como existencia actual**: déjela marcada si el Excel trae el saldo de cada producto.
   - **Las entradas y salidas suman y restan**: solo si el Excel **no** trae saldo. Si marca las dos, se descuenta doble.
5. **Importar.** Si el Excel trae técnicos que no están en la lista, se crean solos.

**Importante:** el día que se importe, KarlaM deja de usar el programa viejo y desde ahí registra todo en AS SYSTEMS. Si sigue en los dos, la información se separa.

Se puede volver a importar cuando quiera: los productos se actualizan por código, los celulares por IMEI y los técnicos por nombre, sin duplicar.

---

## 6. Uso diario

- **Salida:** técnico que recibe + destino u obra + varios materiales a la vez. No deja sacar más de lo que hay.
- **Entrada:** proveedor, factura o remisión y los materiales.
- **Ajuste por conteo:** cuando el físico no cuadra. Queda quién lo hizo y la diferencia.
- **Préstamos:** marque el producto como *Herramienta o equipo* (Editar producto), préstelo al técnico y, cuando lo traiga, **Recibir devolución**. El inicio muestra qué tiene cada técnico y hace cuántos días.
- **Celulares:** reasignar, devolver a bodega, enviar a reparación o dar de baja. Cada cambio queda en el historial del equipo.
- **Técnicos (solo usted):** agregar, editar, desactivar o eliminar. La ficha de cada técnico muestra su celular, las herramientas que tiene y los materiales que ha recibido.
- **Copia de seguridad:** Administración → Descargar copia en Excel. Recomendado una vez por semana.
- **Sin señal:** se puede seguir registrando. Los cambios se envían cuando vuelve la conexión.
