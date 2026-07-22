import { store, escHTML } from '../services/store.js';
import { toast } from '../app.js';

export function renderInstitucional(root) {
  const cursos = store.listCursos();
  root.innerHTML = `
    <h1>🏛️ Institucional</h1>
    <p class="subtitle">Cursos, jornadas, secciones y estudiantes.</p>

    <div class="card">
      <h2 style="margin-top:0">➕ Nuevo curso</h2>
      <div class="form-row">
        <select id="nc-grado">${[2,3,4,5,6,7,8,9,10,11].map(g=>`<option value="${g}">Grado ${g}°</option>`).join('')}</select>
        <input id="nc-paralelo" placeholder="Paralelo (ej: 01)" value="01">
        <input id="nc-year" type="number" value="2026">
        <select id="nc-jornada"><option value="MANANA">Mañana</option><option value="TARDE">Tarde</option><option value="UNICA">Única</option></select>
        <span id="nc-seccion-auto" class="badge" style="align-self:center"></span>
        <button class="btn" id="nc-add">Crear curso</button>
      </div>
      <p style="font-size:.76rem;color:var(--txt2);margin:.4rem 0 0">La sección (Primaria/Bachillerato) se asigna sola según el grado — no se puede desajustar por error.</p>
    </div>

    <h2>Cursos (${cursos.length})</h2>
    <div class="card" style="padding:0">
      ${cursos.length ? `<table>
        <thead><tr><th>Grado</th><th>Paralelo</th><th>Año</th><th>Jornada</th><th>Sección</th><th>Estudiantes</th><th></th></tr></thead>
        <tbody>${cursos.map(c => `
          <tr>
            <td>${c.grado}°</td><td>${escHTML(c.paralelo)}</td><td>${c.year}</td>
            <td>${c.jornada}</td><td>${c.seccion}</td>
            <td>${store.listEstudiantes(c.id).length}</td>
            <td style="display:flex;gap:.4rem">
              <button class="btn sm sec" data-open-curso="${c.id}">👥 Estudiantes</button>
              <button class="btn sm sec" data-del-curso="${c.id}" style="color:var(--bad)">🗑</button>
            </td>
          </tr>`).join('')}
        </tbody>
      </table>` : `<div class="empty">Aún no hay cursos. Crea el primero arriba.</div>`}
    </div>

    <div id="curso-detail"></div>
  `;

  const actualizarSeccionAuto = () => {
    const grado = parseInt(root.querySelector('#nc-grado').value);
    const span = root.querySelector('#nc-seccion-auto');
    span.textContent = grado <= 5 ? 'Primaria' : 'Bachillerato';
  };
  root.querySelector('#nc-grado').onchange = actualizarSeccionAuto;
  actualizarSeccionAuto();

  root.querySelector('#nc-add').onclick = () => {
    const grado = root.querySelector('#nc-grado').value;
    const paralelo = root.querySelector('#nc-paralelo').value.trim() || '01';
    const year = root.querySelector('#nc-year').value;
    const jornada = root.querySelector('#nc-jornada').value;
    const seccion = parseInt(grado) <= 5 ? 'PRIMARIA' : 'BACHILLERATO';
    store.addCurso({ grado, paralelo, year, jornada, seccion });
    toast('Curso creado.');
    renderInstitucional(root);
  };

  root.querySelectorAll('[data-open-curso]').forEach(btn => {
    btn.onclick = () => renderCursoDetail(root, btn.dataset.openCurso);
  });

  root.querySelectorAll('[data-del-curso]').forEach(btn => {
    btn.onclick = () => {
      const c = store.getCurso(btn.dataset.delCurso);
      const n = store.listEstudiantes(c.id).length;
      if (!confirm(`¿Borrar el curso Grado ${c.grado}° ${c.paralelo}${n ? ` y sus ${n} estudiante(s)` : ''}? Esta acción no se puede deshacer.`)) return;
      store.deleteCurso(c.id);
      toast('Curso eliminado.');
      renderInstitucional(root);
    };
  });
}

function renderCursoDetail(root, cursoId) {
  const curso = store.getCurso(cursoId);
  const estudiantes = store.listEstudiantes(cursoId);
  const box = root.querySelector('#curso-detail');
  box.innerHTML = `
    <h2>👥 Estudiantes — Grado ${curso.grado}° ${curso.paralelo} · ${curso.year}</h2>

    <div class="card">
      <h3 style="margin:0 0 .5rem;font-size:.9rem">📋 Pegar lista (uno por línea)</h3>
      <div class="form-row">
        <textarea id="bulk-names" rows="4" style="flex:2" placeholder="Pega una lista de nombres, uno por línea..."></textarea>
        <button class="btn" id="bulk-add" style="align-self:flex-start">Agregar en lote</button>
      </div>
    </div>

    <div class="card" style="margin-top:.8rem">
      <h3 style="margin:0 0 .5rem;font-size:.9rem">📁 Importar desde Excel</h3>
      <p style="font-size:.78rem;color:var(--txt2);margin:0 0 .6rem">El archivo debe tener los nombres en la primera columna (una fila por estudiante; se ignora la primera fila si parece encabezado).</p>
      <div class="form-row">
        <input type="file" id="xl-file" accept=".xlsx,.xls,.csv">
        <button class="btn sec" id="xl-preview">Previsualizar</button>
      </div>
      <div id="xl-preview-box"></div>
    </div>

    <table style="margin-top:1rem">
      <thead><tr><th>#</th><th>Nombre</th><th>Código (para QR)</th><th></th></tr></thead>
      <tbody>${estudiantes.map((e,i)=>`<tr>
        <td>${i+1}</td><td>${escHTML(e.nombre)}</td><td><code>${e.codigo}</code></td>
        <td><button class="btn sm sec" data-del-est="${e.id}" style="color:var(--bad)">🗑</button></td>
      </tr>`).join('') || '<tr><td colspan="4" class="empty">Sin estudiantes aún.</td></tr>'}</tbody>
    </table>
  `;

  box.querySelector('#bulk-add').onclick = () => {
    const lines = box.querySelector('#bulk-names').value.split('\n');
    const nuevos = store.importEstudiantesMasivo(cursoId, lines);
    toast(`${nuevos.length} estudiante(s) agregado(s).`);
    renderCursoDetail(root, cursoId);
  };

  box.querySelectorAll('[data-del-est]').forEach(btn => {
    btn.onclick = () => {
      const id = btn.dataset.delEst;
      const { hojas, resultados } = store.contarDependenciasEstudiante(id);
      const aviso = resultados
        ? `Este estudiante ya tiene ${resultados} resultado(s) calificado(s) y ${hojas} hoja(s) generada(s) — se borrarán también, y no se pueden recuperar. ¿Continuar?`
        : hojas
        ? `Este estudiante tiene ${hojas} hoja(s) generada(s) (sin calificar aún) — se borrarán también. ¿Continuar?`
        : '¿Borrar este estudiante?';
      if (!confirm(aviso)) return;
      store.deleteEstudiante(id);
      toast('Estudiante eliminado.');
      renderCursoDetail(root, cursoId);
    };
  });

  box.querySelector('#xl-preview').onclick = () => {
    const input = box.querySelector('#xl-file');
    const file = input.files[0];
    if (!file) { toast('Selecciona un archivo primero.', 'warn'); return; }
    if (typeof XLSX === 'undefined') { toast('No se pudo cargar el lector de Excel.', 'bad'); return; }
    const reader = new FileReader();
    reader.onload = (e) => {
      const wb = XLSX.read(e.target.result, { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
      let nombres = rows.map(r => (r[0] || '').toString().trim()).filter(Boolean);
      // Si la primera fila parece un encabezado (ej: "Nombre", "Estudiante"), se descarta.
      if (nombres[0] && /nombre|estudiante|apellido/i.test(nombres[0])) nombres = nombres.slice(1);

      const prev = box.querySelector('#xl-preview-box');
      prev.innerHTML = `
        <div style="margin-top:.6rem;font-size:.85rem">
          <p>${nombres.length} nombre(s) detectado(s):</p>
          <div style="max-height:150px;overflow:auto;background:var(--surf2);border-radius:8px;padding:.6rem;font-size:.8rem">
            ${nombres.slice(0, 30).map(n => `<div>${escHTML(n)}</div>`).join('')}
            ${nombres.length > 30 ? `<div style="color:var(--txt2)">... y ${nombres.length - 30} más</div>` : ''}
          </div>
          <button class="btn" id="xl-confirm" style="margin-top:.6rem">✅ Agregar estos ${nombres.length} estudiante(s)</button>
        </div>
      `;
      prev.querySelector('#xl-confirm').onclick = () => {
        const nuevos = store.importEstudiantesMasivo(cursoId, nombres);
        toast(`${nuevos.length} estudiante(s) importado(s) desde Excel.`);
        renderCursoDetail(root, cursoId);
      };
    };
    reader.readAsArrayBuffer(file);
  };
}
