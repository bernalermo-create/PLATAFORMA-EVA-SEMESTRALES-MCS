# Plataforma de Evaluación — V1 (Fase 1)

## Backend (Fase 2 — ya activo)
Esta plataforma sincroniza con **su propio Google Sheet**, separado del de "Pruebas Semestrales", usando el mismo backend genérico de Apps Script (`Codigo_plataforma_evaluacion.gs`, incluido en esta entrega). localStorage sigue siendo la caché instantánea/offline; en segundo plano, cada cambio se sube a Sheets/Drive igual que ya hace el sistema de Análisis Semestral.

**Para activar el backend:**
1. Confirma acceso de edición a `https://docs.google.com/spreadsheets/d/1NRrBQo_nf0RjwdEpEp9pL0TeOwqPJxjWNhXP6yCwZzA/edit`
2. Pega `Codigo_plataforma_evaluacion.gs` en el proyecto de Apps Script de la URL configurada → Implementar → Nueva implementación → Ejecutar como Yo mismo, acceso Cualquier persona (acepta el permiso de Drive).
3. En la app: **Configuración → Probar conexión ahora**. Debe confirmar el Spreadsheet ID y "Drive: ✓ ok".

## Qué incluye esta V1
- ✅ **Login** con dos roles: Admin (usuario+contraseña) y Docente (nombre+contraseña compartida), ambas cambiables desde Configuración
- ✅ Dashboard institucional
- ✅ Institucional: cursos + estudiantes, alta manual, en lote, **y desde Excel** (SheetJS) — con botón de borrar en ambos niveles
- ✅ Banco de evaluaciones + **Constructor diagnóstico**: cada opción (A-D) de cada pregunta representa un nivel de desempeño distinto (Bajo/Básico/Alto/Superior), no una única respuesta "correcta"
- ✅ **Cuadernillo imprimible**: portada, instrucciones y preguntas completas en el formato oficial del colegio (portada con diagonal navy/teal, escudo, PEI, "SESIÓN N"), agrupando **varias áreas en una sola sesión** con numeración continua (ej. Matemáticas 1-10, Ciencias 11-20, Inglés 21-30)
- ✅ **Hoja de respuestas agrupada** por la misma sesión y numeración que el cuadernillo (una columna por área, cada una repite nombre/curso — mismo formato que las hojas físicas del colegio), un solo QR por hoja identifica estudiante + curso + todas las áreas de esa sesión
- ✅ **Panel Admin vs Panel Docente diferenciado**: cada docente ve y edita únicamente sus propias evaluaciones (por nombre de login); el administrador ve y gestiona todas. El Dashboard, Evaluaciones y Resultados muestran contenido y encabezados distintos según el rol. El Boletín por curso (que cruza áreas de varios docentes) es exclusivo del Admin.
- ✅ **Imágenes en preguntas**: los docentes pueden adjuntar una imagen (gráfico, mapa, foto) a cada pregunta al redactarla; se sube a Drive igual que las fotos de respaldo y aparece en el cuadernillo impreso
- ✅ **Escaneo:** lectura de QR por cámara (jsQR) + digitación asistida + **foto de respaldo de la hoja física** (subida a Drive, enlazada al resultado para poder revisarla después)
- ✅ **Resultados:** nivel de desempeño predominante (no porcentaje de aciertos), desglose por competencia, enlace a la foto de respaldo si existe, y **nota final sobre 50** (conversión proporcional)
- ✅ **Boletín por curso**: reporte imprimible con todos los estudiantes de un curso/sesión, nivel + nota por área y promedio general — para publicar/entregar
- ✅ Sincronización con Google Sheets/Apps Script, localStorage como caché instantánea/offline, **con consulta automática cada 25s** para traer cambios de otros usuarios sin necesidad de cerrar sesión
- ✅ PWA instalable con el escudo del colegio como ícono
- ⏳ OMR automático (leer las burbujas directamente de la foto, sin digitar) — Fase 3 del roadmap

## Credenciales por defecto (cámbialas en Configuración)
- Admin: usuario `admin`, contraseña `cervantes2026`
- Docentes: contraseña compartida `docente2026` (cada docente escribe su propio nombre al entrar)

## Cómo probarlo ya mismo
No necesita build ni instalación de dependencias:

1. Sube toda esta carpeta tal cual a Netlify (arrastrar y soltar la carpeta en app.netlify.com, o conectar el repo de GitHub).
2. O pruébalo local: `npx serve .` dentro de la carpeta (los ES Modules no funcionan abriendo el archivo directo con `file://`, necesitan un servidor).

## Dónde vive cada cosa
```
index.html          shell + navegación
styles.css           estilo institucional
app.js               enrutador (carga cada módulo bajo demanda)
services/store.js    capa de datos (hoy: localStorage — mañana: Supabase)
services/qr.js       generación de QR en cliente
modules/*.js         una pantalla por archivo
manifest.json        PWA — reemplaza icon-192.png / icon-512.png por el escudo del colegio
service-worker.js    caché offline del app shell (Fase 1)
```

## Icono institucional
Ya incluido: `icon-192.png` e `icon-512.png` (generados a partir del escudo real del colegio) — se usan en el login, la barra superior y la instalación como PWA.

## Pendiente para Fase 3 (ver roadmap completo en ANALISIS_Y_ARQUITECTURA.md)
- OMR semiautomático: detectar las burbujas rellenas directamente de una foto de la hoja (hoy la identificación del estudiante es automática por QR, pero las respuestas se digitan a mano — rápido y confiable, pero no "óptico").
- Si el volumen de escaneos supera lo cómodo para Sheets/Apps Script (cientos de hojas por sesión, muchas sesiones simultáneas), evaluar migrar `services/sync.js` a Supabase — el resto de `modules/` no necesita cambiar, porque solo conocen `services/store.js`.

## Nota sobre la cámara (módulo Escaneo)
Requiere HTTPS (Netlify lo da automático) y permiso del navegador para usar la cámara. Si el dispositivo no tiene cámara o el permiso se niega, el campo manual ("...o pega aquí el contenido del QR") permite seguir trabajando sin bloquear al docente.

## Conexión con el sistema de Análisis Semestral actual
Este proyecto es independiente y no reemplaza el `index.html` de "Pruebas Semestrales" que ya está en producción — vive aparte y, en Fase 2, exporta hacia el mismo Google Sheet para que el módulo de Análisis siga funcionando exactamente igual.
