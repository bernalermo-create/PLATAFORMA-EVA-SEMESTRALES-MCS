import { store, escHTML } from '../services/store.js';
import { toast } from '../app.js';
import { uploadFoto, hasGasUrl } from '../services/sync.js';
import { canInstall, promptInstall, isStandalone, isIOS } from '../services/pwaInstall.js';
import { detectarRespuestas } from '../services/omr.js';

let stream = null;
let scanLoopId = null;
let currentDeviceId = null;
let _pistaTimer = null;
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
      <div id="sc-hint" style="font-size:.78rem;color:var(--warn);margin-top:.4rem;display:none"></div>
      <canvas id="sc-canvas" style="display:none"></canvas>
      <div class="form-row" style="margin-top:.6rem">
        <input id="sc-manual" placeholder="...o escribe el código corto impreso junto al QR" style="flex:2">
        <button class="btn sec" id="sc-manual-go">Usar este</button>
      </div>
      <div id="sc-id-status" style="font-size:.85rem;margin-top:.6rem"></div>
    </div>

    <div class="card" style="margin-top:1rem">
      <h3 style="margin:0 0 .4rem;font-size:.9rem">🔎 O busca al estudiante directamente</h3>
      <p style="font-size:.78rem;color:var(--txt2);margin:0 0 .6rem">Por si la cámara no logra leer el QR ni el código — identifica la hoja sin necesitar nada del papel.</p>
      <div class="form-row">
        <select id="sc-buscar-curso"><option value="">Elige el curso...</option>${store.listCursos().map(c => `<option value="${c.id}">Grado ${c.grado}° ${escHTML(c.paralelo)} — ${c.jornada}/${c.seccion}</option>`).join('')}</select>
        <select id="sc-buscar-estudiante" disabled><option value="">Elige el curso primero...</option></select>
        <input id="sc-buscar-sesion" type="number" min="1" value="1" style="max-width:100px" title="Sesión">
        <button class="btn sec" id="sc-buscar-go">Buscar</button>
      </div>
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
