# Plataforma de Evaluación — V1 (Fase 1)

## Backend (Fase 2 — ya activo)
Esta plataforma sincroniza con **su propio Google Sheet**, separado del de "Pruebas Semestrales", usando el mismo backend genérico de Apps Script (`Codigo_plataforma_evaluacion.gs`, incluido en esta entrega). localStorage sigue siendo la caché instantánea/offline; en segundo plano, cada cambio se sube a Sheets/Drive igual que ya hace el sistema de Análisis Semestral.

**Para activar el backend:**
1. Confirma acceso de edición a `https://docs.google.com/spreadsheets/d/1NRrBQo_nf0RjwdEpEp9pL0TeOwqPJxjWNhXP6yCwZzA/edit`
2. Pega `Codigo_plataforma_evaluacion.gs` en el proyecto de Apps Script de la URL configurada → Implementar → Nueva implementación → Ejecutar como Yo mismo, acceso Cualquier persona (acepta el permiso de Drive).
3. En la app: **Configuración → Probar conexión ahora**. Debe confirmar el Spreadsheet ID y "Drive: ✓ ok".

## Qué incluye esta V1
- ✅ **Login** con dos roles: Admin (usuario+contraseña) y Docente. Solo puede entrar un docente que el administrador haya registrado explícitamente en **Docentes** — no existe una contraseña compartida ni forma de entrar sin estar en el listado
- ✅ **Docentes**: registro manual o por Excel (nombre, jornada, grados, asignaturas) — genera contraseña individual por docente, exportable en CSV. Restringe el formulario de "Nueva evaluación" a los grados/asignaturas asignados de cada quien
- ✅ Dashboard institucional
- ✅ Institucional: cursos + estudiantes, alta manual, en lote, **y desde Excel** (SheetJS) — con botón de borrar en ambos niveles
- ✅ Banco de evaluaciones + **Constructor diagnóstico**: cada opción (A-D) de cada pregunta representa un nivel de desempeño distinto (Bajo/Básico/Alto/Superior), no una única respuesta "correcta". Preguntas **editables** (✏️) sin tener que borrar y recrear, y evaluaciones completas eliminables con confirmación
- ✅ **Importar evaluación desde Word/PDF**: sube el PDF, la plataforma extrae el texto e intenta reconocer preguntas numeradas con opciones A) B) C) D). Como un PDF no trae el nivel de desempeño de cada opción, **siempre pasa por una pantalla de revisión** donde se asignan los niveles, se corrige cualquier texto mal reconocido, y **se le puede agregar una imagen a cada pregunta** (gráfico, mapa, foto) antes de crear la evaluación — nunca crea nada automáticamente sin confirmación. Si el PDF es una imagen escaneada (sin texto seleccionable) o no sigue el formato esperado, lo avisa claramente en vez de fallar en silencio. (La importación desde Excel se retiró — ahora todo pasa por Word/PDF.)
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
- Docentes: deben estar registrados por el administrador en **Docentes** — no hay contraseña compartida
- Docentes registrados en la pestaña **Docentes**: su propia contraseña individual generada ahí

## Auditoría de escenarios de error (julio 2026)
Revisión sistemática de qué puede salir mal en cada fase, y qué se corrigió:

- **Elaborando pruebas**: validación estricta en los tres caminos de creación (manual, Excel, PDF) — nunca se crea una evaluación con opciones incompletas o niveles repetidos.
- **Escaneando**: se corrigió una caída real — si un estudiante se borraba después de imprimir su hoja física, escanearla más tarde hacía crashear la pantalla (`Cannot read property 'nombre' of null`). Ahora: (1) borrar un estudiante borra también sus hojas/resultados en cascada (con aviso si ya tenía calificaciones), y (2) Escaneo nunca vuelve a caerse aunque encuentre una referencia inconsistente — muestra un mensaje claro en su lugar. También avisa si una hoja incluía un área que después fue eliminada de la plataforma.
- **Análisis**: los cálculos ya estaban protegidos contra división por cero; se verificó con datos reales que los porcentajes cuadran exactamente.
- **Seguridad interna**: el nombre de una evaluación, la competencia de una pregunta, o el nombre de un docente/estudiante se mostraban sin escapar en varias pantallas — cualquiera podía escribir HTML/JS ahí y afectar la sesión de quien lo viera después (ej. el admin). Se corrigió en todos los módulos.
- **Reintentos de guardado**: confirmado que volver a escanear la misma hoja actualiza el resultado existente en vez de duplicarlo (protegido desde antes).

## Ajustes de esta ronda (revisión en vivo del docente)
- Cuadernillo: se quitó la página de instrucciones (innecesaria).
- **Competencia obligatoria** en las 3 formas de crear preguntas (manual, Excel, PDF) — ya no se puede dejar vacía.
- **Sección ya no se puede desajustar del grado**: en Institucional se calcula sola (Primaria si es 2°-5°, Bachillerato si es 6°-11°), eliminando el bug de "Grado 3° / Bachillerato".
- **Nueva evaluación**: ya no pide nombre (se genera solo, ej. "Matemáticas — Grado 6° — Primer Semestre 2026"); se elige Sección primero y el Grado se filtra según esa sección; muestra en vivo a qué Sesión (1 o 2) pertenece la evaluación según el área elegida.
- **Docentes**: la jornada ahora admite varias a la vez (Mañana, Tarde, Única) para quienes dictan en más de una jornada; botones para marcar de una vez todos los grados de Primaria o de Bachillerato.
- **Hojas/QR**: el checklist ahora muestra a qué docente pertenece cada evaluación, para entender de un vistazo por qué una duplicada solo la puede borrar el administrador.
- Nota de arquitectura: la evaluación (preguntas) es la misma para todas las jornadas de un grado — la jornada solo se registra en el curso y en el docente, no en la evaluación, porque el contenido no cambia entre mañana y tarde (y Media, 10°-11°, siempre es jornada única en este colegio).

## Impresión — corregida de raíz (julio 2026, revisión con cuadernillos reales)
- **Bug real encontrado y corregido**: al imprimir, la interfaz completa (tarjetas de configuración, notificaciones) se colaba en el PDF, y aparecían páginas en blanco de más. Causas exactas: (1) el CSS de impresión solo ocultaba botones, no las tarjetas alrededor; (2) no había una regla `@page`, así que el navegador aplicaba sus propios márgenes por encima del tamaño ya exacto de la hoja (210×297mm), desbordando contenido a una página extra; (3) el propio botón de "Imprimir", aunque invisible, seguía ocupando espacio en el diseño y empujaba la portada. Las tres causas están corregidas y verificadas exportando PDFs reales con el mismo motor de impresión del navegador — 0 páginas en blanco, 0 fugas de interfaz.
- **Cuadernillo a dos columnas** — mismo contenido, menos hojas de papel.
- **Imprimir y generar hojas de respuesta (QR) quedó exclusivo del administrador.** Los docentes pueden generar y ver el cuadernillo en pantalla para revisar sus preguntas, pero no imprimirlo ni generar las hojas oficiales — así el colegio mantiene un solo punto de control de lo que se manda a imprimir.
- **Sobre el encabezado/pie con la URL** que aparece en tus PDFs ("Plataforma de Evaluación — ... https://..."): eso no lo pone la plataforma — lo agrega el propio navegador cuando la opción **"Encabezados y pies de página"** está activada en el cuadro de diálogo de impresión. Para quitarlo: en el diálogo de imprimir → "Más ajustes" → desmarca esa casilla. El contenido que si controla la plataforma (nombre del colegio, PEI, etc.) ya sale limpio sin eso.

## Robustez de librerías externas (julio 2026)
- **Corregido el error "No se pudo cargar el lector de QR (jsQR)"** que salió en el celular real: las librerías (lectura/generación de QR, Excel, PDF) ahora se alojan dentro del propio proyecto (`vendor/`) en vez de depender de un CDN externo — si esa red estaba lenta o bloqueada, el escaneo completo dejaba de funcionar. Ahora no depende de terceros y además queda cacheado para uso offline.

## Integridad de las preguntas (julio 2026)
- **Mezcla de opciones al crear una pregunta** (casilla activada por defecto, en el constructor manual y al importar desde PDF): reordena al azar qué letra (A/B/C/D) le toca a cada nivel de desempeño, para que el nivel Superior no quede siempre en la misma letra — evita que un estudiante aprenda a adivinar sin leer. Se decidió mezclar **por pregunta, no por estudiante**: mezclar por estudiante obligaría a imprimir un cuadernillo distinto para cada uno (ya no se podría fotocopiar un solo original), lo cual iría directo en contra del ahorro de papel que se pidió en esta misma ronda. Mezclar por pregunta logra la mayor parte del beneficio (nada de patrón fijo entre preguntas) sin ese costo.

## Tema visual
- Botón 🌙/☀️ en la barra superior para cambiar entre tema oscuro y claro — se recuerda por navegador.


## Ronda: escaneo, acceso y formatos (julio 2026)

### 🎯 El problema clave — el QR no se dejaba escanear con una hoja real
Se encontró la causa raíz revisando el código: el QR codificaba un bloque JSON completo (estudiante + curso + áreas + fecha), que con una sesión de 2-3 áreas fácilmente pasaba de **175 caracteres**. Eso obliga a un QR muy denso (grilla de 73×73 módulos) que, impreso a solo 80px, es prácticamente imposible de leer con una cámara de celular a distancia normal.

**Corregido:**
- El QR ahora solo codifica el ID corto de la hoja (~20 caracteres) — el resto de la información ya vive en la plataforma y se consulta ahí. Grilla real: **29×29 módulos, 2.5 veces menos denso.**
- Tamaño de impresión del QR subido de 80px a 150px.
- Nivel de corrección de errores subido a Alto (resiste dobleces, manchas, fotocopias de baja calidad).
- La cámara ahora pide resolución HD (1920×1080) en vez de dejar que el navegador elija una por defecto baja, y activa enfoque continuo cuando el dispositivo lo soporta.
- **Nueva confirmación explícita**: al reconocer un QR, aparece el nombre del estudiante en grande con un botón "✅ Sí, es esta hoja — continuar" (y uno para "no es esta, volver a escanear") — ya no pasa directo a digitar, hay que confirmar a propósito.
- Si pasan más de 4 segundos sin detectar nada, aparece una pista con sugerencias (acercar/alejar, encuadrar bien, probar la linterna).

### 🆘 Dos formas de respaldo si la cámara no lee el QR
Después de probar con una hoja real impresa donde el QR no se dejó leer, se agregaron dos formas más de identificar la hoja sin depender de la cámara:
- **Código corto impreso junto al QR** (6 caracteres, sin 0/O/1/I): se escribe a mano en el campo manual de Escaneo en 2 segundos, sin necesitar el ID largo completo.
- **Buscar al estudiante directamente**: elige el curso y el estudiante de una lista — identifica su hoja sin necesitar nada del papel. Es la opción más confiable de las tres, porque no depende de que la cámara logre leer nada en absoluto.

### 📥 Descargar cuadernillo y hojas en PDF (administrador)
Botón "⬇️ Descargar PDF" junto al de imprimir — genera el archivo directo sin pasar por el diálogo de impresión. Si el PDF descargado se ve raro con imágenes que no cargaron (puede pasar con imágenes alojadas en Drive), "Imprimir" → "Guardar como PDF" sigue siendo la vía más fiel al diseño exacto.

### 🔒 Acceso solo para docentes registrados
Se quitó la contraseña compartida de respaldo — ya no existe una forma de "entrar como cualquiera". Solo puede iniciar sesión quien el administrador haya registrado explícitamente en **Docentes**.

### 📄 Importar también desde Word (.docx), no solo PDF
Ahora se puede subir el .docx directo, sin convertirlo a PDF primero. Se encontró y corrigió un problema real: cuando Word numera las preguntas con su numeración automática de listas, ese "1." "2." nunca existe como texto real (Word solo lo dibuja) — así que la extracción simple de texto lo perdía por completo. Ahora se reconstruye la numeración a partir de la estructura real de listas del documento (funciona con preguntas indentadas con Tab, y también con preguntas escritas como texto seguidas de una lista de opciones aparte), probando dos estrategias y usando la que mejor resultado dé. Probado con Word reales generados con distintas estructuras.


## Ronda: lectura asistida por foto, resultados individuales (julio 2026)

### 📸 Detectar respuestas con foto (asistido, no automático ciego)
En Escaneo, cada área ahora tiene un botón "📸 Detectar con foto" además de la digitación manual (que sigue disponible, tal como se pidió — ninguna reemplaza a la otra). Flujo:
1. Se abre la cámara con un recuadro guía para alinear la columna de círculos.
2. Se toma la foto.
3. Se ajustan 4 esquinas (arrastrándolas) para que encierren exactamente esa columna — esto reemplaza la necesidad de una detección automática de bordes, que es más frágil.
4. El sistema calcula, para cada pregunta, cuál de las 4 opciones está más oscura que las otras 3 (comparación relativa, no un umbral fijo — tolera variaciones de luz entre fotos), y deja las respuestas pre-marcadas en el formulario de siempre.
5. **Nunca guarda solo** — las detecciones dudosas (marca débil, doble marcada, o vacía) quedan resaltadas en naranja para que se revisen antes de guardar, igual que el resto.

Se investigó primero qué tan viable era una solución "estilo ZipGrade" completamente automática (llegó un documento de investigación técnica al respecto) — la conclusión honesta fue que ese nivel (app nativa, backend propio, modelos de IA entrenados, 99% de precisión) no es construible en este entorno (sin backend propio, sin datos para entrenar un modelo). Se optó por la solución más viable real: detección asistida con revisión humana obligatoria, que sí es 100% construible aquí y no arriesga notas mal puestas en silencio.

Probado de punta a punta con una cámara simulada (video sintético con respuestas conocidas): la detección coincidió exacta con las esquinas bien alineadas, y toleró ±8px de imprecisión en el ajuste manual sin fallar.

### 🔍 Resultados individuales
Nueva sección en Resultados (visible para docente y administrador): elige curso y estudiante, y muestra — por cada área evaluada — el nivel obtenido en **cada pregunta individual**, no solo el promedio. Así se ve exactamente en qué preguntas/competencias le fue bien o mal a un estudiante puntual.

### Español ya no se evalúa
Se quitó de la lista de asignaturas — ya no aparece para elegir en ningún formulario.


## Sesión visible y editable en cada evaluación (julio 2026)
Antes solo se veía "a qué sesión pertenece" como un texto que aparecía y desaparecía al crear la evaluación — no había forma de verla ni cambiarla después. Ahora cada tarjeta de evaluación muestra su Sesión (1, 2, o "sin definir") y el administrador puede corregirla a mano si algún caso particular no encaja con el patrón automático (Primaria: Sesión 1 = Matemáticas/Ciencias Naturales/Inglés, Sesión 2 = Competencias Ciudadanas/Lectura Crítica; Bachillerato: Sesión 1 = Matemáticas/Competencias Ciudadanas/Inglés, Sesión 2 = Ciencias Naturales/Lectura Crítica). Importante: esto es solo la etiqueta informativa — el control real de qué áreas van juntas en un cuadernillo siempre ha estado en las casillas de Hojas/QR, que se pueden marcar/desmarcar libremente sin importar esta etiqueta.

## Importar cursos y estudiantes desde Excel, y orden alfabético corregido (julio 2026)
- **Bug real corregido**: la lista de estudiantes nunca se ordenaba — se mostraba en el orden en que se habían agregado. Si la carga inicial ya venía ordenada se veía bien, pero un estudiante agregado después aparecía al final en vez de en su puesto alfabético. Ahora la lista siempre se ordena por nombre (apellido primero), sin importar cuándo se agregó cada quien.
- **Nueva importación masiva de cursos + estudiantes** en Institucional, adaptada al formato real que ya usa el colegio (columnas `curso` con código grado+paralelo, `apellidos`, `nombres`) — no hay que reformatear nada. Crea los cursos que falten automáticamente y agrega los estudiantes; los repetidos (mismo nombre en el mismo curso) se omiten en vez de duplicarse. Probado de punta a punta con el archivo real del colegio (979 estudiantes, 28 cursos de grado 6° a 11°) — se importó correcto, incluyendo el manejo de una fila vacía real que traía el archivo sin que eso bloqueara el resto.

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

## Pendiente para siguientes fases (ver roadmap completo en ANALISIS_Y_ARQUITECTURA.md)
- ~~OMR semiautomático~~ — hecho en esta entrega (detección asistida por foto + revisión humana, ver arriba).
- Si el volumen de escaneos supera lo cómodo para Sheets/Apps Script (cientos de hojas por sesión, muchas sesiones simultáneas), evaluar migrar `services/sync.js` a Supabase — el resto de `modules/` no necesita cambiar, porque solo conocen `services/store.js`.

## Nota sobre la cámara (módulo Escaneo)
Requiere HTTPS (Netlify lo da automático) y permiso del navegador para usar la cámara. Si el dispositivo no tiene cámara o el permiso se niega, el campo manual ("...o pega aquí el contenido del QR") permite seguir trabajando sin bloquear al docente.

## Conexión con el sistema de Análisis Semestral actual
Esta plataforma tiene su propio módulo **Análisis** que replica los gráficos y el flujo de trabajo de "Pruebas Semestrales" (KPIs, distribución por área, comparativo de semestres, análisis narrativo, alertas), pero alimentado automáticamente por los resultados diagnósticos ya escaneados aquí — no requiere digitar nada aparte. El `index.html` de "Pruebas Semestrales" sigue siendo un sistema aparte con su propio Google Sheet; no se tocó ni se reemplazó, y ambos pueden convivir mientras el colegio decide si migra por completo.
