// ════════════════════════════════════════════════════════════════════
//  modules/informes.js — cierre de año: informe anual congelado,
//  asistente para empezar el año siguiente, y plantilla de plan de
//  mejoramiento (diagnóstico automático + espacio para que el colegio
//  escriba las acciones).
// ════════════════════════════════════════════════════════════════════
import { store, AREAS, NIVELES, escHTML } from '../services/store.js';
import { toast } from '../app.js';

const NIVEL_LABEL = { BAJO: 'Bajo', 'BÁSICO': 'Básico', ALTO: 'Alto', SUPERIOR: 'Superior' };
const NIVEL_COLOR = { BAJO: 'var(--bajo)', 'BÁSICO': 'var(--bas)', ALTO: 'var(--alto)', SUPERIOR: 'var(--sup)' };

let _tab = 'informes';

export function renderInformes(root) {
  root.innerHTML = `
    <h1>📁 Informes y cierre de año</h1>
    <p class="subtitle">Guarda una foto fija de los resultados del año, compárala con años anteriores, y arma el punto de partida para el plan de mejoramiento.</p>
    <div class="an-nav" id="if-nav"></div>
    <div id="if-body"></div>
  `;
  _buildNav(root);
}

function _buildNav(root) {
  const tabs = [
    { id: 'informes', lbl: '📊 Informes anuales' },
    { id: 'nuevoanio', lbl: '🔄 Año nuevo' },
    { id: 'mejoramiento', lbl: '🎯 Plan de mejoramiento' },
  ];
  root.querySelector('#if-nav').innerHTML = tabs.map(t => `<div class="an-navt ${t.id === _tab ? 'on' : ''}" data-tab="${t.id}">${t.lbl}</div>`).join('');
  root.querySelectorAll('.an-navt').forEach(el => el.onclick = () => { _tab = el.dataset.tab; _buildNav(root); });

  const body = root.querySelector('#if-body');
  if (_tab === 'informes') _tabInformes(root, body);
  else if (_tab === 'nuevoanio') _tabNuevoAnio(root, body);
  else if (_tab === 'mejoramiento') _tabMejoramiento(root, body);
}

// ── Pestaña: Informes anuales ──────────────────────────────────────
function _tabInformes(root, body) {
  const informes = store.listInformesAnuales();
  const aniosConDatos = [...new Set(store.listEvaluaciones().map(e => e.year))].sort((a, b) => b - a);

  body.innerHTML = `
    <div class="card">
      <h2 style="margin-top:0">➕ Generar / actualizar informe de un año</h2>
      <p style="font-size:.78rem;color:var(--txt2);margin:0 0 .7rem">
        Congela una foto de los resultados de ese año (por grado y por área) tal como están ahora mismo.
        Si ya existe un informe para ese año, se reemplaza con los datos más recientes — no se acumulan duplicados.
      </p>
      <div class="form-row">
        <select id="if-year-gen">${aniosConDatos.map(y => `<option value="${y}">${y}</option>`).join('') || '<option value="2026">2026</option>'}</select>
        <button class="btn" id="if-generar">📊 Generar informe</button>
      </div>
    </div>

    <h2 style="margin-top:1.4rem">Informes guardados (${informes.length})</h2>
    ${!informes.length ? '<div class="empty">Todavía no hay ningún informe anual guardado.</div>' : `
      <div class="grid grid-2">
        ${informes.map(inf => `
          <div class="card">
            <h3 style="margin:0 0 .4rem">${inf.year}</h3>
            <p style="font-size:.78rem;color:var(--txt2);margin:0 0 .6rem">
              Generado el ${new Date(inf.generado_en).toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' })} ·
              ${inf.porGrado.length} grado(s) · ${inf.totalRegistros} registro(s)
            </p>
            <p style="font-size:.9rem;margin:0 0 .8rem"><b>${inf.aprobacion.toFixed(1)}%</b> de aprobación general (Básico+Alto+Superior)</p>
            <div class="form-row">
              <button class="btn sec sm" data-ver="${inf.id}">Ver detalle</button>
              <button class="btn sec sm" data-del-inf="${inf.id}">🗑 Borrar</button>
            </div>
          </div>
        `).join('')}
      </div>
    `}
    <div id="if-detalle"></div>
  `;

  root.querySelector('#if-generar').onclick = () => {
    const year = root.querySelector('#if-year-gen').value;
    const inf = store.generarInformeAnual(year);
    toast(`Informe de ${inf.year} generado — ${inf.totalRegistros} registro(s) en ${inf.porGrado.length} grado(s).`);
    _tabInformes(root, body);
  };

  body.querySelectorAll('[data-ver]').forEach(b => b.onclick = () => {
    const inf = informes.find(i => i.id === b.dataset.ver);
    _mostrarDetalleInforme(body, inf);
  });
  body.querySelectorAll('[data-del-inf]').forEach(b => b.onclick = () => {
    if (!confirm('¿Borrar este informe guardado? No se puede deshacer (pero puedes volver a generarlo si los datos originales siguen ahí).')) return;
    store.deleteInformeAnual(b.dataset.delInf);
    toast('Informe borrado.');
    _tabInformes(root, body);
  });
}

function _mostrarDetalleInforme(body, inf) {
  const det = body.querySelector('#if-detalle');
  det.innerHTML = `
    <div class="card" style="margin-top:1rem;border:2px solid var(--acc)">
      <h2 style="margin-top:0">📊 Informe anual ${inf.year}</h2>
      <p style="font-size:.8rem;color:var(--txt2)">Congelado el ${new Date(inf.generado_en).toLocaleString('es-CO')} — estos números no cambian aunque los datos originales se actualicen después.</p>
      <div class="an-sbt" style="height:26px;margin:.8rem 0">${NIVELES.map(n => { const p = (inf.niveles[n] || 0) / inf.totalRegistros * 100; return `<div class="an-sbs" style="width:${p.toFixed(1)}%;background:${NIVEL_COLOR[n]}">${p > 8 ? p.toFixed(0) + '%' : ''}</div>`; }).join('')}</div>
      <p style="font-size:.85rem"><b>${inf.aprobacion.toFixed(1)}%</b> de aprobación general (${inf.totalRegistros} registros en total, ${inf.porGrado.length} grados)</p>

      ${inf.porGrado.map(g => `
        <div class="an-panel" style="margin-top:1rem">
          <div class="an-panel-title">Grado ${g.grado}° — ${g.aprobacion.toFixed(1)}% aprobación (${g.total} reg.)</div>
          ${g.porArea.map(a => `
            <div style="margin-bottom:.6rem">
              <div style="font-size:.78rem;color:var(--txt2);margin-bottom:.2rem">${escHTML(a.area)} (${a.total} reg.)</div>
              <div class="an-sbt" style="height:18px">${NIVELES.map(n => { const p = (a.niveles[n] || 0) / a.total * 100; return `<div class="an-sbs" style="width:${p.toFixed(1)}%;background:${NIVEL_COLOR[n]}">${p > 12 ? p.toFixed(0) + '%' : ''}</div>`; }).join('')}</div>
            </div>
          `).join('')}
        </div>
      `).join('')}
    </div>
  `;
  det.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ── Pestaña: Año nuevo ─────────────────────────────────────────────
function _tabNuevoAnio(root, body) {
  const cursos = store.listCursos();
  const aniosExistentes = [...new Set(cursos.map(c => c.year))].sort((a, b) => b - a);
  const anioBase = aniosExistentes[0] || 2026;
  const cursosDelAnioBase = cursos.filter(c => c.year === anioBase);

  body.innerHTML = `
    <div class="card">
      <h2 style="margin-top:0">🔄 Preparar el año siguiente</h2>
      <p style="font-size:.8rem;color:var(--txt2);line-height:1.6;margin:0 0 .8rem">
        No hace falta "reiniciar" nada — los datos de cada año quedan guardados por separado (cada curso y evaluación
        ya tiene su año), así que ${anioBase} sigue disponible tal cual aunque empieces a cargar el año nuevo.
        Este asistente crea los <b>cursos</b> del año nuevo a partir de los de ${anioBase} (subiendo de grado o
        manteniéndolo, como seleccionas) — los estudiantes de cada curso NO se copian automáticamente, porque la
        plataforma no sabe quién realmente fue promovido, quién repite o quién es nuevo. Sube esa lista real con el
        importador de Excel de Institucional, sobre los cursos que se crean aquí.
      </p>
      <div class="form-row">
        <select id="if-curso-base">${aniosExistentes.map(y => `<option value="${y}">Usar los cursos de ${y} como base</option>`).join('')}</select>
        <input id="if-year-nuevo" type="number" value="${anioBase + 1}" style="max-width:120px" title="Año nuevo">
      </div>
      <div class="form-row" style="margin-top:.5rem;align-items:center">
        <label style="display:flex;align-items:center;gap:.4rem;font-size:.85rem">
          <input type="checkbox" id="if-subir-grado" checked> Subir cada curso un grado (promoción normal — desmarca si vas a repetir el mismo grado)
        </label>
      </div>
      <div id="if-preview-cursos" style="margin:.8rem 0;font-size:.82rem;color:var(--txt2)"></div>
      <button class="btn" id="if-crear-cursos">Crear cursos del año nuevo</button>
    </div>

    <div class="card" style="margin-top:1rem">
      <h2 style="margin-top:0">📝 Copiar evaluaciones al año nuevo</h2>
      <p style="font-size:.8rem;color:var(--txt2);margin:0 0 .7rem">
        A diferencia de los estudiantes, las preguntas sí tiene sentido reutilizarlas — copia el banco completo
        (con sus niveles) para no volver a digitarlo. Quedan como borrador en el año nuevo para que cada docente
        las revise y ajuste antes de publicarlas.
      </p>
      <div class="form-row">
        <select id="if-eval-grado"><option value="">Todos los grados</option>${[2,3,4,5,6,7,8,9,10,11].map(g => `<option value="${g}">Grado ${g}°</option>`).join('')}</select>
        <select id="if-eval-anio-base">${aniosExistentes.map(y => `<option value="${y}">Copiar evaluaciones de ${y}</option>`).join('')}</select>
        <input id="if-eval-year-nuevo" type="number" value="${anioBase + 1}" style="max-width:120px" title="Año destino">
        <button class="btn sec" id="if-copiar-evals">Copiar evaluaciones</button>
      </div>
    </div>
  `;

  const actualizarPreview = () => {
    const subirGrado = root.querySelector('#if-subir-grado').checked;
    const base = parseInt(root.querySelector('#if-curso-base').value);
    const cursosBase = cursos.filter(c => c.year === base);
    const prev = root.querySelector('#if-preview-cursos');
    if (!cursosBase.length) { prev.innerHTML = `No hay cursos en ${base} para usar de base.`; return; }
    const resumen = cursosBase.map(c => {
      const gradoNuevo = subirGrado ? c.grado + 1 : c.grado;
      return gradoNuevo > 11 ? `Grado ${c.grado}° ${c.paralelo} — ya es Grado 11°, no sube más (revísalo a mano si corresponde a graduados)` : `Grado ${c.grado}° ${c.paralelo} → Grado ${gradoNuevo}° ${c.paralelo}`;
    });
    prev.innerHTML = `Se crearán ${cursosBase.length} curso(s):<br>` + resumen.join('<br>');
  };
  root.querySelector('#if-curso-base').onchange = actualizarPreview;
  root.querySelector('#if-subir-grado').onchange = actualizarPreview;
  actualizarPreview();

  root.querySelector('#if-crear-cursos').onclick = () => {
    const base = parseInt(root.querySelector('#if-curso-base').value);
    const yearNuevo = parseInt(root.querySelector('#if-year-nuevo').value);
    const subirGrado = root.querySelector('#if-subir-grado').checked;
    const cursosBase = cursos.filter(c => c.year === base);
    if (!cursosBase.length) { toast('No hay cursos en ese año base.', 'warn'); return; }
    let creados = 0, omitidos = 0;
    cursosBase.forEach(c => {
      const gradoNuevo = subirGrado ? c.grado + 1 : c.grado;
      if (gradoNuevo > 11) { omitidos++; return; }
      const yaExiste = store.listCursos().some(x => x.grado === gradoNuevo && x.paralelo === c.paralelo && x.year === yearNuevo);
      if (yaExiste) { omitidos++; return; }
      store.addCurso({ grado: gradoNuevo, paralelo: c.paralelo, year: yearNuevo, jornada: c.jornada, seccion: gradoNuevo <= 5 ? 'PRIMARIA' : 'BACHILLERATO' });
      creados++;
    });
    toast(`${creados} curso(s) creado(s) para ${yearNuevo}${omitidos ? `, ${omitidos} omitido(s) (ya existían o pasaban de Grado 11°)` : ''}. Ahora sube la lista real de estudiantes en Institucional.`);
  };

  root.querySelector('#if-copiar-evals').onclick = () => {
    const gradoFiltro = root.querySelector('#if-eval-grado').value;
    const anioBaseEval = parseInt(root.querySelector('#if-eval-anio-base').value);
    const yearDestino = parseInt(root.querySelector('#if-eval-year-nuevo').value);
    const origen = store.listEvaluaciones().filter(e => e.year === anioBaseEval && (!gradoFiltro || e.grado === parseInt(gradoFiltro)));
    if (!origen.length) { toast('No hay evaluaciones para copiar con esos filtros.', 'warn'); return; }
    let evsCreadas = 0, pregsCreadas = 0;
    origen.forEach(ev => {
      const nueva = store.addEvaluacion({ grado: ev.grado, area: ev.area, semestre: ev.semestre, year: yearDestino, docente: ev.docente });
      store.listPreguntas(ev.id).forEach(p => {
        store.addPregunta(nueva.id, {
          enunciado: p.enunciado, competencia: p.competencia, componente: p.componente,
          imagenUrl: p.imagen_url, lecturaTitulo: p.lectura_titulo, lecturaTexto: p.lectura_texto,
          opciones: p.opciones.map(o => ({ texto: o.texto, nivel: o.nivel })), mezclar: false,
        });
        pregsCreadas++;
      });
      evsCreadas++;
    });
    toast(`${evsCreadas} evaluación(es) y ${pregsCreadas} pregunta(s) copiadas a ${yearDestino}, como borrador para revisar antes de publicar.`);
  };
}

// ── Pestaña: Plan de mejoramiento ──────────────────────────────────
function _tabMejoramiento(root, body) {
  const informes = store.listInformesAnuales();
  body.innerHTML = `
    <div class="card">
      <h2 style="margin-top:0">🎯 Plan de mejoramiento</h2>
      <p style="font-size:.8rem;color:var(--txt2);line-height:1.6;margin:0 0 .8rem">
        Esto <b>no</b> escribe el plan por ustedes — genera el diagnóstico (qué áreas y competencias salieron más
        débiles, con los números reales) ya organizado, para que el equipo académico escriba encima las acciones,
        responsables y metas. La parte de datos es automática y confiable; la parte de qué hacer al respecto la
        decide el colegio.
      </p>
      <div class="form-row">
        <select id="mej-informe">${informes.length ? informes.map(i => `<option value="${i.id}">Informe ${i.year}</option>`).join('') : '<option value="">No hay informes guardados</option>'}</select>
        <button class="btn" id="mej-generar" ${!informes.length ? 'disabled' : ''}>Generar diagnóstico</button>
      </div>
      ${!informes.length ? '<p style="font-size:.78rem;color:var(--warn);margin-top:.6rem">Primero genera un informe anual en la pestaña "Informes anuales".</p>' : ''}
    </div>
    <div id="mej-out"></div>
  `;

  const btn = root.querySelector('#mej-generar');
  if (btn) btn.onclick = () => {
    const inf = informes.find(i => i.id === root.querySelector('#mej-informe').value);
    if (!inf) return;
    _mostrarPlanMejoramiento(root.querySelector('#mej-out'), inf);
  };
}

function _mostrarPlanMejoramiento(out, inf) {
  // Mismos umbrales que las Alertas de Análisis: >50% Bajo = Atención,
  // >70% = Crítico; Alto+Superior >30% = Fortaleza — así el diagnóstico
  // de aquí nunca contradice lo que ya se ve en Análisis.
  const hallazgos = [];
  const fortalezas = [];
  inf.porGrado.forEach(g => {
    g.porArea.forEach(a => {
      const pBajo = (a.niveles.BAJO || 0) / a.total * 100;
      const pAltoSup = ((a.niveles.ALTO || 0) + (a.niveles.SUPERIOR || 0)) / a.total * 100;
      if (pBajo > 70) hallazgos.push({ grado: g.grado, area: a.area, nivel: 'Crítico', detalle: `${pBajo.toFixed(0)}% de las respuestas en Nivel Bajo` });
      else if (pBajo > 50) hallazgos.push({ grado: g.grado, area: a.area, nivel: 'Atención', detalle: `${pBajo.toFixed(0)}% de las respuestas en Nivel Bajo` });
      if (pAltoSup > 30) fortalezas.push({ grado: g.grado, area: a.area, detalle: `${pAltoSup.toFixed(0)}% en Alto o Superior` });
    });
  });
  hallazgos.sort((a, b) => (a.nivel === 'Crítico' ? 0 : 1) - (b.nivel === 'Crítico' ? 0 : 1) || a.grado - b.grado);

  out.innerHTML = `
    <div class="card" style="margin-top:1rem;border:2px solid var(--acc)">
      <h2 style="margin-top:0">Plan de mejoramiento institucional — ${inf.year}</h2>
      <p style="font-size:.78rem;color:var(--txt2)">Diagnóstico generado automáticamente a partir del informe anual ${inf.year} · ${inf.totalRegistros} registros en ${inf.porGrado.length} grados.</p>

      <h3>1. Diagnóstico (automático)</h3>
      ${!hallazgos.length ? '<p style="font-size:.85rem;color:var(--ok)">No se encontraron áreas en nivel Crítico o de Atención con los umbrales institucionales — buen punto de partida.</p>' : `
        <table style="width:100%;border-collapse:collapse;font-size:.85rem;margin-bottom:1rem">
          <thead><tr style="text-align:left;border-bottom:2px solid var(--bord)"><th style="padding:.4rem">Grado</th><th style="padding:.4rem">Área</th><th style="padding:.4rem">Nivel</th><th style="padding:.4rem">Detalle</th></tr></thead>
          <tbody>
            ${hallazgos.map(h => `<tr style="border-bottom:1px solid var(--bord)">
              <td style="padding:.4rem">${h.grado}°</td>
              <td style="padding:.4rem">${escHTML(h.area)}</td>
              <td style="padding:.4rem"><span class="badge ${h.nivel === 'Crítico' ? 'bad' : 'warn'}">${h.nivel}</span></td>
              <td style="padding:.4rem;color:var(--txt2)">${h.detalle}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      `}

      ${fortalezas.length ? `
        <h3>2. Fortalezas a mantener (automático)</h3>
        <ul style="font-size:.85rem">${fortalezas.map(f => `<li>Grado ${f.grado}° — ${escHTML(f.area)}: ${f.detalle}</li>`).join('')}</ul>
      ` : ''}

      <h3>${fortalezas.length ? '3' : '2'}. Acciones propuestas <span style="font-weight:400;color:var(--txt2);font-size:.8rem">(a completar por el equipo académico)</span></h3>
      ${hallazgos.length ? hallazgos.map((h, i) => `
        <div style="margin-bottom:.8rem">
          <label style="font-size:.82rem;font-weight:700">Grado ${h.grado}° — ${escHTML(h.area)} (${h.nivel})</label>
          <textarea class="an-ta" data-mej="${inf.year}-${h.grado}-${h.area}" rows="3" placeholder="¿Qué acciones se van a tomar? ¿Quién es responsable? ¿Cuál es la meta para el próximo año?"></textarea>
        </div>
      `).join('') : '<p style="font-size:.82rem;color:var(--txt2)">No hay hallazgos críticos que requieran un plan de acción específico este año.</p>'}

      <p style="font-size:.74rem;color:var(--txt2);margin-top:1rem">Este documento se puede copiar o imprimir (Ctrl/Cmd+P) para incluirlo en el plan de mejoramiento institucional oficial del colegio.</p>
    </div>
  `;
}
