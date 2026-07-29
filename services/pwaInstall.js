// ════════════════════════════════════════════════════════════════════
//  services/pwaInstall.js
//  Captura el evento de instalación de PWA lo antes posible — el
//  navegador solo lo dispara una vez y hay que guardarlo para poder
//  ofrecerlo después (ej. desde el botón en la pantalla de Escaneo).
//  Se importa por su efecto secundario (registrar el listener) desde
//  app.js, que se carga apenas abre la página.
// ════════════════════════════════════════════════════════════════════

let _deferredPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  _deferredPrompt = e;
  document.dispatchEvent(new CustomEvent('pwa:installable'));
});

window.addEventListener('appinstalled', () => {
  _deferredPrompt = null;
  document.dispatchEvent(new CustomEvent('pwa:installed'));
});

export function canInstall() { return !!_deferredPrompt; }

export function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

export function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export async function promptInstall() {
  if (!_deferredPrompt) return { outcome: 'unavailable' };
  _deferredPrompt.prompt();
  const choice = await _deferredPrompt.userChoice;
  _deferredPrompt = null;
  return choice;
}
