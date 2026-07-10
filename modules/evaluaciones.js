import { store } from '../services/store.js';
import { toast } from '../app.js';

export function renderEvaluaciones(root) {
  const evals = store.listEvaluaciones();
  root.innerHTML = `
    <h1>📝 Banco de evaluaciones</h1>
    <p class="subtitle">Crea una prueba, luego entra a redactar sus preguntas.</p>

    <div class="card">
      <h2 style="margin-top:0">➕ Nueva evaluación</h2>
      <div class="form-row">
        <input id="ne-nombre" placeholder="Nombre (ej: Evaluación Semestral Matemáticas)">
        <select id="ne-grado">${[2,3,4,5,6,7,8,9,10,11].map(g=>`<option value="${g}">Grado ${g}°</option>`).join('')}</select>
        <select id="ne-sem"><option value="S1">Primer Semestre</option><option value="S2">Segundo Semestre</option></select>
        <input id="ne-year" type="number" value="2026">
        <select id="ne-area">
          <option>Matemáticas</option><option>Ciencias Naturales</option><option>Inglés</option>
          <option>Competencias Ciudadanas</option><option>Lectura Crítica</option><option>Español</option>
        </select>
        <input id="ne-docente" placeholder="Docente responsable">
        <button class="btn" id="ne-add">Crear</button>
      </div>
    </div>

    <h2>Evaluaciones (${evals.length})</h2>
    <div class="grid grid-2">
      ${evals.length ? evals.map(ev => `
        <div class="card">
          <div style="display:flex;justify-content:space-between;align-items:start">
            <div>
              <strong>${ev.nombre}</strong>
              <div class="subtitle" style="margin:.2rem 0">Grado ${ev.grado}° · ${ev.semestre} ${ev.year} · ${ev.area}</div>
            </div>
            <span class="badge ${ev.estado === 'publicada' ? 'ok' : 'draft'}">${ev.estado}</span>
          </div>
          <div style="margin:.5rem 0;font-size:.85rem;color:var(--txt2)">${ev.num_preguntas} pregunta(s) · Docente: ${ev.docente || '—'}</div>
          <div style="display:flex;gap:.5rem">
            <button class="btn sm" data-edit="${ev.id}">✏️ Preguntas</button>
            ${ev.estado !== 'publicada' ? `<button class="btn sm sec" data-pub="${ev.id}">✅ Publicar</button>` : ''}
          </div>
        </div>`).join('') : `<div class="empty">Aún no hay evaluaciones creadas.</div>`}
    </div>

    <div id="constructor"></div>
  `;

  root.querySelector('#ne-add').onclick = () => {
    const nombre = root.querySelector('#ne-nombre').value.trim();
    if (!nombre) { toast('Ponle un nombre a la evaluación.', 'warn'); return; }
    store.addEvaluacion({
      nombre,
      grado: root.querySelector('#ne-grado').value,
      semestre: root.querySelector('#ne-sem').value,
      year: root.querySelector('#ne-year').value,
      area: root.querySelector('#ne-area').value,
      docente: root.querySelector('#ne-docente').value.trim(),
    });
    toast('Evaluación creada.');
    renderEvaluaciones(root);
  };

  root.querySelectorAll('[data-pub]').forEach(b => b.onclick = () => {
    store.publicarEvaluacion(b.dataset.pub);
    toast('Evaluación publicada.');
    renderEvaluaciones(root);
  });

  root.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => renderConstructor(root, b.dataset.edit));
}

function renderConstructor(root, evaluacionId) {
  const ev = store.getEvaluacion(evaluacionId);
  const preguntas = store.listPreguntas(evaluacionId);
  const box = root.querySelector('#constructor');
  box.innerHTML = `
    <h2>🧩 Constructor — ${ev.nombre}</h2>
    <div class="card">
      <div class="form-row">
        <textarea id="pq-enunciado" style="flex:2" placeholder="Enunciado de la pregunta..."></textarea>
      </div>
      <div class="form-row">
        <input id="pq-a" placeholder="Opción A"><input id="pq-b" placeholder="Opción B">
        <input id="pq-c" placeholder="Opción C"><input id="pq-d" placeholder="Opción D">
        <select id="pq-correcta"><option>A</option><option>B</option><option>C</option><option>D</option></select>
      </div>
      <div class="form-row">
        <input id="pq-competencia" placeholder="Competencia">
        <input id="pq-componente" placeholder="Componente">
        <select id="pq-nivel"><option value="">Nivel de desempeño (opcional)</option><option>BAJO</option><option>BÁSICO</option><option>ALTO</option><option>SUPERIOR</option></select>
        <button class="btn" id="pq-add">Agregar pregunta</button>
      </div>
    </div>

    <table>
      <thead><tr><th>#</th><th>Enunciado</th><th>Clave</th><th>Competencia</th><th></th></tr></thead>
      <tbody>
        ${preguntas.map(p => `<tr>
          <td>${p.numero}</td><td>${p.enunciado.slice(0,80)}${p.enunciado.length>80?'…':''}</td>
          <td>${p.correcta}</td><td>${p.competencia||'—'}</td>
          <td><button class="btn sm sec" data-del="${p.id}">🗑</button></td>
        </tr>`).join('') || '<tr><td colspan="5" class="empty">Sin preguntas aún.</td></tr>'}
      </tbody>
    </table>
  `;

  box.querySelector('#pq-add').onclick = () => {
    const enunciado = box.querySelector('#pq-enunciado').value.trim();
    if (!enunciado) { toast('Escribe el enunciado.', 'warn'); return; }
    store.addPregunta(evaluacionId, {
      enunciado,
      opciones: [box.querySelector('#pq-a').value, box.querySelector('#pq-b').value, box.querySelector('#pq-c').value, box.querySelector('#pq-d').value],
      correcta: box.querySelector('#pq-correcta').value,
      competencia: box.querySelector('#pq-competencia').value,
      componente: box.querySelector('#pq-componente').value,
      nivel_desempeno: box.querySelector('#pq-nivel').value,
    });
    toast('Pregunta agregada.');
    renderConstructor(root, evaluacionId);
  };

  box.querySelectorAll('[data-del]').forEach(b => b.onclick = () => {
    store.deletePregunta(b.dataset.del);
    renderConstructor(root, evaluacionId);
  });
}
