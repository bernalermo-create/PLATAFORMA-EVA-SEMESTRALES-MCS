import { store } from '../services/store.js';

export function renderResultados(root) {
  const evals = store.listEvaluaciones();
  const resultados = store.listResultados();

  root.innerHTML = `
    <h1>📈 Resultados</h1>
    <p class="subtitle">Se llenan automáticamente desde "Escaneo" al calificar cada hoja. Este es el mismo tipo de nivel de desempeño que consume el análisis semestral del sistema actual.</p>

    ${evals.length ? `
    <div class="form-row">
      <select id="rs-filter"><option value="">Todas las evaluaciones</option>${evals.map(e => `<option value="${e.id}">${e.nombre}</option>`).join('')}</select>
    </div>` : ''}

    <div id="rs-out"></div>
  `;

  const out = root.querySelector('#rs-out');
  const draw = (evaluacionId) => {
    const filtrados = evaluacionId ? resultados.filter(r => r.evaluacion_id === evaluacionId) : resultados;
    if (!filtrados.length) {
      out.innerHTML = `<div class="empty">Aún no hay resultados calificados${evaluacionId ? ' para esta evaluación' : ''}. Ve a "Escaneo" para calificar hojas.</div>`;
      return;
    }
    out.innerHTML = `
      <table>
        <thead><tr><th>Estudiante</th><th>Evaluación</th><th>Aciertos</th><th>%</th><th>Por competencia</th></tr></thead>
        <tbody>
          ${filtrados.map(r => {
            const est = store.getEstudiante(r.estudiante_id);
            const ev = store.getEvaluacion(r.evaluacion_id);
            const comp = Object.entries(r.por_competencia || {})
              .map(([k, v]) => `${k}: ${v.aciertos}/${v.total}`).join(' · ');
            return `<tr>
              <td>${est ? est.nombre : '—'}</td>
              <td>${ev ? ev.nombre : '—'}</td>
              <td>${r.aciertos}/${r.total}</td>
              <td><span class="badge ${r.porcentaje >= 60 ? 'ok' : 'warn'}">${r.porcentaje}%</span></td>
              <td style="font-size:.78rem;color:var(--txt2)">${comp || '—'}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    `;
  };

  draw('');
  const sel = root.querySelector('#rs-filter');
  if (sel) sel.onchange = () => draw(sel.value);
}
