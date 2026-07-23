// ════════════════════════════════════════════════════════════════════
//  services/omr.js — lectura asistida de burbujas marcadas a partir de
//  una foto, dentro de un cuadrilátero que la persona ajusta a mano
//  (arrastrando las 4 esquinas sobre la foto ya tomada).
//
//  Por qué así y no "IA que lo hace todo sola": una hoja fotografiada
//  con el celular casi nunca queda perfectamente cuadrada — el ángulo
//  varía. En vez de intentar detectar el documento solo (que necesita
//  visión por computador más pesada, con más puntos de falla), se le
//  pide a la persona que marque las 4 esquinas de la columna de
//  círculos — un gesto de 5 segundos — y con eso se puede interpolar
//  matemáticamente dónde cae cada círculo aunque la foto esté en
//  ángulo, sin depender de detección automática de bordes.
//
//  Esto NUNCA decide solo: siempre devuelve una sugerencia con nivel
//  de confianza, y la pantalla de revisión (ya existente en escaneo.js)
//  se llena con esa sugerencia pero la persona la revisa y corrige
//  antes de guardar — igual que revisar una transcripción automática
//  en vez de confiar en ella a ciegas.
// ════════════════════════════════════════════════════════════════════

function _lerpPt(p1, p2, t) {
  return { x: p1.x + (p2.x - p1.x) * t, y: p1.y + (p2.y - p1.y) * t };
}

function _interpolar(corners, u, v) {
  const top = _lerpPt(corners.tl, corners.tr, u);
  const bottom = _lerpPt(corners.bl, corners.br, u);
  return _lerpPt(top, bottom, v);
}

function _dist(p1, p2) { return Math.hypot(p2.x - p1.x, p2.y - p1.y); }

// Radio de muestreo por círculo: una fracción del espacio disponible
// entre filas/columnas, nunca menor a unos pocos píxeles.
function _radioMuestra(corners, numFilas) {
  const alturaFila = _dist(corners.tl, corners.bl) / numFilas;
  const anchoCol = _dist(corners.tl, corners.tr) / 4;
  return Math.max(4, Math.min(alturaFila, anchoCol) * 0.30);
}

// Oscuridad promedio (0-255, más alto = más oscuro/más tinta) dentro
// de un círculo de muestreo — se ignoran los píxeles del borde de la
// caja de muestreo para no confundir el trazo impreso del círculo
// vacío con una marca real.
function _oscuridadPromedio(ctx, cx, cy, radio, anchoImg, altoImg) {
  const x0 = Math.max(0, Math.round(cx - radio));
  const y0 = Math.max(0, Math.round(cy - radio));
  const w = Math.min(Math.round(radio * 2), anchoImg - x0);
  const h = Math.min(Math.round(radio * 2), altoImg - y0);
  if (w <= 0 || h <= 0) return { oscuridad: 0, muestras: 0 };
  let data;
  try { data = ctx.getImageData(x0, y0, w, h).data; } catch { return { oscuridad: 0, muestras: 0 }; }
  let suma = 0, n = 0;
  const r2 = radio * radio * 0.55;
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      const ddx = (x0 + dx) - cx, ddy = (y0 + dy) - cy;
      if (ddx * ddx + ddy * ddy > r2) continue;
      const i = (dy * w + dx) * 4;
      const gris = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      suma += gris; n++;
    }
  }
  return { oscuridad: n ? 255 - (suma / n) : 0, muestras: n };
}

/**
 * Detecta, para cada fila (pregunta) dentro del cuadrilátero definido
 * por las 4 esquinas, cuál de las 4 columnas (A/B/C/D) está más oscura
 * — comparación RELATIVA dentro de la misma fila, no un umbral fijo,
 * para tolerar variaciones de luz entre fotos.
 *
 * @param {CanvasRenderingContext2D} ctx  contexto 2D de la foto ya capturada
 * @param {number} anchoImg  ancho real del canvas/imagen en píxeles
 * @param {number} altoImg   alto real del canvas/imagen en píxeles
 * @param {{tl,tr,bl,br}} corners  esquinas en píxeles de imagen (no de pantalla)
 * @param {number} numFilas  cuántas preguntas hay en este bloque
 * @returns {Array<{fila:number, letra:string, confianza:number, oscuridades:number[]}>}
 */
export function detectarRespuestas(ctx, anchoImg, altoImg, corners, numFilas) {
  const letras = ['A', 'B', 'C', 'D'];
  const radio = _radioMuestra(corners, numFilas);
  const resultados = [];

  for (let fila = 0; fila < numFilas; fila++) {
    const oscuridades = [];
    let muestrasMin = Infinity;
    for (let col = 0; col < 4; col++) {
      const u = (col + 0.5) / 4;
      const v = (fila + 0.5) / numFilas;
      const punto = _interpolar(corners, u, v);
      const { oscuridad, muestras } = _oscuridadPromedio(ctx, punto.x, punto.y, radio, anchoImg, altoImg);
      oscuridades.push(oscuridad);
      muestrasMin = Math.min(muestrasMin, muestras);
    }
    const ordenadas = [...oscuridades].sort((a, b) => b - a);
    const brecha = ordenadas[0] - ordenadas[1];
    // Confianza: qué tanto se distingue la más oscura de la segunda más
    // oscura. Poca separación = probablemente vacía, doble marcada, o
    // la esquina quedó mal ajustada — se marca como dudosa para que la
    // revisión humana la mire con más atención.
    let confianza = Math.max(0, Math.min(1, brecha / 55));
    if (muestrasMin < 6) confianza = 0; // esquina mal ajustada / fuera de la foto
    const idx = oscuridades.indexOf(ordenadas[0]);
    resultados.push({ fila, letra: letras[idx], confianza, oscuridades });
  }
  return resultados;
}

// Punto inicial razonable para las 4 esquinas dado un rectángulo guía
// en pantalla (se usa al pasar de "cámara" a "ajustar esquinas").
export function esquinasIniciales(rect) {
  return {
    tl: { x: rect.left, y: rect.top },
    tr: { x: rect.left + rect.width, y: rect.top },
    bl: { x: rect.left, y: rect.top + rect.height },
    br: { x: rect.left + rect.width, y: rect.top + rect.height },
  };
}
