import { store, NIVELES, AREAS, driveImgUrl } from '../services/store.js';
import { toast } from '../app.js';
import { uploadFoto, hasGasUrl } from '../services/sync.js';
import { isAdmin, currentUser, currentScope } from '../services/auth.js';

export function renderEvaluaciones(root) {
  const admin = isAdmin();
  const yo = currentUser().toUpperCase();
  const { grados: gradosPermitidos, areas: areasPermitidas } = admin ? { grados: [], areas: [] } : currentScope();
  const gradosOpciones = gradosPermitidos.length ? gradosPermitidos : [2,3,4,5,6,7,8,9,10,11];
  const areasOpciones = areasPermitidas.length ? areasPermitidas : AREAS;
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
        <input id="ne-nombre" placeholder="Nombre (ej: Evaluación Semestral Matemáticas)">
        <select id="ne-grado">${gradosOpciones.map(g=>`<option value="${g}">Grado ${g}°</option>`).join('')}</select>
        <select id="ne-sem"><option value="S1">Primer Semestre</option><option value="S2">Segundo Semestre</option></select>
        <input id="ne-year" type="number" value="2026">
        <select id="ne-area">${areasOpciones.map(a=>`<option>${a}</option>`).join('')}</select>
        <input id="ne-docente" placeholder="Docente responsable" value="${admin ? '' : currentUser()}" ${admin ? '' : 'readonly'}>
        <button class="btn" id="ne-add">Crear</button>
      </div>
    </div>

    <div class="card">
      <h2 style="margin-top:0">📥 Importar evaluación ya armada (Excel)</h2>
      <p style="font-size:.78rem;color:var(--txt2);margin:0 0 .7rem;line-height:1.6">
        Para pruebas que ya tienes organizadas: descarga la plantilla, complétala con tus preguntas y sube el mismo archivo — se crea la evaluación completa de una vez, con todas sus preguntas, sin digitarlas una por una aquí.
      </p>
      <div class="form-row">
        <button class="btn sec" id="imp-plantilla">⬇️ Descargar plantilla</button>
        <input type="file" id="imp-file" accept=".xlsx,.xls">
        <button class="btn sec" id="imp-preview">Previsualizar</button>
      </div>
      <div id="imp-preview-box"></div>
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
            <button class="btn sm sec" data-del-ev="${ev.id}" title="Eliminar evaluación">🗑 Eliminar</button>
          </div>
        </div>`).join('') : `<div class="empty">${admin ? 'Aún no hay evaluaciones creadas.' : 'No tienes evaluaciones propias todavía. Crea una arriba.'}</div>`}
    </div>

    <div id="constructor"></div>
  `;

  root.querySelector('#ne-add').onclick = () => {
    const nombre = root.querySelector('#ne-nombre').value.trim();
    if (!nombre) { toast('Ponle un nombre a la evaluación.', 'warn'); return; }
    const grado = root.querySelector('#ne-grado').value;
    const area = root.querySelector('#ne-area').value;
    if (!admin) {
      if (gradosPermitidos.length && !gradosPermitidos.includes(parseInt(grado))) { toast('Ese grado no está entre los tuyos asignados.', 'warn'); return; }
      if (areasPermitidas.length && !areasPermitidas.includes(area)) { toast('Esa asignatura no está entre las tuyas asignadas.', 'warn'); return; }
    }
    store.addEvaluacion({
      nombre,
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

  root.querySelector('#imp-plantilla').onclick = () => {
    _descargarPlantilla({
      grado: gradosOpciones[0] || '',
      area: areasOpciones[0] || '',
      docente: admin ? '' : currentUser(),
    });
  };

  root.querySelector('#imp-preview').onclick = () => {
    const input = root.querySelector('#imp-file');
    const file = input.files[0];
    if (!file) { toast('Selecciona un archivo primero.', 'warn'); return; }
    if (typeof XLSX === 'undefined') { toast('No se pudo cargar el lector de Excel.', 'bad'); return; }
    const reader = new FileReader();
    reader.onload = (e) => {
      let wb;
      try { wb = XLSX.read(e.target.result, { type: 'array' }); }
      catch { toast('No se pudo leer el archivo — ¿es un .xlsx válido?', 'bad'); return; }

      const datosCrudos = _leerDatosSheet(wb);
      const filasCrudas = _leerPreguntasSheet(wb);
      const scope = { admin, grados: gradosPermitidos, areas: areasPermitidas };
      const { errores, datos, preguntas } = _validarImportacion(datosCrudos, filasCrudas, scope);

      const prev = root.querySelector('#imp-preview-box');
      if (errores.length) {
        prev.innerHTML = `
          <div class="card" style="border:2px solid var(--bad);margin-top:.8rem">
            <h3 style="margin:0 0 .5rem;color:var(--bad)">⚠ Se encontraron ${errores.length} problema(s) — corrige el Excel y vuelve a intentar</h3>
            <ul style="font-size:.82rem;margin:0;padding-left:1.2rem;line-height:1.8">${errores.map(er => `<li>${_escHTML(er)}</li>`).join('')}</ul>
          </div>`;
        return;
      }
      prev.innerHTML = `
        <div class="card" style="border:2px solid var(--acc);margin-top:.8rem">
          <h3 style="margin:0 0 .5rem">✓ Todo en orden</h3>
          <p style="font-size:.85rem;margin:.2rem 0 .8rem">"<b>${_escHTML(datos.nombre)}</b>" — Grado ${datos.grado}° · ${datos.area} · ${datos.semestre === 'S1' ? 'Primer' : 'Segundo'} Semestre ${datos.year} · <b>${preguntas.length} pregunta(s)</b></p>
          <button class="btn" id="imp-confirm">✅ Crear esta evaluación</button>
        </div>`;
      prev.querySelector('#imp-confirm').onclick = () => {
        const ev = store.addEvaluacion({
          nombre: datos.nombre, grado: datos.grado, area: datos.area,
          semestre: datos.semestre, year: datos.year,
          docente: admin ? datos.docente : currentUser(),
        });
        preguntas.forEach(p => store.addPregunta(ev.id, {
          enunciado: p.enunciado, competencia: p.competencia, componente: p.componente, opciones: p.opciones,
        }));
        toast(`Evaluación importada con ${preguntas.length} pregunta(s).`);
        input.value = '';
        prev.innerHTML = '';
        renderEvaluaciones(root);
      };
    };
    reader.readAsArrayBuffer(file);
  };
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
        <input id="pq-competencia" placeholder="Competencia">
        <input id="pq-componente" placeholder="Componente">
        <button class="btn" id="pq-add">Agregar pregunta</button>
        <button class="btn sec hidden" id="pq-cancel">Cancelar edición</button>
      </div>
    </div>

    <table>
      <thead><tr><th>#</th><th>Enunciado</th><th>Niveles asignados</th><th>Competencia</th><th></th></tr></thead>
      <tbody>
        ${preguntas.map(p => `<tr>
          <td>${p.numero}</td><td>${p.imagen_url ? '🖼️ ' : ''}${p.enunciado.slice(0,70)}${p.enunciado.length>70?'…':''}</td>
          <td style="font-size:.78rem">${p.opciones.map(o=>`${o.letra}:${_niveLabel(o.nivel)}`).join(' · ')}</td>
          <td>${p.competencia||'—'}</td>
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
    if (p) {
      banner.innerHTML = `<div class="badge draft" style="margin-bottom:.6rem">✏️ Editando pregunta #${p.numero} — los cambios reemplazan la pregunta original.</div>`;
      addBtn.textContent = 'Guardar cambios';
      cancelBtn.classList.remove('hidden');
    } else {
      banner.innerHTML = '';
      addBtn.textContent = 'Agregar pregunta';
      cancelBtn.classList.add('hidden');
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
    const componente = box.querySelector('#pq-componente').value.trim();
    if (editingId) {
      store.updatePregunta(editingId, { enunciado, opciones, imagenUrl, competencia, componente });
      toast('Pregunta actualizada.');
    } else {
      store.addPregunta(evaluacionId, { enunciado, opciones, imagenUrl, competencia, componente });
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

function _escHTML(s) { const d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }

// ════════════════════════════════════════════════════════════════════
//  Importar evaluación ya armada desde Excel
// ════════════════════════════════════════════════════════════════════
function _descargarPlantilla(defaults) {
  if (typeof XLSX === 'undefined') { toast('No se pudo cargar el generador de Excel.', 'bad'); return; }

  const wsInstrucciones = XLSX.utils.aoa_to_sheet([
    ['Cómo usar esta plantilla'],
    [''],
    ['1. Completa la hoja "Datos" con la información general de la evaluación (una sola vez).'],
    ['2. Completa la hoja "Preguntas": una fila por pregunta, con sus 4 opciones y el nivel de desempeño de cada una.'],
    ['3. Borra la fila de ejemplo antes de subir el archivo (o déjala y bórrala después dentro de la plataforma).'],
    ['4. Guarda el archivo y súbelo en la plataforma, en Evaluaciones → "Importar evaluación ya armada".'],
    [''],
    ['Valores válidos para "Nivel": Bajo, Básico, Alto, Superior (no hace falta tildes ni mayúsculas exactas).'],
    ['Valores válidos para "Semestre": S1 (Primer Semestre) o S2 (Segundo Semestre).'],
    ['Valores válidos para "Área": ' + AREAS.join(', ')],
    [''],
    ['Cada pregunta debe tener exactamente 4 opciones (A, B, C, D), cada una con un nivel de desempeño DISTINTO.'],
    ['No hay una "respuesta correcta" única — cada opción describe un nivel distinto de desempeño en la misma competencia.'],
  ]);
  wsInstrucciones['!cols'] = [{ wch: 100 }];

  const wsDatos = XLSX.utils.aoa_to_sheet([
    ['Campo', 'Valor'],
    ['Nombre de la evaluación', defaults.nombre || 'Evaluación Semestral'],
    ['Grado (2 a 11)', defaults.grado || ''],
    ['Área', defaults.area || ''],
    ['Semestre (S1 o S2)', defaults.semestre || 'S1'],
    ['Año', defaults.year || 2026],
    ['Docente', defaults.docente || ''],
  ]);
  wsDatos['!cols'] = [{ wch: 26 }, { wch: 34 }];

  const headerPreguntas = ['Número', 'Enunciado', 'Competencia', 'Componente', 'Opción A', 'Nivel A', 'Opción B', 'Nivel B', 'Opción C', 'Nivel C', 'Opción D', 'Nivel D'];
  const ejemplo = [
    1, 'Texto de ejemplo — reemplaza esta fila con tu primera pregunta real', 'Nombre de la competencia', 'Componente (opcional)',
    'Texto que describe un desempeño Bajo', 'Bajo',
    'Texto que describe un desempeño Básico', 'Básico',
    'Texto que describe un desempeño Alto', 'Alto',
    'Texto que describe un desempeño Superior', 'Superior',
  ];
  const wsPreguntas = XLSX.utils.aoa_to_sheet([headerPreguntas, ejemplo]);
  wsPreguntas['!cols'] = [{ wch: 8 }, { wch: 45 }, { wch: 20 }, { wch: 16 }, { wch: 28 }, { wch: 10 }, { wch: 28 }, { wch: 10 }, { wch: 28 }, { wch: 10 }, { wch: 28 }, { wch: 10 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsInstrucciones, 'Instrucciones');
  XLSX.utils.book_append_sheet(wb, wsDatos, 'Datos');
  XLSX.utils.book_append_sheet(wb, wsPreguntas, 'Preguntas');

  const nombreArchivo = `plantilla_evaluacion_${(defaults.area || 'area')}_${(defaults.grado || 'grado')}`.replace(/\s+/g, '_') + '.xlsx';
  XLSX.writeFile(wb, nombreArchivo);
}

function _leerDatosSheet(wb) {
  const sheetName = wb.SheetNames.find(n => /datos/i.test(n)) || wb.SheetNames[1] || wb.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: '' });
  const map = {};
  rows.forEach(r => { if (r[0]) map[String(r[0]).trim().toLowerCase()] = r[1]; });
  const buscar = (patron) => { const k = Object.keys(map).find(k => patron.test(k)); return k !== undefined ? map[k] : ''; };
  return {
    nombre: buscar(/nombre/i),
    grado: buscar(/grado/i),
    area: buscar(/[aá]rea/i),
    semestre: buscar(/semestre/i),
    year: buscar(/a[ñn]o/i),
    docente: buscar(/docente/i),
  };
}

function _leerPreguntasSheet(wb) {
  const sheetName = wb.SheetNames.find(n => /pregunta/i.test(n)) || wb.SheetNames[wb.SheetNames.length - 1];
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: '' });
  let dataRows = rows;
  if (rows.length && /n[uú]mero/i.test(String(rows[0][0]))) dataRows = rows.slice(1);
  return dataRows.filter(r => r.some(c => String(c).trim() !== ''));
}

function _parseNivelImport(v) {
  const norm = String(v || '').trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const map = { BAJO: 'BAJO', BASICO: 'BÁSICO', ALTO: 'ALTO', SUPERIOR: 'SUPERIOR' };
  return map[norm] || null;
}
function _parseSemestreImport(v) {
  const t = String(v || '').trim().toUpperCase();
  if (t.includes('S1') || t.includes('PRIMER') || t === '1') return 'S1';
  if (t.includes('S2') || t.includes('SEGUNDO') || t === '2') return 'S2';
  return null;
}
function _parseAreaImport(v) {
  const norm = String(v || '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  return AREAS.find(a => a.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase() === norm) || null;
}

function _validarImportacion(datosCrudos, filasCrudas, scope) {
  const errores = [];

  const nombre = String(datosCrudos.nombre || '').trim();
  if (!nombre) errores.push('Hoja "Datos": falta el nombre de la evaluación.');

  const grado = parseInt(datosCrudos.grado);
  if (!grado || grado < 2 || grado > 11) errores.push('Hoja "Datos": el grado debe ser un número entre 2 y 11.');

  const area = _parseAreaImport(datosCrudos.area);
  if (!area) errores.push(`Hoja "Datos": el área "${datosCrudos.area || '(vacío)'}" no coincide con ninguna de: ${AREAS.join(', ')}.`);

  const semestre = _parseSemestreImport(datosCrudos.semestre);
  if (!semestre) errores.push('Hoja "Datos": el semestre debe ser S1 o S2 (o "Primer"/"Segundo").');

  const year = parseInt(datosCrudos.year) || 2026;
  const docente = String(datosCrudos.docente || '').trim();

  if (!scope.admin) {
    if (scope.grados.length && grado && !scope.grados.includes(grado)) errores.push(`No tienes asignado el grado ${grado}° — contacta al administrador o corrige la hoja "Datos".`);
    if (scope.areas.length && area && !scope.areas.includes(area)) errores.push(`No tienes asignada el área "${area}" — contacta al administrador o corrige la hoja "Datos".`);
  }

  const preguntas = [];
  filasCrudas.forEach((fila, i) => {
    const filaNum = i + 3; // fila 1 = encabezado, datos empiezan en la 2 (índice 0), +1 para numeración humana
    const enunciado = String(fila[1] || '').trim();
    if (!enunciado) { errores.push(`Fila ${filaNum} de "Preguntas": falta el enunciado.`); return; }
    const competencia = String(fila[2] || '').trim();
    const componente = String(fila[3] || '').trim();
    const letras = ['A', 'B', 'C', 'D'];
    const opciones = letras.map((letra, k) => ({
      texto: String(fila[4 + k * 2] || '').trim(),
      nivel: _parseNivelImport(fila[5 + k * 2]),
      _nivelCrudo: fila[5 + k * 2],
      letra,
    }));
    opciones.forEach(o => {
      if (!o.texto) errores.push(`Fila ${filaNum} de "Preguntas": falta el texto de la opción ${o.letra}.`);
      if (!o.nivel) errores.push(`Fila ${filaNum} de "Preguntas": el nivel de la opción ${o.letra} ("${o._nivelCrudo || '(vacío)'}") no es válido — usa Bajo, Básico, Alto o Superior.`);
    });
    if (opciones.every(o => o.texto && o.nivel) && new Set(opciones.map(o => o.nivel)).size !== 4) {
      errores.push(`Fila ${filaNum} de "Preguntas": las 4 opciones deben tener niveles distintos entre sí.`);
    }
    preguntas.push({ enunciado, competencia, componente, opciones: opciones.map(o => ({ texto: o.texto, nivel: o.nivel })) });
  });
  if (!preguntas.length) errores.push('No se encontró ninguna pregunta en la hoja "Preguntas".');

  return { errores, datos: { nombre, grado, area, semestre, year, docente }, preguntas };
}
