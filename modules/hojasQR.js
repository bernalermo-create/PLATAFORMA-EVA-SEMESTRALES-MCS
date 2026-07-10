import { store } from '../services/store.js';
import { renderQR } from '../services/qr.js';
import { toast } from '../app.js';

export function renderHojas(root) {
  const evals = store.listEvaluaciones().filter(e => e.estado === 'publicada');
  const cursos = store.listCursos();

  root.innerHTML = `
    <h1>🧾 Hojas de respuesta con QR</h1>
    <p class="subtitle">Genera la hoja de respuestas (formato de burbujas A-B-C-D, igual al que ya usa el colegio) con un QR único por estudiante que identifica prueba + curso + estudiante.</p>

    ${evals.length === 0 ? `<div class="empty">Primero publica una evaluación en el módulo "Evaluaciones".</div>` : `
    <div class="card">
      <div class="form-row">
        <select id="hj-eval">${evals.map(e => `<option value="${e.id}">${e.nombre} (Grado ${e.grado}°)</option>`).join('')}</select>
        <select id="hj-curso">${cursos.map(c => `<option value="${c.id}">Grado ${c.grado}° ${c.paralelo} — ${c.jornada}/${c.seccion}</option>`).join('')}</select>
        <button class="btn" id="hj-gen">Generar hojas del curso</button>
      </div>
    </div>
    <div id="hojas-out"></div>
    `}
  `;

  if (!evals.length) return;

  root.querySelector('#hj-gen').onclick = () => {
    const evaluacionId = root.querySelector('#hj-eval').value;
    const cursoId = root.querySelector('#hj-curso').value;
    const ev = store.getEvaluacion(evaluacionId);
    const preguntas = store.listPreguntas(evaluacionId);
    const estudiantes = store.listEstudiantes(cursoId);
    const curso = cursos.find(c => c.id === cursoId);

    if (!preguntas.length) { toast('Esta evaluación no tiene preguntas todavía.', 'warn'); return; }
    if (!estudiantes.length) { toast('Este curso no tiene estudiantes cargados.', 'warn'); return; }

    const out = root.querySelector('#hojas-out');
    out.innerHTML = `<div class="no-print" style="margin:1rem 0"><button class="btn sec" onclick="window.print()">🖨 Imprimir todas</button></div>`;

    estudiantes.forEach(est => {
      const hoja = store.generarHoja({ evaluacionId, estudianteId: est.id, cursoId });
      const sheet = document.createElement('div');
      sheet.className = 'hoja-print';
      sheet.innerHTML = `
        <div class="hoja-hd">
          <h3>COLEGIO MIGUEL DE CERVANTES SAAVEDRA I.E.D.</h3>
          <div>HOJA DE RESPUESTAS — ${ev.nombre}</div>
        </div>
        <div class="hoja-meta">
          <div>
            <div><b>Nombre:</b> ${est.nombre}</div>
            <div><b>Curso:</b> Grado ${curso.grado}° ${curso.paralelo} · ${curso.jornada}/${curso.seccion}</div>
            <div><b>Año/Semestre:</b> ${ev.year} · ${ev.semestre}</div>
          </div>
          <div class="qr-box" data-qr="${hoja.id}"></div>
        </div>
        <div class="omr-area">
          ${preguntas.map(p => `
            <div class="omr-q">
              <b>${p.numero}.</b>
              ${['A','B','C','D'].map(l => `<span class="bubble">${l}</span>`).join('')}
            </div>`).join('')}
        </div>
      `;
      out.appendChild(sheet);
      renderQR(sheet.querySelector(`[data-qr="${hoja.id}"]`), hoja.qr_payload, 90);
    });

    toast(`${estudiantes.length} hoja(s) generada(s).`);
  };
}
