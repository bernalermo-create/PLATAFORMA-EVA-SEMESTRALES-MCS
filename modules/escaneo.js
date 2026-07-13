import { store, escHTML } from '../services/store.js';
import { toast } from '../app.js';
import { uploadFoto, hasGasUrl } from '../services/sync.js';
import { canInstall, promptInstall, isStandalone, isIOS } from '../services/pwaInstall.js';

let stream = null;
let scanLoopId = null;
let currentDeviceId = null;
let videoDevices = [];
// Se mantienen a nivel de módulo (no se reinician al cambiar de
// pestaña y volver) porque este flujo se usa para digitalizar muchas
// hojas seguidas — perder el contador o la preferencia de "seguir
// escaneando" cada vez que alguien revisa otra pantalla sería molesto.
let contadorSesion = 0;
let seguirEscaneando = true;

export function renderEscaneo(root) {
  root.innerHTML = `
    <h1>📷 Escaneo — QR + digitación asistida</h1>
    <p class="subtitle">Escanea el QR de la hoja de respuestas (cámara o pegado manual). El QR ya identifica al estudiante, el curso y todas las áreas incluidas en esa sesión, así que no hace falta elegir nada más antes de digitar.</p>

    <div id="sc-install-banner"></div>

    <div class="card">
      <div class="form-row" style="align-items:center">
        <button class="btn" id="sc-cam-on">📷 Activar cámara</button>
        <button class="btn sec" id="sc-cam-off" style="display:none">⏹ Detener cámara</button>
        <button class="btn sec" id="sc-cam-switch" style="display:none" title="Cambiar de cámara">🔄</button>
        <button class="btn sec" id="sc-cam-torch" style="display:none" title="Linterna">💡</button>
        <label style="display:flex;align-items:center;gap:.4rem;font-size:.8rem;color:var(--txt2);margin-left:auto;cursor:pointer">
          <input type="checkbox" id="sc-auto" ${seguirEscaneando ? 'checked' : ''}>
          Seguir escaneando automáticamente
        </label>
      </div>
      <div class="sc-video-wrap" id="sc-video-wrap" style="display:none">
        <video id="sc-video" playsinline muted></video>
        <div class="sc-frame"></div>
      </div>
      <canvas id="sc-canvas" style="display:none"></canvas>
      <div class="form-row" style="margin-top:.6rem">
        <input id="sc-manual" placeholder="...o pega aquí el contenido del QR / el ID de la hoja" style="flex:2">
        <button class="btn sec" id="sc-manual-go">Usar este</button>
      </div>
      <div id="sc-id-status" style="font-size:.85rem;margin-top:.6rem"></div>
    </div>

    <div id="sc-contador" style="font-size:.82rem;color:var(--txt2);margin:.6rem .2rem">
      ${contadorSesion ? `✅ ${contadorSesion} hoja(s) digitalizada(s) en esta sesión.` : ''}
    </div>

    <div id="sc-form"></div>
  `;

  renderInstallBanner(root);
  document.addEventListener('pwa:installable', () => renderInstallBanner(root));

  const video = root.querySelector('#sc-video');
  const canvas = root.querySelector('#sc-canvas');
  const btnOn = root.querySelector('#sc-cam-on');
  const btnOff = root.querySelector('#sc-cam-off');

  btnOn.onclick = () => startCamera(root, video, canvas, btnOn, btnOff);
  btnOff.onclick = () => stopCamera(root, video, btnOn, btnOff);

  root.querySelector('#sc-cam-switch').onclick = async () => {
    if (videoDevices.length < 2) return;
    const idx = videoDevices.findIndex(d => d.deviceId === currentDeviceId);
    currentDeviceId = videoDevices[(idx + 1) % videoDevices.length].deviceId;
    try {
      await _abrirStream(video, currentDeviceId);
      scanLoop(root, video, canvas);
      _actualizarControlesCamara(root);
    } catch (err) { _mostrarErrorCamara(err); }
  };

  root.querySelector('#sc-cam-torch').onclick = async () => {
    const track = stream?.getVideoTracks?.()[0];
    if (!track) return;
    const btn = root.querySelector('#sc-cam-torch');
    const on = btn.dataset.on !== '1';
    try {
      await track.applyConstraints({ advanced: [{ torch: on }] });
      btn.dataset.on = on ? '1' : '0';
      btn.style.background = on ? 'var(--acc)' : '';
    } catch { toast('Este dispositivo no permite controlar la linterna desde aquí.', 'warn'); }
  };

  root.querySelector('#sc-auto').onchange = (e) => { seguirEscaneando = e.target.checked; };

  root.querySelector('#sc-manual-go').onclick = () => {
    const val = root.querySelector('#sc-manual').value.trim();
    if (!val) return;
    identificarHoja(root, val);
  };
}

function renderInstallBanner(root) {
  const box = root.querySelector('#sc-install-banner');
  if (!box) return; // la persona ya navegó a otra pantalla
  if (isStandalone()) { box.innerHTML = ''; return; }
  if (canInstall()) {
    box.innerHTML = `
      <div class="card" style="background:var(--surf2);display:flex;justify-content:space-between;align-items:center;gap:.6rem;flex-wrap:wrap;margin-bottom:1rem">
        <div style="font-size:.85rem">📲 Instala la plataforma como app en este celular — se abre más rápido y a un toque desde la pantalla de inicio.</div>
        <button class="btn sm" id="sc-install-btn">Instalar</button>
      </div>`;
    box.querySelector('#sc-install-btn').onclick = async () => {
      const r = await promptInstall();
      if (r.outcome === 'accepted') toast('¡Instalada! Ya la puedes abrir desde la pantalla de inicio.');
      renderInstallBanner(root);
    };
  } else if (isIOS()) {
    box.innerHTML = `
      <div class="card" style="background:var(--surf2);margin-bottom:1rem">
        <div style="font-size:.85rem">📲 En iPhone: toca <b>Compartir</b> (el ícono de la flecha hacia arriba) y luego <b>"Agregar a pantalla de inicio"</b> para usarla como app.</div>
      </div>`;
  } else {
    box.innerHTML = '';
  }
}

async function startCamera(root, video, canvas, btnOn, btnOff) {
  if (typeof jsQR === 'undefined') {
    toast('No se pudo cargar el lector de QR (jsQR). Usa el campo manual.', 'warn');
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    toast('Este navegador no da acceso a la cámara aquí. Usa el campo manual, o revisa que la página abra con https://.', 'bad');
    return;
  }
  try {
    await _abrirStream(video, currentDeviceId);
    root.querySelector('#sc-video-wrap').style.display = 'block';
    btnOn.style.display = 'none';
    btnOff.style.display = '';
    scanLoop(root, video, canvas);
    _actualizarControlesCamara(root);
  } catch (err) {
    _mostrarErrorCamara(err);
  }
}

async function _abrirStream(video, deviceId) {
  if (stream) stream.getTracks().forEach(t => t.stop());
  const constraints = deviceId
    ? { video: { deviceId: { exact: deviceId } } }
    : { video: { facingMode: { ideal: 'environment' } } };
  stream = await navigator.mediaDevices.getUserMedia(constraints);
  video.srcObject = stream;
  await video.play();
  try {
    // Solo se listan con nombres/deviceId reales una vez que ya se dio
    // permiso — por eso se hace después de abrir el primer stream, no antes.
    videoDevices = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'videoinput');
    if (!currentDeviceId) {
      const activa = stream.getVideoTracks()[0]?.getSettings?.().deviceId;
      if (activa) currentDeviceId = activa;
    }
  } catch { /* no crítico — el cambio de cámara simplemente no se ofrece */ }
}

function _actualizarControlesCamara(root) {
  const switchBtn = root.querySelector('#sc-cam-switch');
  const torchBtn = root.querySelector('#sc-cam-torch');
  if (switchBtn) switchBtn.style.display = videoDevices.length > 1 ? '' : 'none';
  if (torchBtn) {
    const track = stream?.getVideoTracks?.()[0];
    const soportaLinterna = !!track?.getCapabilities?.().torch;
    torchBtn.style.display = soportaLinterna ? '' : 'none';
    torchBtn.dataset.on = '0';
    torchBtn.style.background = '';
  }
}

function _mostrarErrorCamara(err) {
  let msg = 'No se pudo acceder a la cámara: ' + (err.message || err.name || 'error desconocido');
  if (err.name === 'NotAllowedError') msg = 'Permiso de cámara denegado — revisa los permisos del sitio en el navegador del celular.';
  else if (err.name === 'NotFoundError') msg = 'No se encontró ninguna cámara en este dispositivo.';
  else if (err.name === 'NotReadableError') msg = 'La cámara está siendo usada por otra aplicación — ciérrala e intenta de nuevo.';
  else if (location.protocol !== 'https:' && location.hostname !== 'localhost') msg = 'La cámara solo funciona con conexión segura (https://) — revisa que la URL empiece así.';
  toast(msg, 'bad');
}

function stopCamera(root, video, btnOn, btnOff) {
  cancelAnimationFrame(scanLoopId);
  if (stream) stream.getTracks().forEach(t => t.stop());
  stream = null;
  const wrap = root.querySelector('#sc-video-wrap');
  if (wrap) wrap.style.display = 'none';
  btnOn.style.display = '';
  btnOff.style.display = 'none';
  const sw = root.querySelector('#sc-cam-switch'); if (sw) sw.style.display = 'none';
  const tb = root.querySelector('#sc-cam-torch'); if (tb) tb.style.display = 'none';
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
        stopCamera(root, video, root.querySelector('#sc-cam-on'), root.querySelector('#sc-cam-off'));
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
  // Defensa ante datos inconsistentes (ej. el estudiante o el curso se
  // borraron después de imprimir esta hoja física) — antes esto hacía
  // que la pantalla se cayera al intentar leer est.nombre de null.
  if (!est || !curso) {
    status.innerHTML = `<span style="color:var(--bad)">✕ Esta hoja hace referencia a un estudiante o curso que ya no existe en la plataforma (puede haber sido borrado). No se puede calificar — contacta al administrador si esto no debería haber pasado.</span>`;
    return;
  }
  const { bloques } = store.gruposConNumeracion(hoja.evaluacion_ids);
  if (!bloques.length) {
    status.innerHTML = `<span style="color:var(--bad)">✕ Todas las evaluaciones incluidas en esta hoja fueron eliminadas de la plataforma — no queda nada que calificar.</span>`;
    return;
  }
  const areas = bloques.map(b => b.ev.area).join(', ');
  const primerEv = bloques[0].ev;
  const avisoParcial = bloques.length < hoja.evaluacion_ids.length
    ? ` <span style="color:var(--warn)">(⚠ esta hoja incluía más áreas originalmente; alguna(s) evaluación(es) ya no existe(n))</span>`
    : '';
  status.innerHTML = `<span style="color:var(--ok)">✓ Identificado: <b>${escHTML(est.nombre)}</b> — Grado ${curso.grado}° ${escHTML(curso.paralelo)} · Sesión ${hoja.sesion} · ${primerEv.semestre === 'S1' ? 'Primer' : 'Segundo'} Semestre ${primerEv.year} (${areas})</span>${avisoParcial}`;
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
        <div class="sc-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:.6rem">
          ${preguntas.map(p => `
            <div data-q="${p._abs}">
              <div style="font-size:.78rem;color:var(--txt2);margin-bottom:.3rem">Pregunta ${p._abs}</div>
              <div style="display:flex;gap:.3rem">
                ${['A','B','C','D'].map(l => `<button class="btn sm sec opt-btn" data-letra="${l}" style="flex:1">${l}</button>`).join('')}
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
    contadorSesion++;
    toast(`Calificado (${contadorSesion} en esta sesión). ${resumen}`);
    box.innerHTML = '';
    root.querySelector('#sc-id-status').innerHTML = '';
    const contadorEl = root.querySelector('#sc-contador');
    if (contadorEl) contadorEl.textContent = `✅ ${contadorSesion} hoja(s) digitalizada(s) en esta sesión.`;

    // Flujo continuo: si está activado, reabre la cámara de inmediato
    // para el siguiente estudiante, en vez de dejar todo en blanco
    // esperando que alguien vuelva a tocar "Activar cámara" — pensado
    // para digitalizar un curso completo sin soltar el celular.
    if (seguirEscaneando) {
      const video = root.querySelector('#sc-video');
      const canvas = root.querySelector('#sc-canvas');
      const btnOn = root.querySelector('#sc-cam-on');
      const btnOff = root.querySelector('#sc-cam-off');
      startCamera(root, video, canvas, btnOn, btnOff);
    }
  };
}

function _niveLabel(n) {
  const map = { BAJO: 'Bajo', 'BÁSICO': 'Básico', ALTO: 'Alto', SUPERIOR: 'Superior' };
  return map[n] || n || '—';
}
