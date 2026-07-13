import { store, AREAS, escHTML } from '../services/store.js';
import { toast } from '../app.js';

const GRADOS = [2,3,4,5,6,7,8,9,10,11];

export function renderDocentes(root, bannerHtml = '') {
  const docentes = store.listDocentes();

  root.innerHTML = `
    <h1>👤 Docentes</h1>
    <p class="subtitle">
      Registra a cada docente con su jornada, grados y asignaturas — la plataforma le genera una
      contraseña individual. Con eso, cada quien entra solo a su propio espacio: el nombre que use
      para iniciar sesión debe coincidir con el que registres aquí. Los docentes que aún no estén
      registrados siguen entrando con la contraseña compartida de siempre (Configuración), sin
      restricción — puedes migrarlos a su propio usuario cuando quieras, no es obligatorio hacerlo de una vez.
    </p>

    <div id="doc-result">${bannerHtml}</div>

    <div class="card">
      <h2 style="margin-top:0">➕ Registrar un docente</h2>
      <div class="form-row">
        <input id="dq-nombre" placeholder="Nombre completo (ej: GARCIA JUAN)" style="flex:2">
        <select id="dq-jornada">
          <option value="">Jornada (opcional)</option>
          <option value="MANANA">Mañana</option>
          <option value="TARDE">Tarde</option>
        </select>
      </div>
      <div class="form-row" style="flex-wrap:wrap;gap:.4rem 1rem">
        <div style="font-size:.78rem;color:var(--txt2);width:100%">Grados a cargo</div>
        ${GRADOS.map(g => `
          <label style="display:flex;align-items:center;gap:.3rem;font-size:.85rem">
            <input type="checkbox" class="dq-grado" value="${g}"> ${g}°
          </label>`).join('')}
      </div>
      <div class="form-row" style="flex-wrap:wrap;gap:.4rem 1rem;margin-top:.4rem">
        <div style="font-size:.78rem;color:var(--txt2);width:100%">Asignaturas</div>
        ${AREAS.map((a, i) => `
          <label style="display:flex;align-items:center;gap:.3rem;font-size:.85rem">
            <input type="checkbox" class="dq-area" value="${a}" data-i="${i}"> ${a}
          </label>`).join('')}
      </div>
      <div class="form-row" style="margin-top:.6rem">
        <button class="btn" id="dq-add">Registrar y generar contraseña</button>
      </div>
    </div>

    <div class="card" style="margin-top:1rem">
      <h2 style="margin-top:0">📁 Importar varios desde Excel</h2>
      <p style="font-size:.78rem;color:var(--txt2);margin:0 0 .6rem">
        Columnas esperadas: <b>Nombre</b>, <b>Jornada</b> (Mañana/Tarde), <b>Grados</b> (ej: "6,7,8"),
        <b>Asignaturas</b> (ej: "Matemáticas, Inglés"). Se ignora la primera fila si parece encabezado.
        Los nombres ya registrados se omiten (no se duplican ni se les cambia la contraseña).
      </p>
      <div class="form-row">
        <input type="file" id="dq-xl-file" accept=".xlsx,.xls,.csv">
        <button class="btn sec" id="dq-xl-preview">Previsualizar</button>
      </div>
      <div id="dq-xl-preview-box"></div>
    </div>

    <div class="card" style="margin-top:1rem;padding:0">
      <div style="display:flex;justify-content:space-between;align-items:center;padding:1rem 1rem 0">
        <h2 style="margin:0">Docentes registrados (${docentes.length})</h2>
        ${docentes.length ? `<button class="btn sm sec" id="dq-export">⬇️ Exportar lista (CSV)</button>` : ''}
      </div>
      ${docentes.length ? `
      <table style="margin-top:.8rem">
        <thead><tr><th>Nombre</th><th>Jornada</th><th>Grados</th><th>Asignaturas</th><th>Contraseña</th><th>Estado</th><th></th></tr></thead>
        <tbody>
          ${docentes.map(d => `
            <tr>
              <td>${escHTML(d.nombre)}</td>
              <td>${d.jornada === 'MANANA' ? 'Mañana' : d.jornada === 'TARDE' ? 'Tarde' : '—'}</td>
              <td style="font-size:.8rem">${d.grados.length ? d.grados.map(g=>g+'°').join(', ') : '— todos —'}</td>
              <td style="font-size:.8rem">${d.areas.length ? d.areas.join(', ') : '— todas —'}</td>
              <td><code class="dq-pwd" data-masked="1" data-pwd="${d.password}" style="cursor:pointer" title="Clic para mostrar">••••••</code></td>
              <td>${d.activo ? '<span class="badge ok">activo</span>' : '<span class="badge draft">inactivo</span>'}</td>
              <td style="display:flex;gap:.3rem">
                <button class="btn sm sec" data-regen="${d.id}" title="Generar nueva contraseña">🔄</button>
                <button class="btn sm sec" data-toggle="${d.id}" title="${d.activo ? 'Desactivar' : 'Activar'}">${d.activo ? '⏸' : '▶️'}</button>
                <button class="btn sm sec" data-del-doc="${d.id}" title="Eliminar" style="color:var(--bad)">🗑</button>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>` : `<div class="empty">Aún no hay docentes registrados — usa el formulario o importa un Excel arriba.</div>`}
    </div>
  `;

  root.querySelector('#dq-add').onclick = () => {
    const nombre = root.querySelector('#dq-nombre').value.trim();
    if (!nombre) { toast('Escribe el nombre del docente.', 'warn'); return; }
    const grados = Array.from(root.querySelectorAll('.dq-grado:checked')).map(c => c.value);
    const areas = Array.from(root.querySelectorAll('.dq-area:checked')).map(c => c.value);
    const jornada = root.querySelector('#dq-jornada').value;
    try {
      const d = store.addDocente({ nombre, jornada, grados, areas });
      toast('Docente registrado.');
      renderDocentes(root, _bannerNuevo([d]));
    } catch (err) {
      toast(err.message, 'warn');
    }
  };

  root.querySelectorAll('[data-regen]').forEach(b => b.onclick = () => {
    if (!confirm('¿Generar una contraseña nueva? La anterior deja de funcionar de inmediato.')) return;
    const d = store.regenerarPasswordDocente(b.dataset.regen);
    renderDocentes(root, _bannerNuevo([d], 'Nueva contraseña generada:'));
  });

  root.querySelectorAll('[data-toggle]').forEach(b => b.onclick = () => {
    const d = store.getDocente(b.dataset.toggle);
    store.updateDocente(d.id, { activo: !d.activo });
    toast(d.activo ? 'Docente desactivado.' : 'Docente activado.');
    renderDocentes(root);
  });

  root.querySelectorAll('[data-del-doc]').forEach(b => b.onclick = () => {
    const d = store.getDocente(b.dataset.delDoc);
    if (!confirm(`¿Eliminar el usuario de "${d.nombre}"? Sus evaluaciones ya creadas NO se borran, pero ya no podrá entrar con este usuario.`)) return;
    store.deleteDocente(d.id);
    toast('Docente eliminado.');
    renderDocentes(root);
  });

  root.querySelectorAll('.dq-pwd').forEach(el => el.onclick = () => {
    if (el.dataset.masked === '1') { el.textContent = el.dataset.pwd; el.dataset.masked = '0'; }
    else { el.textContent = '••••••'; el.dataset.masked = '1'; }
  });

  const exportBtn = root.querySelector('#dq-export');
  if (exportBtn) exportBtn.onclick = () => _exportarCSV(docentes);

  root.querySelector('#dq-xl-preview').onclick = () => {
    const input = root.querySelector('#dq-xl-file');
    const file = input.files[0];
    if (!file) { toast('Selecciona un archivo primero.', 'warn'); return; }
    if (typeof XLSX === 'undefined') { toast('No se pudo cargar el lector de Excel.', 'bad'); return; }
    const reader = new FileReader();
    reader.onload = (e) => {
      const wb = XLSX.read(e.target.result, { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
      let data = rows.map(r => ({
        nombre: (r[0] || '').toString().trim(),
        jornada: _parseJornada((r[1] || '').toString()),
        grados: _parseGrados((r[2] || '').toString()),
        areas: _parseAreas((r[3] || '').toString()),
      })).filter(f => f.nombre);
      if (data[0] && /nombre|docente/i.test(data[0].nombre)) data = data.slice(1);

      const prev = root.querySelector('#dq-xl-preview-box');
      prev.innerHTML = `
        <div style="margin-top:.6rem;font-size:.85rem">
          <p>${data.length} docente(s) detectado(s):</p>
          <div style="max-height:180px;overflow:auto;background:var(--surf2);border-radius:8px;padding:.6rem;font-size:.78rem">
            ${data.slice(0, 40).map(f => `<div>${escHTML(f.nombre)} — ${escHTML(f.jornada) || '—'} — ${f.grados.join(',') || '—'} — ${f.areas.map(escHTML).join(', ') || '—'}</div>`).join('')}
            ${data.length > 40 ? `<div style="color:var(--txt2)">... y ${data.length - 40} más</div>` : ''}
          </div>
          <button class="btn" id="dq-xl-confirm" style="margin-top:.6rem">✅ Registrar estos ${data.length} docente(s)</button>
        </div>
      `;
      prev.querySelector('#dq-xl-confirm').onclick = () => {
        const { creados, omitidos } = store.importDocentesMasivo(data);
        toast(`${creados.length} docente(s) importado(s)${omitidos.length ? `, ${omitidos.length} omitido(s) por repetido(s)` : ''}.`);
        renderDocentes(root, _bannerNuevo(creados, 'Docentes importados:', omitidos));
      };
    };
    reader.readAsArrayBuffer(file);
  };
}

function _bannerNuevo(lista, titulo = 'Contraseña generada:', omitidos = []) {
  return `
    <div class="card" style="border:2px solid var(--acc);margin-bottom:1rem">
      <h3 style="margin:0 0 .6rem">${titulo}</h3>
      <table style="font-size:.85rem">
        <thead><tr><th>Nombre</th><th>Contraseña</th></tr></thead>
        <tbody>${lista.map(d => `<tr><td>${escHTML(d.nombre)}</td><td><code style="font-size:1rem;font-weight:800">${d.password}</code></td></tr>`).join('')}</tbody>
      </table>
      <p style="font-size:.78rem;color:var(--txt2);margin:.6rem 0 0">Anótala o cópiala ahora — se puede volver a ver desde la tabla de abajo (clic sobre la contraseña enmascarada), pero no llega a ningún otro lado automáticamente.</p>
      ${omitidos.length ? `<p style="font-size:.78rem;color:var(--warn);margin:.4rem 0 0">Omitidos por ya existir: ${omitidos.join(', ')}</p>` : ''}
    </div>
  `;
}

function _exportarCSV(docentes) {
  const rows = [['Nombre','Jornada','Grados','Asignaturas','Contraseña','Estado']];
  docentes.forEach(d => rows.push([
    d.nombre, d.jornada || '', d.grados.join('|'), d.areas.join('|'), d.password, d.activo ? 'activo' : 'inactivo'
  ]));
  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'docentes_plataforma_evaluacion.csv';
  a.click();
  URL.revokeObjectURL(a.href);
}

function _parseJornada(s) {
  const t = s.trim().toUpperCase();
  if (t.startsWith('MA')) return 'MANANA';
  if (t.startsWith('TA')) return 'TARDE';
  return '';
}
function _parseGrados(s) {
  return s.split(/[,;\s]+/).map(x => x.trim()).filter(Boolean).map(x => parseInt(x)).filter(n => !isNaN(n));
}
function _parseAreas(s) {
  const partes = s.split(/[,;]+/).map(x => x.trim()).filter(Boolean);
  // Empareja con el nombre oficial de AREAS aunque venga sin tilde o con mayúsculas distintas.
  return partes.map(p => {
    const norm = p.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const match = AREAS.find(a => a.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase() === norm);
    return match || p;
  });
}
