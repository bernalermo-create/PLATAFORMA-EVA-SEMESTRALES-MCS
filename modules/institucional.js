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

    <div class="card">
      <h2 style="margin-top:0">📥 Importar cursos y estudiantes desde Excel</h2>
      <p style="font-size:.78rem;color:var(--txt2);margin:0 0 .7rem;line-height:1.6">
        Para cuando ya tienes el listado completo del colegio en un Excel — como el que usa la institución, con columnas
        <b>curso</b> (código de grado+paralelo, ej. <code>601</code> = Grado 6° Paralelo 01), <b>apellidos</b> y <b>nombres</b>.
        Crea automáticamente los cursos que falten y agrega los estudiantes — los que ya existan (mismo nombre en el mismo curso) se omiten, no se duplican.
      </p>
      <div class="form-row">
        <button class="btn sec" id="imp-est-plantilla">⬇️ Descargar plantilla</button>
        <select id="imp-est-jornada"><option value="MANANA">Mañana</option><option value="TARDE">Tarde</option><option value="UNICA">Única</option></select>
        <input id="imp-est-year" type="number" value="2026" style="max-width:110px" title="Año">
      </div>
      <div class="form-row" style="margin-top:.5rem">
        <input type="file" id="imp-est-file" accept=".xlsx,.xls">
        <button class="btn sec" id="imp-est-preview">Previsualizar</button>
      </div>
      <div id="imp-est-box"></div>
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

  root.querySelector('#imp-est-plantilla').onclick = () => _descargarPlantillaEstudiantes();

  root.querySelector('#imp-est-preview').onclick = () => {
    const input = root.querySelector('#imp-est-file');
    const file = input.files[0];
    if (!file) { toast('Selecciona un archivo primero.', 'warn'); return; }
    if (typeof XLSX === 'undefined') { toast('No se pudo cargar el lector de Excel.', 'bad'); return; }
    const jornada = root.querySelector('#imp-est-jornada').value;
    const year = root.querySelector('#imp-est-year').value;
    const reader = new FileReader();
    reader.onload = (e) => {
      let wb;
      try { wb = XLSX.read(e.target.result, { type: 'array' }); }
      catch { toast('No se pudo leer el archivo — ¿es un .xlsx válido?', 'bad'); return; }
      _previsualizarImportEstudiantes(root, wb, { jornada, year });
    };
    reader.readAsArrayBuffer(file);
  };
}

function _descargarPlantillaEstudiantes() {
  if (typeof XLSX === 'undefined') { toast('No se pudo cargar el generador de Excel.', 'bad'); return; }
  const wsInstrucciones = XLSX.utils.aoa_to_sheet([
    ['Plantilla para importar cursos y estudiantes'],
    [''],
    ['Columna "curso": código de grado + paralelo, dos dígitos para el paralelo.'],
    ['Ejemplos: 601 = Grado 6° Paralelo 01 · 1102 = Grado 11° Paralelo 02 · 302 = Grado 3° Paralelo 02.'],
    ['Columnas "apellidos" y "nombres": van separadas, tal como ya las maneja el colegio.'],
    [''],
    ['No borres ni renombres los encabezados de la hoja "Plantilla" (fila 1).'],
    ['Los cursos que no existan todavía se crean solos; los estudiantes repetidos (mismo nombre en el mismo curso) se omiten.'],
  ]);
  wsInstrucciones['!cols'] = [{ wch: 90 }];
  const wsPlantilla = XLSX.utils.aoa_to_sheet([
    ['curso', 'apellidos', 'nombres'],
    [601, 'PEREZ GOMEZ', 'JUAN DAVID'],
    [601, 'RAMIREZ TORRES', 'MARIA JOSE'],
  ]);
  wsPlantilla['!cols'] = [{ wch: 10 }, { wch: 28 }, { wch: 28 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsInstrucciones, 'Instrucciones');
  XLSX.utils.book_append_sheet(wb, wsPlantilla, 'Plantilla');
  XLSX.writeFile(wb, 'plantilla_cursos_estudiantes.xlsx');
}

function _previsualizarImportEstudiantes(root, wb, { jornada, year }) {
  const hoja = wb.Sheets['Plantilla'] || wb.Sheets[wb.SheetNames[0]];
  const filas = XLSX.utils.sheet_to_json(hoja, { header: 1, defval: '' });
  const box = root.querySelector('#imp-est-box');
  const errores = [];
  const registros = [];

  filas.slice(1).forEach((fila, i) => {
    const filaNum = i + 2;
    if (!fila || fila.every(c => c === '' || c == null)) return; // fila totalmente vacía, se ignora
    const apellidos = String(fila[1] || '').trim();
    const nombres = String(fila[2] || '').trim();
    if (!apellidos && !nombres) return; // fila separadora/vacía sin nombre (aunque tenga algo en "curso") — se ignora, no es un error
    const cursoCod = parseInt(fila[0]);
    if (!cursoCod || cursoCod < 200) { errores.push(`Fila ${filaNum}: el código de curso "${fila[0]}" no es válido (ej. 601 = Grado 6° Paralelo 01).`); return; }
    const grado = Math.floor(cursoCod / 100);
    const paralelo = String(cursoCod % 100).padStart(2, '0');
    if (grado < 2 || grado > 11) { errores.push(`Fila ${filaNum}: el código "${cursoCod}" da un grado ${grado}°, fuera del rango 2°-11°.`); return; }
    if (!apellidos || !nombres) { errores.push(`Fila ${filaNum}: falta ${!apellidos ? 'el apellido' : 'el nombre'}.`); return; }
    registros.push({ grado, paralelo, nombre: `${apellidos} ${nombres}`.replace(/\s+/g, ' ').trim() });
  });

  if (errores.length) {
    box.innerHTML = `
      <div class="card" style="border:2px solid var(--bad);margin-top:.8rem">
        <h3 style="margin:0 0 .5rem;color:var(--bad)">⚠ Se encontraron ${errores.length} problema(s) — corrige el Excel y vuelve a intentar</h3>
        <ul style="font-size:.82rem;margin:0;padding-left:1.2rem;line-height:1.8;max-height:260px;overflow:auto">${errores.slice(0, 60).map(er => `<li>${escHTML(er)}</li>`).join('')}</ul>
        ${errores.length > 60 ? `<p style="font-size:.78rem;color:var(--txt2);margin:.5rem 0 0">... y ${errores.length - 60} más.</p>` : ''}
      </div>`;
    return;
  }
  if (!registros.length) {
    box.innerHTML = `<div class="card" style="border:2px solid var(--warn);margin-top:.8rem"><p style="margin:0;font-size:.85rem">No se encontró ningún estudiante en el archivo.</p></div>`;
    return;
  }

  const cursosExistentes = store.listCursos();
  const cursosUnicos = [...new Map(registros.map(r => [`${r.grado}-${r.paralelo}`, r])).values()];
  const cursosNuevos = cursosUnicos.filter(c => !cursosExistentes.some(ce => ce.grado === c.grado && ce.paralelo === c.paralelo && ce.year === parseInt(year)));

  box.innerHTML = `
    <div class="card" style="border:2px solid var(--acc);margin-top:.8rem">
      <h3 style="margin:0 0 .5rem">✓ Listo para importar</h3>
      <p style="font-size:.85rem;margin:.2rem 0 .8rem">
        <b>${registros.length}</b> estudiante(s) en <b>${cursosUnicos.length}</b> curso(s)
        (<b>${cursosNuevos.length}</b> curso(s) nuevo(s) se crearán — jornada ${jornada === 'MANANA' ? 'Mañana' : jornada === 'TARDE' ? 'Tarde' : 'Única'}, año ${year}).
        Los estudiantes que ya existan con el mismo nombre en el mismo curso se omiten, no se duplican.
      </p>
      <button class="btn" id="imp-est-confirm">✅ Importar ahora</button>
    </div>`;

  box.querySelector('#imp-est-confirm').onclick = () => {
    let cursosCreados = 0, estudiantesCreados = 0, omitidos = 0;
    const cache = {};
    registros.forEach(r => {
      const key = `${r.grado}-${r.paralelo}`;
      let curso = cache[key];
      if (!curso) {
        curso = store.listCursos().find(c => c.grado === r.grado && c.paralelo === r.paralelo && c.year === parseInt(year));
        if (!curso) {
          curso = store.addCurso({ grado: r.grado, paralelo: r.paralelo, year, jornada, seccion: r.grado <= 5 ? 'PRIMARIA' : 'BACHILLERATO' });
          cursosCreados++;
        }
        cache[key] = curso;
      }
      const yaExiste = store.listEstudiantes(curso.id).some(e => e.nombre.toUpperCase() === r.nombre.toUpperCase());
      if (yaExiste) { omitidos++; return; }
      store.addEstudiante({ nombre: r.nombre, curso_id: curso.id });
      estudiantesCreados++;
    });
    toast(`Listo: ${cursosCreados} curso(s) creado(s), ${estudiantesCreados} estudiante(s) agregado(s)${omitidos ? `, ${omitidos} ya existían y se omitieron` : ''}.`);
    root.querySelector('#imp-est-file').value = '';
    renderInstitucional(root);
  };
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
