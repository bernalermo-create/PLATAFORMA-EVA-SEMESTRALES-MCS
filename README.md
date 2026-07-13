# Plataforma de Evaluación — V1 (Fase 1)

## Backend (Fase 2 — ya activo)
Esta plataforma sincroniza con **su propio Google Sheet**, separado del de "Pruebas Semestrales", usando el mismo backend genérico de Apps Script (`Codigo_plataforma_evaluacion.gs`, incluido en esta entrega). localStorage sigue siendo la caché instantánea/offline; en segundo plano, cada cambio se sube a Sheets/Drive igual que ya hace el sistema de Análisis Semestral.

**Para activar el backend:**
1. Confirma acceso de edición a `https://docs.google.com/spreadsheets/d/1NRrBQo_nf0RjwdEpEp9pL0TeOwqPJxjWNhXP6yCwZzA/edit`
2. Pega `Codigo_plataforma_evaluacion.gs` en el proyecto de Apps Script de la URL configurada → Implementar → Nueva implementación → Ejecutar como Yo mismo, acceso Cualquier persona (acepta el permiso de Drive).
3. En la app: **Configuración → Probar conexión ahora**. Debe confirmar el Spreadsheet ID y "Drive: ✓ ok".

## Qué incluye esta V1
- ✅ **Login** con dos roles: Admin (usuario+contraseña) y Docente. Los docentes registrados en **Docentes** entran con nombre + **contraseña individual** (generada automáticamente); los que aún no estén registrados siguen entrando con la contraseña compartida de siempre, como respaldo
- ✅ **Docentes**: registro manual o por Excel (nombre, jornada, grados, asignaturas) — genera contraseña individual por docente, exportable en CSV. Restringe el formulario de "Nueva evaluación" a los grados/asignaturas asignados de cada quien
- ✅ Dashboard institucional
- ✅ Institucional: cursos + estudiantes, alta manual, en lote, **y desde Excel** (SheetJS) — con botón de borrar en ambos niveles
- ✅ Banco de evaluaciones + **Constructor diagnóstico**: cada opción (A-D) de cada pregunta representa un nivel de desempeño distinto (Bajo/Básico/Alto/Superior), no una única respuesta "correcta". Preguntas **editables** (✏️) sin tener que borrar y recrear, y evaluaciones completas eliminables con confirmación
- ✅ **Importar evaluación ya armada desde Excel**: descarga una plantilla (hojas Instrucciones/Datos/Preguntas), la completas con tus preguntas y la subes — crea la evaluación completa de una vez, con validación fila por fila (nivel inválido, opción vacía, niveles repetidos, etc.) antes de crear nada, y respetando el alcance de grado/asignatura de cada docente
- ✅ **Importar evaluación desde PDF** (pruebas ya escritas en Word): sube el PDF, la plataforma extrae el texto e intenta reconocer preguntas numeradas con opciones A) B) C) D). Como un PDF no trae el nivel de desempeño de cada opción, **siempre pasa por una pantalla de revisión** donde se asignan los niveles y se corrige cualquier texto mal reconocido antes de crear la evaluación — nunca crea nada automáticamente sin confirmación. Si el PDF es una imagen escaneada (sin texto seleccionable) o no sigue el formato esperado, lo avisa claramente en vez de fallar en silencio
- ✅ **Cuadernillo imprimible**: portada rediseñada con bandas contenidas (robusta al exportar a PDF), instrucciones y preguntas completas en el formato oficial del colegio, agrupando **varias áreas en una sola sesión** con numeración continua. Las áreas de cada sesión se **premarcan automáticamente** según la sección (Primaria/Bachillerato)
- ✅ **Hoja de respuestas agrupada** por la misma sesión y numeración que el cuadernillo, un solo QR por hoja identifica estudiante + curso + todas las áreas de esa sesión
- ✅ **Panel Admin vs Panel Docente diferenciado**, con el alcance de cada docente (grados/asignaturas) tomado de su registro en Docentes
- ✅ **Imágenes en preguntas**: se suben a Drive con URL estable (`lh3.googleusercontent.com`) — las imágenes subidas antes de este cambio también se normalizan solas, sin tener que resubirlas
- ✅ **Escaneo, reforzado para uso en celular**: lectura de QR por cámara (jsQR) + digitación asistida con botones táctiles grandes (44px) + **flujo continuo** (reactiva la cámara solo tras guardar, con contador de sesión) + selector de cámara / linterna cuando el dispositivo lo soporta + aviso de instalación como app (PWA) + mensajes de error de cámara más claros + foto de respaldo de la hoja física
- ✅ **Resultados:** nivel de desempeño predominante, desglose por competencia, foto de respaldo, nota final sobre 50
- ✅ **Boletín por curso**: reporte imprimible con todos los estudiantes de un curso/sesión — exclusivo Admin
- ✅ **Análisis** (reemplaza el rol de "Pruebas Semestrales" para esta plataforma): KPIs, distribución por área, dona general, radar por área, comparativo 1er vs 2do semestre con delta, análisis narrativo por área y semestre, análisis final consolidado, y alertas automáticas por umbral — todo calculado en vivo a partir de los resultados ya digitalizados, sin digitación manual aparte. Incluye también una pestaña **"Por Competencia"** (máximo 2 por asignatura, C1/C2 como en Pruebas Semestrales) con su propio espacio de análisis narrativo por semestre — ambas vistas (por área y por competencia) conviven, cada docente usa la que prefiera
- ✅ Sincronización con Google Sheets/Apps Script, localStorage como caché instantánea/offline, consulta automática cada 25s, **badge de sincronización que ahora sí refleja fallas de descarga** (antes solo mostraba fallas de subida), y **reintento automático con backoff** si un envío falla (útil en wifi débil desde el celular)
- ✅ PWA instalable con el escudo del colegio como ícono, con aviso de instalación dentro de Escaneo
- ⏳ OMR automático (leer las burbujas directamente de la foto, sin digitar) — Fase 3 del roadmap

## Credenciales por defecto (cámbialas en Configuración)
- Admin: usuario `admin`, contraseña `cervantes2026`
- Docentes sin registrar individualmente: contraseña compartida `docente2026`
- Docentes registrados en la pestaña **Docentes**: su propia contraseña individual generada ahí

## Auditoría de escenarios de error (julio 2026)
Revisión sistemática de qué puede salir mal en cada fase, y qué se corrigió:

- **Elaborando pruebas**: validación estricta en los tres caminos de creación (manual, Excel, PDF) — nunca se crea una evaluación con opciones incompletas o niveles repetidos.
- **Escaneando**: se corrigió una caída real — si un estudiante se borraba después de imprimir su hoja física, escanearla más tarde hacía crashear la pantalla (`Cannot read property 'nombre' of null`). Ahora: (1) borrar un estudiante borra también sus hojas/resultados en cascada (con aviso si ya tenía calificaciones), y (2) Escaneo nunca vuelve a caerse aunque encuentre una referencia inconsistente — muestra un mensaje claro en su lugar. También avisa si una hoja incluía un área que después fue eliminada de la plataforma.
- **Análisis**: los cálculos ya estaban protegidos contra división por cero; se verificó con datos reales que los porcentajes cuadran exactamente.
- **Seguridad interna**: el nombre de una evaluación, la competencia de una pregunta, o el nombre de un docente/estudiante se mostraban sin escapar en varias pantallas — cualquiera podía escribir HTML/JS ahí y afectar la sesión de quien lo viera después (ej. el admin). Se corrigió en todos los módulos.
- **Reintentos de guardado**: confirmado que volver a escanear la misma hoja actualiza el resultado existente en vez de duplicarlo (protegido desde antes).

## Cómo probarlo ya mismo
No necesita build ni instalación de dependencias:

1. Sube toda esta carpeta tal cual a Netlify (arrastrar y soltar la carpeta en app.netlify.com, o conectar el repo de GitHub).
2. O pruébalo local: `npx serve .` dentro de la carpeta (los ES Modules no funcionan abriendo el archivo directo con `file://`, necesitan un servidor).

## Dónde vive cada cosa
```
index.html          shell + navegación
styles.css           estilo institucional
app.js               enrutador (carga cada módulo bajo demanda)
services/store.js    capa de datos (localStorage + sync a Sheets/Drive)
services/auth.js     login y contraseñas (individuales de docente + admin)
services/pwaInstall.js  captura el evento de instalación como app (celular)
services/qr.js       generación de QR en cliente
modules/*.js         una pantalla por archivo (incluye docentes.js y analisis.js)
manifest.json        PWA — reemplaza icon-192.png / icon-512.png por el escudo del colegio
service-worker.js    caché offline del app shell
```

## Icono institucional
Ya incluido: `icon-192.png` e `icon-512.png` (generados a partir del escudo real del colegio) — se usan en el login, la barra superior y la instalación como PWA.

## Pendiente para Fase 3 (ver roadmap completo en ANALISIS_Y_ARQUITECTURA.md)
- OMR semiautomático: detectar las burbujas rellenas directamente de una foto de la hoja (hoy la identificación del estudiante es automática por QR, pero las respuestas se digitan a mano — rápido y confiable, pero no "óptico").
- Si el volumen de escaneos supera lo cómodo para Sheets/Apps Script (cientos de hojas por sesión, muchas sesiones simultáneas), evaluar migrar `services/sync.js` a Supabase — el resto de `modules/` no necesita cambiar, porque solo conocen `services/store.js`.

## Nota sobre la cámara (módulo Escaneo)
Requiere HTTPS (Netlify lo da automático) y permiso del navegador para usar la cámara. Si el dispositivo no tiene cámara o el permiso se niega, el campo manual ("...o pega aquí el contenido del QR") permite seguir trabajando sin bloquear al docente.

## Conexión con el sistema de Análisis Semestral actual
Esta plataforma tiene su propio módulo **Análisis** que replica los gráficos y el flujo de trabajo de "Pruebas Semestrales" (KPIs, distribución por área, comparativo de semestres, análisis narrativo, alertas), pero alimentado automáticamente por los resultados diagnósticos ya escaneados aquí — no requiere digitar nada aparte. El `index.html` de "Pruebas Semestrales" sigue siendo un sistema aparte con su propio Google Sheet; no se tocó ni se reemplazó, y ambos pueden convivir mientras el colegio decide si migra por completo.
