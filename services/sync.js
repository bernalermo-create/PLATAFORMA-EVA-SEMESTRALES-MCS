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

// Devuelve { ok, data, error } — a diferencia de la versión anterior,
// ahora SIEMPRE se puede distinguir "conexión falló" de "conexión ok
// pero todavía no hay datos guardados", para que el badge de sync no
// muestre "Local" cuando en realidad la sincronización está rota.
export async function pullDB() {
  if (!hasGasUrl()) return { ok: false, error: 'Sin URL configurada', data: null };
  try {
    const res = await fetch(`${getGasUrl()}?action=load&key=${encodeURIComponent(REMOTE_KEY)}`, { cache: 'no-cache' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const txt = await res.text();
    if (!txt || txt === '{}') return { ok: true, data: null };
    const d = JSON.parse(txt);
    if (d && d.error) throw new Error(d.error);
    return { ok: true, data: d };
  } catch (err) {
    console.error('[sync] pullDB error:', err);
    return { ok: false, error: err.message, data: null };
  }
}

// Antes se mandaba SIEMPRE la base completa (pushDB), y el backend la
// sobreescribía entera — si dos docentes escaneaban a la vez, quien
// sincronizara de último borraba sin darse cuenta los resultados que
// el otro acababa de guardar. Ahora solo se manda lo que cambió desde
// la última sincronización confirmada (delta = {upserts, deletes} por
// colección, cada registro con su id) y el backend lo fusiona registro
// por registro contra lo que ya tenga guardado (ver _handlePushDelta
// en Codigo_plataforma_evaluacion.gs). El control de que no haya dos
// pushDelta en vuelo a la vez desde esta misma pestaña vive en
// store.js (_intentarPush), que es quien conoce el estado real de qué
// hay pendiente — aquí ya no se necesita ninguna cola propia.
export async function pushDelta(delta) {
  if (!hasGasUrl()) return { ok: false, error: 'Sin URL configurada' };
  try {
    const res = await fetch(getGasUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      redirect: 'follow',
      body: JSON.stringify({ action: 'pushDelta', key: REMOTE_KEY, upserts: delta.upserts, deletes: delta.deletes }),
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const txt = await res.text();
    const d = JSON.parse(txt);
    if (!d.ok) throw new Error(d.error || 'Error del servidor');
    return { ok: true };
  } catch (err) {
    console.error('[sync] pushDelta error:', err);
    return { ok: false, error: err.message };
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
