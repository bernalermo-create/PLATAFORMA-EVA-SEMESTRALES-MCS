import { store, escHTML } from '../services/store.js';
import { isAdmin, currentUser } from '../services/auth.js';

const NIVEL_LABEL = { BAJO: 'Bajo', 'BÁSICO': 'Básico', ALTO: 'Alto', SUPERIOR: 'Superior' };
const NIVEL_BADGE = { BAJO: 'warn', 'BÁSICO': 'draft', ALTO: 'ok', SUPERIOR: 'ok' };

export function renderResultados(root) {
  const admin = isAdmin();
  const yo = currentUser().toUpperCase();
  const todasEvals = store.listEvaluaciones();
  const evals = admin ? todasEvals : todasEvals.filter(e => !e.docente || e.docente.trim().toUpperCase() === yo);
  const evalIds = new Set(evals.map(e => e.id));
  const cursos = store.listCursos();
  const resultados = store.listResultados().filter(r => evalIds.has(r.evaluacion_id));

  root.innerHTML = `
    <h1>📈 ${admin ? 'Resultados (todas las áreas)' : 'Mis resultados'}</h1>
    <p class="subtitle">${admin
      ? 'La nota final (escala oficial 0.0-5.0) y el nivel se calculan a partir de la mezcla real de niveles obtenidos en cada pregunta, respetando los rangos institucionales: Bajo 0.0-2.9 · Básico 3.0-3.9 · Alto 4.0-4.5 · Superior 4.6-5.0.'
      : 'Solo se muestran los resultados de tus propias evaluaciones.'}</p>

    ${evals.length ? `
    <div class="form-row">
      <select id="rs-filter"><option value="">${admin ? 'Todas las evaluaciones' : 'Todas mis evaluaciones'}</option>${evals.map(e => `<option value="${e.id}">${escHTML(e.nombre)}</option>`).join('')}</select>
    </div>` : ''}

    <div id="rs-out"></div>

    ${admin ? `
    <h2 style="margin-top:1.6rem">📋 Boletín por curso (para publicar / imprimir)</h2>
    <p class="subtitle">Muestra, para todos los estudiantes de un curso en una sesión, el nivel y la nota de cada área (de todos los docentes) más el promedio general — listo para imprimir y entregar. Solo el administrador coordina esta vista porque agrupa varias áreas/docentes en un mismo documento.</p>
    <div class="card no-print">
      <div class="form-row">
        <select id="bo-curso">${cursos.map(c => `<option value="${c.id}">Grado ${c.grado}° ${escHTML(c.paralelo)} — ${c.jornada}/${c.seccion}</option>`).join('')}</select>
        <input id="bo-sesion" type="number" min="1" value="1" style="max-width:120px" title="Número de sesión">
        <button class="btn" id="bo-gen">📋 Generar boletín</button>
        <button class="btn sec" id="bo-print" style="display:none">🖨 Imprimir</button>
      </div>
    </div>
    <div id="bo-out"></div>
    ` : ''}
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
        <thead><tr><th>Estudiante</th><th>Evaluación</th><th>Nota /5.0</th><th>Nivel final</th><th>Respondidas</th><th>Por competencia</th><th>Foto</th></tr></thead>
        <tbody>
          ${filtrados.map(r => {
            const est = store.getEstudiante(r.estudiante_id);
            const ev = store.getEvaluacion(r.evaluacion_id);
            const comp = Object.entries(r.por_competencia || {})
              .map(([k, v]) => `${k}: ${NIVEL_LABEL[v.predominante] || '—'}`).join(' · ');
            return `<tr>
              <td>${est ? escHTML(est.nombre) : '—'}</td>
              <td>${ev ? escHTML(ev.nombre) : '—'}</td>
              <td><b>${r.nota != null ? r.nota.toFixed(1) : '—'}</b></td>
              <td><span class="badge ${NIVEL_BADGE[r.nivel_final] || 'draft'}">${NIVEL_LABEL[r.nivel_final] || 'Sin datos'}</span></td>
              <td>${r.contestadas}/${r.total}</td>
              <td style="font-size:.78rem;color:var(--txt2)">${comp || '—'}</td>
              <td>${r.foto_url ? `<a href="${r.foto_url}" target="_blank">📷 Ver</a>` : '—'}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    `;
  };

  draw('');
  const sel = root.querySelector('#rs-filter');
  if (sel) sel.onchange = () => draw(sel.value);

  const boGen = root.querySelector('#bo-gen');
  if (boGen) boGen.onclick = () => generarBoletin(root, cursos);
  const boPrint = root.querySelector('#bo-print');
  if (boPrint) boPrint.onclick = () => window.print();
}

function generarBoletin(root, cursos) {
  const cursoId = root.querySelector('#bo-curso').value;
  const sesion = parseInt(root.querySelector('#bo-sesion').value) || 1;
  const curso = cursos.find(c => c.id === cursoId);
  const hojas = store.listHojasPorCursoSesion(cursoId, sesion);
  const boBox = root.querySelector('#bo-out');

  if (!hojas.length) {
    boBox.innerHTML = `<div class="empty">No hay hojas generadas para Grado ${curso.grado}° ${escHTML(curso.paralelo)} en la Sesión ${sesion}.</div>`;
    root.querySelector('#bo-print').style.display = 'none';
    return;
  }

  // Reúne, por estudiante, el resultado de cada área incluida en su hoja.
  const filas = hojas.map(h => {
    const est = store.getEstudiante(h.estudiante_id);
    const areas = h.evaluacion_ids.map(evId => {
      const ev = store.getEvaluacion(evId);
      const r = store.getResultadoPorHoja(h.id, evId);
      return { area: ev?.area || '—', nivel: r?.nivel_final || null, nota: r?.nota ?? null };
    });
    const notasValidas = areas.filter(a => a.nota !== null).map(a => a.nota);
    const promedio = notasValidas.length ? Math.round((notasValidas.reduce((a, b) => a + b, 0) / notasValidas.length) * 10) / 10 : null;
    return { est, areas, promedio };
  }).sort((a, b) => (a.est?.nombre || '').localeCompare(b.est?.nombre || ''));

  const areasNombres = [...new Set(filas.flatMap(f => f.areas.map(a => a.area)))];

  boBox.innerHTML = `
    <div class="boletin-print">
      <div class="boletin-hd">
        <h3>COLEGIO MIGUEL DE CERVANTES SAAVEDRA I.E.D.</h3>
        <div>Boletín de resultados — Grado ${curso.grado}° ${escHTML(curso.paralelo)} · Sesión ${sesion}</div>
      </div>
      <table>
        <thead><tr>
          <th>Estudiante</th>
          ${areasNombres.map(a => `<th>${a}</th>`).join('')}
          <th>Promedio /5.0</th>
        </tr></thead>
        <tbody>
          ${filas.map(f => `<tr>
            <td>${f.est ? escHTML(f.est.nombre) : '—'}</td>
            ${areasNombres.map(nombreArea => {
              const a = f.areas.find(x => x.area === nombreArea);
              if (!a || a.nota === null) return `<td style="color:#999">Sin calificar</td>`;
              return `<td>${NIVEL_LABEL[a.nivel] || '—'} · <b>${a.nota.toFixed(1)}</b></td>`;
            }).join('')}
            <td><b>${f.promedio != null ? f.promedio.toFixed(1) : '—'}</b></td>
          </tr>`).join('')}
        </tbody>
      </table>
      <p class="boletin-nota">
        Escala institucional 0.0-5.0 — Bajo 0.0-2.9 · Básico 3.0-3.9 · Alto 4.0-4.5 · Superior 4.6-5.0.
        La nota interpola entre los niveles obtenidos en cada pregunta según la mezcla real de respuestas.
      </p>
    </div>
  `;
  root.querySelector('#bo-print').style.display = '';
}
