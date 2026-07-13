import { store, driveImgUrl, escHTML, SESSION_PRESETS, tierDeGrado } from '../services/store.js';
import { renderQR } from '../services/qr.js';
import { toast } from '../app.js';

// Para la PORTADA se usan 3 estilos (no 2), siguiendo la división
// oficial del MEN: Primaria (2°-5°), Secundaria (6°-9°) y Media
// (10°-11°) — cada una con su propia identidad visual.
function _tierCover(grado) {
  if (grado <= 5) return 'primaria';
  if (grado <= 9) return 'secundaria';
  return 'media';
}

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
        <select id="hj-curso">${cursos.map(c => `<option value="${c.id}">Grado ${c.grado}° ${escHTML(c.paralelo)} — ${c.jornada}/${c.seccion}</option>`).join('')}</select>
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
    const sesion = parseInt(root.querySelector('#cd-sesion').value) || 1;
    const match = evals.filter(e => e.grado === grado && e.year === year && e.semestre === sem);
    const box = root.querySelector('#cd-checklist');
    if (!match.length) {
      box.innerHTML = `<div class="empty" style="padding:.8rem">No hay evaluaciones publicadas para Grado ${grado}° · ${year} · ${sem === 'S1' ? 'Primer' : 'Segundo'} Semestre.</div>`;
      return;
    }
    const tier = tierDeGrado(grado);
    const preset = (SESSION_PRESETS[tier] || {})[sesion];
    box.innerHTML = `
      <div style="font-size:.78rem;color:var(--txt2);margin-bottom:.4rem">
        Preselección para ${tier === 'primaria' ? 'Primaria' : 'Bachillerato'} · Sesión ${sesion}${!preset ? ' (sin patrón predefinido para esta sesión — marca a mano)' : ''}.
      </div>
      ${match.map((e) => `
      <label style="display:flex;align-items:center;gap:.5rem;padding:.35rem 0">
        <input type="checkbox" class="cd-check" value="${e.id}" ${preset ? (preset.includes(e.area) ? 'checked' : '') : ''}>
        ${e.area} — ${store.listPreguntas(e.id).length} pregunta(s)
        <span style="color:var(--txt2);font-size:.78rem">— ${e.docente ? `docente: ${escHTML(e.docente)}` : 'sin docente asignado'}</span>
      </label>
    `).join('')}`;
  };
  drawChecklist();
  root.querySelector('#cd-grado').onchange = drawChecklist;
  root.querySelector('#cd-year').onchange = drawChecklist;
  root.querySelector('#cd-sem').onchange = drawChecklist;
  root.querySelector('#cd-sesion').oninput = drawChecklist;

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
  const tier = _tierCover(primera.grado);
  const semLabel = primera.semestre === 'S1' ? 'Primer Semestre' : 'Segundo Semestre';
  const cover = document.createElement('div');
  cover.className = `cuad-page cuad-cover tier-${tier}`;
  cover.innerHTML = `
    <div class="cv-motif">
      <div class="cv-corner tl"></div><div class="cv-corner tr"></div>
      <div class="cv-corner bl"></div><div class="cv-corner br"></div>
    </div>
    <header class="cv-head">
      <div class="cv-shield"><img src="icon-512.png" alt="Escudo"></div>
      <div class="cv-head-text">
        <div class="cv-colegio">Colegio Miguel de Cervantes Saavedra I.E.D.</div>
      </div>
      <div class="cv-sesion">SESIÓN ${sesion}</div>
    </header>
    <main class="cv-main">
      <div class="cv-eyebrow">Evaluación Semestral · ${semLabel} · ${primera.year}</div>
      <h1 class="cv-title">Evaluaciones<br>Semestrales</h1>
      <div class="cv-title-rule"></div>
      <div class="cv-grado">
        <span class="cv-grado-num">${primera.grado}°</span>
        <span class="cv-grado-label">Grado ${_grado(primera.grado)}</span>
      </div>
    </main>
    <footer class="cv-foot">
      <div class="cv-rule"></div>
      <div class="cv-pei">PEI: "Habilidades Comunicativas para la excelencia, el emprendimiento y la transformación de la comunidad"</div>
    </footer>
  `;
  out.appendChild(cover);

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
            ${p.imagen_url ? `<div style="margin:.4rem 0"><img src="${driveImgUrl(p.imagen_url)}" style="max-width:100%;max-height:220px"></div>` : ''}
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

  toast(`Cuadernillo generado: ${bloques.map(b => b.ev.area).join(', ')} (${total} preguntas en total).`);
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
              <div class="hoja-col-name">${escHTML(est.nombre)}</div>
              <div><b>Curso:</b> ${curso.grado}° ${escHTML(curso.paralelo)}</div>
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
