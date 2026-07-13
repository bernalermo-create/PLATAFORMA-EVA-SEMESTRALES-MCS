// ════════════════════════════════════════════════════════════════════
//  services/qr.js — genera un QR dentro de un contenedor DOM.
//  Usa la librería qrcodejs (cargada por CDN en index.html) para no
//  depender de ningún backend: el QR se genera 100% en el navegador.
// ════════════════════════════════════════════════════════════════════
export function renderQR(container, text, size = 120) {
  container.innerHTML = '';
  // eslint-disable-next-line no-undef
  new QRCode(container, { text, width: size, height: size, correctLevel: QRCode.CorrectLevel.M });
}
