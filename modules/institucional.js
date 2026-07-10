import { store } from '../services/store.js';
import { toast } from '../app.js';

export function renderInstitucional(root) {
  const cursos = store.listCursos();
  root.innerHTML = `
    <h1>🏛️ Institucional</h1>
    <p class="subtitle">Cursos, jornadas, secciones y estudiantes. (El importador masivo de Excel del sistema de Análisis Semestral actual se reutiliza sin cambios — este panel es para crear cursos nuevos que aún no existan allí.)</p>

    <div class="card">
      <h2 style="margin-top:0">➕ Nuevo curso</h2>
      <div class="form-row">
        <select id="nc-grado">${[2,3,4,5,6,7,8,9,10,11].map(g=>`<option value="${g}">Grado ${g}°</option>`).join('')}</select>
        <input id="nc-paralelo" placeholder="Paralelo (ej: 01)" value="01">
        <input id="nc-year" type="number" value="2026">
        <select id="nc-jornada"><option value="MANANA">Mañana</option><option value="TARDE">Tarde</option></select>
        <select id="nc-seccion"><option value="PRIMARIA">Primaria</option><option value="BACHILLERATO" selected>Bachillerato</option></select>
        <button class="btn" id="nc-add">Crear curso</button>
      </div>
    </div>

    <h2>Cursos (${cursos.length})</h2>
    <div class="card" style="padding:0">
      ${cursos.length ? `<table>
        <thead><tr><th>Grado</th><th>Paralelo</th><th>Año</th><th>Jornada</th><th>Sección</th><th>Estudiantes</th><th></th></tr></thead>
        <tbody>${cursos.map(c => `
          <tr>
            <td>${c.grado}°</td><td>${c.paralelo}</td><td>${c.year}</td>
            <td>${c.jornada}</td><td>${c.seccion}</td>
            <td>${store.listEstudiantes(c.id).length}</td>
            <td><button class="btn sm sec" data-open-curso="${c.id}">👥 Estudiantes</button></td>
          </tr>`).join('')}
        </tbody>
      </table>` : `<div class="empty">Aún no hay cursos. Crea el primero arriba.</div>`}
    </div>

    <div id="curso-detail"></div>
  `;

  root.querySelector('#nc-add').onclick = () => {
    const grado = root.querySelector('#nc-grado').value;
    const paralelo = root.querySelector('#nc-paralelo').value.trim() || '01';
    const year = root.querySelector('#nc-year').value;
    const jornada = root.querySelector('#nc-jornada').value;
    const seccion = root.querySelector('#nc-seccion').value;
    store.addCurso({ grado, paralelo, year, jornada, seccion });
    toast('Curso creado.');
    renderInstitucional(root);
  };

  root.querySelectorAll('[data-open-curso]').forEach(btn => {
    btn.onclick = () => renderCursoDetail(root, btn.dataset.openCurso);
  });
}

function renderCursoDetail(root, cursoId) {
  const curso = store.listCursos().find(c => c.id === cursoId);
  const estudiantes = store.listEstudiantes(cursoId);
  const box = root.querySelector('#curso-detail');
  box.innerHTML = `
    <h2>👥 Estudiantes — Grado ${curso.grado}° ${curso.paralelo} · ${curso.year}</h2>
    <div class="card">
      <div class="form-row">
        <textarea id="bulk-names" rows="4" style="flex:2" placeholder="Pega una lista de nombres, uno por línea..."></textarea>
        <button class="btn" id="bulk-add" style="align-self:flex-start">Agregar en lote</button>
      </div>
      <table>
        <thead><tr><th>#</th><th>Nombre</th><th>Código (para QR)</th></tr></thead>
        <tbody>${estudiantes.map((e,i)=>`<tr><td>${i+1}</td><td>${e.nombre}</td><td><code>${e.codigo}</code></td></tr>`).join('') || '<tr><td colspan="3" class="empty">Sin estudiantes aún.</td></tr>'}</tbody>
      </table>
    </div>
  `;
  box.querySelector('#bulk-add').onclick = () => {
    const lines = box.querySelector('#bulk-names').value.split('\n');
    const nuevos = store.importEstudiantesMasivo(cursoId, lines);
    toast(`${nuevos.length} estudiante(s) agregado(s).`);
    renderCursoDetail(root, cursoId);
  };
}
