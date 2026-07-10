import { store } from '../services/store.js';
import { toast } from '../app.js';

let stream = null;
let scanLoopId = null;

export function renderEscaneo(root) {
  const evals = store.listEvaluaciones().filter(e => e.estado === 'publicada' && store.listPreguntas(e.id).length);

  root.innerHTML = `
    <h1>📷 Escaneo — QR + digitación asistida</h1>
    <p class="subtitle">Fase 2 del roadmap: identifica al estudiante leyendo el QR de su hoja (cámara o pegado manual) y digita las respuestas rápido con botones grandes. La calificación se hace sola contra la clave.</p>

    ${!evals.length ? `<div class="empty">No hay evaluaciones publicadas con preguntas todavía. Crea y publica una en "Evaluaciones", y genera sus hojas en "Hojas / QR".</div>` : `
    <div class="card">
      <div class="form-row">
        <select id="sc-eval">${evals.map(e => `<option value="${e.id}">${e.nombre} (Grado ${e.grado}°)</option>`).join('')}</select>
      </div>
      <h2 style="margin-top:1rem">1. Identificar la hoja</h2>
      <div class="form-row">
        <button class="btn" id="sc-cam-on">📷 Activar cámara</button>
        <button class="btn sec" id="sc-cam-off" style="display:none">⏹ Detener cámara</button>
      </div>
      <video id="sc-video" playsinline style="width:100%;max-width:360px;border-radius:8px;display:none;background:#000"></video>
      <canvas id="sc-canvas" style="display:none"></canvas>
      <div class="form-row" style="margin-top:.6rem">
        <input id="sc-manual" placeholder="...o pega aquí el contenido del QR / el ID de la hoja" style="flex:2">
        <button class="btn sec" id="sc-manual-go">Usar este</button>
      </div>
      <div id="sc-id-status" style="font-size:.85rem;margin-top:.6rem"></div>
    </div>

    <div id="sc-form"></div>
    `}
  `;

  if (!evals.length) return;

  const video = root.querySelector('#sc-video');
  const canvas = root.querySelector('#sc-canvas');
  const btnOn = root.querySelector('#sc-cam-on');
  const btnOff = root.querySelector('#sc-cam-off');

  btnOn.onclick = () => startCamera(root, video, canvas, btnOn, btnOff);
  btnOff.onclick = () => stopCamera(video, btnOn, btnOff);

  root.querySelector('#sc-manual-go').onclick = () => {
    const val = root.querySelector('#sc-manual').value.trim();
    if (!val) return;
    identificarHoja(root, val);
  };
}

function startCamera(root, video, canvas, btnOn, btnOff) {
  if (typeof jsQR === 'undefined') {
    toast('No se pudo cargar el lector de QR (jsQR). Usa el campo manual.', 'warn');
    return;
  }
  navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
    .then(s => {
      stream = s;
      video.srcObject = s;
      video.style.display = 'block';
      video.play();
      btnOn.style.display = 'none';
      btnOff.style.display = '';
      scanLoop(root, video, canvas);
    })
    .catch(err => toast('No se pudo acceder a la cámara: ' + err.message, 'bad'));
}

function stopCamera(video, btnOn, btnOff) {
  cancelAnimationFrame(scanLoopId);
  if (stream) stream.getTracks().forEach(t => t.stop());
  video.style.display = 'none';
  btnOn.style.display = '';
  btnOff.style.display = 'none';
}

function scanLoop(root, video, canvas) {
  const ctx = canvas.getContext('2d');
  const tick = () => {
    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
      // eslint-disable-next-line no-undef
      const code = jsQR(img.data, img.width, img.height);
      if (code && code.data) {
        stopCamera(video, root.querySelector('#sc-cam-on'), root.querySelector('#sc-cam-off'));
        identificarHoja(root, code.data);
        return;
      }
    }
    scanLoopId = requestAnimationFrame(tick);
  };
  scanLoopId = requestAnimationFrame(tick);
}

function identificarHoja(root, qrText) {
  const hoja = store.findHojaByQR(qrText);
  const status = root.querySelector('#sc-id-status');
  if (!hoja) {
    status.innerHTML = `<span style="color:var(--bad)">✕ No se encontró ninguna hoja con ese código. Verifica que la evaluación tenga hojas generadas.</span>`;
    return;
  }
  const evaluacionId = root.querySelector('#sc-eval').value;
  if (hoja.evaluacion_id !== evaluacionId) {
    status.innerHTML = `<span style="color:var(--warn)">⚠ Esta hoja pertenece a otra evaluación. Selecciónala arriba primero.</span>`;
    return;
  }
  const est = store.getEstudiante(hoja.estudiante_id);
  const curso = store.getCurso(hoja.curso_id);
  status.innerHTML = `<span style="color:var(--ok)">✓ Identificado: <b>${est.nombre}</b> — Grado ${curso.grado}° ${curso.paralelo}</span>`;
  renderDigitacion(root, hoja);
}

function renderDigitacion(root, hoja) {
  const preguntas = store.listPreguntas(hoja.evaluacion_id);
  const existente = store.getResultadoPorHoja(hoja.id);
  const respuestas = existente ? { ...existente.respuestas } : {};

  const box = root.querySelector('#sc-form');
  box.innerHTML = `
    <h2>2. Digitar respuestas ${existente ? '<span class="badge ok">ya calificada — puedes corregir</span>' : ''}</h2>
    <div class="card">
      <div id="sc-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:.6rem"></div>
      <div style="margin-top:1rem;display:flex;gap:.6rem;align-items:center">
        <button class="btn" id="sc-save">✅ Guardar y calificar</button>
        <span id="sc-progress" style="font-size:.82rem;color:var(--txt2)"></span>
      </div>
    </div>
  `;

  const grid = box.querySelector('#sc-grid');
  grid.innerHTML = preguntas.map(p => `
    <div class="card" style="padding:.6rem" data-q="${p.numero}">
      <div style="font-weight:700;margin-bottom:.4rem">Pregunta ${p.numero}</div>
      <div style="display:flex;gap:.3rem">
        ${['A','B','C','D'].map(l => `<button class="btn sm sec opt-btn" data-letra="${l}" style="flex:1">${l}</button>`).join('')}
      </div>
    </div>
  `).join('');

  function marcar(numero, letra) {
    respuestas[numero] = letra;
    updateUI();
  }

  function updateUI() {
    preguntas.forEach(p => {
      const card = grid.querySelector(`[data-q="${p.numero}"]`);
      card.querySelectorAll('.opt-btn').forEach(btn => {
        const on = respuestas[p.numero] === btn.dataset.letra;
        btn.classList.toggle('sec', !on);
        btn.style.background = on ? 'var(--acc)' : '';
        btn.style.color = on ? '#fff' : '';
      });
    });
    const contestadas = Object.keys(respuestas).length;
    box.querySelector('#sc-progress').textContent = `${contestadas} / ${preguntas.length} respondidas`;
  }

  grid.querySelectorAll('.opt-btn').forEach(btn => {
    btn.onclick = () => marcar(parseInt(btn.closest('[data-q]').dataset.q), btn.dataset.letra);
  });

  updateUI();

  box.querySelector('#sc-save').onclick = () => {
    const faltantes = preguntas.length - Object.keys(respuestas).length;
    if (faltantes > 0 && !confirm(`Hay ${faltantes} pregunta(s) sin marcar (quedarán como "en blanco"). ¿Guardar de todas formas?`)) return;
    const r = store.guardarResultado({ hojaId: hoja.id, respuestas });
    toast(`Calificado: ${r.aciertos}/${r.total} (${r.porcentaje}%).`);
    box.innerHTML = '';
    root.querySelector('#sc-id-status').innerHTML = '';
  };
}
