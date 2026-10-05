# CUESTIONARIO

**Convierte un PDF en un cuestionario de 4 opciones por pregunta y lo descarga en Word.**

### ▶ Pruébalo sin instalar nada: **<https://whoissif.github.io/cuestionario-pdf/>**

![Node](https://img.shields.io/badge/node-%E2%89%A522.13-brightgreen)
![Sin servidor](https://img.shields.io/badge/servidor-no%20hace%20falta-blue)
![GitHub Pages](https://img.shields.io/badge/GitHub%20Pages-listo-success)

Funciona **entera dentro de tu navegador**: no hay servidor, ni cuentas, ni base de datos. El PDF
que eliges **no se sube a ningún sitio**.

1. **Eliges un PDF** (uno por cuestionario, máximo 10 MB). Se lee en tu equipo y se ve una vista
   previa.
2. **Pulsa «Generar preguntas»** y la aplicación lo lee y redacta sola las preguntas, cada una con
   **4 opciones (A, B, C, D)** y una marcada como correcta.
3. **Revisas y corriges** lo que haga falta: enunciados, opciones, cuál es la correcta, quitar o
   añadir preguntas a mano.
4. **Descargas dos archivos de Word**: el **examen** (solo las preguntas, para imprimir) y el
   **solucionario** (tabla de respuestas correctas y clave rápida).
5. Opcionalmente, **genera las preguntas con IA**: Ollama en tu propio PC o servicios en la nube
   con **nivel gratuito**.

> **Por defecto NO usa IA**: la generación normal es un motor de reglas propio, sin internet, sin
> claves y sin coste. La IA es un extra que se activa si tú quieres.

> **No se guarda nada.** No hay base de datos ni sesión: el cuestionario vive en la pestaña del
> navegador hasta que lo descargas. Al cerrar la página, desaparece.

---

## Cómo se usa

1. **Elige el PDF** y pulsa **Leer el PDF**. Verás cuántas páginas tiene y cuánto texto se ha
   podido extraer.
2. **Indica cuántas preguntas quieres** (de 1 a 50) y pulsa **Generar preguntas**.
3. **Revisa y corrige** en la tarjeta *5 · Revisa y edita las preguntas*.
4. **Escribe el título** (aparece en la cabecera del examen y da nombre al archivo).
5. **Descarga el examen y el solucionario.**

> Si el documento no da para tantas preguntas como has pedido, se generan las que se pueden y te lo
> dice. Si es un escaneo (sin texto seleccionable), te avisa: no hay nada que leer.

### Descargar en Word (.docx)

| Archivo | Contenido |
|---------|-----------|
| `examen-<título>.docx` | Título, fecha, instrucciones y las preguntas numeradas con sus 4 opciones. |
| `soluciones-<título>.docx` | Tabla con el nº, la letra correcta y el texto de la respuesta, más la clave rápida (`1-B  2-D  …`). |

El Word se crea **en el navegador** con la librería `docx`: no hace falta tener Word instalado, ni
LibreOffice, ni ningún servidor.

### Generar con IA (opcional)

En la tarjeta *3 · O genera con IA*:

1. Elige el **servicio**. Los tres primeros **no necesitan clave ni registro**.
2. Pulsa **Ver modelos** (o **Probar conexión**) para comprobar que responde y rellenar el campo
   *Modelo* con la lista real del servicio.
3. Si el servicio pide **clave de API**, pégala. Se guarda **solo en tu navegador**
   (localStorage). El botón **Borrar clave** la elimina de ahí.
4. Pulsa **Generar con IA**.

| Servicio | ¿Clave? | Nivel gratuito |
|----------|---------|----------------|
| **Ollama en tu PC** | No | Gratis e ilimitado (usa tu equipo) |
| **LLM7.io** | **No** | Acceso básico sin registro; el que más margen da |
| **OVHcloud AI Endpoints** | **No** | 2 peticiones/minuto por IP, sin registro |
| **Groq** | Sí | 30 peticiones/minuto, sin tarjeta |
| **Google Gemini** | Sí | Gratis en muchos países (**no** en la UE, Reino Unido ni Suiza) |
| **OpenRouter** | Sí | Modelos con sufijo `:free` |
| **Cerebras** | Sí | Hasta 1 millón de tokens al día |
| **Mistral AI** | Sí | Plan «Experiment» |
| **Ollama Cloud** | Sí | Nivel gratuito con límites de uso |

> **Privacidad:** con Ollama en tu PC, el PDF **no sale de tu ordenador**. Con los servicios en la
> nube, el texto del PDF se envía a ese servicio (es lo que hace la IA); la aplicación te lo
> recuerda en cada caso y no lo envía a ningún otro sitio.

> **Aviso sobre los servicios en la nube:** al llamarlos **desde el navegador**, algunos pueden
> rechazar la petición por CORS. Ollama en tu PC funciona siempre. Si la IA falla, la aplicación te
> explica el motivo y **genera el cuestionario con el motor local**, para que nunca te quedes sin
> preguntas.

#### Instalar Ollama (IA gratis y local, sin claves)

1. Descarga Ollama desde <https://ollama.com/download> e instálalo.
2. Descarga un modelo (solo la primera vez):
   ```bash
   ollama pull llama3.2
   ```
3. Deja Ollama funcionando (arranca solo al instalar; si no, `ollama serve`).
4. En la app elige **«Ollama en tu PC»**, pulsa **Probar conexión** y luego **Generar con IA**.

---

## Ejecutarlo en tu equipo

Hace falta **Node.js 22.13 o superior** (lo exige `pdfjs-dist`, la librería que lee los PDF).

```bash
npm install     # solo la primera vez
npm run dev     # arranca un servidor local en http://localhost:3000
```

En Windows también puedes hacer **doble clic en `iniciar.cmd`**, que comprueba Node, instala las
dependencias la primera vez y abre el navegador.

> **¿Por qué hace falta un servidor si la aplicación no tiene servidor?** Porque el navegador no
> deja cargar módulos ES desde `file://`. El archivo `servidor/index.js` solo reparte los archivos
> por HTTP; **ninguna lógica de la aplicación pasa por él**. En GitHub Pages ese papel lo hace
> GitHub.

Si el puerto 3000 está ocupado: `set PORT=4000 && npm run dev` (CMD) ·
`$env:PORT=4000; npm run dev` (PowerShell).

---

## Publicar tu propia copia en GitHub Pages

```bash
npm run build     # construye la carpeta docs/ (la que se publica)
```

Después, en GitHub: **Settings → Pages → Source: Deploy from a branch → `main` → `/docs` → Save**.
En un minuto la aplicación estará en `https://TU-USUARIO.github.io/cuestionario-pdf/`.

La carpeta `docs/` **se sube al repositorio** (es el sitio publicado). `npm run build` la genera a
partir de `public/`, `nucleo/` y lo imprescindible de `node_modules`, y **comprueba** que no falte
nada antes de terminar.

Guía detallada, con los tres caminos posibles y los errores frecuentes:
**[PUBLICAR-EN-GITHUB.md](PUBLICAR-EN-GITHUB.md)**

---

## Qué se guarda y qué no

| Dato | ¿Se guarda? |
|------|-------------|
| El PDF que eliges | **No.** Se lee en tu navegador; nunca se sube. |
| Cuestionario y preguntas | **No.** Solo en la memoria de la pestaña. |
| Respuestas y puntuaciones | **No existen**: la app genera exámenes, no los corrige. |
| Clave de API | Solo en el **localStorage de tu navegador**. |
| Preferencias de IA (servicio, URL, modelo) | También en el localStorage. |

No hay ningún dato en ningún servidor porque **no hay servidor**.

---

## Documento de ejemplo para probar

El proyecto incluye **`samples/documento-ejemplo.pdf`**, un mini-temario ficticio de Derecho civil
(definiciones, un artículo, listas de conceptos y frases con términos). Pídele 8 preguntas: salen 8,
de cinco tipos distintos. Pidiendo 20 salen las 11 que el documento permite.

También hay dos Word de muestra: `samples/ejemplo-examen.docx` y `samples/ejemplo-soluciones.docx`.

Si borras el PDF, puedes regenerarlo:

```bash
npm run pdf-ejemplo
```

---

## Auditoría por consola

Para ver **qué texto** se lee de un PDF y **qué preguntas** salen, sin abrir el navegador:

```bash
npm run texto      -- samples/documento-ejemplo.pdf        # texto leído, línea a línea
npm run extraccion -- samples/documento-ejemplo.pdf        # ¿tiene texto extraíble?
npm run generar    -- samples/documento-ejemplo.pdf 10     # 10 preguntas propuestas
```

Es la forma más rápida de comprobar la calidad del motor con un documento nuevo.

### Comprobar un .docx descargado

```bash
npm run verificar-docx -- "$env:TEMP"     # o la carpeta donde hayas guardado el .docx
```

Abre el archivo como ZIP y confirma que Word podrá leerlo, mostrando su texto y sus tablas.

### Comprobar la IA sin gastar cuota

El proyecto incluye un **servidor de IA simulado** que imita a la vez la API de Ollama y la
compatible con OpenAI. Permite probar todo el circuito sin claves, sin internet y sin gastar nada:

```bash
npm run ia-falsa      # escucha en http://127.0.0.1:11499
```

En la app elige **«Otro servidor Ollama»** y pon esa URL. Para provocar fallos, usa como modelo
`falla-401`, `falla-429`, `basura`, `pocas` o `duplicadas`.

---

## Estructura del proyecto

```
cuestionario-pdf/
├─ nucleo/                 # el «cerebro»: módulos compartidos navegador + Node
│  ├─ pdf.js              # extraer el texto del PDF (PDF.js se inyecta)
│  ├─ generador.js        # motor de reglas que redacta las preguntas
│  ├─ docx.js             # construir el examen y el solucionario (docx se inyecta)
│  └─ ia.js               # generación opcional con IA (11 servicios, 2 familias de API)
├─ public/                 # la aplicación
│  ├─ index.html           # interfaz (una sola pantalla)
│  ├─ styles.css           # estilos (Material Design Lite + propios)
│  └─ app.js               # módulo ES que usa nucleo/ y window.docx
├─ servidor/
│  └─ index.js            # servidor local opcional (solo reparte archivos)
├─ docs/                   # sitio construido que publica GitHub Pages (npm run build)
├─ scripts/                # herramientas de consola y construcción
├─ samples/                # PDF y .docx de ejemplo
├─ iniciar.cmd             # arranque con doble clic (Windows)
├─ PUBLICAR-EN-GITHUB.md   # cómo publicar tu propia copia
├─ INSTRUCCIONES.md        # especificación técnica completa
└─ package.json
```

---

## Las piezas compartidas (`nucleo/`)

Son módulos ES que funcionan **igual en el navegador y en Node**, así que la aplicación y las
herramientas de consola usan exactamente el mismo código. No usan nada exclusivo de Node: las
librerías que necesitan se **inyectan**.

| Módulo | Qué exporta |
|--------|-------------|
| `nucleo/pdf.js` | `agruparEnLineas(items)`, `extraerLineas(pdfjs, datos)` → `{ numPages, pages, lines, text }` |
| `nucleo/generador.js` | `generarPreguntasDeLineas(lines, cantidad)` → `{ preguntas, candidatas, tipos, tema }` |
| `nucleo/docx.js` | `construirDocumento(tipo, datos, docxLib)`, `nombreArchivoDocx(tipo, título)`, `fechaActual()` |
| `nucleo/ia.js` | `catalogo()`, `normalizarConfig(config)`, `listarModelos(config)`, `generarConIA({ config, texto, paginas, cantidad })` |

La inyección es lo que permite usar la misma lógica en los dos mundos:

```js
// En el navegador (public/app.js)
const documento = construirDocumento('examen', datos, window.docx);
const blob = await window.docx.Packer.toBlob(documento);

// En Node (una herramienta de consola)
const docx = require('docx');
const documento = construirDocumento('examen', datos, docx);
const buffer = await docx.Packer.toBuffer(documento);
```

---

## Notas técnicas

- **Sin servidor de aplicación**: no hay API, ni base de datos, ni subida de archivos. (En la
  versión 1.x había SQLite y una API REST; se retiraron en la 2.0, y en la 3.0 el servidor pasó a
  ser solo un repartidor de archivos para uso local.)
- **Sin CDN**: PDF.js, Material Design Lite y la librería `docx` se copian dentro de `docs/vendor`,
  así que la aplicación funciona **sin conexión a internet** (salvo si usas la IA de la nube).
- **Rutas relativas**: `index.html` y `app.js` usan `./nucleo/…` y `./vendor/…` a propósito, para
  funcionar igual en la raíz de un sitio que dentro de la subcarpeta de GitHub Pages.
- **El motor local** detecta definiciones («El contrato es…»), artículos («art. 1254 CC establece
  que…»), listas de conceptos con viñetas y enumeraciones. Elige los distractores de la misma
  sección, filtra por forma gramatical y ajusta la longitud para que la correcta no se delate.
  Primero **construye** todas las preguntas y después elige, para no perder ninguna por el camino.
- **IA opcional**: dos familias de API (Ollama nativa y compatible con OpenAI), tandas de 14.000
  caracteres (un documento normal cabe en **una sola petición**), reintentos automáticos si el
  servicio limita (HTTP 429 con `Retry-After`), recuperación cuando el modelo ya no existe,
  segunda pasada si devuelve menos preguntas y mensajes de error en español.
- **Frontend sin framework**: HTML, CSS y JavaScript vanilla (módulos ES).

---

## Licencia

Este proyecto **no incluye licencia**: sin licencia, los derechos quedan reservados al autor. Si
quieres que otros puedan usarlo y modificarlo, añade un archivo `LICENSE` (por ejemplo, la licencia
MIT) desde **Add file → Create new file → Choose a license template**.

---

## Tecnologías

[PDF.js](https://mozilla.github.io/pdf.js/) ·
[docx](https://docx.js.org/) ·
[Material Design Lite](https://getmdl.io/) ·
[Express](https://expressjs.com/) (solo para el servidor local opcional)
