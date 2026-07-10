import { store } from '../services/store.js';

export function renderDashboard(root) {
  const s = store.stats();
  root.innerHTML = `
    <h1>📊 Dashboard institucional</h1>
    <p class="subtitle">Resumen general de evaluaciones semestrales.</p>
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
        <li>Cargar/actualizar estudiantes y cursos en <b>Institucional</b>.</li>
        <li>Crear una prueba y sus preguntas en <b>Evaluaciones</b>.</li>
        <li>Generar las hojas de respuesta con QR en <b>Hojas / QR</b> e imprimirlas.</li>
        <li>Aplicar la prueba y capturar respuestas en <b>Escaneo</b> (QR + digitación asistida).</li>
        <li>Consultar <b>Resultados</b> y el análisis semestral consolidado.</li>
      </ol>
    </div>
  `;
}

function statCard(icon, num, lbl) {
  return `<div class="card stat-card">
    <div style="font-size:1.3rem">${icon}</div>
    <div class="stat-num">${num}</div>
    <div class="stat-lbl">${lbl}</div>
  </div>`;
}
