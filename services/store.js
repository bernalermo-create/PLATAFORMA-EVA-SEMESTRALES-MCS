// ════════════════════════════════════════════════════════════════════
//  services/store.js
//  Capa de datos. Guarda en localStorage al instante (para que la app
//  nunca se sienta lenta ni pierda datos si se cierra la pestaña), y en
//  segundo plano sincroniza esa misma base con el backend de Sheets/
//  Drive (services/sync.js) — mismo patrón que "Pruebas Semestrales".
// ════════════════════════════════════════════════════════════════════
import { pullDB, pushDB, hasGasUrl } from './sync.js';

const KEY = 'pev_db_v1'; // Plataforma de EValuación

// Mismos 4 niveles de desempeño que ya usa "Pruebas Semestrales", para
// que estos resultados sean compatibles con ese análisis si algún día
// se conectan. NIVEL_PESO se usa para calcular el promedio (escala 1-4).
export const NIVELES = ['BAJO', 'BÁSICO', 'ALTO', 'SUPERIOR'];
export const NIVEL_PESO = { BAJO: 1, 'BÁSICO': 2, ALTO: 3, SUPERIOR: 4 };

// Lista única de asignaturas — antes estaba repetida a mano en el
// formulario de "Nueva evaluación"; ahora también la usa el registro
// de docentes, así que vive en un solo lugar.
export const AREAS = ['Matemáticas', 'Ciencias Naturales', 'Inglés', 'Competencias Ciudadanas', 'Lectura Crítica'];

// Distribución oficial de áreas por sesión — fuente única de verdad,
// usada tanto en Evaluaciones (para mostrarle al docente a qué sesión
// pertenece lo que está creando) como en Hojas/QR (para premarcar el
// checklist). Antes vivía duplicada en hojasQR.js; centralizarla evita
// que las dos pantallas se desalineen si se ajusta la regla.
export const SESSION_PRESETS = {
  primaria: {
    1: ['Matemáticas', 'Ciencias Naturales', 'Inglés'],
    2: ['Competencias Ciudadanas', 'Lectura Crítica'],
  },
  bachillerato: {
    1: ['Matemáticas', 'Competencias Ciudadanas', 'Inglés'],
    2: ['Ciencias Naturales', 'Lectura Crítica'],
  },
};
// Primaria = grados 2°-5°, Bachillerato = grados 6°-11° — división
// oficial del MEN. Un grado SIEMPRE implica una sola sección; nunca se
// deja escoger la sección de forma independiente para evitar el tipo
// de inconsistencia "Grado 3° / Bachillerato".
export function tierDeGrado(grado) { return parseInt(grado) <= 5 ? 'primaria' : 'bachillerato'; }
// Devuelve 1, 2, o null si el área no tiene sesión predefinida.
export function sesionDeArea(grado, area) {
  const preset = SESSION_PRESETS[tierDeGrado(grado)];
  if (preset[1].includes(area)) return 1;
  if (preset[2].includes(area)) return 2;
  return null;
}

// Escala valorativa OFICIAL del colegio (0.0 a 5.0):
//   0.0 – 2.9  Bajo
//   3.0 – 3.9  Básico
//   4.0 – 4.5  Alto
//   4.6 – 5.0  Superior
export const BANDAS = [
  { nivel: 'BAJO',     min: 0.0, max: 2.9 },
  { nivel: 'BÁSICO',   min: 3.0, max: 3.9 },
  { nivel: 'ALTO',     min: 4.0, max: 4.5 },
  { nivel: 'SUPERIOR', min: 4.6, max: 5.0 },
];
// Punto "representativo" de cada nivel dentro de su propio rango
// (el punto medio) — son los anclajes que se usan para interpolar la
// nota cuando un estudiante mezcla varios niveles entre pregunta y
// pregunta. Ej: 100% Bajo → 1.45 · 100% Básico → 3.45 · 100% Alto →
// 4.25 · 100% Superior → 4.8. Cualquier mezcla queda interpolada
// linealmente ENTRE esos anclajes, nunca fuera de la escala 0.0-5.0.
const ANCLA = Object.fromEntries(BANDAS.map(b => [b.nivel, Math.round(((b.min + b.max) / 2) * 100) / 100]));
const ANCLA_POR_PESO = { 1: ANCLA.BAJO, 2: ANCLA['BÁSICO'], 3: ANCLA.ALTO, 4: ANCLA.SUPERIOR };

// Convierte el desempeño de una evaluación (mezcla de niveles por
// pregunta) en la nota final oficial (0.0-5.0), interpolando entre los
// anclajes de cada nivel según el promedio de pesos obtenido.
// Las preguntas sin responder cuentan en el denominador (si penalizan).
export function notaOficial(sumaPeso, totalPreguntas) {
  if (!totalPreguntas) return 0;
  const promedio = sumaPeso / totalPreguntas; // escala 1-4 (0 si no respondió nada)
  let nota;
  if (promedio <= 1) nota = ANCLA_POR_PESO[1];
  else if (promedio >= 4) nota = ANCLA_POR_PESO[4];
  else {
    const piso = Math.floor(promedio);
    const frac = promedio - piso;
    const a = ANCLA_POR_PESO[piso];
    const b = ANCLA_POR_PESO[Math.min(piso + 1, 4)];
    nota = a + (b - a) * frac;
  }
  // Las notas colombianas se reportan a 1 decimal (4.5, no 4.53) —
  // redondear aquí también evita que un valor caiga justo en el hueco
  // entre bandas (ej. 4.51-4.59, que no pertenece ni a Alto ni a
  // Superior según los rangos oficiales del colegio).
  return Math.round(nota * 10) / 10;
}

// Dado un valor de nota (0.0-5.0), devuelve a qué nivel oficial
// corresponde según las bandas del colegio — esta es la fuente de
// verdad para el "nivel final" que se muestra en boletines (más
// confiable que el nivel más frecuente pregunta-a-pregunta, porque
// respeta exactamente los rangos que definió el colegio).
// Robusto ante huecos entre bandas (ej. 4.5→4.6): si la nota no cae
// EXACTAMENTE dentro de ninguna, se asigna a la banda más cercana.
export function nivelDeNota(nota) {
  const exacta = BANDAS.find(x => nota >= x.min && nota <= x.max);
  if (exacta) return exacta.nivel;
  if (nota < BANDAS[0].min) return BANDAS[0].nivel;
  if (nota > BANDAS[BANDAS.length - 1].max) return BANDAS[BANDAS.length - 1].nivel;
  let mejor = BANDAS[0], mejorDist = Infinity;
  BANDAS.forEach(b => {
    const dist = Math.min(Math.abs(nota - b.min), Math.abs(nota - b.max));
    if (dist < mejorDist) { mejorDist = dist; mejor = b; }
  });
  return mejor.nivel;
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return _ensureShape(JSON.parse(raw));
  } catch { /* noop */ }
  return { cursos: [], estudiantes: [], evaluaciones: [], preguntas: [], hojas: [], resultados: [], docentes: [], analisisTexto: [] };
}

function saveLocal(db) {
  localStorage.setItem(KEY, JSON.stringify(db));
}

let DB = load();
let _syncTimer = null;
let _pushInFlight = false;
let _pullTimer = null;
let _lastSyncStatus = { state: 'idle', at: null, error: null };
let _retryTimer = null;
let _retryDelay = 8000; // arranca en 8s, se duplica hasta un tope — pensado para el celular en zonas de wifi débil del colegio, donde un push puede fallar y luego sí pasar sin que nadie tenga que reintentar a mano.
const _RETRY_MAX = 60000;

function scheduleSync() {
  saveLocal(DB);
  if (!hasGasUrl()) return;
  clearTimeout(_syncTimer);
  clearTimeout(_retryTimer);
  _syncTimer = setTimeout(_intentarPush, 700);
}

async function _intentarPush() {
  _lastSyncStatus = { state: 'syncing', at: null, error: null };
  document.dispatchEvent(new CustomEvent('pev:sync', { detail: _lastSyncStatus }));
  _pushInFlight = true;
  const r = await pushDB(DB);
  _pushInFlight = false;
  _syncTimer = null;
  if (r.ok) {
    _retryDelay = 8000; // éxito: resetea el backoff para la próxima falla
    _lastSyncStatus = { state: 'ok', at: new Date(), error: null };
  } else {
    _lastSyncStatus = { state: 'error', at: new Date(), error: r.error };
    clearTimeout(_retryTimer);
    _retryTimer = setTimeout(_intentarPush, _retryDelay);
    _retryDelay = Math.min(_retryDelay * 2, _RETRY_MAX);
  }
  document.dispatchEvent(new CustomEvent('pev:sync', { detail: _lastSyncStatus }));
}

function uid(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

// Una base traída de la nube puede venir de antes de que existiera
// algún campo nuevo (ej. "docentes" no existía en versiones previas).
// Sin esto, el primer push() de esa sesión borraría el campo para
// todo el mundo, y cualquier código que espere un array se rompería.
function _ensureShape(db) {
  if (!db.docentes) db.docentes = [];
  if (!db.analisisTexto) db.analisisTexto = [];
  // Auto-repara cursos con sección inconsistente con su grado (ej. "Grado
  // 3° / Bachillerato" creados antes de que esto se validara solo) — así
  // no hay que borrar y volver a crear los cursos viejos a mano.
  if (db.cursos) {
    db.cursos.forEach(c => {
      const correcta = parseInt(c.grado) <= 5 ? 'PRIMARIA' : 'BACHILLERATO';
      if (c.seccion !== correcta) c.seccion = correcta;
    });
  }
  return db;
}

// Fisher-Yates — para mezclar qué letra (A/B/C/D) le toca a cada nivel
// al crear una pregunta, sin favorecer ningún orden en particular.
function _shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Contraseña corta y fácil de copiar/escribir a mano — sin 0/O/1/I
// para que nadie confunda un carácter con otro al transcribirla.
function _generarPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let p = '';
  for (let i = 0; i < 6; i++) p += chars[Math.floor(Math.random() * chars.length)];
  return p;
}

// Código corto por hoja, para escribir a mano en Escaneo si la cámara
// no logra leer el QR — mismo alfabeto sin caracteres ambiguos.
function _generarCodigoHoja() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let intento;
  do {
    intento = '';
    for (let i = 0; i < 6; i++) intento += chars[Math.floor(Math.random() * chars.length)];
  } while (DB.hojas.some(h => h.codigo === intento));
  return intento;
}

// Las imágenes subidas quedan en Drive; el formato
// "drive.google.com/uc?export=view&id=..." funciona al abrirlo
// directamente en el navegador, pero es poco confiable como <img src>
// hotlink (Drive a veces devuelve una página de confirmación en vez
// del archivo). "lh3.googleusercontent.com/d/{id}" es el formato
// estable para incrustar imágenes. Esta función normaliza CUALQUIER
// URL de Drive (vieja o nueva) al formato confiable, así que también
// arregla imágenes que ya se habían subido antes de este cambio, sin
// tener que volver a subirlas.
// Texto libre escrito por docentes (nombre, competencia, enunciado...)
// termina insertado en innerHTML en varias pantallas que otros
// usuarios (otro docente, el admin) ven después. Sin escapar, alguien
// podría meter HTML/JS ahí y afectar la sesión de quien lo vea. Se usa
// en todos los módulos que muestran texto libre de otra persona.
export function escHTML(s) {
  const d = document.createElement('div');
  d.textContent = s ?? '';
  return d.innerHTML;
}

export function driveImgUrl(url) {
  if (!url) return url;
  const m = url.match(/[?&]id=([^&]+)/) || url.match(/\/d\/([^/=?]+)/);
  const fileId = m ? m[1] : null;
  return fileId ? `https://lh3.googleusercontent.com/d/${fileId}` : url;
}

// Nivel que más se repite en un conteo {BAJO:n,'BÁSICO':n,ALTO:n,SUPERIOR:n}.
// En caso de empate, gana el nivel más alto (más optimista con datos
// escasos sería incorrecto; aquí se prioriza consistencia con el orden
// de NIVELES, de menor a mayor exigencia).
function _modaNivel(counts) {
  let best = null, bestN = -1;
  NIVELES.forEach(n => {
    const c = counts[n] || 0;
    if (c >= bestN) { bestN = c; best = n; }
  });
  return bestN > 0 ? best : null;
}

export const store = {
  // ── Arranque: intenta traer la versión más reciente de la nube antes
  // de que la app empiece a renderizar. Si no hay conexión, sigue con
  // lo que ya había en localStorage (offline-first real, no solo de
  // nombre).
  async initRemote() {
    const r = await pullDB();
    if (r.ok) {
      if (r.data && r.data.cursos) { DB = _ensureShape(r.data); saveLocal(DB); }
      _lastSyncStatus = { state: 'ok', at: new Date(), error: null };
    } else {
      // Conexión falló: seguimos con lo que había en localStorage
      // (offline-first), pero el badge debe reflejar el problema real
      // en vez de mostrar "Local" como si fuera el estado normal.
      _lastSyncStatus = { state: 'error', at: new Date(), error: r.error };
    }
    document.dispatchEvent(new CustomEvent('pev:sync', { detail: _lastSyncStatus }));
    return DB;
  },
  syncStatus() { return _lastSyncStatus; },

  // Consulta Sheets cada ~25s en segundo plano para traer cambios de
  // otros docentes/administradores — sin esto, una pestaña abierta solo
  // veía el estado de Sheets tal como estaba al momento de entrar, y
  // había que cerrar sesión y volver a entrar para enterarse de cambios
  // hechos por otra persona. Nunca sobreescribe mientras haya cambios
  // locales pendientes de enviar o un envío en curso, para no perder
  // nada de lo que el usuario acaba de escribir.
  startPullLoop() {
    clearInterval(_pullTimer);
    _pullTimer = setInterval(async () => {
      if (!hasGasUrl() || _syncTimer !== null || _retryTimer !== null || _pushInFlight) return;
      const r = await pullDB();
      if (!r.ok) {
        _lastSyncStatus = { state: 'error', at: new Date(), error: r.error };
        document.dispatchEvent(new CustomEvent('pev:sync', { detail: _lastSyncStatus }));
        return;
      }
      const remote = r.data;
      if (!remote || !remote.cursos) return;
      if (JSON.stringify(remote) === JSON.stringify(DB)) return; // nada nuevo
      DB = _ensureShape(remote);
      saveLocal(DB);
      document.dispatchEvent(new CustomEvent('pev:data-updated'));
    }, 25000);
  },

  // ── Cursos ──────────────────────────────────────────────────────
  listCursos() { return DB.cursos; },
  getCurso(id) { return DB.cursos.find(c => c.id === id) || null; },
  addCurso({ grado, paralelo, year, jornada, seccion }) {
    const c = { id: uid('curso'), grado: parseInt(grado), paralelo, year: parseInt(year), jornada, seccion };
    DB.cursos.push(c); scheduleSync(); return c;
  },

  // ── Estudiantes ─────────────────────────────────────────────────
  // Siempre ordenados por nombre (que empieza con el apellido, ej.
  // "ABELLA ALARCON LUISA MARIA") — antes se devolvían en el orden en
  // que se habían agregado, así que la lista se veía alfabética solo
  // si la carga inicial ya venía ordenada, y un estudiante agregado
  // después aparecía al final en vez de en su puesto alfabético.
  listEstudiantes(cursoId) {
    const lista = cursoId ? DB.estudiantes.filter(e => e.curso_id === cursoId) : DB.estudiantes.slice();
    return lista.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  },
  getEstudiante(id) { return DB.estudiantes.find(e => e.id === id) || null; },
  addEstudiante({ nombre, curso_id, codigo }) {
    const e = { id: uid('est'), nombre, curso_id, codigo: codigo || uid('cod'), activo: true };
    DB.estudiantes.push(e); scheduleSync(); return e;
  },
  importEstudiantesMasivo(cursoId, nombres) {
    const nuevos = nombres.filter(Boolean).map(nombre => ({
      id: uid('est'), nombre: nombre.trim(), curso_id: cursoId, codigo: uid('cod'), activo: true
    }));
    DB.estudiantes.push(...nuevos); scheduleSync(); return nuevos;
  },
  // Antes esto dejaba huérfanas las hojas/resultados de ese estudiante:
  // si alguien luego escaneaba esa hoja física ya impresa, la pantalla
  // de Escaneo se caía al intentar leer el nombre de un estudiante que
  // ya no existe. Ahora se borra todo en cascada, igual que con un curso.
  contarDependenciasEstudiante(id) {
    return {
      hojas: DB.hojas.filter(h => h.estudiante_id === id).length,
      resultados: DB.resultados.filter(r => r.estudiante_id === id).length,
    };
  },
  deleteEstudiante(id) {
    DB.hojas = DB.hojas.filter(h => h.estudiante_id !== id);
    DB.resultados = DB.resultados.filter(r => r.estudiante_id !== id);
    DB.estudiantes = DB.estudiantes.filter(e => e.id !== id);
    scheduleSync();
  },
  deleteCurso(id) {
    // Borra el curso y todo lo que dependa de él, para no dejar datos huérfanos.
    DB.estudiantes = DB.estudiantes.filter(e => e.curso_id !== id);
    DB.hojas = DB.hojas.filter(h => h.curso_id !== id);
    DB.cursos = DB.cursos.filter(c => c.id !== id);
    scheduleSync();
  },

  // ── Evaluaciones ────────────────────────────────────────────────
  listEvaluaciones() { return DB.evaluaciones; },
  getEvaluacion(id) { return DB.evaluaciones.find(e => e.id === id) || null; },
  addEvaluacion({ nombre, year, semestre, grado, area, docente }) {
    const sesion = sesionDeArea(grado, area);
    const nombreFinal = (nombre || '').trim() || `${area} — Grado ${parseInt(grado)}° — ${semestre === 'S1' ? 'Primer' : 'Segundo'} Semestre ${year}`;
    const ev = {
      id: uid('eval'), nombre: nombreFinal, year: parseInt(year), semestre, grado: parseInt(grado),
      area, docente: docente || '', sesion,
      num_preguntas: 0, version: 1, estado: 'borrador',
      creado_en: new Date().toISOString()
    };
    DB.evaluaciones.push(ev); scheduleSync(); return ev;
  },
  publicarEvaluacion(id) {
    const ev = this.getEvaluacion(id);
    if (ev) { ev.estado = 'publicada'; scheduleSync(); }
    return ev;
  },
  // Permite corregir a mano la sesión de una evaluación ya creada, por
  // si la asignación automática (por grado+área) no encaja con algún
  // caso particular del colegio — sin esto no había forma de
  // cambiarla una vez creada la evaluación.
  setSesionManual(id, sesion) {
    const ev = this.getEvaluacion(id);
    if (ev) { ev.sesion = sesion ? parseInt(sesion) : sesionDeArea(ev.grado, ev.area); scheduleSync(); }
    return ev;
  },
  // Borra la evaluación y sus preguntas. Las hojas/resultados ya
  // generados con ella se dejan como respaldo histórico (no se
  // borran) — simplemente dejan de aparecer al armar cuadernillos
  // nuevos, ya que gruposConNumeracion() ignora evaluación_ids que ya
  // no existen.
  deleteEvaluacion(id) {
    DB.preguntas = DB.preguntas.filter(p => p.evaluacion_id !== id);
    DB.evaluaciones = DB.evaluaciones.filter(e => e.id !== id);
    scheduleSync();
  },

  // ── Preguntas ───────────────────────────────────────────────────
  // Modelo DIAGNÓSTICO: cada pregunta tiene 4 opciones (A-D) y CADA
  // OPCIÓN representa un nivel de desempeño distinto (Bajo/Básico/
  // Alto/Superior) — no hay una única "respuesta correcta". La
  // calificación consiste en leer qué opción marcó el estudiante y
  // traducirla directamente al nivel de desempeño de esa pregunta.
  listPreguntas(evaluacionId) {
    return DB.preguntas.filter(p => p.evaluacion_id === evaluacionId).sort((a, b) => a.numero - b.numero);
  },
  getPregunta(id) { return DB.preguntas.find(p => p.id === id) || null; },
  addPregunta(evaluacionId, { enunciado, competencia, componente, opciones, imagenUrl, mezclar }) {
    // opciones: [{texto,nivel}, {texto,nivel}, {texto,nivel}, {texto,nivel}]
    const existentes = this.listPreguntas(evaluacionId);
    const letras = ['A', 'B', 'C', 'D'];
    // "mezclar" reordena qué letra le toca a cada nivel — así no queda
    // un patrón fijo (ej. D siempre = Superior) que el estudiante
    // pueda aprender a adivinar sin leer la pregunta. El contenido de
    // cada opción no cambia, solo qué letra la representa.
    const ordenadas = mezclar ? _shuffle([...(opciones || [])]) : (opciones || []);
    const p = {
      id: uid('preg'), evaluacion_id: evaluacionId, numero: existentes.length + 1,
      enunciado, competencia: competencia || '', componente: componente || '', peso: 1,
      imagen_url: imagenUrl || null,
      opciones: ordenadas.map((o, i) => ({ letra: letras[i], texto: o.texto, nivel: o.nivel }))
    };
    DB.preguntas.push(p);
    const ev = this.getEvaluacion(evaluacionId);
    if (ev) ev.num_preguntas = existentes.length + 1;
    scheduleSync();
    return p;
  },
  // Edita una pregunta existente in situ (mismo id y número) — para
  // corregir un dato que se digitó mal (ej. la competencia) sin tener
  // que borrarla y perder su lugar en el orden.
  updatePregunta(id, { enunciado, competencia, componente, opciones, imagenUrl }) {
    const p = this.getPregunta(id);
    if (!p) return null;
    const letras = ['A', 'B', 'C', 'D'];
    p.enunciado = enunciado;
    p.competencia = competencia || '';
    p.componente = componente || '';
    if (imagenUrl !== undefined) p.imagen_url = imagenUrl || null;
    p.opciones = (opciones || []).map((o, i) => ({ letra: letras[i], texto: o.texto, nivel: o.nivel }));
    scheduleSync();
    return p;
  },
  deletePregunta(id) {
    DB.preguntas = DB.preguntas.filter(p => p.id !== id);
    scheduleSync();
  },

  // ── Hojas de respuesta ──────────────────────────────────────────
  // Una hoja ahora representa UNA SESIÓN completa (puede agrupar
  // varias áreas/evaluaciones, igual que el cuadernillo impreso), no
  // una sola evaluación. Esto evita el desfase de numeración que
  // había entre el cuadernillo (numeración continua entre áreas) y la
  // hoja de respuestas (que antes numeraba cada área desde 1).
  listHojas(evaluacionId) {
    return evaluacionId ? DB.hojas.filter(h => h.evaluacion_ids.includes(evaluacionId)) : DB.hojas;
  },
  getHoja(id) { return DB.hojas.find(h => h.id === id) || null; },
  findHojaByQR(qrPayload) {
    // El QR guarda el payload textual completo; también aceptamos que
    // alguien pegue manualmente el id de la hoja, o escriba el código
    // corto legible impreso junto al QR (respaldo si la cámara no lo
    // reconoce), sin importar mayúsculas/minúsculas ni espacios.
    const limpio = (qrPayload || '').trim();
    const limpioUpper = limpio.toUpperCase();
    return DB.hojas.find(h => h.qr_payload === limpio || h.id === limpio || h.codigo === limpioUpper) || null;
  },
  // Calcula, para un grupo de evaluaciones (mismo orden que el
  // cuadernillo), la numeración ABSOLUTA continua entre áreas.
  // Reutilizado por el generador del cuadernillo, el de hojas de
  // respuesta y el módulo de Escaneo — así los tres SIEMPRE coinciden.
  gruposConNumeracion(evaluacionIds) {
    let contador = 0;
    const bloques = evaluacionIds.map(id => {
      const ev = this.getEvaluacion(id);
      const preguntas = this.listPreguntas(id).map(p => ({ ...p, _abs: ++contador }));
      return { ev, preguntas };
    }).filter(b => b.ev);
    return { bloques, total: contador };
  },
  listHojasPorCursoSesion(cursoId, sesion) {
    return DB.hojas.filter(h => h.curso_id === cursoId && h.sesion === sesion);
  },
  generarHoja({ evaluacionIds, estudianteId, cursoId, sesion }) {
    const existente = DB.hojas.find(h =>
      h.estudiante_id === estudianteId &&
      h.sesion === sesion &&
      JSON.stringify(h.evaluacion_ids) === JSON.stringify(evaluacionIds)
    );
    if (existente) return existente;
    const id = uid('hoja');
    // El QR antes codificaba un JSON completo (estudiante+curso+áreas+
    // fecha) — con varias áreas por sesión eso pasaba de 170 caracteres,
    // lo que obliga a un QR muy denso e ilegible al imprimirlo pequeño
    // o fotocopiarlo. Ahora el QR solo trae este ID corto; todo lo
    // demás (estudiante, curso, áreas) ya vive en la fila de la hoja y
    // se consulta ahí — el QR es solo la llave de búsqueda.
    //
    // Además, cada hoja trae un código corto legible (6 caracteres) que
    // se imprime como TEXTO junto al QR — si la cámara no logra leer el
    // código en un celular o red particular, se puede escribir a mano
    // en 2 segundos en vez de necesitar el ID largo completo.
    const codigo = _generarCodigoHoja();
    const h = {
      id, evaluacion_ids: evaluacionIds, estudiante_id: estudianteId,
      curso_id: cursoId, sesion: sesion || 1, qr_payload: id, codigo,
      generada_en: new Date().toISOString()
    };
    DB.hojas.push(h); scheduleSync(); return h;
  },

  // ── Resultados: cada respuesta se traduce a un nivel de desempeño
  // (no hay "correcto/incorrecto" — cada opción YA ES un nivel). Como
  // una hoja puede agrupar varias áreas, se guarda UN resultado por
  // cada (hoja, evaluación) para que el análisis por área siga
  // funcionando igual que antes ─────────────────────────────────────
  getResultadoPorHoja(hojaId, evaluacionId) {
    return DB.resultados.find(r => r.hoja_id === hojaId && r.evaluacion_id === evaluacionId) || null;
  },
  listResultadosPorHoja(hojaId) { return DB.resultados.filter(r => r.hoja_id === hojaId); },
  guardarResultadoGrupo({ hojaId, respuestasAbsolutas, fotoUrl }) {
    const hoja = this.getHoja(hojaId);
    if (!hoja) throw new Error('Hoja no encontrada');
    const { bloques } = this.gruposConNumeracion(hoja.evaluacion_ids);

    const guardados = bloques.map(({ ev, preguntas }) => {
      const niveles = {};
      const resumen = { BAJO: 0, 'BÁSICO': 0, ALTO: 0, SUPERIOR: 0 };
      const porCompetencia = {};
      let sumaPeso = 0, contestadas = 0;

      preguntas.forEach(p => {
        const letra = respuestasAbsolutas[p._abs] || null;
        const opcion = letra ? p.opciones.find(o => o.letra === letra) : null;
        const nivel = opcion ? opcion.nivel : null;
        niveles[p.numero] = nivel;

        const comp = p.competencia || 'Sin competencia';
        if (!porCompetencia[comp]) porCompetencia[comp] = { BAJO: 0, 'BÁSICO': 0, ALTO: 0, SUPERIOR: 0 };

        if (nivel) {
          resumen[nivel] = (resumen[nivel] || 0) + 1;
          porCompetencia[comp][nivel] = (porCompetencia[comp][nivel] || 0) + 1;
          sumaPeso += NIVEL_PESO[nivel] || 0;
          contestadas++;
        }
      });

      Object.values(porCompetencia).forEach(c => { c.predominante = _modaNivel(c); });
      const nivelPredominante = _modaNivel(resumen);
      const promedio = contestadas ? sumaPeso / contestadas : 0;
      const nota = notaOficial(sumaPeso, preguntas.length);
      const nivelFinal = nivelDeNota(nota);

      const existente = this.getResultadoPorHoja(hojaId, ev.id);
      const resultado = existente || { id: uid('res'), hoja_id: hojaId, evaluacion_id: ev.id };
      Object.assign(resultado, {
        estudiante_id: hoja.estudiante_id,
        respuestas: niveles /* por compatibilidad de forma con versiones previas */,
        niveles, resumen,
        por_competencia: porCompetencia,
        nivel_predominante: nivelPredominante,
        promedio_numerico: Math.round(promedio * 100) / 100,
        nota, nivel_final: nivelFinal,
        total: preguntas.length,
        contestadas,
        foto_url: fotoUrl || (existente ? existente.foto_url : null),
        calculado_en: new Date().toISOString(),
      });
      if (!existente) DB.resultados.push(resultado);
      return resultado;
    });

    scheduleSync();
    return guardados; // un resultado por cada área incluida en la hoja
  },
  listResultados(evaluacionId) {
    return evaluacionId ? DB.resultados.filter(r => r.evaluacion_id === evaluacionId) : DB.resultados;
  },

  // ── Docentes ────────────────────────────────────────────────────
  // Padrón de docentes con contraseña individual — reemplaza (de forma
  // gradual) la contraseña única compartida. Cada docente queda con un
  // alcance (grados + áreas) que evaluaciones.js usa para restringir
  // qué puede crear, además del filtro por nombre que ya existía.
  // NOTA: el alcance es dos listas independientes (no una matriz
  // grado×área), así que si alguien dicta Matemáticas en 6° e Inglés
  // en 8°, técnicamente también podría crear "Inglés 6°" — es una
  // simplificación consciente para la primera versión.
  listDocentes() { return DB.docentes || []; },
  getDocente(id) { return (DB.docentes || []).find(d => d.id === id) || null; },
  findDocenteByNombre(nombre) {
    const n = (nombre || '').trim().toUpperCase();
    return (DB.docentes || []).find(d => d.nombre === n) || null;
  },
  addDocente({ nombre, jornadas, grados, areas }) {
    if (!DB.docentes) DB.docentes = [];
    const nombreN = (nombre || '').trim().toUpperCase();
    if (!nombreN) throw new Error('El nombre no puede estar vacío.');
    if (this.findDocenteByNombre(nombreN)) throw new Error(`Ya existe un docente registrado como "${nombreN}".`);
    const d = {
      id: uid('doc'), nombre: nombreN, jornadas: jornadas || [],
      grados: (grados || []).map(g => parseInt(g)).filter(Boolean),
      areas: areas || [],
      password: _generarPassword(), activo: true, creado_en: new Date().toISOString(),
    };
    DB.docentes.push(d);
    scheduleSync();
    return d;
  },
  // filas: [{nombre, jornadas:[...], grados:[...], areas:[...]}] — nombres
  // vacíos o ya registrados se omiten (se listan en "omitidos").
  importDocentesMasivo(filas) {
    if (!DB.docentes) DB.docentes = [];
    const creados = [], omitidos = [];
    (filas || []).forEach(f => {
      const nombreN = (f.nombre || '').trim().toUpperCase();
      if (!nombreN) return;
      if (this.findDocenteByNombre(nombreN)) { omitidos.push(nombreN); return; }
      const d = {
        id: uid('doc'), nombre: nombreN, jornadas: f.jornadas || [],
        grados: (f.grados || []).map(g => parseInt(g)).filter(Boolean),
        areas: f.areas || [],
        password: _generarPassword(), activo: true, creado_en: new Date().toISOString(),
      };
      DB.docentes.push(d);
      creados.push(d);
    });
    if (creados.length) scheduleSync();
    return { creados, omitidos };
  },
  updateDocente(id, { jornadas, grados, areas, activo }) {
    const d = this.getDocente(id);
    if (!d) return null;
    if (jornadas !== undefined) d.jornadas = jornadas;
    if (grados !== undefined) d.grados = grados.map(g => parseInt(g));
    if (areas !== undefined) d.areas = areas;
    if (activo !== undefined) d.activo = activo;
    scheduleSync();
    return d;
  },
  regenerarPasswordDocente(id) {
    const d = this.getDocente(id);
    if (d) { d.password = _generarPassword(); scheduleSync(); }
    return d;
  },
  deleteDocente(id) {
    DB.docentes = (DB.docentes || []).filter(d => d.id !== id);
    scheduleSync();
  },

  // ── Análisis (agrupa resultados diagnósticos por grado+año+área+semestre) ──
  // Reemplaza a "Pruebas Semestrales": en vez de que el docente digite
  // manualmente el nivel de cada estudiante, esto agrega los resultados
  // que YA se calcularon en Escaneo/Resultados — mismos gráficos y
  // estructura de análisis, alimentados automáticamente.
  listEspaciosAnalisis() {
    const set = new Map();
    DB.evaluaciones.forEach(e => {
      const k = `${e.grado}_${e.year}`;
      if (!set.has(k)) set.set(k, { grado: e.grado, year: e.year });
    });
    return Array.from(set.values()).sort((a, b) => a.year - b.year || a.grado - b.grado);
  },
  // Devuelve, por cada área fija, los conteos de nivel para S1 y S2 por
  // separado, más los conteos combinados por competencia (juntando
  // ambos semestres, ya que la competencia es una propiedad de la
  // pregunta, no del semestre).
  analisisAgregado(grado, year) {
    const g = parseInt(grado), y = parseInt(year);
    const vacio = () => ({ BAJO: 0, 'BÁSICO': 0, ALTO: 0, SUPERIOR: 0 });
    const porArea = {};
    AREAS.forEach(area => { porArea[area] = { S1: vacio(), S2: vacio(), competencias: {}, ordenCompetencias: [] }; });
    const evals = DB.evaluaciones.filter(e => e.grado === g && e.year === y);
    evals.forEach(ev => {
      if (!porArea[ev.area]) return;
      const bucket = porArea[ev.area][ev.semestre];
      DB.resultados.filter(r => r.evaluacion_id === ev.id).forEach(r => {
        if (bucket && r.resumen) NIVELES.forEach(n => { bucket[n] += (r.resumen[n] || 0); });
        if (r.por_competencia) {
          Object.entries(r.por_competencia).forEach(([comp, counts]) => {
            if (!porArea[ev.area].competencias[comp]) {
              porArea[ev.area].competencias[comp] = { S1: vacio(), S2: vacio() };
              porArea[ev.area].ordenCompetencias.push(comp); // orden estable de "primera vez vista"
            }
            const compBucket = porArea[ev.area].competencias[comp][ev.semestre];
            NIVELES.forEach(n => { compBucket[n] += (counts[n] || 0); });
          });
        }
      });
    });
    return porArea;
  },
  // Conteos identitarios (estudiantes/cursos distintos) para los KPI —
  // separados de analisisAgregado() porque ese solo tiene sumatorias de
  // nivel, no identidades.
  analisisResumenExtra(grado, year) {
    const g = parseInt(grado), y = parseInt(year);
    const evalIds = new Set(DB.evaluaciones.filter(e => e.grado === g && e.year === y).map(e => e.id));
    const resultados = DB.resultados.filter(r => evalIds.has(r.evaluacion_id));
    const estudiantes = new Set(resultados.map(r => r.estudiante_id));
    const cursos = new Set(resultados.map(r => {
      const h = DB.hojas.find(h => h.id === r.hoja_id);
      return h ? h.curso_id : null;
    }).filter(Boolean));
    return { totalResultados: resultados.length, estudiantesUnicos: estudiantes.size, cursosUnicos: cursos.size };
  },
  getAnalisisTexto(grado, year, tipo, area) {
    const g = parseInt(grado), y = parseInt(year);
    const r = (DB.analisisTexto || []).find(t => t.grado === g && t.year === y && t.tipo === tipo && t.area === area);
    return r ? r.texto : '';
  },
  setAnalisisTexto(grado, year, tipo, area, texto) {
    if (!DB.analisisTexto) DB.analisisTexto = [];
    const g = parseInt(grado), y = parseInt(year);
    let r = DB.analisisTexto.find(t => t.grado === g && t.year === y && t.tipo === tipo && t.area === area);
    if (!r) { r = { id: uid('atx'), grado: g, year: y, tipo, area }; DB.analisisTexto.push(r); }
    r.texto = texto;
    r.actualizado_en = new Date().toISOString();
    scheduleSync();
    return r;
  },

  // ── Agregados para el Dashboard ─────────────────────────────────
  stats() {
    return {
      cursos: DB.cursos.length,
      estudiantes: DB.estudiantes.length,
      evaluaciones: DB.evaluaciones.length,
      evaluacionesPublicadas: DB.evaluaciones.filter(e => e.estado === 'publicada').length,
      hojasGeneradas: DB.hojas.length,
      resultadosCalificados: DB.resultados.length,
      pendientesPorEscanear: DB.hojas.length - DB.resultados.length,
    };
  },

  _debugReset() { DB = { cursos: [], estudiantes: [], evaluaciones: [], preguntas: [], hojas: [], resultados: [], docentes: [], analisisTexto: [] }; scheduleSync(); }
};
