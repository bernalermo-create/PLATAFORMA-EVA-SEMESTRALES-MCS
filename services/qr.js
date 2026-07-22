// ════════════════════════════════════════════════════════════════════
//  services/qr.js — genera un QR dentro de un contenedor DOM.
//  Usa la librería qrcodejs (cargada por CDN en index.html) para no
//  depender de ningún backend: el QR se genera 100% en el navegador.
// ════════════════════════════════════════════════════════════════════
export function renderQR(container, text, size = 120) {
  container.innerHTML = '';
  // eslint-disable-next-line no-undef
  // Nivel de corrección ALTO (H, ~30%) — con el payload corto que se
  // usa ahora (solo el ID de la hoja) hay margen de sobra para esto,
  // y hace que el QR siga leyéndose aunque el papel esté doblado,
  // manchado, o la fotocopia haya perdido algo de nitidez.
  new QRCode(container, { text, width: size, height: size, correctLevel: QRCode.CorrectLevel.H });
}
