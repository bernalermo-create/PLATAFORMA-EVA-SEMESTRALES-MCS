import { store, NIVELES, AREAS, driveImgUrl, escHTML, tierDeGrado, sesionDeArea } from '../services/store.js';
import { toast } from '../app.js';
import { uploadFoto, hasGasUrl } from '../services/sync.js';
import { isAdmin, currentUser, currentScope } from '../services/auth.js';

export function renderEvaluaciones(root) {
  const admin = isAdmin();
  const yo = currentUser().toUpperCase();
  const { grados: gradosPermitidos, areas: areasPermitidas } = admin ? { grados: [], areas: [] } : currentScope();
  const gradosOpciones = gradosPermitidos.length ? gradosPermitidos : [2,3,4,5,6,7,8,9,10,11];
  const areasOpciones = areasPermitidas.length ? areasPermitidas : AREAS;
  const PRIMARIA_GRADOS = [2,3,4,5], BACHILLERATO_GRADOS = [6,7,8,9,10,11];
  const gradosPrimaria = gradosOpciones.filter(g => PRIMARIA_GRADOS.includes(g));
  const gradosBachillerato = gradosOpciones.filter(g => BACHILLERATO_GRADOS.includes(g));
  // Sección no es un campo libre: cuál(es) se ofrecen depende de qué
  // grados tiene asignados el docente, así nunca se puede armar un
  // "Grado 3° / Bachillerato" como pasaba antes en Institucional.
  const seccionesDisponibles = [
    ...(gradosPrimaria.length ? [{ v: 'PRIMARIA', l: 'Primaria (2°-5°)', grados: gradosPrimaria }] : []),
    ...(gradosBachillerato.length ? [{ v: 'BACHILLERATO', l: 'Bachillerato (6°-11°)', grados: gradosBachillerato }] : []),
  ];
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
      ${!admin && (gradosPermitidos.length || areasPermitidas.length) ? `<p style="font-size:.78rem;color:var(--txt2);margin:0 0 .6rem">Solo puedes crear evaluaciones para tu grado y asignatura asignados. Si necesitas otro, contacta al administrador.</p>` : ''}
      <div class="form-row">
        <select id="ne-seccion">${seccionesDisponibles.map(s => `<option value="${s.v}">${s.l}</option>`).join('')}</select>
        <select id="ne-grado"></select>
        <select id="ne-sem"><option value="S1">Primer Semestre</option><option value="S2">Segundo Semestre</option></select>
        <input id="ne-year" type="number" value="2026">
        <select id="ne-area">${areasOpciones.map(a=>`<option>${a}</option>`).join('')}</select>
        <input id="ne-docente" placeholder="Docente responsable" value="${admin ? '' : currentUser()}" ${admin ? '' : 'readonly'}>
      </div>
      <div class="form-row" style="align-items:center;margin-top:.3rem">
        <span id="ne-sesion-info" style="font-size:.82rem;color:var(--txt2)"></span>
        <button class="btn" id="ne-add" style="margin-left:auto">Crear</button>
      </div>
    </div>

    <div class="card">
      <h2 style="margin-top:0">📄 Importar evaluación desde Word/PDF</h2>
      <p style="font-size:.78rem;color:var(--txt2);margin:0 0 .7rem;line-height:1.6">
        Para pruebas ya escritas en Word (exportadas a PDF) con preguntas numeradas y opciones A) B) C) D): la plataforma
        extrae el texto e intenta reconocer cada pregunta automáticamente, pero <b>siempre te deja revisar y
        corregir antes de crear nada</b> — un PDF no trae el nivel de desempeño de cada opción (Bajo/Básico/Alto/Superior),
        así que ese dato lo asignas tú en la revisión, y ahí mismo puedes agregarle una imagen a cada pregunta si la necesita.
        Funciona mejor con PDFs exportados directo desde Word (no fotos o escaneos de papel).
      </p>
      <div class="form-row">
        <input type="file" id="pdf-file" accept=".pdf">
        <button class="btn sec" id="pdf-extraer">Extraer preguntas</button>
      </div>
      <div id="pdf-review-box"></div>
    </div>

    <h2>${admin ? 'Todas las evaluaciones' : 'Mis evaluaciones'} (${evals.length})</h2>
    <div class="grid grid-2">
      ${evals.length ? evals.map(ev => `
        <div class="card">
          <div style="display:flex;justify-content:space-between;align-items:start">
            <div>
              <strong>${escHTML(ev.nombre)}</strong>
              <div class="subtitle" style="margin:.2rem 0">Grado ${ev.grado}° · ${ev.semestre} ${ev.year} · ${ev.area}</div>
            </div>
            <span class="badge ${ev.estado === 'publicada' ? 'ok' : 'draft'}">${ev.estado}</span>
          </div>
          <div style="margin:.5rem 0;font-size:.85rem;color:var(--txt2)">${ev.num_preguntas} pregunta(s) · Docente: ${escHTML(ev.docente) || '— sin asignar'}</div>
          <div style="display:flex;gap:.5rem">
            <button class="btn sm" data-edit="${ev.id}">✏️ Preguntas</button>
            ${ev.estado !== 'publicada' ? `<button class="btn sm sec" data-pub="${ev.id}">✅ Publicar</button>` : ''}
            <button class="btn sm sec" data-del-ev="${ev.id}" title="Eliminar evaluación">🗑 Eliminar</button>
          </div>
        </div>`).join('') : `<div class="empty">${admin ? 'Aún no hay evaluaciones creadas.' : 'No tienes evaluaciones propias todavía. Crea una arriba.'}</div>`}
    </div>

    <div id="constructor"></div>
  `;

  const actualizarGrados = () => {
    const sel = seccionesDisponibles.find(s => s.v === root.querySelector('#ne-seccion').value) || seccionesDisponibles[0];
    const gradoSel = root.querySelector('#ne-grado');
    gradoSel.innerHTML = (sel ? sel.grados : []).map(g => `<option value="${g}">Grado ${g}°</option>`).join('');
    actualizarSesionInfo();
  };
  const actualizarSesionInfo = () => {
    const grado = parseInt(root.querySelector('#ne-grado').value);
    const area = root.querySelector('#ne-area').value;
    const info = root.querySelector('#ne-sesion-info');
    if (!grado || !area) { info.textContent = ''; return; }
    const sesion = sesionDeArea(grado, area);
    info.textContent = sesion
      ? `📌 Esta evaluación pertenece a la Sesión ${sesion} (según el grado y el área elegidos).`
      : `⚠ "${area}" no tiene sesión predefinida para este grado — se asignará manualmente en Hojas/QR.`;
  };
  root.querySelector('#ne-seccion').onchange = actualizarGrados;
  root.querySelector('#ne-grado').onchange = actualizarSesionInfo;
  root.querySelector('#ne-area').onchange = actualizarSesionInfo;
  actualizarGrados();

  root.querySelector('#ne-add').onclick = () => {
    const grado = root.querySelector('#ne-grado').value;
    const area = root.querySelector('#ne-area').value;
    if (!grado) { toast('No hay grados disponibles para esa sección.', 'warn'); return; }
    if (!admin) {
      if (gradosPermitidos.length && !gradosPermitidos.includes(parseInt(grado))) { toast('Ese grado no está entre los tuyos asignados.', 'warn'); return; }
      if (areasPermitidas.length && !areasPermitidas.includes(area)) { toast('Esa asignatura no está entre las tuyas asignadas.', 'warn'); return; }
    }
    store.addEvaluacion({
      grado,
      semestre: root.querySelector('#ne-sem').value,
      year: root.querySelector('#ne-year').value,
      area,
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

  root.querySelectorAll('[data-del-ev]').forEach(b => b.onclick = () => {
    const ev = store.getEvaluacion(b.dataset.delEv);
    if (!ev) return;
    const n = store.listPreguntas(ev.id).length;
    const aviso = n
      ? `Esto borrará "${ev.nombre}" y sus ${n} pregunta(s). Las hojas/resultados ya generados con ella se conservan como respaldo, pero esta área ya no aparecerá en cuadernillos nuevos. ¿Continuar?`
      : `¿Eliminar la evaluación "${ev.nombre}"?`;
    if (!confirm(aviso)) return;
    store.deleteEvaluacion(ev.id);
    toast('Evaluación eliminada.');
    renderEvaluaciones(root);
  });

  root.querySelector('#pdf-extraer').onclick = () => _extraerPDF(root, { admin, gradosOpciones, areasOpciones, gradosPermitidos, areasPermitidas });
}

function renderConstructor(root, evaluacionId) {
  const ev = store.getEvaluacion(evaluacionId);
  const preguntas = store.listPreguntas(evaluacionId);
  const box = root.querySelector('#constructor');
  box.innerHTML = `
    <h2>🧩 Constructor diagnóstico — ${escHTML(ev.nombre)}</h2>
    <div class="card">
      <p style="font-size:.8rem;color:var(--txt2);margin:0 0 .8rem;line-height:1.6">
        Cada pregunta tiene 4 opciones, y <b>cada opción representa un nivel de desempeño distinto</b>
        (no hay una "respuesta correcta" única). Ejemplo: la opción A puede describir un nivel Bajo de
        comprensión, la B un nivel Básico, la C un nivel Alto y la D un nivel Superior — asigna el nivel
        que corresponda a cada texto, en el orden que quieras.
      </p>
      <div id="pq-editing-banner"></div>
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
        <input id="pq-competencia" placeholder="Competencia *" required>
        <input id="pq-componente" placeholder="Componente">
      </div>
      <div class="form-row" style="align-items:center" id="pq-mezclar-row">
        <label style="display:flex;align-items:center;gap:.4rem;font-size:.8rem;color:var(--txt2)">
          <input type="checkbox" id="pq-mezclar" checked>
          Mezclar el orden de las opciones al guardar (recomendado — evita que el nivel más alto quede siempre en la misma letra)
        </label>
      </div>
      <div class="form-row">
        <button class="btn" id="pq-add">Agregar pregunta</button>
        <button class="btn sec hidden" id="pq-cancel">Cancelar edición</button>
      </div>
    </div>

    <table>
      <thead><tr><th>#</th><th>Enunciado</th><th>Niveles asignados</th><th>Competencia</th><th></th></tr></thead>
      <tbody>
        ${preguntas.map(p => `<tr>
          <td>${p.numero}</td><td>${p.imagen_url ? '🖼️ ' : ''}${escHTML(p.enunciado.slice(0,70))}${p.enunciado.length>70?'…':''}</td>
          <td style="font-size:.78rem">${p.opciones.map(o=>`${o.letra}:${_niveLabel(o.nivel)}`).join(' · ')}</td>
          <td>${escHTML(p.competencia)||'—'}</td>
          <td style="display:flex;gap:.3rem">
            <button class="btn sm sec" data-editp="${p.id}" title="Editar">✏️</button>
            <button class="btn sm sec" data-del="${p.id}" title="Eliminar">🗑</button>
          </td>
        </tr>`).join('') || '<tr><td colspan="5" class="empty">Sin preguntas aún.</td></tr>'}
      </tbody>
    </table>
  `;

  let imagenUrl = null;
  let editingId = null;

  const setEditingBanner = (p) => {
    const banner = box.querySelector('#pq-editing-banner');
    const addBtn = box.querySelector('#pq-add');
    const cancelBtn = box.querySelector('#pq-cancel');
    const mezclarRow = box.querySelector('#pq-mezclar-row');
    if (p) {
      banner.innerHTML = `<div class="badge draft" style="margin-bottom:.6rem">✏️ Editando pregunta #${p.numero} — los cambios reemplazan la pregunta original.</div>`;
      addBtn.textContent = 'Guardar cambios';
      cancelBtn.classList.remove('hidden');
      mezclarRow.classList.add('hidden');
    } else {
      banner.innerHTML = '';
      addBtn.textContent = 'Agregar pregunta';
      cancelBtn.classList.add('hidden');
      mezclarRow.classList.remove('hidden');
    }
  };

  const loadForEdit = (p) => {
    editingId = p.id;
    imagenUrl = p.imagen_url || null;
    box.querySelector('#pq-enunciado').value = p.enunciado;
    box.querySelector('#pq-competencia').value = p.competencia || '';
    box.querySelector('#pq-componente').value = p.componente || '';
    ['A','B','C','D'].forEach((l, i) => {
      const o = p.opciones[i] || {};
      box.querySelector(`#pq-op-${l}`).value = o.texto || '';
      box.querySelector(`#pq-nv-${l}`).value = o.nivel || '';
    });
    const status = box.querySelector('#pq-imagen-status');
    status.innerHTML = p.imagen_url
      ? `<span style="color:var(--ok)">✓ Ya tiene imagen.</span> <a href="${driveImgUrl(p.imagen_url)}" target="_blank">Ver</a> — sube un archivo para reemplazarla.`
      : '';
    setEditingBanner(p);
    box.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

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
        status.innerHTML = `<span style="color:var(--ok)">✓ Imagen lista.</span> <a href="${driveImgUrl(r.url)}" target="_blank">Ver</a>`;
      } else {
        status.innerHTML = `<span style="color:var(--bad)">✕ ${r.error || 'No se pudo subir la imagen.'}</span>`;
      }
    };
    reader.readAsDataURL(file);
  };

  box.querySelector('#pq-cancel').onclick = () => renderConstructor(root, evaluacionId);

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
    const competencia = box.querySelector('#pq-competencia').value.trim();
    if (!competencia) { toast('La competencia es obligatoria.', 'warn'); return; }
    const componente = box.querySelector('#pq-componente').value.trim();
    if (editingId) {
      store.updatePregunta(editingId, { enunciado, opciones, imagenUrl, competencia, componente });
      toast('Pregunta actualizada.');
    } else {
      const mezclar = box.querySelector('#pq-mezclar').checked;
      store.addPregunta(evaluacionId, { enunciado, opciones, imagenUrl, competencia, componente, mezclar });
      toast('Pregunta agregada.');
    }
    renderConstructor(root, evaluacionId);
  };

  box.querySelectorAll('[data-editp]').forEach(b => b.onclick = () => {
    const p = store.getPregunta(b.dataset.editp);
    if (p) loadForEdit(p);
  });

  box.querySelectorAll('[data-del]').forEach(b => b.onclick = () => {
    if (!confirm('¿Eliminar esta pregunta? Esto cambia la numeración de las siguientes.')) return;
    store.deletePregunta(b.dataset.del);
    renderConstructor(root, evaluacionId);
  });
}

function _niveLabel(n) {
  const map = { BAJO: 'Bajo', 'BÁSICO': 'Básico', ALTO: 'Alto', SUPERIOR: 'Superior' };
  return map[n] || n || '—';
}

// ════════════════════════════════════════════════════════════════════
//  Importar evaluación desde PDF (Word exportado) — extracción +
//  revisión obligatoria, porque un PDF nunca trae el nivel de
//  desempeño de cada opción.
// ════════════════════════════════════════════════════════════════════
async function _extraerPDF(root, ctx) {
  const input = root.querySelector('#pdf-file');
  const file = input.files[0];
  if (!file) { toast('Selecciona un archivo PDF primero.', 'warn'); return; }
  if (typeof pdfjsLib === 'undefined') { toast('No se pudo cargar el lector de PDF.', 'bad'); return; }
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js';

  const box = root.querySelector('#pdf-review-box');
  box.innerHTML = `<p style="font-size:.85rem;color:var(--txt2);margin-top:.6rem">⏳ Leyendo PDF...</p>`;

  let texto = '';
  try {
    const buf = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    const lineas = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      // pdf.js entrega fragmentos de texto sueltos con su posición, no
      // líneas ya armadas — se reconstruyen agrupando por altura (Y)
      // aproximada de cada fragmento.
      let lineaActual = '', yActual = null;
      content.items.forEach(item => {
        const y = Math.round(item.transform[5]);
        if (yActual === null || Math.abs(y - yActual) > 3) {
          if (lineaActual.trim()) lineas.push(lineaActual.trim());
          lineaActual = item.str;
          yActual = y;
        } else {
          lineaActual += item.str;
        }
      });
      if (lineaActual.trim()) lineas.push(lineaActual.trim());
    }
    texto = lineas.join('\n');
  } catch (err) {
    box.innerHTML = `<div class="card" style="border:2px solid var(--bad);margin-top:.6rem"><p style="font-size:.85rem;color:var(--bad);margin:0">✕ No se pudo leer este PDF (${escHTML(err.message || 'archivo dañado o formato no compatible')}).</p></div>`;
    return;
  }

  if (!texto.trim() || texto.trim().length < 20) {
    box.innerHTML = `
      <div class="card" style="border:2px solid var(--warn);margin-top:.6rem">
        <p style="font-size:.85rem;margin:0 0 .5rem"><b>⚠ No se encontró texto seleccionable en este PDF.</b></p>
        <p style="font-size:.8rem;color:var(--txt2);margin:0">Esto pasa cuando el PDF es una imagen escaneada (foto del papel) en vez de un documento exportado desde Word. Exporta el Word directo a PDF ("Guardar como" → PDF, no imprimir/escanear), o usa la plantilla de Excel de arriba.</p>
      </div>`;
    return;
  }

  const preguntas = _parsearTextoPreguntas(texto);
  _mostrarRevisionPDF(root, preguntas, texto, ctx);
}

// Heurística simple: una pregunta empieza en una línea "N. texto" (o
// "N)" / "N:"), y sus opciones son líneas "A) texto" .. "D) texto".
// Cualquier otra línea se pega como continuación al último pedazo
// abierto (enunciado si aún no hay opciones, o la última opción si ya
// las hay) — así se sostienen enunciados/opciones que Word partió en
// varias líneas. Es best-effort: por eso la pantalla de revisión
// siempre se muestra antes de crear nada.
function _parsearTextoPreguntas(texto) {
  const lineas = texto.split('\n').map(l => l.trim()).filter(Boolean);
  const reQ = /^(\d{1,3})[.):]\s*(.*)$/;
  const reOp = /^([A-Da-d])[.)\-:]\s+(.*)$/;
  const bloques = [];
  let actual = null;

  lineas.forEach(linea => {
    const mQ = linea.match(reQ);
    const mOp = linea.match(reOp);
    if (mQ) {
      if (actual) bloques.push(actual);
      actual = { enunciado: mQ[2], opciones: [] };
      return;
    }
    if (mOp && actual) {
      const letra = mOp[1].toUpperCase();
      if (!actual.opciones.find(o => o.letra === letra) && actual.opciones.length < 4) {
        actual.opciones.push({ letra, texto: mOp[2] });
        return;
      }
    }
    if (actual) {
      if (actual.opciones.length === 0) actual.enunciado += ' ' + linea;
      else actual.opciones[actual.opciones.length - 1].texto += ' ' + linea;
    }
  });
  if (actual) bloques.push(actual);

  return bloques
    .map(b => {
      const porLetra = {};
      b.opciones.forEach(o => { porLetra[o.letra] = o.texto; });
      return {
        enunciado: b.enunciado.trim(),
        competencia: '',
        imagenUrl: null,
        opciones: ['A', 'B', 'C', 'D'].map(l => ({ letra: l, texto: (porLetra[l] || '').trim(), nivel: '' })),
      };
    })
    .filter(p => p.enunciado); // descarta bloques vacíos (texto antes de la primera pregunta, etc.)
}

function _mostrarRevisionPDF(root, preguntas, textoCrudo, ctx) {
  const { admin, gradosOpciones, areasOpciones, gradosPermitidos, areasPermitidas } = ctx;
  const box = root.querySelector('#pdf-review-box');

  if (!preguntas.length) {
    box.innerHTML = `
      <div class="card" style="border:2px solid var(--warn);margin-top:.6rem">
        <p style="font-size:.85rem;margin:0 0 .5rem"><b>⚠ No se detectó ninguna pregunta con el formato esperado</b> (número seguido de opciones A) B) C) D)).</p>
        <p style="font-size:.8rem;color:var(--txt2);margin:0 0 .6rem">Puede que el PDF use un formato distinto (sin numerar, con viñetas, dos columnas...). Revisa el texto que sí se logró leer, corrígelo a mano, o agrega las preguntas manualmente en la evaluación.</p>
        <details><summary style="cursor:pointer;font-size:.8rem;color:var(--acc2)">Ver texto extraído</summary>
          <pre style="white-space:pre-wrap;font-size:.75rem;max-height:200px;overflow:auto;background:var(--surf2);padding:.6rem;border-radius:8px;margin-top:.4rem">${escHTML(textoCrudo.slice(0, 4000))}</pre>
        </details>
      </div>`;
    return;
  }

  box.innerHTML = `
    <div class="card" style="border:2px solid var(--acc);margin-top:.6rem">
      <h3 style="margin:0 0 .5rem">Se detectaron ${preguntas.length} posible(s) pregunta(s) — revisa antes de crear</h3>
      <p style="font-size:.78rem;color:var(--warn);margin:0 0 1rem">⚠ Ninguna opción tiene nivel asignado todavía — el PDF no trae ese dato. Asígnalo abajo en cada una.</p>
      <div id="pv-errores"></div>
      <div class="form-row">
        <select id="pv-grado">${gradosOpciones.map(g => `<option value="${g}">Grado ${g}°</option>`).join('')}</select>
        <select id="pv-sem"><option value="S1">Primer Semestre</option><option value="S2">Segundo Semestre</option></select>
        <input id="pv-year" type="number" value="2026">
        <select id="pv-area">${areasOpciones.map(a => `<option>${a}</option>`).join('')}</select>
        <input id="pv-docente" placeholder="Docente responsable" value="${admin ? '' : escHTML(currentUser())}" ${admin ? '' : 'readonly'}>
      </div>
      <div id="pv-preguntas" style="margin-top:.8rem"></div>
      <div class="form-row" style="align-items:center">
        <label style="display:flex;align-items:center;gap:.4rem;font-size:.8rem;color:var(--txt2)">
          <input type="checkbox" id="pv-mezclar" checked>
          Mezclar el orden de las opciones al crear (recomendado — evita que el nivel más alto quede siempre en la misma letra)
        </label>
      </div>
      <div class="form-row" style="margin-top:.6rem">
        <button class="btn sec" id="pv-add-manual">+ Agregar pregunta que faltó</button>
        <button class="btn" id="pv-confirm">✅ Crear evaluación con estas preguntas</button>
      </div>
    </div>
  `;

  const listEl = box.querySelector('#pv-preguntas');
  const pintar = () => {
    listEl.innerHTML = preguntas.map((p, i) => `
      <div class="an-panel" style="margin-bottom:.8rem">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:.6rem">
          <textarea class="pv-enun" data-i="${i}" rows="2" style="flex:1" placeholder="Enunciado...">${escHTML(p.enunciado)}</textarea>
          <button class="btn sm sec" data-rm="${i}" title="No es una pregunta real — quitar">🗑</button>
        </div>
        ${['A', 'B', 'C', 'D'].map((l, k) => `
          <div class="form-row" style="align-items:center;margin-top:.4rem">
            <span style="width:1.4rem;font-weight:800">${l}.</span>
            <textarea class="pv-op" data-i="${i}" data-k="${k}" rows="1" style="flex:3">${escHTML(p.opciones[k].texto)}</textarea>
            <select class="pv-nv" data-i="${i}" data-k="${k}" style="flex:1">
              <option value="">Nivel...</option>
              ${NIVELES.map(n => `<option value="${n}" ${p.opciones[k].nivel === n ? 'selected' : ''}>${_niveLabel(n)}</option>`).join('')}
            </select>
          </div>
        `).join('')}
        <div class="form-row" style="margin-top:.4rem">
          <input class="pv-comp" data-i="${i}" placeholder="Competencia *" value="${escHTML(p.competencia || '')}">
        </div>
        <div style="margin-top:.5rem">
          <label style="font-size:.76rem;color:var(--txt2)">🖼️ Imagen (opcional — gráfico, mapa, foto...)</label>
          <input type="file" class="pv-imagen" data-i="${i}" accept="image/*" style="display:block;margin-top:.3rem">
          <div class="pv-imagen-status" data-i="${i}" style="font-size:.76rem;margin-top:.3rem">
            ${p.imagenUrl ? `<span style="color:var(--ok)">✓ Ya tiene imagen.</span> <a href="${driveImgUrl(p.imagenUrl)}" target="_blank">Ver</a> — sube otra para reemplazarla.` : ''}
          </div>
        </div>
      </div>
    `).join('');

    listEl.querySelectorAll('.pv-enun').forEach(el => el.oninput = () => { preguntas[+el.dataset.i].enunciado = el.value; });
    listEl.querySelectorAll('.pv-op').forEach(el => el.oninput = () => { preguntas[+el.dataset.i].opciones[+el.dataset.k].texto = el.value; });
    listEl.querySelectorAll('.pv-nv').forEach(el => el.onchange = () => { preguntas[+el.dataset.i].opciones[+el.dataset.k].nivel = el.value; });
    listEl.querySelectorAll('.pv-comp').forEach(el => el.oninput = () => { preguntas[+el.dataset.i].competencia = el.value; });
    listEl.querySelectorAll('[data-rm]').forEach(btn => btn.onclick = () => { preguntas.splice(+btn.dataset.rm, 1); pintar(); });
    listEl.querySelectorAll('.pv-imagen').forEach(el => el.onchange = async (e) => {
      const i = +el.dataset.i;
      const file = e.target.files[0];
      if (!file) return;
      const status = listEl.querySelector(`.pv-imagen-status[data-i="${i}"]`);
      if (!hasGasUrl()) { status.innerHTML = `<span style="color:var(--warn)">⚠ Configura primero la conexión con Sheets en Configuración.</span>`; return; }
      status.textContent = 'Leyendo imagen...';
      const reader = new FileReader();
      reader.onload = async () => {
        status.textContent = '⬆️ Subiendo imagen...';
        const r = await uploadFoto(reader.result, file.name, file.type);
        if (r.ok) {
          preguntas[i].imagenUrl = r.url;
          status.innerHTML = `<span style="color:var(--ok)">✓ Imagen lista.</span> <a href="${driveImgUrl(r.url)}" target="_blank">Ver</a>`;
        } else {
          status.innerHTML = `<span style="color:var(--bad)">✕ ${r.error || 'No se pudo subir la imagen.'}</span>`;
        }
      };
      reader.readAsDataURL(file);
    });
  };
  pintar();

  box.querySelector('#pv-add-manual').onclick = () => {
    preguntas.push({ enunciado: '', competencia: '', imagenUrl: null, opciones: ['A', 'B', 'C', 'D'].map(l => ({ letra: l, texto: '', nivel: '' })) });
    pintar();
  };

  box.querySelector('#pv-confirm').onclick = () => {
    const nombre = ''; // sin casilla — siempre se autogenera un nombre descriptivo
    const grado = box.querySelector('#pv-grado').value;
    const area = box.querySelector('#pv-area').value;
    const errores = [];
    if (!admin) {
      if (gradosPermitidos.length && !gradosPermitidos.includes(parseInt(grado))) errores.push(`No tienes asignado el grado ${grado}°.`);
      if (areasPermitidas.length && !areasPermitidas.includes(area)) errores.push(`No tienes asignada el área "${area}".`);
    }
    if (!preguntas.length) errores.push('No queda ninguna pregunta para crear.');
    preguntas.forEach((p, i) => {
      if (!p.enunciado.trim()) { errores.push(`Pregunta ${i + 1}: falta el enunciado.`); return; }
      if (!(p.competencia || '').trim()) errores.push(`Pregunta ${i + 1}: falta la competencia (es obligatoria).`);
      p.opciones.forEach(o => {
        if (!o.texto.trim()) errores.push(`Pregunta ${i + 1}: falta el texto de la opción ${o.letra}.`);
        if (!o.nivel) errores.push(`Pregunta ${i + 1}: falta asignar el nivel de la opción ${o.letra}.`);
      });
      if (p.opciones.every(o => o.texto.trim() && o.nivel) && new Set(p.opciones.map(o => o.nivel)).size !== 4) {
        errores.push(`Pregunta ${i + 1}: las 4 opciones deben tener niveles distintos.`);
      }
    });

    const errBox = box.querySelector('#pv-errores');
    if (errores.length) {
      errBox.innerHTML = `<div class="card" style="border:2px solid var(--bad);margin-bottom:.8rem"><h4 style="margin:0 0 .4rem;color:var(--bad)">⚠ ${errores.length} cosa(s) por completar</h4><ul style="font-size:.8rem;margin:0;padding-left:1.2rem;line-height:1.7">${errores.map(e => `<li>${escHTML(e)}</li>`).join('')}</ul></div>`;
      errBox.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    errBox.innerHTML = '';

    const ev = store.addEvaluacion({
      nombre, grado, area,
      semestre: box.querySelector('#pv-sem').value,
      year: box.querySelector('#pv-year').value,
      docente: admin ? box.querySelector('#pv-docente').value.trim() : currentUser(),
    });
    const mezclar = box.querySelector('#pv-mezclar').checked;
    preguntas.forEach(p => store.addPregunta(ev.id, {
      enunciado: p.enunciado.trim(), competencia: (p.competencia || '').trim(), componente: '',
      imagenUrl: p.imagenUrl || null,
      opciones: p.opciones.map(o => ({ texto: o.texto.trim(), nivel: o.nivel })),
      mezclar,
    }));
    toast(`Evaluación creada con ${preguntas.length} pregunta(s) desde PDF.`);
    root.querySelector('#pdf-file').value = '';
    box.innerHTML = '';
    renderEvaluaciones(root);
  };
}
