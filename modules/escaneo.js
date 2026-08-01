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
// Una hoja real suele traer varias materias en columnas lado a lado
// (para ahorrar papel), así que no hay un solo recorrido lineal que
// las atraviese todas — pero SÍ se puede tomar UNA sola foto de toda
// la hoja y reutilizarla para ajustar cada materia por separado, en
// vez de abrir la cámara y volver a enfocar una vez por materia. Se
// guarda a nivel de módulo porque el flujo de "Detectar con foto" de
// cada materia se dispara desde botones independientes; se limpia al
// identificar una hoja nueva (ver renderDigitacion).
let _fotoHojaCompartida = null;

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

  root.querySelector('#sc-auto').onchange = (e) => { seguirEscaneando = e.target.checked; };

  root.querySelector('#sc-manual-go').onclick = () => {
    const val = root.querySelector('#sc-manual').value.trim();
    if (!val) return;
    identificarHoja(root, val);
  };

  root.querySelector('#sc-buscar-curso').onchange = (e) => {
    const sel = root.querySelector('#sc-buscar-estudiante');
    const cursoId = e.target.value;
    if (!cursoId) { sel.innerHTML = '<option value="">Elige el curso primero...</option>'; sel.disabled = true; return; }
    const estudiantes = store.listEstudiantes(cursoId).sort((a, b) => a.nombre.localeCompare(b.nombre));
    sel.innerHTML = estudiantes.length
      ? estudiantes.map(est => `<option value="${est.id}">${escHTML(est.nombre)}</option>`).join('')
      : '<option value="">Este curso no tiene estudiantes cargados</option>';
    sel.disabled = !estudiantes.length;
  };

  root.querySelector('#sc-buscar-go').onclick = () => {
    const cursoId = root.querySelector('#sc-buscar-curso').value;
    const estudianteId = root.querySelector('#sc-buscar-estudiante').value;
    const sesion = parseInt(root.querySelector('#sc-buscar-sesion').value) || 1;
    const status = root.querySelector('#sc-id-status');
    if (!cursoId || !estudianteId) { toast('Elige el curso y el estudiante.', 'warn'); return; }
    const hoja = store.listHojasPorCursoSesion(cursoId, sesion).find(h => h.estudiante_id === estudianteId);
    if (!hoja) {
      status.innerHTML = `<span style="color:var(--bad)">✕ No hay una hoja generada para este estudiante en la Sesión ${sesion}. Verifica el número de sesión, o genérala primero en "Hojas / QR".</span>`;
      return;
    }
    identificarHoja(root, hoja.qr_payload);
    status.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
    _armarPistaEscaneo(root);
  } catch (err) {
    _mostrarErrorCamara(err);
  }
}

// Si pasan varios segundos sin detectar nada, es fácil pensar que
// "no funciona" sin saber qué ajustar — esto da pistas concretas en
// vez de dejar la cámara corriendo en silencio.
function _armarPistaEscaneo(root) {
  clearTimeout(_pistaTimer);
  const hint = root.querySelector('#sc-hint');
  if (hint) hint.style.display = 'none';
  _pistaTimer = setTimeout(() => {
    const h = root.querySelector('#sc-hint');
    if (h && root.querySelector('#sc-video-wrap')?.style.display !== 'none') {
      h.style.display = 'block';
      h.textContent = '💡 ¿No lo reconoce? Acércate o aléjate un poco, encuadra el QR completo dentro del recuadro, evita reflejos, y prueba la linterna 💡 si hay poca luz.';
    }
  }, 4000);
}

async function _abrirStream(video, deviceId) {
  if (stream) stream.getTracks().forEach(t => t.stop());
  // Sin pedir una resolución explícita, el navegador a veces elige una
  // por defecto baja (ej. 640×480), lo que le deja muy pocos píxeles a
  // jsQR para distinguir los módulos del QR — pidiendo HD de una vez
  // se nota mucho en qué tan lejos/pequeño puede estar el código y
  // aun así leerse bien.
  const videoConstraints = deviceId
    ? { deviceId: { exact: deviceId }, width: { ideal: 1920 }, height: { ideal: 1080 } }
    : { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } };
  stream = await navigator.mediaDevices.getUserMedia({ video: videoConstraints });
  video.srcObject = stream;
  await video.play();
  // Enfoque continuo si el dispositivo lo soporta — en varios celulares,
  // una cámara abierta desde una página web NO reenfoca sola a menos
  // que se pida explícitamente, y eso es una causa muy común de que un
  // QR de cerca se vea borroso y no se lea aunque la cámara esté "activa".
  try {
    const track = stream.getVideoTracks()[0];
    const caps = track.getCapabilities?.();
    if (caps?.focusMode?.includes('continuous')) {
      await track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] });
    }
  } catch { /* no soportado en este dispositivo — no es crítico */ }
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

// ════════════════════════════════════════════════════════════════════
//  Lectura asistida por foto — cámara con guía, foto, ajuste manual de
//  las 4 esquinas (arrastrando), y detección. Nunca decide sola: al
//  terminar, las respuestas quedan pre-marcadas en el formulario para
//  que la persona las revise (las de baja confianza quedan resaltadas
//  en naranja) y guarde solo cuando esté conforme.
// ════════════════════════════════════════════════════════════════════
async function _abrirModalOMR(numFilas, onDetectado) {
  const modal = document.createElement('div');
  modal.className = 'omr-modal';
  document.body.appendChild(modal);

  // Si ya se tomó una foto de esta hoja (para otra materia), se
  // reutiliza directo — se salta la cámara y se pasa de una vez al
  // ajuste de esquinas de ESTA materia sobre esa misma foto. Como la
  // hoja trae varias materias en columnas lado a lado (no una debajo
  // de otra), cada materia igual necesita su propio ajuste de esquinas
  // dentro de la foto compartida — lo que se ahorra es reabrir/reenfocar
  // la cámara y repetir la toma por cada una.
  if (_fotoHojaCompartida) {
    const relGuideCentrado = { left: 0.2, top: 0.2, width: 0.6, height: 0.6 };
    _pasoAjustarOMR(modal, _fotoHojaCompartida, relGuideCentrado, numFilas, () => modal.remove(), onDetectado, true);
    return;
  }

  let omrStream = null;
  const cerrar = () => {
    if (omrStream) { omrStream.getTracks().forEach(t => t.stop()); omrStream = null; }
    modal.remove();
  };

  modal.innerHTML = `
    <div class="omr-modal-inner">
      <p>Encuadra <b>toda la hoja de respuestas</b> (todas las materias) dentro del recuadro verde y toca Capturar. Esta misma foto se va a reutilizar para ajustar cada materia — no hace falta repetirla.</p>
      <div class="omr-cam-wrap">
        <video id="omr-video" playsinline muted autoplay></video>
        <div class="omr-guide" id="omr-guide"></div>
      </div>
      <div class="omr-btnrow">
        <button class="btn" id="omr-capturar">📸 Capturar</button>
        <button class="btn sec" id="omr-cancelar">Cancelar</button>
      </div>
    </div>
  `;

  const video = modal.querySelector('#omr-video');
  try {
    omrStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }
    });
    video.srcObject = omrStream;
    await video.play();
  } catch (err) {
    toast('No se pudo activar la cámara: ' + (err.message || err.name || 'error desconocido'), 'bad');
    cerrar();
    return;
  }

  modal.querySelector('#omr-cancelar').onclick = cerrar;

  function posicionarGuia() {
    const wrap = modal.querySelector('.omr-cam-wrap');
    const guide = modal.querySelector('#omr-guide');
    if (!wrap || !guide) return;
    // Guía amplia y centrada — ya no depende del largo de una sola
    // materia (numFilas), porque ahora la foto es de la hoja completa.
    const w = wrap.clientWidth, h = wrap.clientHeight;
    const gw = w * 0.85, gh = h * 0.85;
    guide.style.width = gw + 'px';
    guide.style.height = gh + 'px';
    guide.style.left = ((w - gw) / 2) + 'px';
    guide.style.top = ((h - gh) / 2) + 'px';
  }
  video.onloadedmetadata = posicionarGuia;
  setTimeout(posicionarGuia, 300);

  modal.querySelector('#omr-capturar').onclick = () => {
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);

    if (omrStream) { omrStream.getTracks().forEach(t => t.stop()); omrStream = null; }
    _fotoHojaCompartida = canvas; // se reutiliza para las demás materias de esta hoja
    const relGuideCentrado = { left: 0.2, top: 0.2, width: 0.6, height: 0.6 };
    _pasoAjustarOMR(modal, canvas, relGuideCentrado, numFilas, cerrar, onDetectado, false);
  };
}

function _pasoAjustarOMR(modal, canvas, relGuide, numFilas, cerrar, onDetectado, esFotoCompartida) {
  modal.innerHTML = `
    <div class="omr-modal-inner">
      ${esFotoCompartida ? `<p style="font-size:.78rem;color:var(--txt2);margin:0 0 .4rem">📷 Usando la misma foto de toda la hoja que ya tomaste — ubicá y ajustá aquí solo esta materia.</p>` : ''}
      <p>Pon cada esquina verde exactamente en el <b>centro</b> de la burbuja de esa esquina: arriba-izquierda = burbuja A de la pregunta 1 de ESTA materia, arriba-derecha = burbuja D de la pregunta 1, abajo-izquierda = burbuja A de la pregunta ${numFilas}, abajo-derecha = burbuja D de la pregunta ${numFilas}.</p>
      <div class="omr-canvas-wrap" id="omr-canvas-wrap">
        <canvas id="omr-canvas"></canvas>
        <div class="omr-handle" data-corner="tl"></div>
        <div class="omr-handle" data-corner="tr"></div>
        <div class="omr-handle" data-corner="bl"></div>
        <div class="omr-handle" data-corner="br"></div>
      </div>
      <div class="omr-btnrow">
        <button class="btn" id="omr-confirmar">✓ Detectar respuestas</button>
        <button class="btn sec" id="omr-repetir">🔄 ${esFotoCompartida ? 'Tomar otra foto (de toda la hoja)' : 'Otra foto'}</button>
        <button class="btn sec" id="omr-cancelar2">Cancelar</button>
      </div>
    </div>
  `;

  const wrapEl = modal.querySelector('#omr-canvas-wrap');
  const canvasEl = modal.querySelector('#omr-canvas');
  canvasEl.width = canvas.width;
  canvasEl.height = canvas.height;
  canvasEl.getContext('2d').drawImage(canvas, 0, 0);

  let corners = {
    tl: { x: relGuide.left * canvas.width, y: relGuide.top * canvas.height },
    tr: { x: (relGuide.left + relGuide.width) * canvas.width, y: relGuide.top * canvas.height },
    bl: { x: relGuide.left * canvas.width, y: (relGuide.top + relGuide.height) * canvas.height },
    br: { x: (relGuide.left + relGuide.width) * canvas.width, y: (relGuide.top + relGuide.height) * canvas.height },
  };

  function pintarHandles() {
    const rect = canvasEl.getBoundingClientRect();
    const escalaX = rect.width / canvas.width;
    const escalaY = rect.height / canvas.height;
    Object.entries(corners).forEach(([key, pt]) => {
      const handle = wrapEl.querySelector(`.omr-handle[data-corner="${key}"]`);
      handle.style.left = (pt.x * escalaX) + 'px';
      handle.style.top = (pt.y * escalaY) + 'px';
    });
  }
  pintarHandles();
  const onResize = () => pintarHandles();
  window.addEventListener('resize', onResize);

  wrapEl.querySelectorAll('.omr-handle').forEach(handle => {
    handle.onpointerdown = (e) => {
      e.preventDefault();
      handle.setPointerCapture(e.pointerId);
      handle.onpointermove = (ev) => {
        const rect = canvasEl.getBoundingClientRect();
        const escalaX = canvas.width / rect.width;
        const escalaY = canvas.height / rect.height;
        let x = (ev.clientX - rect.left) * escalaX;
        let y = (ev.clientY - rect.top) * escalaY;
        x = Math.max(0, Math.min(canvas.width, x));
        y = Math.max(0, Math.min(canvas.height, y));
        corners[handle.dataset.corner] = { x, y };
        pintarHandles();
      };
      handle.onpointerup = (ev) => { handle.onpointermove = null; handle.releasePointerCapture(ev.pointerId); };
    };
  });

  modal.querySelector('#omr-cancelar2').onclick = () => { window.removeEventListener('resize', onResize); cerrar(); };
  modal.querySelector('#omr-repetir').onclick = () => {
    window.removeEventListener('resize', onResize);
    cerrar();
    _fotoHojaCompartida = null; // se descarta — la próxima materia también volverá a pedir foto
    _abrirModalOMR(numFilas, onDetectado);
  };
  modal.querySelector('#omr-confirmar').onclick = () => {
    window.removeEventListener('resize', onResize);
    const ctx = canvasEl.getContext('2d');
    const detecciones = detectarRespuestas(ctx, canvas.width, canvas.height, corners, numFilas);
    cerrar();
    onDetectado(detecciones);
  };
}

function stopCamera(root, video, btnOn, btnOff) {
  cancelAnimationFrame(scanLoopId);
  clearTimeout(_pistaTimer);
  const hint = root.querySelector('#sc-hint');
  if (hint) hint.style.display = 'none';
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
      const code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'attemptBoth' });
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
  // Confirmación explícita antes de digitar — evita que un QR ajeno
  // (ej. el de otro estudiante que quedó en el encuadre) arranque la
  // digitación de la persona equivocada por accidente. El nombre queda
  // bien grande y hay que tocar "Sí, es esta hoja" para continuar.
  status.innerHTML = `
    <div class="an-panel" style="border:2px solid var(--ok);margin-top:.4rem">
      <div style="font-size:.78rem;color:var(--txt2);margin-bottom:.3rem">✓ QR reconocido</div>
      <div style="font-size:1.3rem;font-weight:800;margin-bottom:.3rem">${escHTML(est.nombre)}</div>
      <div style="font-size:.85rem;color:var(--txt2);margin-bottom:.8rem">Grado ${curso.grado}° ${escHTML(curso.paralelo)} · Sesión ${hoja.sesion} · ${primerEv.semestre === 'S1' ? 'Primer' : 'Segundo'} Semestre ${primerEv.year} — ${areas}${avisoParcial}</div>
      <div style="display:flex;gap:.6rem;flex-wrap:wrap">
        <button class="btn" id="sc-confirmar" style="min-height:48px;font-size:1rem">✅ Sí, es esta hoja — continuar</button>
        <button class="btn sec" id="sc-no-es" style="min-height:48px">🔄 No es esta — volver a escanear</button>
      </div>
    </div>
  `;
  status.querySelector('#sc-confirmar').onclick = () => renderDigitacion(root, hoja);
  status.querySelector('#sc-no-es').onclick = () => {
    status.innerHTML = '';
    const video = root.querySelector('#sc-video');
    const canvas = root.querySelector('#sc-canvas');
    const btnOn = root.querySelector('#sc-cam-on');
    const btnOff = root.querySelector('#sc-cam-off');
    startCamera(root, video, canvas, btnOn, btnOff);
  };
}

function renderDigitacion(root, hoja) {
  _fotoHojaCompartida = null; // hoja nueva -> ninguna foto tomada todavía
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
  const confianzas = {}; // { [abs]: 0..1 } — solo para las respuestas que vinieron de foto
  box.innerHTML = `
    <h2>2. Digitar respuestas ${yaCalificada ? '<span class="badge ok">ya calificada — puedes corregir</span>' : ''}</h2>
    ${bloques.map(({ ev, preguntas }) => `
      <div class="card" style="margin-bottom:.8rem">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:.5rem;margin-bottom:.6rem">
          <h3 style="margin:0;font-size:.9rem">${ev.area} <span style="color:var(--txt2);font-weight:400">(preguntas ${preguntas[0]._abs} a ${preguntas[preguntas.length-1]._abs})</span></h3>
          <button class="btn sm sec omr-btn" data-area="${escHTML(ev.area)}" data-desde="${preguntas[0]._abs}" data-hasta="${preguntas[preguntas.length-1]._abs}">📸 Detectar con foto</button>
        </div>
        <div class="sc-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:.6rem">
          ${preguntas.map(p => `
            <div data-q="${p._abs}">
              <div style="font-size:.78rem;color:var(--txt2);margin-bottom:.3rem">Pregunta ${p._abs}</div>
              <div style="display:flex;gap:.3rem">
                ${['A','B','C','D'].map(l => `<button class="btn sm sec opt-btn" data-letra="${l}" style="flex:1">${l}</button>`).join('')}
              </div>
              <button class="btn sm sec blank-btn" style="width:100%;margin-top:.25rem;font-size:.72rem">— Sin responder</button>
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

  function marcar(abs, letra, confianza) {
    respuestas[abs] = letra;
    if (confianza !== undefined) confianzas[abs] = confianza; else delete confianzas[abs];
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
      // "Sin responder" queda marcado solo cuando la pregunta YA se tocó
      // (existe la llave) y su valor es explícitamente null — no cuando
      // simplemente nadie la ha contestado todavía.
      const blankBtn = card.querySelector('.blank-btn');
      if (blankBtn) {
        const enBlanco = abs in respuestas && respuestas[abs] == null;
        blankBtn.style.background = enBlanco ? 'var(--warn)' : '';
        blankBtn.style.color = enBlanco ? '#fff' : '';
      }
      // Confianza baja (marca detectada por foto, pero dudosa) -> resalta
      // la tarjeta para que se revise con más atención antes de guardar.
      const dudosa = confianzas[abs] !== undefined && confianzas[abs] < 0.45;
      card.classList.toggle('omr-baja-confianza', dudosa);
    });
    // No contar como "respondida" una pregunta que la detección por foto
    // marcó explícitamente en blanco (letra null) — sigue sin contestar.
    const contestadas = Object.values(respuestas).filter(v => v != null).length;
    box.querySelector('#sc-progress').textContent = `${contestadas} / ${total} respondidas`;
  }

  box.querySelectorAll('.opt-btn').forEach(btn => {
    btn.onclick = () => marcar(parseInt(btn.closest('[data-q]').dataset.q), btn.dataset.letra);
  });

  // Botón explícito para dejar una pregunta sin responder a propósito
  // (cuenta como no contestada/cero, igual que si nunca se hubiera
  // tocado) — para cuando la hoja física de verdad trae una pregunta en
  // blanco y se quiere confirmar eso a mano en vez de solo no tocar nada.
  box.querySelectorAll('.blank-btn').forEach(btn => {
    btn.onclick = () => marcar(parseInt(btn.closest('[data-q]').dataset.q), null);
  });

  box.querySelectorAll('.omr-btn').forEach(btn => {
    btn.onclick = () => {
      const desde = parseInt(btn.dataset.desde), hasta = parseInt(btn.dataset.hasta);
      const numFilas = hasta - desde + 1;
      _abrirModalOMR(numFilas, (detecciones) => {
        detecciones.forEach((d, i) => marcar(desde + i, d.letra, d.confianza));
        const dudosas = detecciones.filter(d => d.confianza < 0.45).length;
        toast(dudosas
          ? `${detecciones.length} respuesta(s) detectada(s) — ${dudosas} marcada(s) en naranja para revisar bien.`
          : `${detecciones.length} respuesta(s) detectada(s). Revísalas antes de guardar.`, dudosas ? 'warn' : 'ok');
      });
    };
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
