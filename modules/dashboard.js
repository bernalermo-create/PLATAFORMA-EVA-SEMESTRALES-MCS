import { store } from '../services/store.js';
import { isAdmin, currentUser } from '../services/auth.js';

export function renderDashboard(root) {
  if (isAdmin()) {
    renderAdminPanel(root);
  } else {
    renderDocentePanel(root);
  }
}

function renderAdminPanel(root) {
  const s = store.stats();
  root.innerHTML = `
    <h1>👑 Panel de Administrador</h1>
    <p class="subtitle">Resumen general de toda la institución — todas las jornadas, secciones y docentes.</p>
    <div class="grid grid-4">
      ${statCard('🏫', s.cursos, 'Cursos registrados')}
      ${statCard('🧑‍🎓', s.estudiantes, 'Estudiantes')}
      ${statCard('📝', s.evaluaciones, 'Evaluaciones creadas')}
      ${statCard('✅', s.evaluacionesPublicadas, 'Evaluaciones publicadas')}
      ${statCard('🧾', s.hojasGeneradas, 'Hojas de respuesta generadas')}
      ${statCard('📈', s.resultadosCalificados, 'Resultados calificados')}
      ${statCard('⏳', s.pendientesPorEscanear, 'Pendientes por escanear')}
    </div>

    <h2>Flujo institucional</h2>
    <div class="card">
      <ol style="line-height:2;font-size:.88rem;color:var(--txt2);margin:0;padding-left:1.2rem">
        <li>Cargar/actualizar estudiantes y cursos en <b>Institucional</b> (o dejar que cada docente cree sus preguntas y tú solo publiques).</li>
        <li>Los docentes crean sus pruebas y preguntas en <b>Evaluaciones</b> (cada uno ve solo las suyas).</li>
        <li>Generar las hojas de respuesta con QR en <b>Hojas / QR</b> e imprimirlas — ahí sí se agrupan varias áreas/docentes en una sola sesión.</li>
        <li>Aplicar la prueba y capturar respuestas en <b>Escaneo</b> (QR + digitación asistida).</li>
        <li>Consultar <b>Resultados</b>, generar el <b>Boletín por curso</b> y publicarlo.</li>
      </ol>
    </div>
  `;
}

function renderDocentePanel(root) {
  const yo = currentUser().toUpperCase();
  const misEvals = store.listEvaluaciones().filter(e => !e.docente || e.docente.trim().toUpperCase() === yo);
  const misEvalIds = new Set(misEvals.map(e => e.id));
  const misResultados = store.listResultados().filter(r => misEvalIds.has(r.evaluacion_id));
  const publicadas = misEvals.filter(e => e.estado === 'publicada').length;
  const preguntasTotal = misEvals.reduce((sum, e) => sum + (e.num_preguntas || 0), 0);

  root.innerHTML = `
    <h1>📚 Panel Docente — ${currentUser()}</h1>
    <p class="subtitle">Solo ves lo relacionado con tus propias evaluaciones. El administrador es quien coordina cuadernillos con varias áreas y publica los boletines por curso.</p>
    <div class="grid grid-4">
      ${statCard('📝', misEvals.length, 'Mis evaluaciones')}
      ${statCard('✅', publicadas, 'Publicadas')}
      ${statCard('🧩', preguntasTotal, 'Preguntas redactadas')}
      ${statCard('📈', misResultados.length, 'Resultados calificados')}
    </div>

    <h2>Qué puedes hacer</h2>
    <div class="card">
      <ol style="line-height:2;font-size:.88rem;color:var(--txt2);margin:0;padding-left:1.2rem">
        <li>Crear tu evaluación y redactar preguntas (con imágenes si quieres) en <b>Evaluaciones</b>.</li>
        <li>Publicarla cuando esté lista.</li>
        <li>Coordinar con el administrador la generación del cuadernillo/hoja de respuestas de la sesión en <b>Hojas / QR</b>.</li>
        <li>Escanear/digitar las respuestas de tus estudiantes en <b>Escaneo</b>.</li>
        <li>Ver los resultados de tus evaluaciones en <b>Resultados</b>.</li>
      </ol>
    </div>

    ${!misEvals.length ? `<div class="empty">Aún no has creado ninguna evaluación — ve a "Evaluaciones" para empezar.</div>` : ''}
  `;
}

function statCard(icon, num, lbl) {
  return `<div class="card stat-card">
    <div style="font-size:1.3rem">${icon}</div>
    <div class="stat-num">${num}</div>
    <div class="stat-lbl">${lbl}</div>
  </div>`;
}
