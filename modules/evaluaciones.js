import { store, NIVELES } from '../services/store.js';
import { toast } from '../app.js';
import { uploadFoto, hasGasUrl } from '../services/sync.js';
import { isAdmin, currentUser } from '../services/auth.js';

export function renderEvaluaciones(root) {
  const admin = isAdmin();
  const yo = currentUser().toUpperCase();
  const todas = store.listEvaluaciones();
  // Panel Docente: cada docente solo ve y edita SUS evaluaciones (por
  // nombre) o las que aún no tienen docente asignado (para poder
  // reclamarlas). Panel Admin: ve y gestiona todas, de cualquier docente.
  const evals = admin ? todas : todas.filter(e => !e.docente || e.docente.trim().toUpperCase() === yo);

  root.innerHTML = `
    <h1>📝 ${admin ? 'Banco de evaluaciones (Panel Administrador — todas las áreas)' : `Mis evaluaciones — Panel Docente (${currentUser()})`}</h1>
    <p class="subtitle">${admin
      ? 'Como administrador ves y puedes editar las evaluaciones de todos los docentes.'
      : 'Solo ves y editas las evaluaciones que creaste o que aún no tienen un docente asignado. Crea una prueba, luego entra a redactar sus preguntas diagnósticas (con imágenes si quieres).'}</p>

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
        <input id="ne-docente" placeholder="Docente responsable" value="${admin ? '' : currentUser()}" ${admin ? '' : 'readonly'}>
        <button class="btn" id="ne-add">Crear</button>
      </div>
    </div>

    <h2>${admin ? 'Todas las evaluaciones' : 'Mis evaluaciones'} (${evals.length})</h2>
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
          <div style="margin:.5rem 0;font-size:.85rem;color:var(--txt2)">${ev.num_preguntas} pregunta(s) · Docente: ${ev.docente || '— sin asignar'}</div>
          <div style="display:flex;gap:.5rem">
            <button class="btn sm" data-edit="${ev.id}">✏️ Preguntas</button>
            ${ev.estado !== 'publicada' ? `<button class="btn sm sec" data-pub="${ev.id}">✅ Publicar</button>` : ''}
          </div>
        </div>`).join('') : `<div class="empty">${admin ? 'Aún no hay evaluaciones creadas.' : 'No tienes evaluaciones propias todavía. Crea una arriba.'}</div>`}
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
      docente: admin ? root.querySelector('#ne-docente').value.trim() : currentUser(),
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
    <h2>🧩 Constructor diagnóstico — ${ev.nombre}</h2>
    <div class="card">
      <p style="font-size:.8rem;color:var(--txt2);margin:0 0 .8rem;line-height:1.6">
        Cada pregunta tiene 4 opciones, y <b>cada opción representa un nivel de desempeño distinto</b>
        (no hay una "respuesta correcta" única). Ejemplo: la opción A puede describir un nivel Bajo de
        comprensión, la B un nivel Básico, la C un nivel Alto y la D un nivel Superior — asigna el nivel
        que corresponda a cada texto, en el orden que quieras.
      </p>
      <div class="form-row">
        <textarea id="pq-enunciado" style="flex:2" placeholder="Enunciado de la pregunta..."></textarea>
      </div>
      <div class="form-row">
        <div style="flex:1">
          <label style="font-size:.78rem;color:var(--txt2)">🖼️ Imagen (opcional — gráfico, mapa, foto, etc.)</label>
          <input type="file" id="pq-imagen" accept="image/*" style="display:block;margin-top:.3rem">
          <div id="pq-imagen-status" style="font-size:.78rem;margin-top:.3rem"></div>
        </div>
      </div>
      ${['A','B','C','D'].map(l => `
        <div class="form-row" style="align-items:center">
          <span style="width:1.4rem;font-weight:800">${l}.</span>
          <textarea id="pq-op-${l}" rows="2" style="flex:3" placeholder="Texto de la opción ${l}..."></textarea>
          <select id="pq-nv-${l}" style="flex:1">
            <option value="">Nivel...</option>
            ${NIVELES.map(n => `<option value="${n}">${_niveLabel(n)}</option>`).join('')}
          </select>
        </div>`).join('')}
      <div class="form-row">
        <input id="pq-competencia" placeholder="Competencia">
        <input id="pq-componente" placeholder="Componente">
        <button class="btn" id="pq-add">Agregar pregunta</button>
      </div>
    </div>

    <table>
      <thead><tr><th>#</th><th>Enunciado</th><th>Niveles asignados</th><th>Competencia</th><th></th></tr></thead>
      <tbody>
        ${preguntas.map(p => `<tr>
          <td>${p.numero}</td><td>${p.imagen_url ? '🖼️ ' : ''}${p.enunciado.slice(0,70)}${p.enunciado.length>70?'…':''}</td>
          <td style="font-size:.78rem">${p.opciones.map(o=>`${o.letra}:${_niveLabel(o.nivel)}`).join(' · ')}</td>
          <td>${p.competencia||'—'}</td>
          <td><button class="btn sm sec" data-del="${p.id}">🗑</button></td>
        </tr>`).join('') || '<tr><td colspan="5" class="empty">Sin preguntas aún.</td></tr>'}
      </tbody>
    </table>
  `;

  let imagenUrl = null;
  box.querySelector('#pq-imagen').onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const status = box.querySelector('#pq-imagen-status');
    if (!hasGasUrl()) { status.innerHTML = `<span style="color:var(--warn)">⚠ Configura primero la conexión con Sheets en Configuración.</span>`; return; }
    status.textContent = 'Leyendo imagen...';
    const reader = new FileReader();
    reader.onload = async () => {
      status.textContent = '⬆️ Subiendo imagen...';
      const r = await uploadFoto(reader.result, file.name, file.type);
      if (r.ok) {
        imagenUrl = r.url;
        status.innerHTML = `<span style="color:var(--ok)">✓ Imagen lista.</span> <a href="${r.url}" target="_blank">Ver</a>`;
      } else {
        status.innerHTML = `<span style="color:var(--bad)">✕ ${r.error || 'No se pudo subir la imagen.'}</span>`;
      }
    };
    reader.readAsDataURL(file);
  };

  box.querySelector('#pq-add').onclick = () => {
    const enunciado = box.querySelector('#pq-enunciado').value.trim();
    if (!enunciado) { toast('Escribe el enunciado.', 'warn'); return; }
    const opciones = ['A','B','C','D'].map(l => ({
      texto: box.querySelector(`#pq-op-${l}`).value.trim(),
      nivel: box.querySelector(`#pq-nv-${l}`).value,
    }));
    if (opciones.some(o => !o.texto || !o.nivel)) {
      toast('Completa el texto y el nivel de las 4 opciones.', 'warn');
      return;
    }
    const niveles = opciones.map(o => o.nivel);
    if (new Set(niveles).size !== 4) {
      toast('Cada opción debe tener un nivel distinto (Bajo, Básico, Alto, Superior).', 'warn');
      return;
    }
    store.addPregunta(evaluacionId, {
      enunciado, opciones, imagenUrl,
      competencia: box.querySelector('#pq-competencia').value.trim(),
      componente: box.querySelector('#pq-componente').value.trim(),
    });
    toast('Pregunta agregada.');
    renderConstructor(root, evaluacionId);
  };

  box.querySelectorAll('[data-del]').forEach(b => b.onclick = () => {
    store.deletePregunta(b.dataset.del);
    renderConstructor(root, evaluacionId);
  });
}

function _niveLabel(n) {
  const map = { BAJO: 'Bajo', 'BÁSICO': 'Básico', ALTO: 'Alto', SUPERIOR: 'Superior' };
  return map[n] || n || '—';
}
