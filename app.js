// ════════════════════════════════════════════════════════════════════
//  app.js — enrutador principal. Cada pantalla es un módulo separado
//  cargado dinámicamente (code-splitting simple), no un archivo gigante.
// ════════════════════════════════════════════════════════════════════
import { store } from './services/store.js';

const routes = {
  dashboard:     () => import('./modules/dashboard.js').then(m => m.renderDashboard),
  institucional: () => import('./modules/institucional.js').then(m => m.renderInstitucional),
  evaluaciones:  () => import('./modules/evaluaciones.js').then(m => m.renderEvaluaciones),
  hojas:         () => import('./modules/hojasQR.js').then(m => m.renderHojas),
  escaneo:       () => import('./modules/escaneo.js').then(m => m.renderEscaneo),
  resultados:    () => import('./modules/resultados.js').then(m => m.renderResultados),
  config:        () => import('./modules/config.js').then(m => m.renderConfig),
};

const app = document.getElementById('app');
const nav = document.getElementById('mainnav');
const syncBadge = document.getElementById('sync-badge');

async function router() {
  const hash = (location.hash || '#/dashboard').replace('#/', '');
  const route = routes[hash] ? hash : 'dashboard';

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
}
document.addEventListener('pev:sync', (e) => updateSyncBadge(e.detail));

window.addEventListener('hashchange', router);
window.addEventListener('DOMContentLoaded', async () => {
  updateSyncBadge({ state: 'syncing' });
  await store.initRemote();
  updateSyncBadge({ state: store.syncStatus().state === 'idle' ? 'idle' : store.syncStatus().state });
  router();
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
