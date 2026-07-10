// ════════════════════════════════════════════════════════════════════
//  app.js — enrutador principal. Cada pantalla es un módulo separado
//  cargado dinámicamente (code-splitting simple), no un archivo gigante.
// ════════════════════════════════════════════════════════════════════
import { store } from './services/store.js';
import { login, logout, isLoggedIn, isAdmin, currentUser } from './services/auth.js';

const routes = {
  dashboard:     () => import('./modules/dashboard.js').then(m => m.renderDashboard),
  institucional: () => import('./modules/institucional.js').then(m => m.renderInstitucional),
  evaluaciones:  () => import('./modules/evaluaciones.js').then(m => m.renderEvaluaciones),
  hojas:         () => import('./modules/hojasQR.js').then(m => m.renderHojas),
  escaneo:       () => import('./modules/escaneo.js').then(m => m.renderEscaneo),
  resultados:    () => import('./modules/resultados.js').then(m => m.renderResultados),
  config:        () => import('./modules/config.js').then(m => m.renderConfig),
};

// Rutas visibles solo para Admin (Institucional y Configuración tocan
// datos maestros / credenciales; Docente no las necesita).
const ADMIN_ONLY_ROUTES = new Set(['institucional', 'config']);

const app = document.getElementById('app');
const topbar = document.getElementById('topbar');
const nav = document.getElementById('mainnav');
const syncBadge = document.getElementById('sync-badge');
const userBadge = document.getElementById('user-badge');
const sLogin = document.getElementById('s-login');

async function router() {
  if (!isLoggedIn()) { showLogin(); return; }

  const hash = (location.hash || '#/dashboard').replace('#/', '');
  let route = routes[hash] ? hash : 'dashboard';
  if (ADMIN_ONLY_ROUTES.has(route) && !isAdmin()) route = 'dashboard';

  nav.querySelectorAll('a').forEach(a => a.classList.toggle('active', a.dataset.route === route));

  try {
    const renderFn = await routes[route]();
    renderFn(app);
  } catch (err) {
    app.innerHTML = `<div class="empty">Error cargando el módulo "${route}": ${err.message}</div>`;
    console.error(err);
  }
}

function updateSyncBadge(detail) {
  if (!syncBadge) return;
  const map = {
    idle:    ['●', 'Local'],
    syncing: ['◐', 'Sincronizando...'],
    ok:      ['✓', 'Sheets ✓'],
    error:   ['✕', 'Sin conexión'],
  };
  const [icon, label] = map[detail.state] || map.idle;
  syncBadge.textContent = `${icon} ${label}`;
  syncBadge.className = `sync-badge sync-${detail.state}`;
  syncBadge.title = detail.state === 'error' && detail.error
    ? `No se pudo conectar con Sheets: ${detail.error}`
    : '';
}
document.addEventListener('pev:sync', (e) => updateSyncBadge(e.detail));

// Cuando el pull en segundo plano trae cambios de otro usuario, se
// refrescan automáticamente solo las pantallas de solo lectura
// (Dashboard, Resultados) — Institucional y Evaluaciones tienen
// formularios que el usuario puede estar llenando, y no se tocan para
// no perder lo que esté escribiendo; ahí basta con cambiar de pestaña
// y volver para ver los datos nuevos.
const REFRESCO_SEGURO = new Set(['dashboard', 'resultados']);
document.addEventListener('pev:data-updated', () => {
  updateSyncBadge({ state: 'ok' });
  const hash = (location.hash || '#/dashboard').replace('#/', '');
  if (REFRESCO_SEGURO.has(hash)) router();
});

function showLogin() {
  sLogin.classList.remove('hidden');
  topbar.classList.add('hidden');
  app.classList.add('hidden');
}

function showApp() {
  sLogin.classList.add('hidden');
  topbar.classList.remove('hidden');
  app.classList.remove('hidden');
  userBadge.textContent = isAdmin() ? '👑 Admin' : `📚 ${currentUser()}`;
  document.querySelectorAll('.mainnav a').forEach(a => {
    const route = a.dataset.route;
    a.classList.toggle('hidden', ADMIN_ONLY_ROUTES.has(route) && !isAdmin());
  });
}

let _loginRole = 'admin';
window.selectLoginRole = function (role) {
  _loginRole = role;
  document.getElementById('rtab-admin').classList.toggle('on', role === 'admin');
  document.getElementById('rtab-docente').classList.toggle('on', role === 'docente');
  document.getElementById('login-user').placeholder = role === 'docente' ? 'Tu nombre (ej: GARCIA JUAN)' : 'Usuario administrador';
};

window.doLogin = async function () {
  const user = document.getElementById('login-user').value.trim();
  const pwd = document.getElementById('login-pwd').value;
  const errEl = document.getElementById('login-err');
  const r = login(_loginRole, user, pwd);
  if (!r.ok) { errEl.textContent = '⚠ ' + r.error; document.getElementById('login-pwd').value = ''; return; }
  errEl.textContent = '';
  showApp();
  updateSyncBadge({ state: 'syncing' });
  await store.initRemote();
  updateSyncBadge(store.syncStatus());
  store.startPullLoop();
  router();
};

window.doLogout = function () {
  if (!confirm('¿Cerrar sesión?')) return;
  logout();
  location.hash = '#/dashboard';
  showLogin();
};

window.addEventListener('hashchange', router);
window.addEventListener('DOMContentLoaded', async () => {
  if (isLoggedIn()) {
    showApp();
    updateSyncBadge({ state: 'syncing' });
    await store.initRemote();
    updateSyncBadge(store.syncStatus());
    store.startPullLoop();
    router();
  } else {
    showLogin();
  }
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('./service-worker.js').catch(() => {});
  }
});

// ── Toast global (usado por todos los módulos) ─────────────────────
export function toast(msg, type = 'ok') {
  const c = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = 'toast';
  el.style.borderLeftColor = type === 'warn' ? 'var(--warn)' : type === 'bad' ? 'var(--bad)' : 'var(--acc)';
  el.textContent = msg;
  c.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}
