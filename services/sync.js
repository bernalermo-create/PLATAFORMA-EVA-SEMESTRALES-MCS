// ════════════════════════════════════════════════════════════════════
//  services/sync.js
//  Capa de sincronización con el backend genérico de Apps Script
//  (el mismo patrón que usa "Pruebas Semestrales": Sheets como índice
//  + Drive para JSON grandes). localStorage sigue siendo la caché
//  instantánea/offline; esta capa la mantiene sincronizada con la nube.
// ════════════════════════════════════════════════════════════════════

// URL "de fábrica" — funciona para todos sin configurar nada. Se puede
// sobreescribir localmente desde Configuración (útil para probar un
// despliegue nuevo sin tener que republicar el sitio).
const DEFAULT_GAS_URL = 'https://script.google.com/macros/s/AKfycbyVM6zE6f6AAWzHQOWwlD2V-vV9I6Z8muALOU0ZBBDZXPuiR-JRmjormhwsZhUzKaDToQ/exec';
const GAS_URL_KEY = 'pev_gas_url_v1';
const REMOTE_KEY = 'pev_db'; // clave bajo la que se guarda la base completa en Sheets/Drive

function getGasUrl() {
  return (localStorage.getItem(GAS_URL_KEY) || '').trim() || DEFAULT_GAS_URL;
}
export function setGasUrl(url) { localStorage.setItem(GAS_URL_KEY, url.trim()); }
export function clearGasUrl() { localStorage.removeItem(GAS_URL_KEY); }
export function hasGasUrl() { return !!getGasUrl(); }
export function currentGasUrl() { return getGasUrl(); }

export async function pullDB() {
  if (!hasGasUrl()) return null;
  try {
    const res = await fetch(`${getGasUrl()}?action=load&key=${encodeURIComponent(REMOTE_KEY)}`, { cache: 'no-cache' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const txt = await res.text();
    if (!txt || txt === '{}') return null;
    const d = JSON.parse(txt);
    if (d && d.error) throw new Error(d.error);
    return d;
  } catch (err) {
    console.error('[sync] pullDB error:', err);
    return null;
  }
}

let _pushing = false, _queued = false;
export async function pushDB(db) {
  if (!hasGasUrl()) return { ok: false, error: 'Sin URL configurada' };
  if (_pushing) { _queued = true; return { ok: true, queued: true }; }
  _pushing = true;
  try {
    const res = await fetch(getGasUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      redirect: 'follow',
      body: JSON.stringify({ key: REMOTE_KEY, data: db }),
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const txt = await res.text();
    const d = JSON.parse(txt);
    if (!d.ok) throw new Error(d.error || 'Error del servidor');
    return { ok: true };
  } catch (err) {
    console.error('[sync] pushDB error:', err);
    return { ok: false, error: err.message };
  } finally {
    _pushing = false;
    if (_queued) { _queued = false; /* el próximo cambio disparará otro push */ }
  }
}

export async function pingBackend() {
  if (!hasGasUrl()) return { ok: false, error: 'Sin URL configurada' };
  try {
    const res = await fetch(`${getGasUrl()}?action=ping`, { cache: 'no-cache' });
    const txt = await res.text();
    return JSON.parse(txt);
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

export async function setRemoteSheetId(sheetId) {
  if (!hasGasUrl()) return { ok: false, error: 'Sin URL configurada' };
  try {
    const res = await fetch(getGasUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      redirect: 'follow',
      body: JSON.stringify({ action: 'setConfig', sheetId }),
    });
    const txt = await res.text();
    return JSON.parse(txt);
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// Sube la foto de respaldo de una hoja de respuestas a Drive (vía el
// mismo backend genérico) y devuelve la URL para guardarla junto al
// resultado. No requiere ningún servicio de almacenamiento adicional.
export async function uploadFoto(base64, filename, mimeType) {
  if (!hasGasUrl()) return { ok: false, error: 'Sin URL configurada' };
  try {
    const res = await fetch(getGasUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      redirect: 'follow',
      body: JSON.stringify({ action: 'uploadFoto', base64, filename, mimeType }),
    });
    const txt = await res.text();
    return JSON.parse(txt);
  } catch (err) {
    return { ok: false, error: err.message };
  }
}
