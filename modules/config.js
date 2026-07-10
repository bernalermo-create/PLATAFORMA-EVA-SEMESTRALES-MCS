import { toast } from '../app.js';
import { setGasUrl, clearGasUrl, currentGasUrl, pingBackend, setRemoteSheetId } from '../services/sync.js';

export function renderConfig(root) {
  root.innerHTML = `
    <h1>⚙️ Configuración</h1>
    <p class="subtitle">Esta plataforma sincroniza con su propio Google Sheet (independiente del de "Pruebas Semestrales"), usando el mismo backend genérico de Apps Script.</p>

    <div class="card">
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

    <button class="btn sec" id="cfg-ping" style="margin-top:1rem">📡 Probar conexión ahora</button>
    <div id="ping-status" style="font-size:.82rem;margin-top:.6rem;white-space:pre-wrap"></div>
  `;

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
