// ════════════════════════════════════════════════════════════════════
//  services/auth.js
//  Login simple de dos roles (Admin / Docente), mismo patrón que ya
//  usa "Pruebas Semestrales": credenciales guardadas en localStorage,
//  con valores por defecto que el administrador puede cambiar desde
//  Configuración. No es autenticación de nivel bancario — es control
//  de acceso básico para uso interno del colegio.
// ════════════════════════════════════════════════════════════════════

const ADMIN_KEY = 'pev_admin_creds_v1';
const TEACHER_KEY = 'pev_teacher_pwd_v1';
const SESSION_KEY = 'pev_session_v1'; // se pierde al cerrar el navegador (sessionStorage)

const ADMIN_DEFAULT = { user: 'admin', pwd: 'cervantes2026' };
const TEACHER_DEFAULT = 'docente2026';

export function getAdminCreds() {
  try { return JSON.parse(localStorage.getItem(ADMIN_KEY)) || ADMIN_DEFAULT; } catch { return ADMIN_DEFAULT; }
}
export function setAdminCreds(user, pwd) {
  localStorage.setItem(ADMIN_KEY, JSON.stringify({ user, pwd }));
}
export function getTeacherPwd() {
  return localStorage.getItem(TEACHER_KEY) || TEACHER_DEFAULT;
}
export function setTeacherPwd(pwd) {
  localStorage.setItem(TEACHER_KEY, pwd);
}

export function getSession() {
  try { return JSON.parse(sessionStorage.getItem(SESSION_KEY)); } catch { return null; }
}
export function isAdmin() { return getSession()?.role === 'admin'; }
export function isLoggedIn() { return !!getSession(); }
export function currentUser() { return getSession()?.user || ''; }

export function login(role, user, pwd) {
  if (role === 'admin') {
    const c = getAdminCreds();
    if (user.toLowerCase() === c.user.toLowerCase() && pwd === c.pwd) {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ role: 'admin', user: c.user }));
      return { ok: true };
    }
    return { ok: false, error: 'Credenciales de administrador incorrectas.' };
  }
  if (!user || user.trim().length < 3) return { ok: false, error: 'Ingresa tu nombre completo.' };
  if (pwd !== getTeacherPwd()) return { ok: false, error: 'Contraseña de docente incorrecta.' };
  sessionStorage.setItem(SESSION_KEY, JSON.stringify({ role: 'docente', user: user.trim().toUpperCase() }));
  return { ok: true };
}

export function logout() {
  sessionStorage.removeItem(SESSION_KEY);
}
