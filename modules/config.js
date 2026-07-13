import { toast } from '../app.js';
import { setGasUrl, clearGasUrl, currentGasUrl, pingBackend, setRemoteSheetId } from '../services/sync.js';
import { getAdminCreds, setAdminCreds, getTeacherPwd, setTeacherPwd } from '../services/auth.js';
import { notaOficial, nivelDeNota, BANDAS } from '../services/store.js';

export function renderConfig(root) {
  const adminCreds = getAdminCreds();
  root.innerHTML = `
    <h1>⚙️ Configuración</h1>
    <p class="subtitle">Esta plataforma sincroniza con su propio Google Sheet (independiente del de "Pruebas Semestrales"), usando el mismo backend genérico de Apps Script.</p>

    <div class="card">
      <h2 style="margin-top:0">🔐 Credenciales de acceso</h2>
      <p style="font-size:.8rem;color:var(--txt2)">Cámbialas al menos una vez — vienen con un valor por defecto.</p>
      <div class="form-row">
        <input id="cfg-admin-user" placeholder="Usuario admin" value="${adminCreds.user}">
        <input id="cfg-admin-pwd" type="password" placeholder="Nueva contraseña admin">
        <button class="btn sec" id="cfg-admin-save">Guardar</button>
      </div>
      <div class="form-row">
        <input id="cfg-teacher-pwd" type="password" placeholder="Nueva contraseña de docentes (compartida)">
        <button class="btn sec" id="cfg-teacher-save">Guardar</button>
      </div>
    </div>

    <div class="card" style="margin-top:1rem">
      <h2 style="margin-top:0">🔗 Conexión con Google Sheets (Apps Script)</h2>
      <p style="font-size:.8rem;color:var(--txt2)">La URL "de fábrica" ya viene puesta en el código. Este campo solo la sobreescribe <b>en este navegador</b>, útil para probar un despliegue nuevo sin republicar el sitio.</p>
      <div class="form-row">
        <input id="cfg-gas" style="flex:2" value="${currentGasUrl()}">
        <button class="btn" id="cfg-save">💾 Guardar y probar</button>
        <button class="btn sec" id="cfg-clear">🗑 Restaurar por defecto</button>
      </div>
      <div id="cfg-status" style="font-size:.82rem;margin-top:.6rem;white-space:pre-wrap"></div>
    </div>

    <div class="card" style="margin-top:1rem">
      <h2 style="margin-top:0">📄 Spreadsheet ID (solo si necesitas cambiarlo)</h2>
      <p style="font-size:.8rem;color:var(--txt2)">Actualiza el script directamente, sin volver a editar código.</p>
      <div class="form-row">
        <input id="cfg-sheet" placeholder="ID del Google Sheet">
        <button class="btn" id="cfg-sheet-save">💾 Guardar Spreadsheet ID</button>
      </div>
      <div id="sheet-status" style="font-size:.82rem;margin-top:.6rem;white-space:pre-wrap"></div>
    </div>

    <div class="card" style="margin-top:1rem">
      <h2 style="margin-top:0">🧮 Tabla de conversión: niveles → nota final (escala oficial 0.0-5.0)</h2>
      <p style="font-size:.8rem;color:var(--txt2);line-height:1.6">
        Rangos oficiales del colegio: <b>Bajo</b> 0.0–2.9 · <b>Básico</b> 3.0–3.9 · <b>Alto</b> 4.0–4.5 · <b>Superior</b> 4.6–5.0.
        Cada nivel puro tiene como nota representativa el punto medio de su rango (Bajo≈1.45, Básico≈3.45, Alto≈4.25, Superior≈4.8).
        Cuando un estudiante mezcla niveles entre pregunta y pregunta, la nota se interpola entre esos puntos según el promedio real obtenido.
      </p>
      <div class="form-row">
        <input id="cv-npreg" type="number" min="1" value="20" style="max-width:140px" title="Número de preguntas">
        <label style="align-self:center;font-size:.82rem;color:var(--txt2)">Nº de preguntas de la evaluación (ej: 15 para Grado 6°-9°, 20 para 10°-11°)</label>
      </div>
      <div id="cv-table"></div>
    </div>

    <button class="btn sec" id="cfg-ping" style="margin-top:1rem">📡 Probar conexión ahora</button>
    <div id="ping-status" style="font-size:.82rem;margin-top:.6rem;white-space:pre-wrap"></div>
  `;

  drawConversionTable(root, 20);
  root.querySelector('#cv-npreg').oninput = (e) => drawConversionTable(root, parseInt(e.target.value) || 1);
  root.querySelector('#cfg-admin-save').onclick = () => {
    const user = root.querySelector('#cfg-admin-user').value.trim();
    const pwd = root.querySelector('#cfg-admin-pwd').value;
    if (!user) { toast('Ingresa un usuario.', 'warn'); return; }
    if (!pwd || pwd.length < 4) { toast('La contraseña debe tener al menos 4 caracteres.', 'warn'); return; }
    setAdminCreds(user, pwd);
    toast('Credenciales de administrador actualizadas.');
    root.querySelector('#cfg-admin-pwd').value = '';
  };

  root.querySelector('#cfg-teacher-save').onclick = () => {
    const pwd = root.querySelector('#cfg-teacher-pwd').value;
    if (!pwd || pwd.length < 4) { toast('La contraseña debe tener al menos 4 caracteres.', 'warn'); return; }
    setTeacherPwd(pwd);
    toast('Contraseña de docentes actualizada.');
    root.querySelector('#cfg-teacher-pwd').value = '';
  };

  root.querySelector('#cfg-save').onclick = async () => {
    const url = root.querySelector('#cfg-gas').value.trim();
    if (!/^https:\/\/script\.google\.com\/macros\/s\/.+\/exec$/.test(url)) {
      setText('#cfg-status', '⚠ La URL debe empezar con https://script.google.com/macros/s/ y terminar en /exec', root);
      return;
    }
    setGasUrl(url);
    toast('URL guardada.');
    await runPing(root, '#cfg-status');
  };

  root.querySelector('#cfg-clear').onclick = () => {
    clearGasUrl();
    root.querySelector('#cfg-gas').value = currentGasUrl();
    toast('Se restauró la URL por defecto.');
  };

  root.querySelector('#cfg-sheet-save').onclick = async () => {
    const sheetId = root.querySelector('#cfg-sheet').value.trim();
    if (!sheetId) { setText('#sheet-status', '⚠ Pega el ID del Google Sheet primero.', root); return; }
    setText('#sheet-status', 'Verificando y guardando...', root);
    const d = await setRemoteSheetId(sheetId);
    setText('#sheet-status', d.ok
      ? `✓ Spreadsheet actualizado: "${d.sheetTitle}"\nID: ${d.sheetId}`
      : `⚠ ${d.error || 'No se pudo actualizar.'}`, root);
  };

  root.querySelector('#cfg-ping').onclick = () => runPing(root, '#ping-status');
}

async function runPing(root, selector) {
  setText(selector, 'Probando conexión...', root);
  const d = await pingBackend();
  setText(selector, d.ok
    ? `✓ Conexión exitosa.\nSpreadsheet ID: ${d.sheetId}\nHoja: "${d.sheetName}" (${d.rows} registro(s))\nDrive: ${d.driveOk === false ? '⚠ ' + d.driveMsg : '✓ ok'}\nHora del servidor: ${d.time}`
    : `✕ ${d.error || 'No se pudo contactar el backend.'}`, root);
}

function setText(selector, text, root) {
  const el = root.querySelector(selector);
  if (el) el.textContent = text;
}

function drawConversionTable(root, n) {
  const box = root.querySelector('#cv-table');
  if (!box || !n) return;
  const NIVEL_LABEL = { BAJO: 'Bajo', 'BÁSICO': 'Básico', ALTO: 'Alto', SUPERIOR: 'Superior' };
  const escenarios = [
    { label: 'Todo en Bajo', peso: n * 1 },
    { label: 'Todo en Básico', peso: n * 2 },
    { label: 'Todo en Alto', peso: n * 3 },
    { label: 'Todo en Superior', peso: n * 4 },
    { label: 'Mitad Bajo / mitad Superior', peso: (n / 2) * 1 + (n / 2) * 4 },
    { label: 'Mitad Básico / mitad Alto', peso: (n / 2) * 2 + (n / 2) * 3 },
    { label: '25% en cada nivel (Bajo/Básico/Alto/Superior)', peso: (n / 4) * 1 + (n / 4) * 2 + (n / 4) * 3 + (n / 4) * 4 },
    { label: '3/4 Básico + 1/4 Superior', peso: (n * 0.75) * 2 + (n * 0.25) * 4 },
    { label: 'Todo sin responder', peso: 0 },
  ];
  box.innerHTML = `
    <table>
      <thead><tr><th>Escenario (con ${n} preguntas)</th><th>Nota /5.0</th><th>Nivel final</th></tr></thead>
      <tbody>
        ${escenarios.map(e => {
          const nota = notaOficial(e.peso, n);
          return `<tr><td>${e.label}</td><td><b>${nota.toFixed(1)}</b></td><td>${NIVEL_LABEL[nivelDeNota(nota)]}</td></tr>`;
        }).join('')}
      </tbody>
    </table>
    <p style="font-size:.75rem;color:var(--txt2);margin-top:.5rem">
      Rangos: ${BANDAS.map(b => `${NIVEL_LABEL[b.nivel]} ${b.min.toFixed(1)}–${b.max.toFixed(1)}`).join(' · ')}
    </p>
  `;
}
