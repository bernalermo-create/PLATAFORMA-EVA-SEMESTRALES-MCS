import { store } from '../services/store.js';
import { renderQR } from '../services/qr.js';
import { toast } from '../app.js';

export function renderHojas(root) {
  const evals = store.listEvaluaciones().filter(e => e.estado === 'publicada');
  const cursos = store.listCursos();

  root.innerHTML = `
    <h1>🧾 Cuadernillos y Hojas de respuesta</h1>
    <p class="subtitle">El cuadernillo y la hoja de respuestas agrupan las mismas áreas por sesión, con la misma numeración continua entre ellas — igual a como el colegio ya lo maneja (ej. Matemáticas + Ciencias Naturales + Inglés en Sesión 1).</p>

    ${evals.length === 0 ? `<div class="empty">Primero publica una evaluación en el módulo "Evaluaciones".</div>` : `
    <div class="card">
      <h2 style="margin-top:0">1. Elige grado, semestre y sesión</h2>
      <div class="form-row">
        <select id="cd-grado">${[2,3,4,5,6,7,8,9,10,11].map(g=>`<option value="${g}">Grado ${g}°</option>`).join('')}</select>
        <select id="cd-year">${[...new Set(evals.map(e=>e.year))].sort().map(y=>`<option value="${y}">${y}</option>`).join('') || '<option value="2026">2026</option>'}</select>
        <select id="cd-sem"><option value="S1">Primer Semestre</option><option value="S2">Segundo Semestre</option></select>
        <input id="cd-sesion" type="number" min="1" value="1" style="max-width:120px" title="Número de sesión">
      </div>
      <h3 style="font-size:.85rem;margin:.8rem 0 .3rem">Áreas incluidas en esta sesión</h3>
      <div id="cd-checklist" style="margin:.4rem 0;font-size:.85rem"></div>
    </div>

    <div class="card" style="margin-top:1rem">
      <h2 style="margin-top:0">2. Generar</h2>
      <div class="form-row">
        <button class="btn" id="cd-gen">📘 Generar Cuadernillo (preguntas)</button>
      </div>
      <div class="form-row" style="margin-top:.6rem">
        <select id="hj-curso">${cursos.map(c => `<option value="${c.id}">Grado ${c.grado}° ${c.paralelo} — ${c.jornada}/${c.seccion}</option>`).join('')}</select>
        <button class="btn" id="hj-gen">🧾 Generar Hojas de respuesta del curso (QR)</button>
      </div>
    </div>

    <div id="hojas-out"></div>
    `}
  `;

  if (!evals.length) return;

  const drawChecklist = () => {
    const grado = parseInt(root.querySelector('#cd-grado').value);
    const year = parseInt(root.querySelector('#cd-year').value);
    const sem = root.querySelector('#cd-sem').value;
    const match = evals.filter(e => e.grado === grado && e.year === year && e.semestre === sem);
    const box = root.querySelector('#cd-checklist');
    if (!match.length) {
      box.innerHTML = `<div class="empty" style="padding:.8rem">No hay evaluaciones publicadas para Grado ${grado}° · ${year} · ${sem === 'S1' ? 'Primer' : 'Segundo'} Semestre.</div>`;
      return;
    }
    box.innerHTML = match.map((e, i) => `
      <label style="display:flex;align-items:center;gap:.5rem;padding:.35rem 0">
        <input type="checkbox" class="cd-check" value="${e.id}" ${i < 3 ? 'checked' : ''}>
        ${e.area} — ${store.listPreguntas(e.id).length} pregunta(s)
      </label>
    `).join('');
  };
  drawChecklist();
  root.querySelector('#cd-grado').onchange = drawChecklist;
  root.querySelector('#cd-year').onchange = drawChecklist;
  root.querySelector('#cd-sem').onchange = drawChecklist;

  function idsMarcados() {
    return Array.from(root.querySelectorAll('.cd-check:checked')).map(c => c.value);
  }

  root.querySelector('#cd-gen').onclick = () => {
    const ids = idsMarcados();
    if (!ids.length) { toast('Marca al menos un área.', 'warn'); return; }
    generarCuadernillo(root, ids);
  };

  root.querySelector('#hj-gen').onclick = () => {
    const ids = idsMarcados();
    if (!ids.length) { toast('Marca al menos un área.', 'warn'); return; }
    generarHojas(root, ids, cursos);
  };
}

function generarCuadernillo(root, evaluacionIds) {
  const { bloques, total } = store.gruposConNumeracion(evaluacionIds);
  if (!total) { toast('Ninguna de las áreas marcadas tiene preguntas todavía.', 'warn'); return; }
  const sesion = parseInt(root.querySelector('#cd-sesion').value) || 1;
  const primera = bloques[0].ev;

  const out = root.querySelector('#hojas-out');
  out.innerHTML = `<div class="no-print" style="margin:1rem 0"><button class="btn sec" onclick="window.print()">🖨 Imprimir cuadernillo</button></div>`;

  // ── Página 1: Portada ──
  const cover = document.createElement('div');
  cover.className = 'cuad-page cuad-cover';
  cover.innerHTML = `
    <div class="band-navy"></div>
    <div class="band-teal"></div>
    <div class="cover-content">
      <h1>Evaluaciones<br>Semestrales</h1>
      <div class="cover-grado">Grado ${_grado(primera.grado)} <span class="cover-grado-num">${primera.grado}</span></div>
    </div>
    <div class="cover-sesion">SESIÓN ${sesion}</div>
    <img class="cover-shield" src="icon-512.png" alt="Escudo">
    <div class="cover-foot">
      <div class="cover-colegio">Colegio Miguel de<br>Cervantes Saavedra.</div>
      <div class="cover-pei">PEI: "Habilidades Comunicativas para la excelencia, el emprendimiento y la transformación de la comunidad"</div>
    </div>
  `;
  out.appendChild(cover);

  // ── Página 2: Instrucciones ──
  const areasTxt = bloques.map(b => b.ev.area).join(', ');
  const instr = document.createElement('div');
  instr.className = 'cuad-page cuad-instr';
  instr.innerHTML = `
    <h2>Instrucciones.</h2>
    <p>
      Estudiante Cervantino, en este momento va a presentar la evaluación semestral, la cual está
      organizada por sesiones. En esta <b>Sesión ${sesion}</b> se reúnen las asignaturas de
      <b>${areasTxt}</b>. La prueba contiene <b>${total} preguntas</b> con cuatro opciones de
      respuesta (A, B, C, D).
    </p>
    <p>
      Lea cuidadosamente cada pregunta y sus opciones antes de responder. Marque su respuesta
      <b>únicamente en la Hoja de Respuestas</b> que se entrega por separado, rellenando completamente el
      círculo correspondiente con lápiz de mina negra No. 2. No escriba ni marque nada en este cuadernillo.
    </p>
    <p>
      Verifique que el número de la respuesta coincida con el número de la pregunta. No marque más de una
      opción por pregunta. Si desea cambiar una respuesta, borre completa y limpiamente la marca anterior.
    </p>
  `;
  out.appendChild(instr);

  // ── Páginas de preguntas, agrupadas por área ──
  const porPagina = 6;
  bloques.forEach(({ ev, preguntas }) => {
    for (let i = 0; i < preguntas.length; i += porPagina) {
      const chunk = preguntas.slice(i, i + porPagina);
      const page = document.createElement('div');
      page.className = 'cuad-page';
      page.innerHTML = `
        <div class="cuad-qhead">
          <div class="cq-colegio">COLEGIO MIGUEL DE CERVANTES SAAVEDRA IED</div>
          <div class="cq-pei">PEI: "Habilidades Comunicativas para la excelencia, el emprendimiento y la transformación de la comunidad"</div>
          <div class="cq-sesion">EVALUACIÓN SEMESTRAL — SESIÓN ${sesion}</div>
        </div>
        ${i === 0 ? `<div class="cuad-area-title">${ev.area} (preguntas ${preguntas[0]._abs} a ${preguntas[preguntas.length - 1]._abs})</div>` : ''}
        ${chunk.map(p => `
          <div class="cuad-q">
            <b class="qnum">${p._abs}.</b>${_escape(p.enunciado)}
            ${p.imagen_url ? `<div style="margin:.4rem 0"><img src="${p.imagen_url}" style="max-width:100%;max-height:220px"></div>` : ''}
            <div class="cuad-opts">
              ${p.opciones.map(o => `<div>${o.letra}. ${_escape(o.texto)}</div>`).join('')}
            </div>
          </div>
        `).join('')}
        <div class="cuad-pagenum">Grado ${ev.grado}° · Sesión ${sesion} · ${ev.area}</div>
      `;
      out.appendChild(page);
    }
  });

  toast(`Cuadernillo generado: ${areasTxt} (${total} preguntas en total).`);
}

function generarHojas(root, evaluacionIds, cursos) {
  const cursoId = root.querySelector('#hj-curso').value;
  const sesion = parseInt(root.querySelector('#cd-sesion').value) || 1;
  const curso = cursos.find(c => c.id === cursoId);
  const estudiantes = store.listEstudiantes(cursoId);
  const { bloques, total } = store.gruposConNumeracion(evaluacionIds);

  if (!total) { toast('Ninguna de las áreas marcadas tiene preguntas todavía.', 'warn'); return; }
  if (!estudiantes.length) { toast('Este curso no tiene estudiantes cargados.', 'warn'); return; }

  const out = root.querySelector('#hojas-out');
  out.innerHTML = `<div class="no-print" style="margin:1rem 0"><button class="btn sec" onclick="window.print()">🖨 Imprimir todas</button></div>`;

  estudiantes.forEach(est => {
    const hoja = store.generarHoja({ evaluacionIds, estudianteId: est.id, cursoId, sesion });
    const sheet = document.createElement('div');
    sheet.className = 'hoja-print hoja-multi';
    sheet.innerHTML = `
      <div class="hoja-hd">
        <h3>COLEGIO MIGUEL DE CERVANTES SAAVEDRA IED</h3>
        <div>EVALUACIONES SEMESTRALES · HOJA DE RESPUESTAS — SESIÓN ${sesion}</div>
      </div>
      <div class="hoja-cols">
        ${bloques.map(({ ev, preguntas }, i) => `
          <div class="hoja-col">
            <div class="hoja-col-meta">
              <div><b>Nombres y apellidos:</b></div>
              <div class="hoja-col-name">${est.nombre}</div>
              <div><b>Curso:</b> ${curso.grado}° ${curso.paralelo}</div>
              ${i === 0 ? `<div class="qr-box" data-qr="${hoja.id}" style="margin-top:.4rem"></div>` : ''}
            </div>
            <div class="hoja-col-area">${ev.area}</div>
            <div class="omr-area-col">
              ${preguntas.map(p => `
                <div class="omr-q">
                  <b>${p._abs}</b>
                  ${['A','B','C','D'].map(l => `<span class="bubble">${l}</span>`).join('')}
                </div>`).join('')}
            </div>
          </div>
        `).join('')}
      </div>
    `;
    out.appendChild(sheet);
    renderQR(sheet.querySelector(`[data-qr="${hoja.id}"]`), hoja.qr_payload, 80);
  });

  toast(`${estudiantes.length} hoja(s) generada(s) — Sesión ${sesion}, ${bloques.length} área(s), ${total} preguntas.`);
}

function _grado(n) {
  const map = { 2:'Segundo',3:'Tercero',4:'Cuarto',5:'Quinto',6:'Sexto',7:'Séptimo',8:'Octavo',9:'Noveno',10:'Décimo',11:'Once' };
  return map[n] || n;
}
function _escape(s) {
  const d = document.createElement('div');
  d.textContent = s || '';
  return d.innerHTML;
}
