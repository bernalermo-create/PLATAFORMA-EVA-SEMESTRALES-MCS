import { store } from '../services/store.js';
import { toast } from '../app.js';
import { uploadFoto, hasGasUrl } from '../services/sync.js';

let stream = null;
let scanLoopId = null;

export function renderEscaneo(root) {
  root.innerHTML = `
    <h1>📷 Escaneo — QR + digitación asistida</h1>
    <p class="subtitle">Escanea el QR de la hoja de respuestas (cámara o pegado manual). El QR ya identifica al estudiante, el curso y todas las áreas incluidas en esa sesión, así que no hace falta elegir nada más antes de digitar.</p>

    <div class="card">
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
  `;

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
    status.innerHTML = `<span style="color:var(--bad)">✕ No se encontró ninguna hoja con ese código. Verifica que se haya generado en "Hojas / QR".</span>`;
    return;
  }
  const est = store.getEstudiante(hoja.estudiante_id);
  const curso = store.getCurso(hoja.curso_id);
  const { bloques } = store.gruposConNumeracion(hoja.evaluacion_ids);
  const areas = bloques.map(b => b.ev.area).join(', ');
  status.innerHTML = `<span style="color:var(--ok)">✓ Identificado: <b>${est.nombre}</b> — Grado ${curso.grado}° ${curso.paralelo} · Sesión ${hoja.sesion} (${areas})</span>`;
  renderDigitacion(root, hoja);
}

function renderDigitacion(root, hoja) {
  const { bloques, total } = store.gruposConNumeracion(hoja.evaluacion_ids);
  const resultadosPrevios = store.listResultadosPorHoja(hoja.id);
  const yaCalificada = resultadosPrevios.length > 0;

  // Reconstruye las respuestas ya guardadas (si las hay) en el mismo
  // esquema de numeración absoluta que usa esta pantalla.
  const respuestas = {};
  if (yaCalificada) {
    bloques.forEach(({ ev, preguntas }) => {
      const r = resultadosPrevios.find(x => x.evaluacion_id === ev.id);
      if (!r) return;
      preguntas.forEach(p => {
        const nivel = r.niveles?.[p.numero];
        if (!nivel) return;
        const opcion = p.opciones.find(o => o.nivel === nivel);
        if (opcion) respuestas[p._abs] = opcion.letra;
      });
    });
  }
  let fotoUrl = yaCalificada ? resultadosPrevios[0].foto_url : null;

  const box = root.querySelector('#sc-form');
  box.innerHTML = `
    <h2>2. Digitar respuestas ${yaCalificada ? '<span class="badge ok">ya calificada — puedes corregir</span>' : ''}</h2>
    ${bloques.map(({ ev, preguntas }) => `
      <div class="card" style="margin-bottom:.8rem">
        <h3 style="margin:0 0 .6rem;font-size:.9rem">${ev.area} <span style="color:var(--txt2);font-weight:400">(preguntas ${preguntas[0]._abs} a ${preguntas[preguntas.length-1]._abs})</span></h3>
        <div class="sc-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:.5rem">
          ${preguntas.map(p => `
            <div data-q="${p._abs}">
              <div style="font-size:.78rem;color:var(--txt2);margin-bottom:.25rem">Pregunta ${p._abs}</div>
              <div style="display:flex;gap:.25rem">
                ${['A','B','C','D'].map(l => `<button class="btn sm sec opt-btn" data-letra="${l}" style="flex:1;padding:.35rem 0">${l}</button>`).join('')}
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `).join('')}

    <div class="card">
      <div style="display:flex;gap:.6rem;align-items:center;flex-wrap:wrap">
        <button class="btn" id="sc-save">✅ Guardar y calificar</button>
        <span id="sc-progress" style="font-size:.82rem;color:var(--txt2)"></span>
      </div>
    </div>

    <div class="card" style="margin-top:.8rem">
      <h3 style="margin:0 0 .5rem;font-size:.9rem">📎 Foto de respaldo (opcional)</h3>
      <p style="font-size:.78rem;color:var(--txt2);margin:0 0 .6rem">
        Guarda una foto de la hoja física como respaldo/auditoría. Se guarda en Drive, igual que el resto de los datos.
      </p>
      <input type="file" id="sc-foto" accept="image/*" capture="environment">
      <div id="sc-foto-status" style="font-size:.8rem;margin-top:.5rem"></div>
      ${fotoUrl ? `<div style="margin-top:.5rem"><a href="${fotoUrl}" target="_blank">📷 Ver foto ya guardada</a></div>` : ''}
    </div>
  `;

  box.querySelector('#sc-foto').onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const status = box.querySelector('#sc-foto-status');
    if (!hasGasUrl()) { status.textContent = '⚠ Configura primero la conexión con Sheets en Configuración.'; return; }
    status.textContent = 'Leyendo imagen...';
    const reader = new FileReader();
    reader.onload = async () => {
      status.textContent = '⬆️ Subiendo foto a Drive...';
      const r = await uploadFoto(reader.result, file.name, file.type);
      if (r.ok) {
        fotoUrl = r.url;
        status.innerHTML = `<span style="color:var(--ok)">✓ Foto guardada.</span> <a href="${r.url}" target="_blank">Ver</a>`;
      } else {
        status.innerHTML = `<span style="color:var(--bad)">✕ ${r.error || 'No se pudo subir la foto.'}</span>`;
      }
    };
    reader.readAsDataURL(file);
  };

  function marcar(abs, letra) {
    respuestas[abs] = letra;
    updateUI();
  }

  function updateUI() {
    box.querySelectorAll('[data-q]').forEach(card => {
      const abs = parseInt(card.dataset.q);
      card.querySelectorAll('.opt-btn').forEach(btn => {
        const on = respuestas[abs] === btn.dataset.letra;
        btn.style.background = on ? 'var(--acc)' : '';
        btn.style.color = on ? '#fff' : '';
      });
    });
    const contestadas = Object.keys(respuestas).length;
    box.querySelector('#sc-progress').textContent = `${contestadas} / ${total} respondidas`;
  }

  box.querySelectorAll('.opt-btn').forEach(btn => {
    btn.onclick = () => marcar(parseInt(btn.closest('[data-q]').dataset.q), btn.dataset.letra);
  });

  updateUI();

  box.querySelector('#sc-save').onclick = () => {
    const faltantes = total - Object.keys(respuestas).length;
    if (faltantes > 0 && !confirm(`Hay ${faltantes} pregunta(s) sin marcar (quedarán como "sin responder"). ¿Guardar de todas formas?`)) return;
    const resultados = store.guardarResultadoGrupo({ hojaId: hoja.id, respuestasAbsolutas: respuestas, fotoUrl });
    const resumen = resultados.map(r => `${store.getEvaluacion(r.evaluacion_id).area}: ${_niveLabel(r.nivel_predominante)}`).join(' · ');
    toast(`Calificado. ${resumen}`);
    box.innerHTML = '';
    root.querySelector('#sc-id-status').innerHTML = '';
  };
}

function _niveLabel(n) {
  const map = { BAJO: 'Bajo', 'BÁSICO': 'Básico', ALTO: 'Alto', SUPERIOR: 'Superior' };
  return map[n] || n || '—';
}
