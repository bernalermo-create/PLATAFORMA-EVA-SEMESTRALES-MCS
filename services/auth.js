// ════════════════════════════════════════════════════════════════════
//  services/auth.js
//  Login simple de dos roles (Admin / Docente), mismo patrón que ya
//  usa "Pruebas Semestrales": credenciales guardadas en localStorage,
//  con valores por defecto que el administrador puede cambiar desde
//  Configuración. No es autenticación de nivel bancario — es control
//  de acceso básico para uso interno del colegio.
// ════════════════════════════════════════════════════════════════════

const ADMIN_KEY = 'pev_admin_creds_v1';
const SESSION_KEY = 'pev_session_v1'; // se pierde al cerrar el navegador (sessionStorage)

const ADMIN_DEFAULT = { user: 'admin', pwd: 'cervantes2026' };

export function getAdminCreds() {
  try { return JSON.parse(localStorage.getItem(ADMIN_KEY)) || ADMIN_DEFAULT; } catch { return ADMIN_DEFAULT; }
}
export function setAdminCreds(user, pwd) {
  localStorage.setItem(ADMIN_KEY, JSON.stringify({ user, pwd }));
}

export function getSession() {
  try { return JSON.parse(sessionStorage.getItem(SESSION_KEY)); } catch { return null; }
}
export function isAdmin() { return getSession()?.role === 'admin'; }
export function isLoggedIn() { return !!getSession(); }
export function currentUser() { return getSession()?.user || ''; }
// Alcance del docente logueado (vacío = sin restricción, ej. Admin o
// un docente que entró por la contraseña compartida de respaldo).
export function currentScope() {
  const s = getSession();
  return { grados: s?.grados || [], areas: s?.areas || [] };
}

// docentes: lista actual de store.listDocentes() — se recibe por
// parámetro (en vez de importar store.js aquí) para no crear un ciclo
// de imports entre auth.js y store.js.
export function login(role, user, pwd, docentes) {
  if (role === 'admin') {
    const c = getAdminCreds();
    if (user.toLowerCase() === c.user.toLowerCase() && pwd === c.pwd) {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ role: 'admin', user: c.user }));
      return { ok: true };
    }
    return { ok: false, error: 'Credenciales de administrador incorrectas.' };
  }
  if (!user || user.trim().length < 3) return { ok: false, error: 'Ingresa tu nombre completo.' };
  const nombreN = user.trim().toUpperCase();
  const registrado = (docentes || []).find(d => d.nombre === nombreN);

  // Ya no hay contraseña compartida de respaldo — solo entra quien el
  // administrador haya registrado explícitamente en "Docentes". Antes
  // cualquiera podía escribir cualquier nombre con la contraseña
  // genérica; ahora el acceso queda controlado por el listado real.
  if (!registrado) {
    return { ok: false, error: 'No estás registrado como docente en esta plataforma. Pídele al administrador que te registre en "Docentes".' };
  }
  if (!registrado.activo) return { ok: false, error: 'Tu usuario está inactivo. Contacta al administrador.' };
  if (pwd !== registrado.password) return { ok: false, error: 'Contraseña incorrecta.' };
  sessionStorage.setItem(SESSION_KEY, JSON.stringify({
    role: 'docente', user: nombreN, docenteId: registrado.id,
    grados: registrado.grados || [], areas: registrado.areas || [],
  }));
  return { ok: true };
}

export function logout() {
  sessionStorage.removeItem(SESSION_KEY);
}

// Ignora acentos, mayúsculas/minúsculas y el orden de las palabras
// (MCS Platform guarda "Nombre Apellido"; aquí se registra "APELLIDO
// NOMBRE") para poder comparar el nombre que llega en el token SSO
// contra el padrón de docentes sin exigir que coincidan carácter a
// carácter.
function _normalizarNombre(s) {
  const combinantes = new RegExp('[' + String.fromCharCode(0x0300) + '-' + String.fromCharCode(0x036f) + ']', 'g');
  return (s || '')
    .normalize('NFD').replace(combinantes, '')
    .toUpperCase()
    .split(/\s+/).filter(Boolean).sort().join(' ');
}

// Autologin vía SSO desde MCS Platform: el token ya fue verificado por
// el backend de Apps Script (ver app.js), así que aquí no se pide
// contraseña — pero sí se exige que el nombre coincida con un docente
// REGISTRADO y ACTIVO en el padrón de ESTA plataforma, igual que en
// login(). Un token válido no basta si el docente no existe aquí.
export function loginConSSO(nombreToken, docentes) {
  const normObjetivo = _normalizarNombre(nombreToken);
  const candidatos = (docentes || []).filter(d => _normalizarNombre(d.nombre) === normObjetivo);

  if (candidatos.length === 0) {
    return {
      ok: false,
      error: `No estás registrado como docente aquí con el nombre "${nombreToken}". Pídele al administrador que te registre en "Docentes", o inicia sesión manualmente si tu nombre quedó escrito distinto.`,
    };
  }
  if (candidatos.length > 1) {
    return { ok: false, error: 'Hay más de un docente registrado con ese nombre — inicia sesión manualmente.' };
  }
  const registrado = candidatos[0];
  if (!registrado.activo) return { ok: false, error: 'Tu usuario está inactivo. Contacta al administrador.' };

  sessionStorage.setItem(SESSION_KEY, JSON.stringify({
    role: 'docente', user: registrado.nombre, docenteId: registrado.id,
    grados: registrado.grados || [], areas: registrado.areas || [],
  }));
  return { ok: true };
}
