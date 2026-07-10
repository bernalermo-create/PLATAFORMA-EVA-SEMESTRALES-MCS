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
    if (raw) return JSON.parse(raw);
  } catch { /* noop */ }
  return { cursos: [], estudiantes: [], evaluaciones: [], preguntas: [], hojas: [], resultados: [] };
}

function saveLocal(db) {
  localStorage.setItem(KEY, JSON.stringify(db));
}

let DB = load();
let _syncTimer = null;
let _pushInFlight = false;
let _pullTimer = null;
let _lastSyncStatus = { state: 'idle', at: null, error: null };

function scheduleSync() {
  saveLocal(DB);
  if (!hasGasUrl()) return;
  clearTimeout(_syncTimer);
  _syncTimer = setTimeout(async () => {
    _lastSyncStatus = { state: 'syncing', at: null, error: null };
    document.dispatchEvent(new CustomEvent('pev:sync', { detail: _lastSyncStatus }));
    _pushInFlight = true;
    const r = await pushDB(DB);
    _pushInFlight = false;
    _syncTimer = null;
    _lastSyncStatus = r.ok
      ? { state: 'ok', at: new Date(), error: null }
      : { state: 'error', at: new Date(), error: r.error };
    document.dispatchEvent(new CustomEvent('pev:sync', { detail: _lastSyncStatus }));
  }, 700);
}

function uid(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
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
      if (r.data && r.data.cursos) { DB = r.data; saveLocal(DB); }
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
      if (!hasGasUrl() || _syncTimer !== null || _pushInFlight) return;
      const r = await pullDB();
      if (!r.ok) {
        _lastSyncStatus = { state: 'error', at: new Date(), error: r.error };
        document.dispatchEvent(new CustomEvent('pev:sync', { detail: _lastSyncStatus }));
        return;
      }
      const remote = r.data;
      if (!remote || !remote.cursos) return;
      if (JSON.stringify(remote) === JSON.stringify(DB)) return; // nada nuevo
      DB = remote;
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
  listEstudiantes(cursoId) {
    return cursoId ? DB.estudiantes.filter(e => e.curso_id === cursoId) : DB.estudiantes;
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
  deleteEstudiante(id) {
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
    const ev = {
      id: uid('eval'), nombre, year: parseInt(year), semestre, grado: parseInt(grado),
      area, docente: docente || '', num_preguntas: 0, version: 1, estado: 'borrador',
      creado_en: new Date().toISOString()
    };
    DB.evaluaciones.push(ev); scheduleSync(); return ev;
  },
  publicarEvaluacion(id) {
    const ev = this.getEvaluacion(id);
    if (ev) { ev.estado = 'publicada'; scheduleSync(); }
    return ev;
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
  addPregunta(evaluacionId, { enunciado, competencia, componente, opciones, imagenUrl }) {
    // opciones: [{texto,nivel}, {texto,nivel}, {texto,nivel}, {texto,nivel}]
    const existentes = this.listPreguntas(evaluacionId);
    const letras = ['A', 'B', 'C', 'D'];
    const p = {
      id: uid('preg'), evaluacion_id: evaluacionId, numero: existentes.length + 1,
      enunciado, competencia: competencia || '', componente: componente || '', peso: 1,
      imagen_url: imagenUrl || null,
      opciones: (opciones || []).map((o, i) => ({ letra: letras[i], texto: o.texto, nivel: o.nivel }))
    };
    DB.preguntas.push(p);
    const ev = this.getEvaluacion(evaluacionId);
    if (ev) ev.num_preguntas = existentes.length + 1;
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
    // alguien pegue manualmente el id de la hoja como respaldo.
    return DB.hojas.find(h => h.qr_payload === qrPayload || h.id === qrPayload) || null;
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
    const payload = JSON.stringify({
      est: estudianteId, curso: cursoId, evals: evaluacionIds, sesion: sesion || 1, v: 1, t: Date.now()
    });
    const h = {
      id: uid('hoja'), evaluacion_ids: evaluacionIds, estudiante_id: estudianteId,
      curso_id: cursoId, sesion: sesion || 1, qr_payload: payload, generada_en: new Date().toISOString()
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

  _debugReset() { DB = { cursos: [], estudiantes: [], evaluaciones: [], preguntas: [], hojas: [], resultados: [] }; scheduleSync(); }
};
