# Pruebas Semestrales → Plataforma Integral de Evaluación
## Colegio Miguel de Cervantes Saavedra I.E.D.
### Análisis técnico, arquitectura y V1 de código

---

## PARTE A — Análisis del `index` actual

**Qué hace hoy.** Es una SPA de un solo archivo HTML (~2.400 líneas) que permite a un administrador cargar resultados de "Pruebas Semestrales" (por Excel o JSON) organizados por grado/año/semestre/jornada/sección, y a los docentes consultar y editar los niveles de desempeño (Bajo/Básico/Alto/Superior) de sus estudiantes por área y competencia. Incluye análisis por competencia, comparativos entre semestres, un "Análisis Final" narrativo, exportaciones (JSON/Excel), impresión de reportes, y sincronización con Google Sheets + Google Drive vía Apps Script como backend gratuito.

**Módulos que ya existen (reutilizables tal cual):**
- Autenticación simple (Admin / Docente) con selección de Jornada/Sección.
- Modelo de "espacio" por grado-año-jornada-sección con estudiantes, cursos, niveles de desempeño.
- Motor de análisis por competencia y área, comparativo S1 vs S2, Análisis Final.
- Import/export Excel y JSON.
- Capa de sincronización con Google Sheets + Drive (con manejo de payloads grandes, diagnóstico de conexión, configuración remota de Sheet ID).
- Exportaciones consolidadas institucionales.

**Datos que maneja hoy:** estudiantes (nombre), cursos, grados 2°-11°, semestres, niveles de desempeño cualitativos por área (no preguntas ni puntajes individuales), y textos de análisis narrativo.

**Debilidades para escalar al sistema pedido:**
1. **No hay modelo de "evaluación" ni "pregunta".** Hoy solo se registra el nivel de desempeño final, no la prueba que lo originó, ni el detalle pregunta-por-pregunta.
2. **Un solo archivo monolítico.** Toda la lógica vive en un `<script>` gigante; añadir 6 módulos nuevos (banco de pruebas, cuadernillos, QR, escaneo, calificación) sobre esa base sería inmanejable y frágil.
3. **Sincronización de "todo o nada".** Cada guardado sube el índice institucional completo; con escaneos de cientos de hojas por sesión, este patrón no escala (ya lo vivimos con el límite de 50.000 caracteres por celda).
4. **Sin identificadores estables.** Los estudiantes se identifican por nombre dentro de un curso, no por un ID único — necesario para que un QR pueda referenciar a un estudiante sin ambigüedad.
5. **Sin concepto de "aplicación de prueba"** (quién, cuándo, qué versión de cuadernillo) — indispensable para trazabilidad del escaneo.

**Qué conservar:** el modelo de espacios (grado/año/jornada/sección), el motor de análisis por competencia, la capa de sync con Sheets+Drive (ya resuelve "gratis y sin servidor"), el estilo visual institucional, y toda la lógica de reportes.

**Qué refactorizar:** pasar de "un archivo" a módulos separados; introducir IDs estables para estudiantes/cursos; separar "captura de nivel de desempeño manual" (como hoy) de "resultado derivado de una evaluación calificada" (nuevo), para que ambos alimenten el mismo motor de análisis.

**Qué reemplazar:** nada del núcleo — se construye alrededor, no se destruye.

---

## PARTE B — Arquitectura recomendada

| Opción | Ventajas | Desventajas | Costo | Complejidad | Rendimiento | Escala | Mantenimiento | Escaneo/Sync |
|---|---|---|---|---|---|---|---|---|
| **1. Netlify + Supabase + PWA** | Postgres real, auth nativa, Storage para imágenes de hojas escaneadas, Realtime, Row Level Security, API REST/GraphQL automática | Requiere aprender Supabase; free tier tiene límites (500MB DB, 1GB storage, pausa tras inactividad) | Gratis hasta cierto volumen, luego ~$25/mes | Media | Alto | Alta | Buena (schema SQL claro) | Excelente — Storage nativo para fotos, functions para procesar |
| **2. Netlify + Google Sheets/Apps Script + IndexedDB** (evolución de lo actual) | Cero fricción con lo ya construido y ya probado en el colegio; sin cuenta nueva; Drive como storage de archivos grandes ya funciona | Sheets no es una base de datos real (lecturas/escrituras lentas a volumen, límites de Apps Script: 6 min/ejecución, cuotas diarias); consultas complejas (por pregunta, por competencia) son incómodas | 100% gratis | Baja (ya la conocen) | Medio (cae con volumen) | Media-baja | Buena a corto plazo, mala a 2-3 años | Aceptable en Fase 1-2, se vuelve cuello de botella en Fase 3 |
| **3. Firebase (Firestore) + PWA** | Realtime real, Storage integrado, Auth robusta, Cloud Functions, buen soporte offline nativo en el SDK | Firestore cobra por lectura/escritura (puede sorprender en escaneo masivo); vendor lock-in de Google distinto al que ya tienen | Gratis hasta cuota, luego pago por operación | Media | Alto | Alta | Buena | Muy buena — offline-first es su fuerte |
| **4. Netlify + Supabase (Postgres) + Sheets como "espejo" institucional** | Lo mejor de ambos: Postgres para todo lo transaccional (pruebas, preguntas, escaneos, resultados), Sheets/Drive se mantiene como capa de reporte/export que coordinación ya conoce y puede abrir directamente | Dos sistemas que sincronizar (mitigable: Sheets se alimenta *desde* Supabase solo en exportación, no en tiempo real) | Gratis en el rango del colegio | Media-alta | Alto | Alta | Buena | Excelente |

### Recomendación: **Opción 4** (con Opción 2 como puente de transición)

Justificación concreta para este caso — colegio público, presupuesto limitado, conectividad variable, varios docentes, escaneo desde celular, no perder datos:

- El **módulo de Análisis Semestral actual sigue funcionando exactamente igual**, sobre Sheets+Apps Script, sin tocarlo — cero riesgo de romper lo que ya funciona y que le costó estabilizar.
- Los **módulos nuevos** (banco de evaluaciones, preguntas, cuadernillos, hojas QR, escaneos, resultados calificados) se construyen sobre **Supabase** (Postgres gratis, con Auth y Storage para las fotos de las hojas escaneadas), porque estas son operaciones transaccionales y de alto volumen para las que Sheets no fue diseñado.
- Un **job de exportación** (botón "Publicar a Sheets", o automático) consolida los resultados calificados de Supabase hacia el mismo formato que el `index` actual ya consume — así el módulo de Análisis no necesita saber que existe Supabase.
- Todo el frontend sigue siendo **estático en Netlify** (gratis), con **PWA** para caché offline de: lista de estudiantes del curso, cuadernillo activo, y cola de escaneos pendientes de subir.
- Si en 2 años el volumen crece demasiado para el free tier de Supabase, es una migración de base de datos, no una reescritura de la aplicación.

**Camino de adopción sin fricción:** Fase 1 puede arrancar usando *solo* la Opción 2 (Sheets/Drive, exactamente el patrón que ya tienen) para evaluaciones/preguntas/hojas — es la opción de menor fricción para publicar ya. La migración a Supabase para escaneos/resultados se hace en Fase 2, cuando el volumen de datos por sesión lo justifique. El código V1 que entrego abajo está escrito para que ese cambio sea *solo* de la capa `services/`, sin tocar los módulos de UI.

---

## PARTE C — Mapa de módulos

| Módulo | Objetivo | Pantallas | Datos | Acciones | Relación |
|---|---|---|---|---|---|
| **Dashboard** | Vista rápida institucional | 1 pantalla con tarjetas + gráficos | Agregados de todos los demás módulos | Ninguna (solo lectura) | Lee de todos |
| **Institucional** | CRUD de estudiantes/docentes/cursos/jornadas/secciones | Listas + importador Excel (reutiliza el ya existente) | Estudiantes, Docentes, Cursos, Grados, Jornadas, Secciones | Crear/editar/importar masivo | Base para Evaluaciones y Cuadernillos |
| **Evaluaciones** | Banco de pruebas | Lista + editor de metadatos | Pruebas (nombre, semestre, grado, área, docente, #preguntas) | Crear, duplicar, archivar | Alimenta Constructor y Cuadernillos |
| **Constructor de pruebas** | Redactar/importar preguntas | Editor tipo formulario, reordenable | Preguntas, opciones, clave, competencia, componente, nivel, peso | Agregar/editar/reordenar/importar | Pertenece a una Evaluación |
| **Cuadernillos** | Generar PDF imprimible | Selector curso/estudiante + vista previa | Plantilla + datos de evaluación | Generar PDF (curso o individual) | Lee Evaluaciones + Institucional |
| **Hojas de respuesta** | Generar hoja OMR con QR | Selector + vista previa | Estudiante, curso, prueba, QR codificado | Generar PDF, regenerar QR | Lee Institucional + Evaluaciones |
| **Escaneo** | Captura desde celular | Cámara (QR) → cámara (hoja) → revisión | Escaneos (imagen + respuestas detectadas) | Escanear, corregir manualmente, confirmar | Escribe Resultados |
| **Resultados** | Calificación automática | Tabla por estudiante/pregunta | Respuestas, aciertos, puntaje | Recalcular, exportar | Alimenta Analítica y el `index` actual |
| **Reportes / Analítica** | Todo lo que ya hace el `index`, ampliado | Tabs existentes + nuevas vistas por pregunta | Resultados + niveles de desempeño | Exportar PDF/Excel/JSON | Hereda el motor de análisis actual |
| **Configuración** | URLs, Sheet ID, credenciales Supabase, roles | Panel Admin (ya existe, se amplía) | Config de conexión | Editar y probar conexión | Transversal |

---

## PARTE D — Modelo de datos

```
estudiantes
  id            uuid PK
  codigo        text UNIQUE   -- para el QR
  nombre        text
  curso_id      uuid FK -> cursos.id
  activo        boolean

docentes
  id            uuid PK
  nombre        text
  usuario       text UNIQUE
  jornada       text
  seccion       text

cursos
  id            uuid PK
  grado         int
  paralelo      text          -- "01","02"...
  year          int
  jornada       text          -- MANANA | TARDE
  seccion       text          -- PRIMARIA | BACHILLERATO
  docente_id    uuid FK NULL

evaluaciones
  id              uuid PK
  nombre          text
  year            int
  semestre        text        -- S1 | S2
  grado           int
  area            text
  docente_id      uuid FK
  num_preguntas   int
  version         int DEFAULT 1
  estado          text        -- borrador | publicada | archivada
  creado_en       timestamptz

preguntas
  id              uuid PK
  evaluacion_id   uuid FK -> evaluaciones.id
  numero          int
  enunciado       text
  competencia     text
  componente      text
  nivel_desempeno text
  peso            numeric DEFAULT 1
  orden           int
  INDEX (evaluacion_id, numero)

opciones
  id            uuid PK
  pregunta_id   uuid FK -> preguntas.id
  letra         char(1)       -- A|B|C|D
  texto         text
  es_correcta   boolean

cuadernillos
  id              uuid PK
  evaluacion_id   uuid FK
  curso_id        uuid FK NULL   -- NULL = individual
  version         int
  generado_en     timestamptz

hojas_respuesta
  id              uuid PK
  evaluacion_id   uuid FK
  estudiante_id   uuid FK
  curso_id        uuid FK
  qr_payload      text UNIQUE   -- JSON firmado: estudiante+curso+evaluacion+jornada+grado+year+semestre+version
  generada_en     timestamptz

escaneos
  id                uuid PK
  hoja_id           uuid FK -> hojas_respuesta.id
  imagen_url        text        -- Supabase Storage
  estado            text        -- pendiente | procesado | error | corregido_manual
  respuestas_crudas jsonb       -- {"1":"A","2":null,"3":"B,C"(doble marca)...}
  escaneado_por     uuid FK -> docentes.id
  escaneado_en      timestamptz

resultados
  id              uuid PK
  hoja_id         uuid FK UNIQUE
  estudiante_id   uuid FK
  evaluacion_id   uuid FK
  respuestas      jsonb       -- {"1":"A","2":"C",...} ya validadas
  aciertos        int
  total           int
  porcentaje      numeric
  por_competencia jsonb       -- agregados
  calculado_en    timestamptz

usuarios (si se requiere control de acceso más allá de Admin/Docente)
  id          uuid PK
  email       text UNIQUE
  rol         text   -- admin | coordinador | docente
  docente_id  uuid FK NULL
```

Índices recomendados: `preguntas(evaluacion_id)`, `hojas_respuesta(qr_payload)`, `resultados(evaluacion_id, estudiante_id)`, `escaneos(estado)` para la cola de pendientes.

---

## PARTE E — Rendimiento y estrategia offline

- **Local (IndexedDB vía la PWA):** catálogo de estudiantes/cursos del docente, evaluación activa con sus preguntas y claves, y la **cola de escaneos** (imagen + respuestas detectadas) hasta que haya internet.
- **Nube:** todo lo transaccional confirmado (resultados calificados, hojas generadas).
- **Conflictos:** cada hoja de respuesta tiene un `qr_payload` único — si dos docentes escanean la misma hoja, el segundo intento se marca `duplicado` y no sobreescribe, se revisa manualmente. Última escritura gana solo para *correcciones manuales* explícitas de un mismo escaneo.
- **Caché de plantillas y estudiantes:** se descargan una vez al abrir el curso y quedan disponibles offline todo el día de aplicación de la prueba.
- **Escaneo offline:** la app guarda foto + intento de lectura en IndexedDB inmediatamente; un *service worker* con Background Sync sube la cola apenas detecta conexión, sin bloquear al docente.
- **Reducir consumo de datos:** las imágenes se comprimen a WebP/JPEG de baja resolución suficiente para OMR (no se necesita foto de alta calidad) antes de subir; miniaturas para revisión, no la imagen completa.
- **Evitar cuello de botella en Sheets:** los escaneos y resultados **nunca** tocan Sheets directamente; solo un resumen consolidado se exporta al índice institucional al final (mismo patrón ya usado hoy para "Publicar").
- **Módulos ligeros:** cada módulo nuevo es un chunk JS separado, cargado solo cuando se visita esa pantalla (ver `app.js` en el código).

---

## PARTE F — Estrategia de escaneo / OMR

**Flujo ideal (Fase 3, cuando el OMR esté maduro):**
1. Docente abre "Escaneo" en el celular → apunta cámara al QR de la hoja.
2. QR decodifica: estudiante, curso, prueba, versión de cuadernillo → la app ya sabe qué clave usar.
3. App pide foto de la hoja de respuestas completa (guía visual tipo "encuadra las 4 esquinas").
4. Se detectan los círculos rellenos por umbral de oscuridad dentro de cada celda de la plantilla conocida (la posición de cada burbuja es fija porque el cuadernillo lo genera la propia plataforma).
5. Se valida: pregunta sin marcar → "en blanco"; más de una marcada → "doble marca, anulada" (igual que ya indican las instrucciones impresas del colegio).
6. Se muestra un resumen editable antes de confirmar subida.

**Flujo alternativo si el OMR automático no es confiable (recomendado para Fase 1-2):**
- **QR + digitación asistida:** el docente escanea el QR (identifica al estudiante instantáneamente, cero error de transcripción de nombre/curso) y luego marca las respuestas en un formulario rápido tipo teclado de opciones (A/B/C/D grandes, tocables, con foco automático a la siguiente pregunta) — mucho más rápido y confiable que corregir a mano 200 hojas, aunque no es "escaneo óptico" todavía.
- **QR + captura con validación visual:** además de lo anterior, se guarda la foto de la hoja como respaldo/auditoría, sin depender de que el reconocimiento automático sea perfecto.

**Librerías/técnicas sugeridas (todas gratuitas):**
- Lectura de QR en cliente: `jsQR` o la Barcode Detection API nativa del navegador (Chrome Android la soporta bien).
- OMR en cliente (Fase 3): `OpenCV.js` (detección de contornos + umbral) corriendo en el navegador — evita servidor de procesamiento de imágenes, que sería el componente más caro de mantener.
- Alternativa server-side ligera si OpenCV.js resulta pesado en celulares de gama baja: una Supabase Edge Function con una librería Python/Node de procesamiento de imágenes, solo si Fase 3 lo justifica.

**Qué corre dónde:** decodificación de QR y formulario de digitación asistida → 100% cliente. OMR por umbral de contorno → cliente con OpenCV.js si el dispositivo lo soporta bien; si no, se sube la imagen y se procesa en una función serverless (asíncrono, no bloquea al docente).

**Validación de identidad:** el QR ya amarra estudiante+curso+prueba; adicionalmente se puede mostrar nombre y foto (si existe) en pantalla antes de confirmar, para que el docente verifique visualmente.

**Corrección manual:** toda hoja con `estado = error` o con menos del 90% de confianza en la detección queda en una bandeja "Por revisar" donde el docente ve la foto ampliada y corrige con el mismo formulario de digitación asistida.

**Fases del módulo de escaneo:**
- **Fase 1:** QR + digitación asistida (sin cámara de hoja, solo QR + teclado rápido). Rápido de construir, cero riesgo de lecturas erróneas.
- **Fase 2:** se agrega captura de foto de la hoja como respaldo/auditoría (aún se digita a mano).
- **Fase 3:** OMR semiautomático con OpenCV.js, con bandeja de revisión para lo que no se detecte con confianza.
- **Fase 4:** OMR robusto + reentrenamiento del umbral por calidad de impresión/escaneo real del colegio.

---

## PARTE G — Roadmap por fases

### Fase 1 — MVP institucional (4-6 semanas)
**Alcance:** Dashboard, Institucional (reutilizando import Excel actual), Evaluaciones + Constructor de preguntas, Cuadernillos y Hojas de respuesta con QR (generación e impresión), conexión de solo-lectura al análisis actual.
**Entregables:** los 4 módulos base funcionando sobre Sheets/Drive (mismo patrón ya validado), PWA instalable.
**Prioridad:** Alta.
**Dependencias:** ninguna — se construye sobre lo que ya existe.
**Riesgos:** ninguno crítico; el mayor riesgo es de alcance (tentación de empezar por el escaneo antes de tener qué escanear).

### Fase 2 — Escaneo + sincronización (4-8 semanas)
**Alcance:** módulo de Escaneo (Fase 1 y 2 de la Parte F: QR + digitación asistida + foto de respaldo), migración de evaluaciones/preguntas/resultados a Supabase, exportación automática al índice institucional del `index` actual, mejoras de reportes (por pregunta, por competencia).
**Entregables:** app funcionando offline durante la aplicación de pruebas, resultados calificados automáticamente.
**Prioridad:** Alta.
**Dependencias:** Fase 1 completa; cuenta de Supabase creada.
**Riesgos:** curva de aprendizaje de Supabase para quien mantenga el proyecto; mitigable con la capa `services/` aislada.

### Fase 3 — OMR robusto + APK/PWA + administración avanzada (6-10 semanas)
**Alcance:** OMR semiautomático con OpenCV.js, bandeja de revisión, empaquetado como app instalable (PWA a APK con Bubblewrap/Capacitor), roles y permisos más finos, dashboard con más indicadores.
**Entregables:** flujo de escaneo real reduciendo digitación manual a los casos dudosos.
**Prioridad:** Media (mejora de eficiencia, no bloquea el uso del sistema).
**Dependencias:** Fase 2 estable con suficientes hojas reales para calibrar el umbral de detección.
**Riesgos:** calidad de impresión/fotocopiado del colegio afecta directamente la precisión del OMR — mitigar con plantillas de alto contraste y guías de encuadre.

---

## PARTE I — Despliegue en Netlify

1. El proyecto es 100% estático (HTML/CSS/JS módulos + `manifest.json` + `service-worker.js`), así que Netlify solo necesita servir la carpeta `dist/` (o la raíz si no hay build step en la Fase 1).
2. **Build command:** ninguno en Fase 1 (no hay bundler); en Fase 2, si se introduce Vite para los módulos, `npm run build` con `dist` como *publish directory*.
3. Variables de entorno en Netlify (Site settings → Environment variables) para no hardcodear credenciales: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_GAS_URL` (para el módulo de Análisis existente).
4. Activar **Netlify Forms** no es necesario aquí; sí conviene activar **Deploy Previews** por rama para probar cambios sin afectar producción.
5. El `service-worker.js` debe registrarse solo en producción (evitar cachear durante desarrollo).
6. Para PWA instalable: `manifest.json` con íconos del colegio, `display: standalone`, y HTTPS (Netlify lo da gratis) — requisito para el Background Sync del escaneo offline.

---

## PARTE J — ¿APK desde el inicio?

**No.** Recomendación: **PWA primero, APK después (Fase 3), y solo si de verdad hace falta.**

Razones concretas para este proyecto:
- Una PWA bien hecha (instalable, con ícono en el celular, funciona offline) cubre el 90% de lo que un docente necesita para escanear, sin pasar por Google Play (registro de desarrollador, revisiones, actualizaciones que dependen de aprobación).
- El acceso a cámara para QR y fotos funciona perfectamente en PWA sobre Chrome/Android, que es lo que previsiblemente usan los docentes.
- Empaquetar a APK (con Bubblewrap o Capacitor) es un paso *mecánico* al final, no una decisión de arquitectura — el código no cambia, solo se envuelve. Adelantarlo no da ninguna ventaja hoy y sí agrega complejidad de mantenimiento (firma de la app, actualizaciones, políticas de Play Store) antes de que el sistema esté probado.
- Si en algún punto se necesita distribución fuera de navegador (por ejemplo, un tablet institucional sin acceso fácil a Chrome), ahí sí se justifica el empaquetado — y para entonces la PWA ya estará madura y probada en producción real.
