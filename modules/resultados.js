import { store, escHTML } from '../services/store.js';
import { isAdmin, currentUser } from '../services/auth.js';
import { toast } from '../app.js';

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
        <thead><tr><th>Estudiante</th><th>Evaluación</th><th>Nota /5.0</th><th>Nivel final</th><th>Respondidas</th><th>Por competencia</th><th>Foto</th><th></th></tr></thead>
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
              <td><button class="btn sm sec" data-del-resultado="${r.id}" style="color:var(--bad)" title="Borrar este resultado (ej. una prueba de escaneo) — la hoja vuelve a quedar pendiente por calificar">🗑</button></td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    `;
    out.querySelectorAll('[data-del-resultado]').forEach(btn => {
      btn.onclick = () => {
        if (!confirm('¿Borrar este resultado calificado? La hoja de respuestas sigue existiendo (vuelve a quedar pendiente por escanear), solo se borra la calificación. No se puede deshacer.')) return;
        store.deleteResultado(btn.dataset.delResultado);
        toast('Resultado borrado.');
        const idx = resultados.findIndex(r => r.id === btn.dataset.delResultado);
        if (idx !== -1) resultados.splice(idx, 1);
        draw(sel ? sel.value : '');
      };
    });
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
      : '<option value="">Este curso no tiene estudiantes cargados</option>';
    selEst.disabled = !estudiantes.length;
  };

  const buscarResultadosIndividuales = () => {
    const estudianteId = root.querySelector('#ri-estudiante').value;
    const riOut = root.querySelector('#ri-out');
    if (!estudianteId) { riOut.innerHTML = '<div class="empty">Elige el curso y el estudiante.</div>'; return; }
    const est = store.getEstudiante(estudianteId);
    const propios = resultados.filter(r => r.estudiante_id === estudianteId);
    if (!propios.length) {
      riOut.innerHTML = `<div class="empty">${escHTML(est.nombre)} todavía no tiene resultados calificados${admin ? '' : ' en tus evaluaciones'}.</div>`;
      return;
    }
    riOut.innerHTML = `
      <h3 style="margin:1rem 0 .6rem">${escHTML(est.nombre)}</h3>
      ${propios.map(r => {
        const ev = store.getEvaluacion(r.evaluacion_id);
        const preguntas = store.listPreguntas(r.evaluacion_id);
        return `
        <div class="card" style="margin-bottom:.8rem">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:.5rem;margin-bottom:.6rem">
            <h4 style="margin:0">${ev ? escHTML(ev.area) : '—'} <span style="color:var(--txt2);font-weight:400;font-size:.82rem">${ev ? (ev.semestre === 'S1' ? 'Primer' : 'Segundo') + ' Semestre ' + ev.year : ''}</span></h4>
            <span style="display:flex;align-items:center;gap:.5rem">
              <b>${r.nota != null ? r.nota.toFixed(1) : '—'}</b>/5.0 — <span class="badge ${NIVEL_BADGE[r.nivel_final] || 'draft'}">${NIVEL_LABEL[r.nivel_final] || 'Sin datos'}</span>
              <button class="btn sm sec" data-del-resultado-ri="${r.id}" style="color:var(--bad)" title="Borrar este resultado">🗑</button>
            </span>
          </div>
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:.5rem">
            ${preguntas.map(p => {
              const nivel = r.niveles?.[p.numero];
              return `<div style="background:var(--surf2);border-radius:8px;padding:.5rem .6rem">
                <div style="font-size:.72rem;color:var(--txt2)">Pregunta ${p.numero}${p.competencia ? ' · ' + escHTML(p.competencia) : ''}</div>
                <span class="badge ${nivel ? (NIVEL_BADGE[nivel] || 'draft') : 'draft'}" style="margin-top:.25rem">${nivel ? NIVEL_LABEL[nivel] : 'Sin responder'}</span>
              </div>`;
            }).join('')}
          </div>
        </div>`;
      }).join('')}
    `;
    riOut.querySelectorAll('[data-del-resultado-ri]').forEach(btn => {
      btn.onclick = () => {
        if (!confirm('¿Borrar este resultado calificado? La hoja de respuestas sigue existiendo (vuelve a quedar pendiente por escanear), solo se borra la calificación. No se puede deshacer.')) return;
        store.deleteResultado(btn.dataset.delResultadoRi);
        toast('Resultado borrado.');
        const idx = resultados.findIndex(r => r.id === btn.dataset.delResultadoRi);
        if (idx !== -1) resultados.splice(idx, 1);
        buscarResultadosIndividuales();
      };
    });
  };
  root.querySelector('#ri-buscar').onclick = buscarResultadosIndividuales;
}

function generarBoletin(root, cursos) {
  const cursoId = root.querySelector('#bo-curso').value;
  const curso = cursos.find(c => c.id === cursoId);
  // Todas las hojas del curso, de CUALQUIER sesión — un estudiante puede
  // tener varias hojas (distintas sesiones, o hojas viejas regeneradas
  // con otra combinación de áreas); se agrupan por estudiante y por área
  // para que cada quien salga en una sola fila con la prueba completa,
  // en vez de una fila por hoja (eso duplicaba estudiantes en pantalla
  // cuando había más de una hoja generada para la misma persona).
  const hojas = store.listHojas().filter(h => h.curso_id === cursoId);
  const boBox = root.querySelector('#bo-out');

  if (!hojas.length) {
    boBox.innerHTML = `<div class="empty">No hay hojas generadas para Grado ${curso.grado}° ${escHTML(curso.paralelo)}.</div>`;
    root.querySelector('#bo-print').style.display = 'none';
    return;
  }

  // Por estudiante -> por área -> mejor resultado disponible (si el área
  // aparece en más de una hoja del mismo estudiante, se prefiere la que
  // sí tiene resultado calificado; entre dos calificadas, la más reciente).
  const porEstudiante = new Map();
  hojas.forEach(h => {
    const est = store.getEstudiante(h.estudiante_id);
    if (!est) return;
    if (!porEstudiante.has(est.id)) porEstudiante.set(est.id, { est, areas: new Map() });
    const entrada = porEstudiante.get(est.id);
    h.evaluacion_ids.forEach(evId => {
      const ev = store.getEvaluacion(evId);
      if (!ev) return;
      const r = store.getResultadoPorHoja(h.id, evId);
      const actual = entrada.areas.get(ev.area);
      if (!actual || (r && (!actual.r || new Date(r.calculado_en) > new Date(actual.r.calculado_en)))) {
        entrada.areas.set(ev.area, { r, nivel: r?.nivel_final || null, nota: r?.nota ?? null });
      }
    });
  });

  const filas = [...porEstudiante.values()].map(({ est, areas }) => {
    const notasValidas = [...areas.values()].filter(a => a.nota !== null).map(a => a.nota);
    const promedio = notasValidas.length ? Math.round((notasValidas.reduce((a, b) => a + b, 0) / notasValidas.length) * 10) / 10 : null;
    return { est, areas, promedio };
  }).sort((a, b) => a.est.nombre.localeCompare(b.est.nombre));

  const areasNombres = [...new Set(filas.flatMap(f => [...f.areas.keys()]))].sort();

  boBox.innerHTML = `
    <div class="boletin-print">
      <div class="boletin-hd">
        <h3>COLEGIO MIGUEL DE CERVANTES SAAVEDRA I.E.D.</h3>
        <div>Boletín de resultados — Grado ${curso.grado}° ${escHTML(curso.paralelo)}</div>
      </div>
      <table>
        <thead><tr>
          <th>Estudiante</th>
          ${areasNombres.map(a => `<th>${a}</th>`).join('')}
          <th>Promedio /5.0</th>
        </tr></thead>
        <tbody>
          ${filas.map(f => `<tr>
            <td>${escHTML(f.est.nombre)}</td>
            ${areasNombres.map(nombreArea => {
              const a = f.areas.get(nombreArea);
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
