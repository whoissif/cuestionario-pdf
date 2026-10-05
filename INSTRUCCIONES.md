# Especificación del proyecto **CUESTIONARIO** (v3.0)

> Documento de instrucciones para generar y mantener la aplicación.
> Versión del proyecto: **3.0.0** (`cuestionario-pdf`) · Última actualización: **05/10/2026**.
> Estado: **implementado y publicado en GitHub Pages** (ver «Estado de implementación»).
>
> **La 3.0 es una web app 100 % estática.** No hay servidor de aplicación, ni API, ni subida de
> archivos: leer el PDF, redactar las preguntas y crear el Word ocurre **entero dentro del
> navegador**. Node.js solo hace falta para desarrollar (servidor de comodidad, herramientas y
> construcción del sitio).

---

## Historial de versiones

| Versión | Cambio principal |
|---------|------------------|
| **1.0** | Creación. Aplicación web local que sube un PDF, **genera** el cuestionario de 4 opciones, lo **guarda en SQLite** y permite **responderlo** con puntuación. Incluía exportación a Word (.docx) y generación opcional con IA. |
| **2.0** | **Se retira la base de datos y la vista «Responder»**: la aplicación ya no guarda nada en el servidor. Se eliminan `backend/db.js` y la carpeta `data/`, los endpoints `POST /api/quiz`, `GET /api/quizzes`, `GET /api/quiz/:id`, `GET /api/quiz/:id/docx` y `POST /api/answers` (en la 2.0 pasaron a responder **404**), y el script `scripts/borrar-cuestionario.js`. El paquete pasa a llamarse **`cuestionario-pdf`** y exige **Node ≥ 22.13** (lo pide `pdfjs-dist`; ya no lo impone `node:sqlite`). |
| **3.0** | **La aplicación deja de ser un servidor Node y pasa a ser una web app 100 % estática.** El PDF se lee en el navegador con PDF.js y el Word se construye en el navegador con la librería `docx`, así que **desaparecen los siete endpoints que quedaban** (`/api/upload`, `/api/generate`, `/api/docx`, los tres `/api/ia/*` y el `/api/health` de la aplicación), el servidor de aplicación (`backend/index.js`, `routes.js`, `utils.js`, `generador.js`, `pdf-texto.js`, `docx.js`, `ia.js`) y la dependencia **`multer`**. El motor, la lectura del PDF, la capa de IA y la exportación a Word se extraen a **`nucleo/`**, cuatro módulos **ESM compartidos** que funcionan igual en el navegador y en Node. Se añaden `servidor/index.js` (servidor estático **opcional** para uso local), `scripts/construir-web.js` y la carpeta **`docs/`** que publica GitHub Pages. `pdf-lib` pasa a **`devDependencies`** (solo lo usa el generador del PDF de ejemplo) y la interfaz cambia la tarjeta 1 por «1 · Elige el documento PDF». |

### Por qué se retiró SQLite (decisión de la 2.0)

En la **1.x** la aplicación guardaba los cuestionarios, las preguntas y los intentos en SQLite
(`data/data.db`) mediante el módulo integrado `node:sqlite`. Eso permitía listar los cuestionarios
creados y **responderlos** con corrección y puntuación.

En la **2.0** ese alcance se descartó por completo. El producto quedó definido como una
**herramienta de un solo uso**: subir un PDF, obtener el cuestionario y descargarlo en Word. Con
ese alcance, la base de datos solo añadía peso (esquema, transacciones, migraciones y ficheros
`data.db`, `data.db-wal`, `data.db-shm`) sin aportar nada al usuario, así que:

- Se eliminó `backend/db.js` y toda dependencia de `node:sqlite`.
- Se eliminó la carpeta `data/`; **el servidor ya no crea ningún archivo de datos al arrancar**.
- Se eliminó la vista «Responder» (listado, visor del *runner*, formulario de respuestas y
  corrección con puntuación) junto con su lógica en `app.js`.
- Se eliminaron los cinco endpoints asociados y el script `borrar-cuestionario.js`, que ya no
  tenía sentido.

> **Ventaja añadida:** al no haber persistencia, tampoco hay nada que proteger en el servidor. La
> respuesta correcta dejó de ocultarse al navegador (ver «La respuesta correcta ya no se oculta»),
> porque ya no existe un servicio que la custodie.

En la **3.0** ese razonamiento se lleva hasta el final: **si no hay nada que guardar ni nada que
custodiar, tampoco hace falta un servidor**. Retirarlo es lo que permite publicar la aplicación como
sitio estático en GitHub Pages y usarla sin instalar nada, ni en el equipo propio ni en el del
visitante.

---

## Visión general

**Web app 100 % estática** que **genera automáticamente** un cuestionario de preguntas con
**4 opciones de respuesta** (A, B, C, D) a partir de un **documento PDF** (uno por cuestionario),
permite **revisar y editar** las preguntas y **descargarlas en Word** como examen y como
solucionario.

- **Todo ocurre dentro del navegador**: no hay servidor de aplicación, ni API, ni base de datos, ni
  subida de archivos. El PDF se lee en local con PDF.js y el `.docx` se construye en local con la
  librería `docx`.
- Precisamente por eso se puede **publicar en GitHub Pages** (carpeta `docs/`) y usar **sin instalar
  nada**: basta con abrir la página.
- La generación de preguntas es **local y sin internet** por defecto: no usa IA ni claves de API
  (es el **motor de reglas** de `nucleo/generador.js`).
- **Opcionalmente** se puede generar con IA (Ollama en el propio equipo, o servicios en la nube con
  nivel gratuito). Esa vía la activa el usuario, su clave se queda en su navegador y, si la IA
  falla, la aplicación **cae al motor local**.
- **No se guarda nada**: ni el PDF (que **nunca sale del navegador**), ni el cuestionario, ni las
  preguntas. Todo el estado vive en memoria en la pestaña (`state` en `app.js`) hasta que se
  descarga el `.docx`.
- Acceso **anónimo**: no hay registro, ni inicio de sesión, ni modo «responder».
- Interfaz en **español**, con una **sola vista** («Crear»).
- El uso de Node.js es **opcional y solo para el desarrollador**: el servidor estático de
  `servidor/index.js` (comodidad en local), las herramientas de `scripts/` y la construcción de
  `docs/`.

---

## Tecnologías seleccionadas

| Área | Tecnología | Comentario |
|------|------------|------------|
| **Interfaz** | HTML + CSS + JavaScript **vanilla**, módulos ES | Sin frameworks. Estilo **Material Design Lite**. |
| **Lectura del PDF** | **PDF.js** (`pdfjs-dist`) | En el navegador el build web; en las herramientas de consola el build *legacy*. Se sirve desde `vendor/` (sin CDN). |
| **Generación de preguntas** | **Motor propio** (`nucleo/generador.js`) | Reglas sobre el texto: **sin IA, sin API, sin internet**. |
| **Generación con IA (opcional)** | **`nucleo/ia.js`** | Ollama (API nativa) y API compatible con OpenAI. La clave se queda en el navegador. |
| **Exportación a Word** | **`docx` 9** | Se ejecuta **dentro del navegador** (`Packer.toBlob`), sin LibreOffice ni Word instalados. |
| **Núcleo compartido** | **`nucleo/`** (4 módulos ESM) | Funciona igual en el navegador y en Node: nada de `require`, `fs` ni APIs exclusivas de Node. |
| **Servidor local (opcional)** | **Node.js ≥ 22.13** + **Express 5** | Solo sirve archivos estáticos para abrir la aplicación con comodidad. **No hay API.** |
| **Publicación** | **GitHub Pages** | Publica la carpeta `docs/` ya construida (*Deploy from a branch → main → /docs*). |
| **Construcción del sitio** | `scripts/construir-web.js` | Copia `public/`, `nucleo/` y lo imprescindible de `node_modules` a `docs/`, y lo verifica. |
| **PDF de ejemplo** | **pdf-lib** (`devDependencies`) | Solo lo usa `scripts/make-sample-pdf.cjs` para fabricar el PDF de prueba. |
| **Empaquetado (opcional)** | Docker | El proyecto funciona sin Docker; el contenedor **no está incluido**. |

**Node.js solo hace falta para desarrollar.** La versión mínima es **22.13.0** porque es lo que pide
`pdfjs-dist`; ninguna dependencia compila código nativo, así que `npm install` baja solo JavaScript
puro. Para **usar** la aplicación publicada no hace falta Node en absoluto: es una página web.

---

## Requerimientos funcionales

1. **Elegir y leer el PDF** (todo dentro del navegador)
   - El usuario elige un archivo con el selector y pulsa **«Leer el PDF»**: el archivo **no se sube
     a ningún sitio**.
   - Se comprueba que sea un PDF y que no supere **10 MB** (`MAX_PDF_BYTES` en `app.js`).
   - Se lee como `Uint8Array` y se extrae el texto con PDF.js mediante
     `extraerLineas(pdfjs, datos)` (`nucleo/pdf.js`). Si el documento no tiene texto seleccionable
     (probable escaneo), se avisa.
   - Se dibuja una **vista previa** de hasta 12 páginas en `<canvas>` y se ofrece un enlace para
     abrir el PDF aparte (Object URL del propio archivo).
2. **Generación automática de preguntas** ⭐ (función principal)
   - `generarPreguntasDeLineas(lines, cantidad)` (`nucleo/generador.js`) recibe las **líneas** del
     documento y devuelve las preguntas ya redactadas con sus **4 opciones** y la correcta marcada.
   - El motor es **local**: estructura el texto en bloques (títulos, viñetas y párrafos) y detecta
     hechos respondibles (**ver «Motor de generación»**).
   - La cantidad admitida es de **1 a 50** preguntas (por defecto 10).
   - Si el documento no da para tantas, devuelve las que ha podido construir y lo indica en pantalla.
   - El usuario **revisa y edita** las preguntas generadas antes de descargarlas.
3. **Generación con IA (opcional)** ⭐
   - `catalogo()` (`nucleo/ia.js`) devuelve los **11 servicios** del catálogo (sin claves).
   - `listarModelos(config)` lista los modelos del servicio y **sirve de prueba de conexión**.
   - `generarConIA({ config, texto, paginas, cantidad })` genera las preguntas a partir del
     **texto ya extraído**.
   - **La clave de API no se guarda en ningún servidor**: se escribe en el `localStorage` del
     navegador (`cuestionario.ia.config`) y viaja solo en la petición a ese servicio concreto.
   - Si la IA falla, la interfaz avisa del motivo y **continúa con el motor local**.
4. **Exportación a Word (.docx)** ⭐
   - Se generan **dos documentos independientes**:
     - `examen` → título, fecha, instrucciones y las preguntas numeradas con sus 4 opciones.
     - `soluciones` → tabla (nº, letra correcta, texto) y **clave rápida** al final.
   - `construirDocumento(tipo, datos, docxLib)` (`nucleo/docx.js`) monta el documento y **quien
     llama lo empaqueta**: `Packer.toBlob` en el navegador (`window.docx`), `Packer.toBuffer` en
     Node.
   - La descarga se dispara con un **Object URL** y el nombre del archivo sale de `nombreArchivoDocx`
     (por ejemplo `examen-tema-3-el-contrato.docx`).
5. **Sin persistencia y sin servidor** (requisito explícito)
   - La aplicación **no guarda** cuestionarios, preguntas, respuestas ni puntuaciones, y **no sube
     el PDF**.
   - Recargar la página descarta el cuestionario en curso.
   - **No hay ninguna API HTTP**: los siete endpoints de la 2.0 ya no existen en el proyecto.

---

## Qué se guarda y qué no

| Dato | ¿Se guarda? |
|------|-------------|
| Cuestionario y preguntas | **No.** Solo en la memoria de la pestaña (`state` en `app.js`). |
| Respuestas y puntuaciones | **No existen**: la aplicación no tiene modo «responder». |
| **El PDF elegido** | **No.** Se lee en memoria con PDF.js y **nunca se sube** a ningún sitio. |
| Clave de API | Solo en el **localStorage del navegador** (`cuestionario.ia.config`), por servicio. |
| Texto del PDF (solo si se usa IA) | Se envía **al servicio que elijas**, porque es él quien redacta. Con Ollama en tu PC no sale del ordenador. |

Como la aplicación **no tiene servidor**, el navegador es el único sitio donde hay datos. Para
borrarlo todo basta con cerrar la pestaña y, si se quiere, borrar el almacenamiento local del sitio
(que solo contiene la configuración de IA: URL, modelo y clave).

> **Restos de versiones anteriores:** sigue existiendo la carpeta `backend/uploads/` con los PDFs
> que se subieron cuando la aplicación tenía servidor (1.x y 2.0). **Ya no los usa nadie** —en la
> 3.0 el PDF no sale del navegador— y está ignorada por Git, así que se pueden borrar sin más:
>
> ```bash
> rm -rf backend/uploads                  # Linux/macOS
> Remove-Item backend\uploads -Recurse    # PowerShell
> ```

---

## Motor de generación (local, sin IA)

Está en **`nucleo/generador.js`** (módulo compartido) y trabaja en cuatro fases:

1. **Extracción** (`nucleo/pdf.js`): `extraerLineas(pdfjs, datos)` recibe los **bytes** del PDF y la
   librería PDF.js **inyectada** (el navegador pasa el build web, las herramientas de consola el
   *legacy*) y agrupa los fragmentos de texto en líneas usando la coordenada vertical de cada uno.
   Aquí no se abre ningún archivo: quien llama ya ha leído los bytes.
2. **Estructuración** (`parsearBloques`): reconstruye el documento en títulos de sección,
   viñetas y párrafos, y vuelve a unir las frases que el PDF corta a lo ancho.
3. **Detección de hechos** (`recolectar`): busca patrones de temario.
4. **Montaje** (`construirSemillas` + `seleccionar` + `montarOpciones`): elige los distractores y
   baraja las 4 opciones. **Las preguntas se construyen antes de seleccionarse**, de modo que una
   semilla que no encuentre distractores válidos no descuenta cupo: si el documento da para lo
   pedido, se entregan tantas preguntas como se hayan pedido.

La función pública es `generarPreguntasDeLineas(lines, cantidad)` y recibe **líneas de texto**, no
una ruta de archivo. Así el mismo motor sirve para el navegador y para las herramientas de consola
(que leen el archivo del disco con `scripts/lib/pdf-nodo.js`).

### Tipos de pregunta que sabe construir
| Tipo | Patrón del documento | Ejemplo |
|------|----------------------|---------|
| `articulo` | «el art. 1.254 CC establece que …» | ¿Qué establece el art. 1.254 CC? |
| `definicion` | «El contrato **es** …», «… **supone que** …», «… **sirve para** …» | ¿Qué es la oferta? |
| `vineta_termino` | «● Consensuales: se perfeccionan …» | ¿Qué se entiende por «Consensuales»? |
| `vineta_descripcion` | el mismo ítem, en sentido inverso | ¿A qué concepto corresponde esta definición: «…»? |
| `enumeracion` | lista de 3+ conceptos tras «Según …:» | ¿Cuáles son los tipos de contrato según su perfeccionamiento? |
| `hueco` | frase con un término definido en el documento | Completa la frase: «… en los _____, la causa es …» |

### Cómo elige los distractores (clave de la calidad)
- Prefiere **conceptos de la misma lista o sección**, que son los realmente confundibles.
- Descarta opciones que **contienen** a la correcta o están contenidas en ella (evita ambigüedad).
- Ajusta la **longitud** de las opciones (entre 0,5× y 1,9× la correcta) para que la respuesta
  no se delate por ser la más larga.
- Respeta la **forma gramatical**: una definición nominal no se mezcla con una subordinada
  («Que …») ni con un infinitivo («Garantizar que …»).
- Reparte los tipos de pregunta por rondas, de modo que un cuestionario de 10 preguntas no salga
  con las 10 del mismo tipo, y no repite dos veces el mismo hecho.

---

## Generación con IA (opcional) — `nucleo/ia.js`

La IA **no sustituye** al motor local: es una vía alternativa que el usuario activa cuando quiere.
En la 3.0 esta capa se ha movido **tal cual** a `nucleo/ia.js`, un módulo compartido que solo usa
`fetch`, `AbortSignal` y `URL` (existen en el navegador y en Node). Ya **no lee archivos**: recibe el
**texto ya extraído**; de la lectura se encarga `nucleo/pdf.js`. El port se validó con
**44 comprobaciones, 0 fallos** (ver «Pruebas realizadas»).

### Dos familias de API
| Familia | Se usa para | Listar modelos | Generar |
|---------|-------------|----------------|---------|
| `ollama` | Ollama en el PC, Ollama Cloud, otro Ollama en la red | `GET /api/tags` | `POST /api/chat` (`stream:false`, `format:'json'`) |
| `openai` | Groq, Gemini, OpenRouter, Cerebras, Mistral y cualquier compatible | `GET /models` | `POST /chat/completions` |

- Si el servicio **no admite** `response_format: json_object`, se reintenta automáticamente sin
  ese campo (así funcionan también los que no lo soportan).
- Ollama se invoca con `format: 'json'`, que ya fuerza una salida JSON válida.
- Tiempo máximo por llamada: **180 s** (los modelos locales son lentos).

### Servicios incluidos en el catálogo
Sin clave: **Ollama local**, **LLM7.io** y **OVHcloud AI Endpoints** (nivel anónimo).
Con clave: **Groq**, **Google Gemini**, **OpenRouter** (`:free`), **Cerebras**, **Mistral AI**
y **Ollama Cloud**. Además, dos entradas genéricas («otro compatible con OpenAI» y «otro
servidor Ollama») para cualquier servicio propio.

El cliente ordena la lista poniendo primero los servicios **sin clave**, y dentro de ellos
**LLM7.io antes que OVHcloud** por un motivo práctico: LLM7.io admite unas 30 peticiones por
minuto y OVHcloud solo 2.

### Cómo se prepara el material y se reparten las preguntas
1. `materialDeTexto(texto, paginas)` reutiliza el analizador del motor local (`parsearBloques`,
   importado de `nucleo/generador.js`) y escribe el texto con estructura: `## título`, `- viñeta` y
   párrafos. `contarPaginas` deduce las páginas de los saltos de página (`\f`) o del dato que le
   pase quien llama.
2. `dividirEnTandas` lo parte en tandas de como mucho **14.000 caracteres**, equilibradas: los
   cortes se calculan sobre la longitud **acumulada** (1/N, 2/N… del texto), no sobre el tamaño
   de cada tanda. Si cada tanda se llenara hasta el máximo, la última quedaría con cuatro líneas
   y el final del documento apenas generaría preguntas.
3. **Cada tanda es una petición al servicio**, así que el tamaño se eligió alto a propósito: los
   niveles gratuitos limitan mucho el número de peticiones (OVHcloud anónimo, 2 por minuto) y un
   documento normal cabe en **una sola**. Comprobado: un PDF de 9.269 caracteres → **1 tanda**
   (antes se partía en dos o tres).
4. Las preguntas se reparten proporcionalmente al tamaño de cada tanda y se ajusta la suma para
   pedir exactamente el número solicitado.
5. **Segunda pasada** (una sola vez): si el modelo devolvió menos de lo pedido, o repitió
   preguntas y el deduplicador las descartó, se le piden las que faltan.

### Límites gratuitos: reintento automático ante HTTP 429
Los niveles gratuitos responden 429 cuando se supera su cuota. `enviarConReintento`:
- Respeta la cabecera **`Retry-After`** (en segundos o como fecha), con un tope de 90 s.
- Si no viene, espera 30 s y luego 45 s (máximo **2 reintentos**).
- Deja un aviso en el resultado: «El servicio ha alcanzado su límite gratuito; se espera N s y se
  reintenta (1 de 2).»

Si el 429 persiste, el mensaje final propone esperar, pedir menos preguntas o cambiar a un
servicio con más margen (LLM7.io en lugar de OVHcloud).

### Validación de lo que devuelve el modelo
`limpiarPreguntaIA` acepta las variantes que usan los modelos reales y descarta lo que no sirve:
- Acepta `text`/`pregunta`/`question`/`enunciado` y `options`/`opciones`/`answers`.
- Acepta las opciones como **objeto** `{A,B,C,D}` o como **array**.
- Acepta la respuesta correcta como **letra** (`"A"`) o como **el texto** de la opción
  (se busca a qué letra corresponde).
- Descarta la pregunta si falta el enunciado, falta alguna opción, hay opciones repetidas
  (ambigüedad) o el enunciado supera 400 caracteres.
- El JSON se extrae aunque venga dentro de un bloque ``` ```json ``` o rodeado de explicaciones.

### Recuperación automática si el modelo ya no existe
Los servicios retiran modelos con frecuencia (p. ej. `deepseek-v3-0324` en LLM7.io). En vez de
fallar, la aplicación:
1. Detecta que el error se debe al modelo (`esErrorDeModelo`), reconociendo las muchas formas en
   que lo dicen: *is currently unavailable*, *not found*, *does not exist*, *unknown model*,
   *invalid model*, *deprecated*, *model_not_found*… (también con nombres que llevan puntos).
2. Consulta la lista real del servicio (`listarModelos`).
3. Elige un modelo conversacional con `elegirModeloDisponible`, que **descarta los que no sirven
   para redactar** (embeddings, `bge`, `whisper`, `tts`, `rerank`, imagen, vídeo, *guard*…) y
   prefiere los de tipo chat.
4. Reintenta la generación completa y añade un aviso: «El modelo «X» no está disponible en este
   servicio, así que se ha usado «Y».»

Solo se reintenta una vez, y únicamente ante errores de modelo: un 401 (clave), un 429 (límite)
o un 500 **no** se confunden con un modelo inexistente.

### Mensajes de error (todo en español)
Clave inválida (401/403), límite agotado (429), URL equivocada (404), modelo inexistente (400),
servicio apagado (`ECONNREFUSED`), sin conexión (`ENOTFOUND`) y tiempo agotado (`TimeoutError`).

### Seguridad de la clave
- La clave **no se envía a ninguna otra parte**: viaja en la cabecera de la única llamada al servicio
  elegido y se descarta al terminar.
- **No hay ningún servidor propio que la vea**: en la 3.0 la petición sale del navegador
  directamente hacia el servicio.
- El navegador la guarda en `localStorage` bajo `cuestionario.ia.config`, por servicio, junto con la
  URL y el modelo: es el **único dato que la aplicación conserva** en el equipo. El botón
  **Borrar clave** la elimina de ahí.

### Aviso honesto sobre CORS (novedad de la 3.0)
Antes la llamada a la IA salía del servidor; ahora sale **del navegador**, que es quien tiene el
texto. Eso significa que **el servicio debe permitir peticiones desde otro origen (CORS)**: algunos
servicios en la nube rechazan la petición por este motivo y el navegador no deja leer la respuesta.

- **Ollama en el propio PC funciona** y es la opción sin clave más fiable.
- Si un servicio en la nube falla por CORS, la aplicación lo dice y **cae al motor local**, así que
  nunca te quedas sin cuestionario.
- No es un fallo de la aplicación ni se puede arreglar desde el cliente: la decisión es del servicio.

---

## Estructura del proyecto (real)

```
cuestionario-app/
├─ package.json            # paquete «cuestionario-pdf» v3.0.0: scripts y dependencias
├─ package-lock.json
├─ .gitignore              # node_modules, caché, uploads, logs, .env y archivos del sistema
├─ README.md               # guía de uso y de «qué se guarda y qué no»
├─ PUBLICAR-EN-GITHUB.md   # guía paso a paso para publicar el proyecto
├─ INSTRUCCIONES.md        # este documento
├─ iniciar.cmd             # arranque de un doble clic en Windows (comprueba Node ≥ 22.13)
├─ nucleo/                 # MÓDULOS COMPARTIDOS (navegador y Node; ESM, sin APIs de Node)
│  ├─ pdf.js              # lectura del PDF: agruparEnLineas + extraerLineas(pdfjs, datos)
│  ├─ generador.js        # motor de reglas: generarPreguntasDeLineas(lines, cantidad)
│  ├─ docx.js             # documentos Word: construirDocumento(tipo, datos, docxLib)
│  └─ ia.js               # capa de IA: catálogo, modelos y generarConIA({ config, texto… })
├─ public/                 # LA INTERFAZ
│  ├─ index.html           # una sola vista, la de «Crear»
│  ├─ styles.css           # estilos (MDL + propios)
│  └─ app.js               # lógica del cliente: módulo ES que importa ./nucleo/*.js
├─ servidor/
│  └─ index.js            # servidor estático OPCIONAL para uso local (npm run dev)
├─ docs/                   # SITIO YA CONSTRUIDO: lo que publica GitHub Pages (211 archivos)
├─ samples/
│  ├─ documento-ejemplo.pdf     # PDF de ejemplo para probar
│  ├─ ejemplo-examen.docx       # ejemplo de examen exportado
│  └─ ejemplo-soluciones.docx   # ejemplo de solucionario exportado
├─ backend/
│  └─ uploads/             # PDFs antiguos de la 1.x y la 2.0: no los usa nadie (ignorado por Git)
└─ scripts/
   ├─ construir-web.js        # construye y verifica docs/
   ├─ lib/pdf-nodo.js         # lectura de PDF SOLO para Node: extraerTextoDeArchivo(ruta)
   ├─ volcar-texto.js         # muestra el texto que el motor «ve» en un PDF
   ├─ probar-generador.js     # genera preguntas por consola para revisar la calidad
   ├─ probar-extraccion.js    # comprobación rápida de extracción de texto
   ├─ make-sample-pdf.cjs     # regenera el PDF de ejemplo (CommonJS; usa pdf-lib)
   ├─ verificar-docx.cjs      # abre un .docx y comprueba que Word podrá leerlo
   └─ servidor-ia-falso.cjs   # servidor de IA simulado para probar la IA sin claves
```

**Ya no existen** (se retiraron en la 3.0): `backend/index.js`, `backend/routes.js`,
`backend/utils.js`, `backend/generador.js`, `backend/pdf-texto.js`, `backend/docx.js`,
`backend/ia.js` y la dependencia `multer`. De la 2.0 ya se habían retirado `backend/db.js`, la
carpeta `data/` con `data.db` y `scripts/borrar-cuestionario.js`.

### Convención de extensiones

El paquete declara **`"type": "module"`**, así que:

- **`.js` es ESM** (módulos ES): los cuatro módulos de `nucleo/`, `servidor/index.js` y las
  herramientas que necesitan el núcleo (`construir-web.js`, `volcar-texto.js`,
  `probar-generador.js`, `probar-extraccion.js`, `lib/pdf-nodo.js`).
- **`.cjs` es CommonJS**: solo las tres utilidades que no tocan el núcleo y que siguen con
  `require`: `make-sample-pdf.cjs`, `verificar-docx.cjs` y `servidor-ia-falso.cjs`.

---

## Estructura multi‑agente

El proyecto se organiza en tres roles con responsabilidades separadas (y una interfaz clara entre ellos).

### Agente Núcleo (compartido)
- **Responsabilidad:** el motor de generación de preguntas, la lectura del PDF, la capa de IA y la
  construcción de los `.docx`. Es la pieza que usan **a la vez** el navegador y las herramientas de
  consola.
- **Carpeta:** `nucleo/` — `pdf.js`, `generador.js`, `docx.js`, `ia.js`.
- **Regla de oro:** nada de `require`, `module.exports`, `fs`, `path` ni `from 'node:…'`. Las dos
  librerías externas (**PDF.js** y **`docx`**) se **inyectan** desde fuera.
- **Entregable:** cuatro módulos ESM que dan el mismo resultado en el navegador y en Node.

### Agente Interfaz
- **Responsabilidad:** página de una sola vista, selector y lectura del PDF, editor de preguntas,
  vista previa y descarga del `.docx`. **No** hay listado de cuestionarios, ni formulario de
  respuestas, ni corrección, ni subida de archivos.
- **Carpeta:** `public/` — `index.html`, `styles.css`, `app.js`.
- **Dependencias:** `nucleo/` (importado con **rutas relativas**), Material Design Lite y PDF.js
  servidos desde `vendor/` (CSS **y** JavaScript) y la librería `docx` de navegador
  (`vendor/docx/index.iife.js`, que crea el global `window.docx`).
- **Entregable:** una página que funciona sin recargar, sin CDN y sin servidor.

### Agente Herramientas y publicación
- **Responsabilidad:** servidor local opcional, construcción y verificación del sitio, utilidades de
  consola, PDF de ejemplo, publicación y `.gitignore`.
- **Archivos:** `servidor/index.js`, `scripts/` (`construir-web.js`, `lib/pdf-nodo.js`,
  `volcar-texto.js`, `probar-generador.js`, `probar-extraccion.js`, `make-sample-pdf.cjs`,
  `verificar-docx.cjs`, `servidor-ia-falso.cjs`), `docs/`, `iniciar.cmd`, `package.json`.
  *(`Dockerfile` y `docker-compose.yml` **no están incluidos**: se decidió publicar el proyecto como
  sitio estático, sin contenedor. La sección «Docker (opcional)» deja la receta por si algún día se
  quiere añadir.)*
- **Entregable:** `npm run dev` abre la aplicación en local y **`npm run build`** deja en `docs/` el
  sitio listo para GitHub Pages, verificado.

### Contratos entre agentes (no cambiar sin avisar)

Ahora son **APIs de módulos**, no rutas HTTP:

| Origen → Destino | Contrato |
|------------------|----------|
| Interfaz → `nucleo/pdf.js` | `extraerLineas(pdfjs, datos)` → `{ numPages, pages, lines, text }` |
| Interfaz → `nucleo/generador.js` | `generarPreguntasDeLineas(lines, cantidad)` → `{ preguntas[{ text, options{A..D}, correct, tipo }], candidatas, tipos, tema }` |
| Interfaz → `nucleo/ia.js` | `catalogo()` → `[{ id, nombre, tipo, baseUrl, claveObligatoria, privacidad, nota, ayuda, modelos }]` |
| Interfaz → `nucleo/ia.js` | `normalizarConfig(config, { requiereModelo })` → `{ proveedor, baseUrl, apiKey, modelo }` (**idempotente**) |
| Interfaz → `nucleo/ia.js` | `listarModelos(config)` → `string[]` |
| Interfaz → `nucleo/ia.js` | `generarConIA({ config, texto, paginas, cantidad })` → `{ questions, paginas, tandas, caracteres, proveedor, modelo, avisos }` |
| Interfaz → `nucleo/docx.js` | `construirDocumento(tipo, datos, docxLib)` → documento para `Packer.toBlob` |
| Interfaz → `nucleo/docx.js` | `nombreArchivoDocx(tipo, titulo)` → `examen-….docx` |
| Herramientas → `nucleo/pdf.js` | `scripts/lib/pdf-nodo.js` inyecta el build *legacy* de PDF.js y los bytes leídos del disco |
| Herramientas → `nucleo/generador.js` | `scripts/probar-generador.js` y `volcar-texto.js` usan el mismo motor que la interfaz |
| Navegador → Servicio de IA | `fetch` directo con la clave en la cabecera: **nada pasa por un servidor propio** |
| Navegador → Disco | Solo `localStorage` (`cuestionario.ia.config`). **Ningún otro dato se escribe.** |
| `nucleo/` → Navegador **y** Node | Sin APIs de Node; PDF.js y `docx` se inyectan como parámetro |
| Herramientas → `docs/` | `npm run build` copia `public/`, `nucleo/` y `vendor/`, y lo verifica |

Esta separación permite cambiar una pieza sin tocar las demás (p. ej. sustituir la interfaz vanilla
por React, o añadir otra herramienta de consola, reutilizando los mismos módulos del núcleo y sin
tocar el motor de generación).

---

## Detalles de implementación

### Núcleo compartido (`nucleo/`)

Cuatro módulos **ESM** que no usan `require`, ni `module.exports`, ni `fs`, ni `path`, ni ninguna
otra API exclusiva de Node: el mismo código sirve en el navegador y en las herramientas de consola.
Las dos librerías externas se **inyectan** desde fuera.

| Módulo | Exporta | Notas |
|--------|---------|-------|
| `pdf.js` | `agruparEnLineas(items)`, `extraerLineas(pdfjs, datos)` | PDF.js se **inyecta**: el navegador pasa el build web (`vendor/pdfjs/build/pdf.min.mjs`), las herramientas el *legacy* de `pdfjs-dist`. Recibe los **bytes**, no una ruta. |
| `generador.js` | `generarPreguntasDeLineas(lines, cantidad)` + `parsearBloques`, `recolectar`, `dividirEnFrases`, `limpiar`, `normalizar` | Recibe **líneas de texto**. Construye las preguntas antes de seleccionarlas. |
| `docx.js` | `construirDocumento(tipo, datos, docxLib)`, `nombreArchivoDocx`, `fechaActual` | La librería `docx` se inyecta como parámetro `D`. Devuelve el documento **sin empaquetar**. |
| `ia.js` | `catalogo`, `normalizarConfig`, `listarModelos`, `generarConIA`, `materialDeTexto` (y, para pruebas, `extraerJson`, `limpiarPreguntaIA`, `dividirEnTandas`, `mensajeDeError`, `esErrorDeModelo`, `elegirModeloDisponible`) | Solo usa `fetch`, `AbortSignal` y `URL`. Importa `parsearBloques` y `normalizar` de `generador.js`. Recibe el **texto ya extraído**. |

- **`normalizarConfig` es idempotente:** acepta tanto el identificador del servicio (`'ollama'`)
  como el objeto ya normalizado, así que da igual si quien llama pasa la configuración tal cual sale
  de la interfaz o la que devolvió el propio módulo.
- **Nadie empaqueta dentro del núcleo:** quien llama decide (`Packer.toBlob` en el navegador,
  `Packer.toBuffer` en Node).
- **Nada de red salvo en `ia.js`,** y solo cuando el usuario pulsa «Generar con IA».

### Servidor local opcional (`servidor/index.js`)

- **No hace falta para que la aplicación funcione.** Existe para abrirla cómodamente en
  `http://localhost:3000`, porque con `file://` los módulos ES no cargan.
- Sirve archivos estáticos: `public/` en la raíz, `/nucleo`, `/vendor/pdfjs`, `/vendor/mdl` y
  `/vendor/docx`.
- Responde **un único endpoint**, `GET /api/health` → `{ ok: true, service: 'cuestionario-pdf',
  modo: 'estatico', api: false }`, para comprobar de un vistazo que el servidor está vivo.
  **No hay ninguna otra ruta de API.**
- Avisa por consola si falta alguna carpeta (por ejemplo, si no se ha ejecutado `npm install`).
- Variables de entorno opcionales: `PORT` (3000) y `HOST` (127.0.0.1).

### Endpoints retirados

En la **2.0** se retiraron `POST /api/quiz`, `GET /api/quizzes`, `GET /api/quiz/:id`,
`GET /api/quiz/:id/docx` y `POST /api/answers`. En la **3.0** desaparecen también los siete que
quedaban: `/api/upload`, `/api/generate`, `/api/docx`, `/api/ia/proveedores`, `/api/ia/modelos`,
`/api/ia/generar` y el `/api/health` de la aplicación. El único `/api/health` que existe es el del
servidor estático opcional. **La aplicación no tiene API HTTP de ningún tipo.**

### Motor de generación (`nucleo/generador.js`)
- No hace ninguna llamada de red: es texto que entra y preguntas que salen.
- No lee archivos: recibe las **líneas ya extraídas**, así que es exactamente el mismo motor en el
  navegador y en la consola. La lectura del PDF en Node vive en `scripts/lib/pdf-nodo.js`, que
  importa PDF.js *legacy* de forma dinámica (es ESM) y delega la extracción en `nucleo/pdf.js`.
- Cada pregunta generada se valida antes de devolverse: **4 opciones distintas** y una sola
  correcta; si no se pueden reunir 3 distractores válidos, la pregunta se descarta.
- Se puede auditar por consola con `npm run generar -- <pdf> <n>` y ver el texto leído con
  `npm run texto -- <pdf>`.

### Exportación a Word (`nucleo/docx.js`)
- Construye el documento con la librería `docx` **inyectada** y lo devuelve **sin empaquetar**. En
  el navegador se empaqueta con **`Packer.toBlob`** (el global `window.docx`, cargado desde
  `vendor/docx/index.iife.js`) y la descarga se dispara con un **Object URL**; en Node se usaría
  `Packer.toBuffer`.
- **Examen:** título centrado, línea de contexto (documento de origen, fecha, nº de preguntas),
  instrucciones y cada pregunta en negrita seguida de sus 4 opciones indentadas.
- **Soluciones:** tabla de 3 columnas (nº, letra correcta, texto de la respuesta) y una
  **clave rápida** final del tipo `1-B  2-D  3-A`.
- **La respuesta correcta vive en el navegador**, que es su autor: está en `state.questions` y con
  ella se construye el solucionario. No hay ningún servidor del que ocultarla (ver «La respuesta
  correcta ya no se oculta»).
- El nombre del archivo lo calcula `nombreArchivoDocx` (slug sin acentos, máximo 60 caracteres) y se
  entrega con el atributo `download` del enlace temporal.

### Frontend (`public/`)

- **Una sola vista.** `index.html` mantiene únicamente la vista «Crear», con seis tarjetas:

  | Tarjeta | Contenido |
  |---------|-----------|
  | 1 · Elige el documento PDF | selector de archivo, botón **«Leer el PDF»** y vista previa con PDF.js |
  | 2 · Genera las preguntas del documento | número de preguntas (1-50) y motor local |
  | 3 · O genera con IA (opcional) | servicio, URL, modelo, clave y botones de prueba y generación |
  | 4 · Título del cuestionario | título que encabeza el examen y da nombre al archivo |
  | 5 · Revisa y edita las preguntas | editor de preguntas con sus 4 opciones y la correcta |
  | 6 · Descargar en Word (.docx) | botones de descarga del examen y del solucionario |

  Al pie hay una nota que avisa de que **la aplicación no guarda nada y no tiene servidor**. La
  cabecera no tiene navegación (`app.js` no define `initNavigation`) y no existe el botón
  «Guardar cuestionario».
- **`app.js` es un módulo ES** que importa el núcleo con **rutas relativas**:
  `./nucleo/pdf.js`, `./nucleo/generador.js`, `./nucleo/docx.js` y `./nucleo/ia.js`.
- **Todas las rutas son relativas a propósito** (`vendor/…`, `styles.css`, `app.js`): así la misma
  página funciona igual servida desde la raíz (servidor local) que dentro de una subcarpeta
  (`https://usuario.github.io/cuestionario-pdf/`). Las librerías que se cargan con `import()` se
  resuelven con `new URL('./vendor/…', import.meta.url)`.
- El PDF se lee **en local**: `abrirPdf` abre el documento con PDF.js y `renderPdf` dibuja hasta 12
  páginas en `<canvas>`, con un enlace al PDF completo mediante un **Object URL**. Nada se sube.
- `index.html` carga **`material.min.css` y `material.min.js`** (desde `vendor/mdl`) y
  **`vendor/docx/index.iife.js`**, que crea el global `window.docx`. El JavaScript de MDL es
  imprescindible: es quien añade las clases `is-dirty`/`is-focused` de las etiquetas flotantes de
  los campos de texto. Los tres se cargan con `defer` **antes** de `app.js` para que
  `componentHandler` y `window.docx` ya existan cuando arranca la interfaz.
- El editor de preguntas se genera dinámicamente y se refresca con `componentHandler.upgradeDom()`
  para que MDL aplique sus estilos.
- `revisarPreguntas()` comprueba que todas las preguntas tengan enunciado y 4 opciones antes de
  permitir la descarga; si la librería de Word no se ha cargado, se avisa y no se intenta.
- Ya **no** existen en `app.js`: `initNavigation`, `loadQuizList`, `openQuiz`, `renderAnswerForm`,
  `initRunner`, `renderResult`, `initSave`, `descargarDocxGuardado`, `state.currentQuiz` **ni
  ninguna llamada a `fetch('/api/…')`**. En la 3.0 la única red que se toca es la del servicio de IA
  que elija el usuario.

### La respuesta correcta ya no se oculta

Es un cambio de comportamiento que viene de la 2.0 y en la 3.0 llega a su conclusión:

- **En la 1.x** el servidor guardaba la respuesta correcta en SQLite y `GET /api/quiz/:id` la
  omitía salvo que se pidiera con `?withAnswers=1`. Así el navegador no podía «hacer trampa» al
  responder, y la corrección la hacía el servidor en `POST /api/answers`.
- **En la 2.0** dejó de haber persistencia, pero el servidor seguía construyendo el `.docx`, así que
  la respuesta correcta **viajaba del navegador al servidor** al pedir el solucionario.
- **En la 3.0** no hay servidor ninguno: el cuestionario vive en `state.questions` del navegador con
  su respuesta correcta incluida, porque el usuario es su autor, y el solucionario se construye **en
  la misma pestaña**.
- **Consecuencia:** la aplicación es un **generador de exámenes y solucionarios**, no una plataforma
  de examen con calificación. Ocultar la respuesta correcta al navegador carecería de sentido: no
  habría nada que proteger y el solucionario no podría construirse.

---

## El sitio construido (`docs/`) y GitHub Pages

GitHub Pages publica **archivos estáticos**, así que la carpeta `docs/` contiene la aplicación ya
lista: **211 archivos, ~6,5 MB**. Es lo único que hace falta para que la aplicación esté en internet.

`npm run build` (→ `scripts/construir-web.js`) hace lo siguiente:

1. **Borra y recrea `docs/`**, con una salvaguarda previa: solo borra una carpeta llamada
   exactamente `docs` que esté dentro del proyecto.
2. Copia **`public/` en la raíz** de `docs/` (la página y su lógica) y **`nucleo/`** en
   `docs/nucleo/`, que es donde `app.js` los busca con sus rutas relativas.
3. Copia de `node_modules` **solo lo imprescindible**, nunca los paquetes completos:
   `pdf.min.mjs` y `pdf.worker.min.mjs` más `cmaps/`, `standard_fonts/` y `wasm/` de PDF.js;
   `material.min.css` y `material.min.js` de MDL; y `docx/index.iife.js`.
4. Escribe **`.nojekyll`** para que GitHub Pages no procese nada con Jekyll (si lo hiciera, se
   cargaría carpetas que empiezan por guion bajo y rompería los vendor).
5. **Verifica** tres cosas y **falla con código de salida 1** si alguna no se cumple:
   - que **todo lo que pide `index.html`** (`src`, `href` e `import()`) existe dentro de `docs/`;
   - que **todo lo que importa `app.js`** con rutas `./` existe dentro de `docs/`;
   - que **ningún módulo de `nucleo/`** usa `require(`, `module.exports` ni `from 'node:`.

Para publicarlo: **`Settings → Pages → Deploy from a branch → main → /docs`**. La carpeta `docs/`
se sube al repositorio como cualquier otro archivo y GitHub Pages sirve su contenido tal cual; cada
vez que se cambie el código hay que volver a ejecutar `npm run build` y subir el resultado.

> **Las rutas relativas son la clave de que esto funcione.** La aplicación se publica en
> `https://usuario.github.io/cuestionario-pdf/`, es decir **en una subcarpeta**, no en la raíz del
> dominio. Con rutas absolutas (`/vendor/…`) la página se rompería al publicarla, y por eso la
> verificación de `npm run build` se hace pensando en esa ubicación.

---

## Ejecutar la aplicación en local

### Con el servidor de comodidad (recomendado)

```bash
cd cuestionario-app
npm install            # solo la primera vez (requiere Node >= 22.13)
npm run dev            # sirve la aplicación en http://localhost:3000
```

- El servidor sirve `public/`, `/nucleo`, `/vendor/pdfjs`, `/vendor/mdl` y `/vendor/docx`. **No hay
  API** ni subida de archivos: solo archivos estáticos.
- En Windows también se puede arrancar con doble clic en **`iniciar.cmd`**, que comprueba que Node
  sea 22.13 o superior antes de instalar y arrancar (`node servidor\index.js`).
- Variables de entorno opcionales: `PORT` (por defecto 3000) y `HOST` (por defecto 127.0.0.1).
- Al arrancar **no se crea ni se escribe nada** en disco.

### Sin servidor: el sitio construido

```bash
npm run build          # construye y verifica docs/
```

Después, abre `docs/index.html` **con un servidor** (por ejemplo `npx serve docs`) o publícalo en
GitHub Pages. Abierto directamente con `file://` no funciona: los módulos ES no cargan desde el
sistema de archivos, y por eso existe el servidor local.

### Scripts de `package.json`
```json
{
  "name": "cuestionario-pdf",
  "version": "3.0.0",
  "type": "module",
  "main": "servidor/index.js",
  "scripts": {
    "dev": "node servidor/index.js",
    "start": "node servidor/index.js",
    "build": "node scripts/construir-web.js",
    "construir-web": "node scripts/construir-web.js",
    "generar": "node scripts/probar-generador.js",
    "texto": "node scripts/volcar-texto.js",
    "extraccion": "node scripts/probar-extraccion.js",
    "verificar-docx": "node scripts/verificar-docx.cjs",
    "ia-falsa": "node scripts/servidor-ia-falso.cjs",
    "pdf-ejemplo": "node scripts/make-sample-pdf.cjs"
  },
  "engines": { "node": ">=22.13.0" }
}
```

`pdf-lib` está en **`devDependencies`** porque solo lo usa `scripts/make-sample-pdf.cjs`;
`express` sigue siendo dependencia de ejecución, pero únicamente para el servidor de comodidad.

### PDF de ejemplo
```bash
npm run pdf-ejemplo                     # genera samples/documento-ejemplo.pdf
```

### Auditar la generación por consola
```bash
npm run texto      -- samples/documento-ejemplo.pdf      # qué texto se ha leído
npm run generar    -- samples/documento-ejemplo.pdf 10   # qué preguntas salen
npm run extraccion -- samples/documento-ejemplo.pdf      # caracteres extraídos por página
```

Estas herramientas usan **los mismos módulos** que el navegador (`nucleo/`), así que lo que se ve
por consola es exactamente lo que hará la página.

---

## Docker (opcional, NO incluido)

El proyecto **no necesita Docker**: es un sitio estático y, en local, basta con el servidor de
`servidor/index.js`. En la 3.0 **no se incluye** ningún `Dockerfile`. Si algún día se quiere
empaquetar (por ejemplo, para servir `docs/` desde un servidor propio), esta es la receta:

```Dockerfile
FROM node:24-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev --ignore-scripts
COPY . .
EXPOSE 3000
CMD ["node", "servidor/index.js"]
```

> **Ya no hay nada que conservar entre reinicios**: ni base de datos (se retiró en la 2.0) ni PDFs
> subidos (en la 3.0 el PDF no sale del navegador). Un contenedor así solo serviría archivos
> estáticos, y para eso es bastante más simple publicar `docs/` en GitHub Pages. Por eso se ha
> eliminado también el volumen de `uploads` que tenía la receta de la 2.0.

---

## Estado de implementación

| Elemento | Estado |
|----------|--------|
| Estructura de carpetas | ✅ creada (`nucleo/`, `public/`, `servidor/`, `scripts/`, `docs/`) |
| Dependencias instaladas | ✅ `express`, `pdfjs-dist`, `material-design-lite`, `docx` (+ `pdf-lib` en dev) |
| **Núcleo compartido (`nucleo/`)** | ✅ 4 módulos ESM sin APIs de Node, comprobados en la construcción |
| **Web app 100 % estática** | ✅ el PDF se lee y el Word se crea **dentro del navegador** |
| **API HTTP** | ➖ **retirada en la 3.0**: no existe ningún endpoint de aplicación |
| **Subida de archivos (Multer)** | ➖ **retirada en la 3.0**: el PDF no sale del navegador |
| **Generación automática de preguntas** | ✅ 8/8 con el PDF de ejemplo y 10/10 con el PDF real de 4 páginas |
| **Exportación a Word (.docx)** | ✅ examen y solucionario construidos en el navegador |
| **Generación con IA (opcional)** | ✅ probada con un servidor simulado (11 servicios, 3 sin clave) |
| **Sitio construido (`docs/`)** | ✅ 211 archivos, ~6,5 MB, verificado por `npm run build` |
| **GitHub Pages** | ✅ publicado desde `main` → `/docs` |
| **Base de datos** | ➖ **retirada en la 2.0**: no hay persistencia de ningún tipo |
| **Vista «Responder» y puntuación** | ➖ **retirada en la 2.0** |
| Interfaz de una sola vista («Crear») | ✅ implementada, con 6 tarjetas y aviso de que no se guarda nada |
| Visor PDF.js | ✅ servido desde `vendor/pdfjs`, usado como vista previa del PDF elegido |
| Servidor local (opcional) | ✅ `npm run dev` y `iniciar.cmd`; solo sirve archivos estáticos |
| Docker | ⬜ opcional, no configurado |

### Pruebas realizadas

**Verificación de la 3.0 (web app 100 % estática):**
- **37 comprobaciones, 0 fallos** en una prueba que **sirve `docs/` dentro de una subcarpeta**
  (simulando `https://usuario.github.io/cuestionario-pdf/`), que es justo donde se publica. Cubre:
  - **Carga en un DOM real** (jsdom): `app.js` se ejecuta **sin errores**, el desplegable de
    servicios se rellena con los **11** servicios, el editor arranca con **una pregunta en blanco**
    y la configuración de IA se persiste en `localStorage`.
  - **Tubería completa con los módulos reales**: leer el PDF de ejemplo (**1 página, 17 líneas**),
    generar **8 preguntas de 5 tipos**, crear el examen y el solucionario con la **librería de Word
    de navegador** y validarlos como `.docx` con `jszip` (acentos y `ñ` intactos, y la clave
    **solo** en el solucionario).
  - **Generación con IA** contra el servidor simulado.
- **Port de la capa de IA a `nucleo/ia.js`: 44 comprobaciones, 0 fallos** — catálogo y orden de los
  servicios, las dos familias de API, 429 con `Retry-After`, modelo inexistente, JSON dentro de un
  bloque de código, opciones en array, respuesta correcta escrita como texto, segunda pasada,
  deduplicación, errores en español y equivalencia de `dividirEnTandas`.
- **Motor local:** pedir 8 preguntas al PDF de ejemplo devuelve **8 siempre** (10 ejecuciones
  seguidas, 5 tipos distintos) y pedir 20 devuelve las **11** que el documento permite. El PDF real
  de 4 páginas sigue dando **10/10** con los **6 tipos** de pregunta.
- `node --check` correcto en **todos** los archivos (`.js` y `.cjs`) y **cero caracteres corruptos**.
- `npm run build` **falla con código 1** si la página pide un archivo que no está en `docs/`, si
  `app.js` importa algo que falta o si un módulo de `nucleo/` usa APIs de Node.

**Comprobado en versiones anteriores y que sigue vigente:**
- **Exportación a Word**: los dos `.docx` abren como ZIP válido, con `[Content_Types].xml` y
  `word/document.xml`; el **examen** lleva los enunciados y las 4 opciones de todas las preguntas y
  **no** la clave, y el **solucionario** lleva la respuesta correcta de cada una y la clave rápida.
  En la 3.0 se comprobó con la **librería de Word de navegador** (`window.docx`), y en la 2.0 con la
  de Node.
- **Motor local**: las preguntas se **construyen antes de seleccionarlas**, de modo que una semilla
  sin distractores ya no descuenta cupo (antes, pedir 8 devolvía entre 6 y 9).
- **Generación con IA** (con `scripts/servidor-ia-falso.cjs`, sin claves ni internet):
  - listado de modelos por API Ollama y por API tipo OpenAI;
  - generación de 10, 6 y 3 preguntas → **exactamente** las pedidas; el material de 9.269 caracteres
    se resuelve en **1 sola petición** (tandas de 14.000 caracteres);
  - **límite de cuota (429)**: el servicio responde 429 con `Retry-After: 1` la primera vez → la
    aplicación espera, reintenta y devuelve **10/10 preguntas en 3 s**, con el aviso
    correspondiente; un 429 permanente falla con el mensaje que propone alternativas;
  - formatos reales tolerados: JSON en bloque de código, opciones en array y correcta como texto;
  - modelo que devuelve la mitad → **segunda pasada**; modelo que repite la misma pregunta → el
    deduplicador la descarta y se avisa;
  - **modelo que ya no existe** (`deepseek-v3-0324`) por las dos familias de API → la aplicación
    consulta la lista, cambia sola a un modelo disponible (`modelo-falso-1` / `llama3.2`) y devuelve
    las preguntas pedidas con el aviso correspondiente;
  - detección de «modelo inexistente» probada con **8 frases** distintas; un 401, un 429 y un 500
    **no** se confunden con ese caso;
  - los modelos sugeridos de **OVHcloud** y **LLM7.io** se sustituyeron por los reales que devuelven
    sus endpoints `/v1/models` (los anteriores ya no existían);
  - errores traducidos al español: 401, 429, 500, servicio apagado (`ECONNREFUSED`), sin conexión
    (`ENOTFOUND`) y tiempo agotado (`TimeoutError`).
- **Retirada de la base de datos (2.0)**: los endpoints que entonces existían se retiraron y
  respondían 404, el arranque no creaba ninguna carpeta `data/` y `backend/db.js` dejó de existir.

**Verificación de la 2.0 (histórica: cuando la aplicación todavía tenía servidor):**
- **51 comprobaciones automáticas, 0 fallos** sobre el servidor de entonces, cubriendo salud,
  estáticos, subida, motor local, exportación a Word y capa de IA.
- Los cuatro endpoints retirados en esa versión (`/api/quizzes`, `/api/quiz/1`, `/api/quiz/1/docx`
  y `/api/answers`) respondían **404**, y el arranque **no creaba** ninguna carpeta `data/` ni
  archivo `data.db`.
- El HTML servido ya no contenía la vista «Responder» ni el botón «Guardar cuestionario», y avisaba
  de que la aplicación no guarda nada.
- Word: los dos `.docx` eran ZIP válidos, con el MIME correcto y `filename*=UTF-8''`; el título con
  acentos, `·` y `ñ` llegaba intacto («Prueba v2 · acentos y ñ»).
- IA (servidor simulado): catálogo con los servicios sin clave primero y **LLM7.io antes que
  OVHcloud**, listado de modelos, generación, **429 con `Retry-After` → reintento y aviso**, y
  **modelo inexistente → recuperación automática**.

> **Límites conocidos:** la interfaz se ha ejercitado en un **DOM real (jsdom)** y servida desde una
> **subcarpeta** como la de GitHub Pages, pero **no** se ha visto en un navegador de verdad dentro
> del entorno de desarrollo (el navegador sin cabeza no arranca en la caja de arena). Tampoco se ha
> probado **la IA contra un servicio real en la nube**: depende de que el servicio permita CORS y de
> tener clave o red.

---

## Próximos pasos sugeridos

- [x] **Generación automática de preguntas** desde el PDF (motor local).
- [x] **Exportación a Word (.docx)**: examen y solucionario por separado.
- [x] **Generación opcional con IA** (Ollama y servicios gratuitos compatibles con OpenAI).
- [x] **Retirada de la base de datos y de la vista «Responder»** (2.0): la aplicación no guarda
      nada.
- [x] **Web app 100 % estática publicada en GitHub Pages** (3.0): sin servidor, sin API y sin subir
      el PDF.
- [ ] Probar la IA contra un servicio real en la nube (necesita CORS favorable y una clave).
- [ ] Avisar en la propia interfaz cuando un servicio falle por CORS, con una sugerencia concreta.
- [ ] Editar el número de preguntas ya generadas sin volver a leer el PDF.
- [ ] Soporte de **varios PDFs por cuestionario** (hoy es uno).
- [ ] Exportar también a PDF directamente (hoy: `.docx`, que Word convierte a PDF).
- [ ] Recordar el último PDF elegido entre recargas usando `localStorage` (hoy no se persiste nada
      más que la configuración de IA).
- [ ] Pruebas automatizadas de extremo a extremo en un navegador real (Playwright o similar).
- [ ] Dockerfile y `docker-compose.yml` si se quiere servir `docs/` desde un servidor propio.

---

*Documento actualizado a la versión 3.0: refleja el paso a **web app 100 % estática publicada en
GitHub Pages** (sin servidor, sin API y sin subida de archivos) y conserva el historial de las
decisiones anteriores: SQLite en la 1.x, y la retirada de la base de datos y de la vista «Responder»
en la 2.0.*
