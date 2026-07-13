import { store, AREAS, NIVELES } from '../services/store.js';

const NIVEL_LABEL = { BAJO: 'Bajo', 'BÁSICO': 'Básico', ALTO: 'Alto', SUPERIOR: 'Superior' };
const NIVEL_COLOR = { BAJO: 'var(--bajo)', 'BÁSICO': 'var(--bas)', ALTO: 'var(--alto)', SUPERIOR: 'var(--sup)' };
const NIVEL_HEX   = { BAJO: '#ef4444', 'BÁSICO': '#f59e0b', ALTO: '#22d3ee', SUPERIOR: '#4ade80' };
const SEM_LABEL = { S1: 'Primer Semestre', S2: 'Segundo Semestre' };
const AREA_SHORT = {
  'Matemáticas': 'Mat', 'Ciencias Naturales': 'C.Nat', 'Inglés': 'Ing',
  'Competencias Ciudadanas': 'C.Ciu', 'Lectura Crítica': 'L.Crít', 'Español': 'Esp',
};

let _grado = null, _year = null, _tab = 'resumen';

export function renderAnalisis(root) {
  const espacios = store.listEspaciosAnalisis();
  if (_grado === null) {
    const ultimo = espacios[espacios.length - 1];
    _grado = ultimo ? ultimo.grado : 6;
    _year = ultimo ? ultimo.year : 2026;
  }

  const years = new Set(store.listEvaluaciones().map(e => e.year));
  years.add(_year);

  root.innerHTML = `
    <h1>📈 Análisis</h1>
    <p class="subtitle">Distribución de desempeño, comparativo entre semestres y alertas — calculado automáticamente a partir de los resultados ya digitalizados en Escaneo. No hay que digitar nada aparte; esto solo lee lo que ya se calificó.</p>

    <div class="card">
      <div class="form-row">
        <select id="an-grado">${[2,3,4,5,6,7,8,9,10,11].map(g => `<option value="${g}" ${g === _grado ? 'selected' : ''}>Grado ${g}°</option>`).join('')}</select>
        <select id="an-year">${Array.from(years).sort().map(y => `<option value="${y}" ${y === _year ? 'selected' : ''}>${y}</option>`).join('')}</select>
      </div>
    </div>

    <div class="an-nav" id="an-nav"></div>
    <div id="an-body"></div>
  `;

  root.querySelector('#an-grado').onchange = (e) => { _grado = parseInt(e.target.value); renderAnalisis(root); };
  root.querySelector('#an-year').onchange = (e) => { _year = parseInt(e.target.value); renderAnalisis(root); };

  _buildNav(root);
}

function _buildNav(root) {
  const agg = store.analisisAgregado(_grado, _year);
  const hasS1 = _hasDatos(agg, 'S1');
  const hasS2 = _hasDatos(agg, 'S2');
  const tabs = [
    { id: 'resumen', lbl: '📈 Resumen' },
    { id: 'competencias', lbl: '📋 Por Competencia' },
    ...(hasS1 ? [{ id: 's1', lbl: '1er Semestre' }] : []),
    ...(hasS2 ? [{ id: 's2', lbl: '2do Semestre' }] : []),
    ...(hasS1 && hasS2 ? [{ id: 'cmp', lbl: '⚖️ Comparativo' }] : []),
    { id: 'final', lbl: '🏁 Análisis Final' },
    { id: 'alertas', lbl: '🔔 Alertas' },
  ];
  if (!tabs.find(t => t.id === _tab)) _tab = 'resumen';
  root.querySelector('#an-nav').innerHTML = tabs.map(t => `<div class="an-navt ${t.id === _tab ? 'on' : ''}" data-tab="${t.id}">${t.lbl}</div>`).join('');
  root.querySelectorAll('.an-navt').forEach(el => el.onclick = () => {
    _tab = el.dataset.tab;
    _buildNav(root);
  });
  _renderTab(root, agg);
}

function _renderTab(root, agg) {
  const body = root.querySelector('#an-body');
  if (_tab === 'resumen') _tabResumen(body, agg);
  else if (_tab === 'competencias') _tabCompetencias(body, agg);
  else if (_tab === 's1') _tabSemestre(body, agg, 'S1');
  else if (_tab === 's2') _tabSemestre(body, agg, 'S2');
  else if (_tab === 'cmp') _tabComparativo(body, agg);
  else if (_tab === 'final') _tabFinal(body, agg);
  else if (_tab === 'alertas') _tabAlertas(body, agg);
}

// ── Helpers de agregación ────────────────────────────────────────────
function _sumBuckets(...bs) {
  const r = { BAJO: 0, 'BÁSICO': 0, ALTO: 0, SUPERIOR: 0 };
  bs.forEach(b => NIVELES.forEach(n => r[n] += (b?.[n] || 0)));
  return r;
}
function _sumNivel(b) { return NIVELES.reduce((s, n) => s + (b?.[n] || 0), 0); }
function _pct(n, t) { return t > 0 ? (n / t * 100).toFixed(1) : '0.0'; }
function _algunDato(b) { return _sumNivel(b) > 0; }
function _hasDatos(agg, sem) { return AREAS.some(a => _algunDato(agg[a][sem])); }
function _esc(s) { const d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }

// ── Tabs ──────────────────────────────────────────────────────────────
function _tabResumen(body, agg) {
  const combinado = {};
  AREAS.forEach(a => { combinado[a] = _sumBuckets(agg[a].S1, agg[a].S2); });
  const total = _sumBuckets(...AREAS.map(a => combinado[a]));
  const T = _sumNivel(total);
  const extra = store.analisisResumenExtra(_grado, _year);

  if (!T) {
    body.innerHTML = `<div class="an-empty">📭 Todavía no hay resultados calificados para Grado ${_grado}° · ${_year}.<br>Esto se llena solo, a medida que se escaneen y califiquen hojas de respuesta en "Escaneo".</div>`;
    return;
  }

  body.innerHTML = `
    <div class="an-krow">
      <div class="an-kpi" style="--c:var(--acc2)"><div class="kl">Resultados</div><div class="kv">${extra.totalResultados}</div><div class="ks">${extra.estudiantesUnicos} estudiante(s) · ${extra.cursosUnicos} curso(s)</div></div>
      <div class="an-kpi" style="--c:var(--bajo)"><div class="kl">Nivel Bajo</div><div class="kv">${_pct(total.BAJO, T)}%</div><div class="ks">${total.BAJO} reg.</div></div>
      <div class="an-kpi" style="--c:var(--bas)"><div class="kl">Nivel Básico</div><div class="kv">${_pct(total['BÁSICO'], T)}%</div><div class="ks">${total['BÁSICO']} reg.</div></div>
      <div class="an-kpi" style="--c:var(--alto)"><div class="kl">Nivel Alto</div><div class="kv">${_pct(total.ALTO, T)}%</div><div class="ks">${total.ALTO} reg.</div></div>
      <div class="an-kpi" style="--c:var(--sup)"><div class="kl">Nivel Superior</div><div class="kv">${_pct(total.SUPERIOR, T)}%</div><div class="ks">${total.SUPERIOR} reg.</div></div>
      <div class="an-kpi" style="--c:var(--acc)"><div class="kl">Aprobación</div><div class="kv">${_pct(total['BÁSICO'] + total.ALTO + total.SUPERIOR, T)}%</div><div class="ks">Bás+Alt+Sup</div></div>
    </div>
    <div class="an-cgrid">
      <div class="an-cc full"><div class="an-ct">Distribución por área</div>${_stackedBarHTML(combinado)}</div>
      <div class="an-cc"><div class="an-ct">Distribución general</div>${_donutSVG(total.BAJO, total['BÁSICO'], total.ALTO, total.SUPERIOR)}</div>
      <div class="an-cc"><div class="an-ct">Índice por área (0–100)</div><canvas id="an-radar" width="300" height="265" style="max-width:100%"></canvas></div>
    </div>
  `;
  setTimeout(() => _drawRadar(combinado), 30);
}

function _tabSemestre(body, agg, sem) {
  const porArea = {};
  AREAS.forEach(a => { porArea[a] = agg[a][sem]; });
  const total = _sumBuckets(...AREAS.map(a => porArea[a]));
  const T = _sumNivel(total);
  if (!T) {
    body.innerHTML = `<div class="an-empty">📭 Sin resultados para ${SEM_LABEL[sem]} — Grado ${_grado}° · ${_year}.</div>`;
    return;
  }
  let html = `
    <div class="an-krow">
      <div class="an-kpi" style="--c:var(--acc2)"><div class="kl">Resultados</div><div class="kv">${T}</div></div>
      <div class="an-kpi" style="--c:var(--bajo)"><div class="kl">Bajo</div><div class="kv">${_pct(total.BAJO, T)}%</div></div>
      <div class="an-kpi" style="--c:var(--bas)"><div class="kl">Básico</div><div class="kv">${_pct(total['BÁSICO'], T)}%</div></div>
      <div class="an-kpi" style="--c:var(--alto)"><div class="kl">Alto</div><div class="kv">${_pct(total.ALTO, T)}%</div></div>
      <div class="an-kpi" style="--c:var(--sup)"><div class="kl">Superior</div><div class="kv">${_pct(total.SUPERIOR, T)}%</div></div>
    </div>
    <div class="an-cc full" style="margin-bottom:1rem"><div class="an-ct">Distribución por área — ${SEM_LABEL[sem]}</div>${_stackedBarHTML(porArea)}</div>
  `;
  AREAS.forEach(area => {
    if (!_algunDato(porArea[area])) return;
    html += `
      <div class="an-panel">
        <div class="an-panel-title">📚 ${area}</div>
        <label style="font-size:.78rem;color:var(--txt2);display:block;margin-bottom:.3rem">Análisis — ${area} (${SEM_LABEL[sem]})</label>
        <textarea class="an-ta" data-tipo="${sem}" data-area="${area}" placeholder="Escribe el análisis de ${area}...">${_esc(store.getAnalisisTexto(_grado, _year, sem, area))}</textarea>
      </div>`;
  });
  body.innerHTML = html;
  _wireTextareas(body);
}

function _tabComparativo(body, agg) {
  const s1Total = _sumBuckets(...AREAS.map(a => agg[a].S1));
  const s2Total = _sumBuckets(...AREAS.map(a => agg[a].S2));
  let html = `
    <div class="an-cgrid" style="margin-bottom:.3rem">
      <div class="an-cc"><div class="an-ct">Primer Semestre (${_sumNivel(s1Total)} reg.)</div>${_donutSVG(s1Total.BAJO, s1Total['BÁSICO'], s1Total.ALTO, s1Total.SUPERIOR)}</div>
      <div class="an-cc"><div class="an-ct">Segundo Semestre (${_sumNivel(s2Total)} reg.)</div>${_donutSVG(s2Total.BAJO, s2Total['BÁSICO'], s2Total.ALTO, s2Total.SUPERIOR)}</div>
    </div>
  `;
  AREAS.forEach(area => {
    const b1 = agg[area].S1, b2 = agg[area].S2;
    if (!_algunDato(b1) && !_algunDato(b2)) return;
    const t1 = _sumNivel(b1) || 1, t2 = _sumNivel(b2) || 1;
    const deltaHTML = NIVELES.map(n => {
      const d = (b2[n] || 0) - (b1[n] || 0);
      const sign = d >= 0 ? '+' : '';
      const bueno = n === 'BAJO' ? d <= 0 : d >= 0;
      return `<span style="font-size:.72rem;color:var(--txt2)">${NIVEL_LABEL[n]}: <b style="color:${bueno ? 'var(--sup)' : 'var(--bajo)'}">${sign}${d}</b></span>`;
    }).join('');
    html += `
      <div class="an-panel">
        <div class="an-panel-title">⚖️ ${area}</div>
        <div style="font-size:.75rem;color:var(--txt2);margin-bottom:.3rem">1er Semestre</div>
        <div class="an-sbt" style="height:22px;margin-bottom:.6rem">${NIVELES.map(n => { const p = (b1[n] || 0) / t1 * 100; return `<div class="an-sbs" style="width:${p.toFixed(1)}%;background:${NIVEL_COLOR[n]}">${p > 10 ? p.toFixed(0) + '%' : ''}</div>`; }).join('')}</div>
        <div style="font-size:.75rem;color:var(--txt2);margin-bottom:.3rem">2do Semestre</div>
        <div class="an-sbt" style="height:22px">${NIVELES.map(n => { const p = (b2[n] || 0) / t2 * 100; return `<div class="an-sbs" style="width:${p.toFixed(1)}%;background:${NIVEL_COLOR[n]}">${p > 10 ? p.toFixed(0) + '%' : ''}</div>`; }).join('')}</div>
        <div style="display:flex;gap:.8rem;flex-wrap:wrap;margin-top:.6rem">${deltaHTML}</div>
        <label style="font-size:.78rem;color:var(--txt2);display:block;margin:.9rem 0 .3rem">Comparativo — ${area}</label>
        <textarea class="an-ta" data-tipo="CMP" data-area="${area}" placeholder="Escribe el comparativo para ${area}...">${_esc(store.getAnalisisTexto(_grado, _year, 'CMP', area))}</textarea>
      </div>
    `;
  });
  body.innerHTML = html;
  _wireTextareas(body);
}

function _tabFinal(body, agg) {
  const hasS1 = _hasDatos(agg, 'S1'), hasS2 = _hasDatos(agg, 'S2');
  let html = `<p style="font-size:.8rem;color:var(--txt2);margin-bottom:1rem">Consolidado de lo escrito en cada semestre y en el comparativo, más la conclusión final del año por área.</p>`;
  AREAS.forEach(area => {
    const t1 = store.getAnalisisTexto(_grado, _year, 'S1', area);
    const t2 = store.getAnalisisTexto(_grado, _year, 'S2', area);
    const tc = store.getAnalisisTexto(_grado, _year, 'CMP', area);
    const filas = [];
    if (t1) filas.push({ lbl: '1er Sem.', texto: t1 });
    if (t2) filas.push({ lbl: '2do Sem.', texto: t2 });
    if (tc) filas.push({ lbl: 'Comparativo', texto: tc });

    html += `<div class="an-panel"><div class="an-panel-title">📚 ${area}</div>`;
    if (!filas.length) {
      html += `<div class="an-empty" style="padding:1rem">Aún no hay análisis redactado para esta área.</div>`;
    } else {
      html += filas.map(f => `<div style="background:var(--surf2);border-radius:8px;padding:.6rem .8rem;margin-bottom:.5rem"><div style="font-size:.72rem;font-weight:700;color:var(--acc2);margin-bottom:.2rem">${f.lbl}</div><div style="font-size:.82rem;line-height:1.55">${_esc(f.texto)}</div></div>`).join('');
    }
    if (hasS1 && hasS2) {
      html += `<label style="font-size:.78rem;color:var(--txt2);display:block;margin-top:.8rem">🏁 Análisis Final — ${area}</label>
        <textarea class="an-ta" data-tipo="FINAL" data-area="${area}" placeholder="Conclusión final del año para ${area}...">${_esc(store.getAnalisisTexto(_grado, _year, 'FINAL', area))}</textarea>`;
    } else {
      html += `<div class="an-empty" style="padding:.8rem;margin-top:.6rem">El Análisis Final se habilita cuando hay resultados de Primer y Segundo Semestre.</div>`;
    }
    html += `</div>`;
  });
  body.innerHTML = html;
  _wireTextareas(body);
}

function _tabCompetencias(body, agg) {
  let html = `
    <p style="font-size:.8rem;color:var(--txt2);margin-bottom:1rem">
      Vista por competencia (máximo 2 por asignatura, como en "Pruebas Semestrales") — las barras salen
      solas de los resultados ya escaneados; el análisis de cada competencia lo redacta el docente,
      igual que antes.
    </p>
  `;
  AREAS.forEach(area => {
    const compNames = (agg[area].ordenCompetencias || []).slice(0, 2);
    html += `<div class="an-panel"><div class="an-panel-title">📚 ${area}</div>`;
    if (!compNames.length) {
      html += `<div class="an-empty" style="padding:1rem">Aún no hay preguntas con una competencia asignada en esta área — se llena sola cuando el docente escriba la competencia al crear sus preguntas.</div>`;
    } else {
      compNames.forEach((comp, idx) => {
        const bucket = agg[area].competencias[comp];
        html += `<div style="${idx > 0 ? 'border-top:1px solid var(--bord);padding-top:1rem;margin-top:1rem' : ''}">
          <div style="font-weight:700;font-size:.85rem;color:var(--acc2);margin-bottom:.7rem">C${idx + 1} — ${_esc(comp)}</div>
          ${['S1', 'S2'].map(sem => {
            const b = bucket[sem];
            const T = _sumNivel(b);
            const areaKey = `${area}__${comp}`;
            if (!T) {
              return `<div style="font-size:.78rem;color:var(--txt2);margin-bottom:.9rem">${SEM_LABEL[sem]}: sin resultados todavía.</div>`;
            }
            return `
              <div style="font-size:.76rem;color:var(--txt2);margin-bottom:.3rem">${SEM_LABEL[sem]} (${T} reg.)</div>
              <div class="an-sbt" style="height:22px;margin-bottom:.5rem">${NIVELES.map(n => { const p = (b[n] || 0) / T * 100; return `<div class="an-sbs" style="width:${p.toFixed(1)}%;background:${NIVEL_COLOR[n]}">${p > 10 ? p.toFixed(0) + '%' : ''}</div>`; }).join('')}</div>
              <label style="font-size:.76rem;color:var(--txt2);display:block;margin:.4rem 0 .2rem">Análisis — ${SEM_LABEL[sem]}</label>
              <textarea class="an-ta" data-tipo="${sem}" data-area="${areaKey}" placeholder="Escribe el análisis de esta competencia...">${_esc(store.getAnalisisTexto(_grado, _year, sem, areaKey))}</textarea>
            `;
          }).join('')}
        </div>`;
      });
    }
    html += `</div>`;
  });
  body.innerHTML = html;
  _wireTextareas(body);
}

function _tabAlertas(body, agg) {
  const alerts = [];
  AREAS.forEach(area => {
    ['S1', 'S2'].forEach(sem => {
      const b = agg[area][sem];
      const T = _sumNivel(b);
      if (!T) return;
      const pB = b.BAJO / T * 100, pH = (b.ALTO + b.SUPERIOR) / T * 100;
      const lbl = `${area} — ${SEM_LABEL[sem]}`;
      if (pB > 70) alerts.push({ c: 'var(--bajo)', icon: '🔴', title: `Crítico — ${lbl}`, desc: `${pB.toFixed(1)}% en Nivel Bajo. Intervención urgente.` });
      else if (pB > 50) alerts.push({ c: 'var(--bas)', icon: '🟡', title: `Atención — ${lbl}`, desc: `${pB.toFixed(1)}% en Nivel Bajo. Revisar estrategias.` });
      if (pH > 30) alerts.push({ c: 'var(--sup)', icon: '🟢', title: `Fortaleza — ${lbl}`, desc: `${pH.toFixed(1)}% en Nivel Alto o Superior.` });
    });
  });
  if (!alerts.length) alerts.push({ c: 'var(--acc2)', icon: 'ℹ️', title: 'Sin alertas', desc: 'No se detectaron patrones de alerta con los resultados actuales.' });
  body.innerHTML = `
    <p style="font-size:.8rem;color:var(--txt2);margin-bottom:.9rem">Bajo &gt;50% → Atención · Bajo &gt;70% → Crítico · Alto+Superior &gt;30% → Fortaleza</p>
    ${alerts.map(a => `<div class="an-alert" style="--c:${a.c}"><div style="font-size:1.3rem">${a.icon}</div><div><div class="ai-title">${a.title}</div><div class="ai-desc">${a.desc}</div></div></div>`).join('')}
  `;
}

function _wireTextareas(body) {
  body.querySelectorAll('.an-ta[data-tipo]').forEach(ta => {
    ta.oninput = () => store.setAnalisisTexto(_grado, _year, ta.dataset.tipo, ta.dataset.area, ta.value);
  });
}

// ── Gráficos (SVG/canvas puros, sin librerías externas) ────────────────
function _legendHTML() {
  return `<div class="an-leg">${NIVELES.map(n => `<div class="li"><div class="ld" style="background:${NIVEL_COLOR[n]}"></div>${NIVEL_LABEL[n]}</div>`).join('')}</div>`;
}

function _stackedBarHTML(porAreaCounts) {
  let h = '';
  AREAS.forEach(area => {
    const st = porAreaCounts[area] || { BAJO: 0, 'BÁSICO': 0, ALTO: 0, SUPERIOR: 0 };
    const T = _sumNivel(st) || 1;
    const hi = ((st.ALTO + st.SUPERIOR) / T * 100).toFixed(0);
    h += `<div class="an-sbrow"><div title="${area}">${area}</div>
      <div class="an-sbt">${NIVELES.map(n => { const p = (st[n] || 0) / T * 100; return `<div class="an-sbs" style="width:${p.toFixed(1)}%;background:${NIVEL_COLOR[n]}" title="${NIVEL_LABEL[n]}: ${p.toFixed(1)}%">${p > 10 ? p.toFixed(0) + '%' : ''}</div>`; }).join('')}</div>
      <div style="text-align:right;color:var(--txt2)">${hi}%↑</div></div>`;
  });
  return `<div>${h}${_legendHTML()}</div>`;
}

function _donutSVG(B, Ba, A, S) {
  const T = B + Ba + A + S;
  const Tsafe = T || 1;
  const segs = [
    { l: 'Bajo', v: B, c: NIVEL_HEX.BAJO }, { l: 'Básico', v: Ba, c: NIVEL_HEX['BÁSICO'] },
    { l: 'Alto', v: A, c: NIVEL_HEX.ALTO }, { l: 'Superior', v: S, c: NIVEL_HEX.SUPERIOR },
  ];
  const cx = 80, cy = 80, r = 65, ri = 40;
  let angle = -Math.PI / 2, paths = '';
  segs.forEach(sg => {
    if (!sg.v) return;
    const sw = sg.v / Tsafe * 2 * Math.PI;
    const x1 = cx + r * Math.cos(angle), y1 = cy + r * Math.sin(angle);
    const x2 = cx + r * Math.cos(angle + sw), y2 = cy + r * Math.sin(angle + sw);
    const xi1 = cx + ri * Math.cos(angle), yi1 = cy + ri * Math.sin(angle);
    const xi2 = cx + ri * Math.cos(angle + sw), yi2 = cy + ri * Math.sin(angle + sw);
    const lg = sw > Math.PI ? 1 : 0;
    paths += `<path d="M${xi1},${yi1}L${x1},${y1}A${r},${r} 0 ${lg},1 ${x2},${y2}L${xi2},${yi2}A${ri},${ri} 0 ${lg},0 ${xi1},${yi1}" fill="${sg.c}" opacity=".92"><title>${sg.l}: ${sg.v} (${(sg.v / Tsafe * 100).toFixed(1)}%)</title></path>`;
    angle += sw;
  });
  const pH = T ? ((A + S) / T * 100).toFixed(1) : '0.0';
  return `<div class="an-dwrap"><svg width="160" height="160" viewBox="0 0 160 160">${paths}
    <text x="80" y="76" text-anchor="middle" fill="#e8ecf5" font-size="16" font-weight="800">${pH}%</text>
    <text x="80" y="93" text-anchor="middle" fill="#93a3c2" font-size="8">Alto+Superior</text>
  </svg>
  <div class="an-dleg">${segs.map(s => `<div class="an-dr"><span><span class="dd" style="background:${s.c}"></span>${s.l}</span><span>${s.v} (${T ? (s.v / T * 100).toFixed(1) : '0.0'}%)</span></div>`).join('')}</div></div>`;
}

function _drawRadar(porAreaCombined) {
  const canvas = document.getElementById('an-radar');
  if (!canvas) return;
  const dpr = window.devicePixelRatio || 1;
  const lW = 300, lH = 265;
  canvas.width = lW * dpr; canvas.height = lH * dpr;
  canvas.style.width = lW + 'px'; canvas.style.height = lH + 'px';
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  const labels = AREAS.map(a => AREA_SHORT[a] || a.slice(0, 4));
  const scores = AREAS.map(area => {
    const st = porAreaCombined[area] || { BAJO: 0, 'BÁSICO': 0, ALTO: 0, SUPERIOR: 0 };
    const t = _sumNivel(st);
    if (!t) return 0;
    const num = st['BÁSICO'] + st.ALTO * 2 + st.SUPERIOR * 3;
    return num / (t * 3) * 100;
  });
  const W = lW, H = lH, cx = W / 2, cy = H / 2, maxR = Math.min(cx, cy) - 32, n = labels.length;
  ctx.clearRect(0, 0, W, H);
  ctx.strokeStyle = '#2e3350'; ctx.lineWidth = 1;
  [.25, .5, .75, 1].forEach(t => {
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const a = (i / n) * 2 * Math.PI - Math.PI / 2;
      const x = cx + Math.cos(a) * maxR * t, y = cy + Math.sin(a) * maxR * t;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.closePath(); ctx.stroke();
  });
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 2 * Math.PI - Math.PI / 2;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * maxR, cy + Math.sin(a) * maxR); ctx.stroke();
  }
  ctx.beginPath();
  scores.forEach((s, i) => {
    const a = (i / n) * 2 * Math.PI - Math.PI / 2, rr = s / 100 * maxR;
    const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.closePath();
  ctx.fillStyle = 'rgba(59,130,246,.22)'; ctx.fill();
  ctx.strokeStyle = '#3b82f6'; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = '#93a3c2'; ctx.font = '11px system-ui'; ctx.textAlign = 'center';
  labels.forEach((l, i) => {
    const a = (i / n) * 2 * Math.PI - Math.PI / 2;
    ctx.fillText(l, cx + Math.cos(a) * (maxR + 22), cy + Math.sin(a) * (maxR + 22) + 4);
  });
  ctx.fillStyle = '#3b82f6'; ctx.font = 'bold 9px system-ui';
  scores.forEach((s, i) => {
    const a = (i / n) * 2 * Math.PI - Math.PI / 2, rr = s / 100 * maxR;
    ctx.fillText(s.toFixed(0) + '%', cx + Math.cos(a) * rr, cy + Math.sin(a) * rr - 4);
  });
}
