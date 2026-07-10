# Plataforma de Evaluación — V1 (Fase 1)

## Backend (Fase 2 — ya activo)
Esta plataforma sincroniza con **su propio Google Sheet**, separado del de "Pruebas Semestrales", usando el mismo backend genérico de Apps Script (`Codigo_plataforma_evaluacion.gs`, incluido en esta entrega). localStorage sigue siendo la caché instantánea/offline; en segundo plano, cada cambio se sube a Sheets/Drive igual que ya hace el sistema de Análisis Semestral.

**Para activar el backend:**
1. Confirma acceso de edición a `https://docs.google.com/spreadsheets/d/1NRrBQo_nf0RjwdEpEp9pL0TeOwqPJxjWNhXP6yCwZzA/edit`
2. Pega `Codigo_plataforma_evaluacion.gs` en el proyecto de Apps Script de la URL configurada → Implementar → Nueva implementación → Ejecutar como Yo mismo, acceso Cualquier persona (acepta el permiso de Drive).
3. En la app: **Configuración → Probar conexión ahora**. Debe confirmar el Spreadsheet ID y "Drive: ✓ ok".

## Qué incluye esta V1
- ✅ Dashboard institucional
- ✅ Institucional (cursos + estudiantes, alta manual y en lote)
- ✅ Banco de evaluaciones + Constructor de preguntas
- ✅ Generador de hojas de respuesta con QR (imprimibles, formato de burbujas A-B-C-D)
- ✅ **Escaneo:** lectura de QR por cámara (jsQR) + digitación asistida, con entrada manual de respaldo si no hay cámara disponible
- ✅ **Resultados:** calificación automática contra la clave, desglose por competencia
- ✅ Sincronización con Google Sheets/Apps Script (Opción 2 de arquitectura), localStorage como caché instantánea/offline
- ✅ PWA instalable con caché offline del "app shell"
- ⏳ OMR automático (lectura óptica de la hoja física sin digitar) — Fase 3 del roadmap; hoy la identificación es 100% confiable (QR) y la captura de respuestas es manual-asistida, no leída ópticamente de la foto

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
Agrega `icon-192.png` y `icon-512.png` (el escudo del colegio, cuadrado) en esta misma carpeta para que la PWA se instale con el logo correcto — están referenciados en `manifest.json` pero no incluidos en esta entrega.

## Pendiente para Fase 3 (ver roadmap completo en ANALISIS_Y_ARQUITECTURA.md)
- OMR semiautomático: detectar las burbujas rellenas directamente de una foto de la hoja (hoy la identificación del estudiante es automática por QR, pero las respuestas se digitan a mano — rápido y confiable, pero no "óptico").
- Si el volumen de escaneos supera lo cómodo para Sheets/Apps Script (cientos de hojas por sesión, muchas sesiones simultáneas), evaluar migrar `services/sync.js` a Supabase — el resto de `modules/` no necesita cambiar, porque solo conocen `services/store.js`.

## Nota sobre la cámara (módulo Escaneo)
Requiere HTTPS (Netlify lo da automático) y permiso del navegador para usar la cámara. Si el dispositivo no tiene cámara o el permiso se niega, el campo manual ("...o pega aquí el contenido del QR") permite seguir trabajando sin bloquear al docente.

## Conexión con el sistema de Análisis Semestral actual
Este proyecto es independiente y no reemplaza el `index.html` de "Pruebas Semestrales" que ya está en producción — vive aparte y, en Fase 2, exporta hacia el mismo Google Sheet para que el módulo de Análisis siga funcionando exactamente igual.
