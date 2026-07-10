// ════════════════════════════════════════════════════════════════════
//  services/store.js
//  Capa de datos. Guarda en localStorage al instante (para que la app
//  nunca se sienta lenta ni pierda datos si se cierra la pestaña), y en
//  segundo plano sincroniza esa misma base con el backend de Sheets/
//  Drive (services/sync.js) — mismo patrón que "Pruebas Semestrales".
// ════════════════════════════════════════════════════════════════════
import { pullDB, pushDB, hasGasUrl } from './sync.js';

const KEY = 'pev_db_v1'; // Plataforma de EValuación

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
let _lastSyncStatus = { state: 'idle', at: null, error: null };

function scheduleSync() {
  saveLocal(DB);
  if (!hasGasUrl()) return;
  clearTimeout(_syncTimer);
  _syncTimer = setTimeout(async () => {
    _lastSyncStatus = { state: 'syncing', at: null, error: null };
    document.dispatchEvent(new CustomEvent('pev:sync', { detail: _lastSyncStatus }));
    const r = await pushDB(DB);
    _lastSyncStatus = r.ok
      ? { state: 'ok', at: new Date(), error: null }
      : { state: 'error', at: new Date(), error: r.error };
    document.dispatchEvent(new CustomEvent('pev:sync', { detail: _lastSyncStatus }));
  }, 700);
}

function uid(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export const store = {
  // ── Arranque: intenta traer la versión más reciente de la nube antes
  // de que la app empiece a renderizar. Si no hay conexión, sigue con
  // lo que ya había en localStorage (offline-first real, no solo de
  // nombre).
  async initRemote() {
    const remote = await pullDB();
    if (remote && remote.cursos) {
      DB = remote;
      saveLocal(DB);
    }
    return DB;
  },
  syncStatus() { return _lastSyncStatus; },

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
  listPreguntas(evaluacionId) {
    return DB.preguntas.filter(p => p.evaluacion_id === evaluacionId).sort((a, b) => a.numero - b.numero);
  },
  addPregunta(evaluacionId, { enunciado, competencia, componente, nivel_desempeno, opciones, correcta }) {
    const existentes = this.listPreguntas(evaluacionId);
    const p = {
      id: uid('preg'), evaluacion_id: evaluacionId, numero: existentes.length + 1,
      enunciado, competencia: competencia || '', componente: componente || '',
      nivel_desempeno: nivel_desempeno || '', peso: 1,
      opciones: opciones || ['', '', '', ''], correcta: correcta || 'A'
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
  listHojas(evaluacionId) { return DB.hojas.filter(h => h.evaluacion_id === evaluacionId); },
  getHoja(id) { return DB.hojas.find(h => h.id === id) || null; },
  findHojaByQR(qrPayload) {
    // El QR guarda el payload textual completo; también aceptamos que
    // alguien pegue manualmente el id de la hoja como respaldo.
    return DB.hojas.find(h => h.qr_payload === qrPayload || h.id === qrPayload) || null;
  },
  generarHoja({ evaluacionId, estudianteId, cursoId }) {
    const existente = DB.hojas.find(h => h.evaluacion_id === evaluacionId && h.estudiante_id === estudianteId);
    if (existente) return existente;
    const payload = JSON.stringify({
      est: estudianteId, curso: cursoId, eval: evaluacionId, v: 1, t: Date.now()
    });
    const h = { id: uid('hoja'), evaluacion_id: evaluacionId, estudiante_id: estudianteId,
      curso_id: cursoId, qr_payload: payload, generada_en: new Date().toISOString() };
    DB.hojas.push(h); scheduleSync(); return h;
  },

  // ── Resultados: calificación automática contra la clave ─────────
  getResultadoPorHoja(hojaId) { return DB.resultados.find(r => r.hoja_id === hojaId) || null; },
  guardarResultado({ hojaId, respuestas }) {
    const hoja = this.getHoja(hojaId);
    if (!hoja) throw new Error('Hoja no encontrada');
    const preguntas = this.listPreguntas(hoja.evaluacion_id);

    let aciertos = 0;
    const porCompetencia = {};
    preguntas.forEach(p => {
      const marcada = respuestas[p.numero] || null;
      const esCorrecta = marcada && marcada === p.correcta;
      if (esCorrecta) aciertos++;
      const comp = p.competencia || 'Sin competencia';
      if (!porCompetencia[comp]) porCompetencia[comp] = { total: 0, aciertos: 0 };
      porCompetencia[comp].total++;
      if (esCorrecta) porCompetencia[comp].aciertos++;
    });

    const existente = this.getResultadoPorHoja(hojaId);
    const resultado = existente || { id: uid('res'), hoja_id: hojaId };
    Object.assign(resultado, {
      estudiante_id: hoja.estudiante_id,
      evaluacion_id: hoja.evaluacion_id,
      respuestas,
      aciertos,
      total: preguntas.length,
      porcentaje: preguntas.length ? Math.round((aciertos / preguntas.length) * 100) : 0,
      por_competencia: porCompetencia,
      calculado_en: new Date().toISOString(),
    });
    if (!existente) DB.resultados.push(resultado);
    scheduleSync();
    return resultado;
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
