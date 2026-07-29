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
    <p class="subtitle">Muestra, para todos los estudiantes de un curso, el nivel y la nota de cada área evaluada (de todas las sesiones y docentes) más el promedio general — un solo documento con la prueba completa, listo para imprimir y entregar. Solo el administrador coordina esta vista porque agrupa varias áreas/docentes en un mismo documento.</p>
    <div class="card no-print">
      <div class="form-row">
        <select id="bo-curso">${cursos.map(c => `<option value="${c.id}">Grado ${c.grado}° ${escHTML(c.paralelo)} — ${c.jornada}/${c.seccion}</option>`).join('')}</select>
        <button class="btn" id="bo-gen">📋 Generar boletín</button>
        <button class="btn sec" id="bo-print" style="display:none">🖨 Imprimir</button>
      </div>
    </div>
    <div id="bo-out"></div>
    ` : ''}

    <h2 style="margin-top:1.6rem">🔍 Resultados individuales</h2>
    <p class="subtitle">Consulta pregunta por pregunta qué nivel obtuvo un estudiante en cada área — para ver exactamente dónde le fue bien y dónde le fue mal, no solo el promedio.</p>
    <div class="card no-print">
      <div class="form-row">
        <select id="ri-curso"><option value="">Elige el curso...</option>${cursos.map(c => `<option value="${c.id}">Grado ${c.grado}° ${escHTML(c.paralelo)} — ${c.jornada}/${c.seccion}</option>`).join('')}</select>
        <select id="ri-estudiante" disabled><option value="">Elige el curso primero...</option></select>
        <button class="btn" id="ri-buscar">🔍 Ver resultados</button>
      </div>
    </div>
    <div id="ri-out"></div>
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

  root.querySelector('#ri-curso').onchange = (e) => {
    const selEst = root.querySelector('#ri-estudiante');
    const cursoId = e.target.value;
    if (!cursoId) { selEst.innerHTML = '<option value="">Elige el curso primero...</option>'; selEst.disabled = true; return; }
    const estudiantes = store.listEstudiantes(cursoId).sort((a, b) => a.nombre.localeCompare(b.nombre));
    selEst.innerHTML = estudiantes.length
      ? estudiantes.map(est => `<option value="${est.id}">${escHTML(est.nombre)}</option>`).join('')
