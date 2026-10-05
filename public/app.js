/**
 * CUESTIONARIO · lógica de la interfaz (JavaScript vanilla).
 *
 * TODO OCURRE EN EL NAVEGADOR: no hay servidor, ni subida de archivos, ni base
 * de datos. La página funciona igual abierta desde GitHub Pages.
 *
 * Flujo:
 *   1. Elegir un PDF               -> se lee en local con PDF.js
 *   2. Generar las preguntas       -> nucleo/generador.js (motor de reglas)
 *   3. O generarlas con IA         -> nucleo/ia.js        (servicio externo, opcional)
 *   4. Descargar examen/soluciones -> nucleo/docx.js      (librería `docx`: window.docx)
 *
 * Todo el estado vive en memoria, en esta pestaña, dentro de `state`.
 */

import { extraerLineas } from './nucleo/pdf.js';
import { generarPreguntasDeLineas } from './nucleo/generador.js';
import { construirDocumento, nombreArchivoDocx } from './nucleo/docx.js';
import { catalogo, normalizarConfig, listarModelos, generarConIA } from './nucleo/ia.js';

const OPTION_KEYS = ['A', 'B', 'C', 'D'];
const MAX_PDF_BYTES = 10 * 1024 * 1024; // 10 MB

const state = {
  archivo: null, // File elegido por el usuario (nunca se sube a ningún sitio)
  urlPdf: null, // Object URL para la vista previa y para abrir el PDF aparte
  pdf: null, // documento abierto con PDF.js
  lineas: [], // líneas de texto extraídas del PDF
  paginas: 0,
  texto: '', // texto completo; es el material que se envía a la IA (si se usa)
  questions: [], // { text, options:{A,B,C,D}, correct }
  pdfModule: null, // módulo pdf.js cargado bajo demanda
};

/* ------------------------------------------------------------------ */
/* Utilidades                                                          */
/* ------------------------------------------------------------------ */

function setStatus(el, message, kind = '') {
  el.textContent = message || '';
  el.className = `status${kind ? ` is-${kind}` : ''}`;
}

function capitalizar(texto) {
  const t = String(texto || '').trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : t;
}

/* ------------------------------------------------------------------ */
/* Lector y visor de PDF (PDF.js) · todo dentro del navegador          */
/* ------------------------------------------------------------------ */

/** Carga PDF.js desde ./vendor (sin CDN, así funciona también sin internet). */
async function getPdfModule() {
  if (state.pdfModule) return state.pdfModule;

  const lib = await import('./vendor/pdfjs/build/pdf.min.mjs');
  const base = import.meta.url;
  lib.GlobalWorkerOptions.workerSrc = new URL('./vendor/pdfjs/build/pdf.worker.min.mjs', base).href;
  state.pdfModule = lib;
  return lib;
}

/** Abre el PDF que ha elegido el usuario (bytes en memoria, sin subirlo). */
async function abrirPdf(pdfjsLib, archivo) {
  const datos = new Uint8Array(await archivo.arrayBuffer());
  const base = import.meta.url;

  return pdfjsLib.getDocument({
    data: datos,
    cMapUrl: new URL('./vendor/pdfjs/cmaps/', base).href,
    cMapPacked: true,
    standardFontDataUrl: new URL('./vendor/pdfjs/standard_fonts/', base).href,
    wasmUrl: new URL('./vendor/pdfjs/wasm/', base).href,
  }).promise;
}

/** Dibuja en el contenedor las primeras páginas del documento ya abierto. */
async function renderPdf(doc, container, url, maxPages = 12) {
  container.innerHTML = '';

  const loading = document.createElement('p');
  loading.className = 'hint';
  loading.textContent = 'Cargando documento…';
  container.appendChild(loading);

  try {
    container.innerHTML = '';

    const pages = Math.min(doc.numPages, maxPages);
    for (let n = 1; n <= pages; n += 1) {
      const page = await doc.getPage(n);
      const viewport = page.getViewport({ scale: 1.4 });

      const canvas = document.createElement('canvas');
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      container.appendChild(canvas);

      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    }

    if (doc.numPages > pages) {
      const note = document.createElement('p');
      note.className = 'hint';
      note.textContent = `Mostrando ${pages} de ${doc.numPages} páginas.`;
      container.appendChild(note);
    }

    const link = document.createElement('a');
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = 'Abrir el PDF en una pestaña nueva';
    link.className = 'hint';
    container.appendChild(link);
  } catch (err) {
    console.error(err);
    container.innerHTML = '';
    const fallback = document.createElement('p');
    fallback.className = 'hint';
    fallback.textContent = 'No se pudo dibujar la vista previa, pero el documento se ha leído bien:';
    const link = document.createElement('a');
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = 'Abrir PDF';
    container.append(fallback, link);
  }
}

/* ------------------------------------------------------------------ */
/* 1 · Elegir y leer el PDF (no se sube a ningún sitio)                */
/* ------------------------------------------------------------------ */

function initArchivo() {
  const input = document.getElementById('pdf-input');
  const button = document.getElementById('btn-upload');
  const status = document.getElementById('upload-status');
  const info = document.getElementById('pdf-info');

  button.addEventListener('click', async () => {
    const archivo = input.files && input.files[0];
    if (!archivo) {
      setStatus(status, 'Selecciona primero un archivo PDF.', 'error');
      return;
    }
    if (archivo.size > MAX_PDF_BYTES) {
      setStatus(status, 'El PDF supera el límite de 10 MB.', 'error');
      return;
    }
    const esPdf = archivo.type === 'application/pdf' || /\.pdf$/i.test(archivo.name);
    if (!esPdf) {
      setStatus(status, 'Solo se permiten archivos PDF.', 'error');
      return;
    }

    button.disabled = true;
    setStatus(status, 'Leyendo el documento…');
    info.textContent = '';

    try {
      const pdfjsLib = await getPdfModule();
      const datos = new Uint8Array(await archivo.arrayBuffer());
      const { numPages, lines, text } = await extraerLineas(pdfjsLib, datos);

      if (!lines.length) {
        throw new Error('el documento no contiene texto seleccionable (¿es un escaneo?)');
      }

      state.archivo = archivo;
      state.lineas = lines;
      state.texto = text;
      state.paginas = numPages;

      if (state.urlPdf) URL.revokeObjectURL(state.urlPdf);
      state.urlPdf = URL.createObjectURL(archivo);

      info.textContent =
        `${archivo.name} · ${numPages} página(s) · ${(archivo.size / 1024).toFixed(0)} KB · ` +
        `${text.length.toLocaleString('es-ES')} caracteres de texto`;
      setStatus(status, 'Documento leído. Ya puedes generar las preguntas.', 'ok');

      state.pdf = await abrirPdf(pdfjsLib, archivo);
      await renderPdf(state.pdf, ensurePreviewBox(), state.urlPdf);
    } catch (err) {
      state.archivo = null;
      state.lineas = [];
      state.texto = '';
      state.paginas = 0;
      setStatus(status, `No se ha podido leer el PDF: ${err.message}`, 'error');
    } finally {
      button.disabled = false;
    }
  });
}

/** Caja de vista previa dentro de la tarjeta de subida (se crea una sola vez). */
function ensurePreviewBox() {
  let box = document.getElementById('upload-preview');
  if (!box) {
    box = document.createElement('div');
    box.id = 'upload-preview';
    box.className = 'pdf-viewer';
    box.style.marginTop = '14px';
    document.getElementById('pdf-info').after(box);
  }
  return box;
}

/* ------------------------------------------------------------------ */
/* 2 · Generación automática de preguntas (motor local)                */
/* ------------------------------------------------------------------ */

/** Número de preguntas pedido en pantalla, acotado a 1-50. */
function cantidadPedida() {
  const input = document.getElementById('gen-count');
  const cantidad = Math.min(50, Math.max(1, Number(input.value) || 10));
  input.value = String(cantidad);
  return cantidad;
}

/** Genera las preguntas con el motor de reglas local (nucleo/generador.js). */
function generarLocal(cantidad) {
  return generarPreguntasDeLineas(state.lineas, cantidad);
}

/** Vuelca en el editor las preguntas recibidas (de la IA o del motor local). */
function volcarPreguntas(generadas) {
  state.questions = generadas.map((q) => ({
    text: q.text,
    options: { A: q.options.A, B: q.options.B, C: q.options.C, D: q.options.D },
    correct: q.correct,
  }));
  renderQuestions();
}

function initGenerate() {
  const button = document.getElementById('btn-generate');
  const input = document.getElementById('gen-count');
  const status = document.getElementById('gen-status');

  button.addEventListener('click', async () => {
    if (!state.lineas.length) {
      setStatus(status, 'Pulsa primero «Leer el PDF» con el documento elegido.', 'error');
      return;
    }

    const cantidad = cantidadPedida();
    button.disabled = true;
    input.disabled = true;
    setStatus(status, 'Redactando las preguntas del documento…');

    try {
      const data = generarLocal(cantidad);
      const generadas = data.preguntas || [];

      if (generadas.length === 0) {
        setStatus(
          status,
          'No se han podido generar preguntas de este documento. Añádelas a mano abajo.',
          'error'
        );
        return;
      }

      volcarPreguntas(generadas);

      const titulo = document.getElementById('quiz-title');
      if (!titulo.value.trim()) titulo.value = sugerirTitulo(data);

      const aviso =
        generadas.length < cantidad
          ? ` El documento solo daba para ${generadas.length} de las ${cantidad} pedidas.`
          : '';
      setStatus(
        status,
        `Se han generado ${generadas.length} preguntas de ${state.paginas} página(s). ` +
          `Revísalas y descárgalas en Word.${aviso}`,
        'ok'
      );
    } catch (err) {
      setStatus(status, err.message, 'error');
    } finally {
      button.disabled = false;
      input.disabled = false;
    }
  });
}

/** Título propuesto para el cuestionario: el tema detectado o el nombre del archivo. */
function sugerirTitulo(data) {
  if (data.tema) return capitalizar(data.tema);
  const nombre = (state.archivo && state.archivo.name) || 'Cuestionario';
  return nombre.replace(/\.pdf$/i, '');
}

/* ------------------------------------------------------------------ */
/* 3 · Generación con IA (opcional)                                    */
/* ------------------------------------------------------------------ */

const IA_STORAGE_KEY = 'cuestionario.ia.config';

const iaState = { proveedores: [], proveedor: null };

/** Configuración guardada en el navegador (nunca en el servidor). */
function leerConfigIA() {
  try {
    const crudo = JSON.parse(localStorage.getItem(IA_STORAGE_KEY) || '{}') || {};
    return { proveedor: crudo.proveedor || null, porProveedor: crudo.porProveedor || {} };
  } catch {
    return { proveedor: null, porProveedor: {} };
  }
}

function guardarConfigIA(config) {
  try {
    localStorage.setItem(IA_STORAGE_KEY, JSON.stringify(config));
  } catch {
    /* si el navegador bloquea el almacenamiento, se sigue sin guardar */
  }
}

/** Lee los campos de IA de la pantalla. */
function configIAEnPantalla() {
  return {
    proveedor: document.getElementById('ia-proveedor').value,
    baseUrl: document.getElementById('ia-url').value.trim(),
    modelo: document.getElementById('ia-modelo').value.trim(),
    apiKey: document.getElementById('ia-clave').value.trim(),
  };
}

/** Guarda en el navegador lo que hay en los campos, por servicio. */
function persistirIA() {
  const config = leerConfigIA();
  const actual = configIAEnPantalla();
  config.proveedor = actual.proveedor;
  config.porProveedor[actual.proveedor] = {
    baseUrl: actual.baseUrl,
    modelo: actual.modelo,
    apiKey: actual.apiKey,
  };
  guardarConfigIA(config);
}

/** Rellena los campos con lo guardado para ese servicio (o con los valores por defecto). */
function aplicarProveedor(proveedorId) {
  const proveedor = iaState.proveedores.find((p) => p.id === proveedorId);
  if (!proveedor) return;

  iaState.proveedor = proveedor;
  const guardado = leerConfigIA().porProveedor[proveedorId] || {};

  document.getElementById('ia-url').value = guardado.baseUrl || proveedor.baseUrl;
  document.getElementById('ia-modelo').value =
    guardado.modelo || (proveedor.modelos && proveedor.modelos[0]) || '';
  document.getElementById('ia-clave').value = guardado.apiKey || '';

  // Sugerencias de modelo en el desplegable del campo.
  const datalist = document.getElementById('ia-modelos');
  datalist.innerHTML = '';
  (proveedor.modelos || []).forEach((nombre) => {
    const opcion = document.createElement('option');
    opcion.value = nombre;
    datalist.appendChild(opcion);
  });

  // Nota: privacidad, aviso y enlace para conseguir la clave.
  const nota = document.getElementById('ia-nota');
  nota.innerHTML = '';
  nota.append(`${proveedor.privacidad} ${proveedor.nota}`);
  if (proveedor.ayuda) {
    const enlace = document.createElement('a');
    enlace.href = proveedor.ayuda;
    enlace.target = '_blank';
    enlace.rel = 'noopener';
    enlace.textContent = ' Conseguir la clave aquí.';
    nota.appendChild(enlace);
  }

  const campoClave = document.getElementById('ia-clave');
  campoClave.placeholder = proveedor.claveObligatoria
    ? 'Obligatoria para este servicio'
    : 'Opcional (solo si tu servicio la pide)';
}

async function initIA() {
  const select = document.getElementById('ia-proveedor');
  const status = document.getElementById('ia-status');
  const botonModelos = document.getElementById('btn-ia-modelos');
  const botonProbar = document.getElementById('btn-ia-probar');
  const botonGenerar = document.getElementById('btn-ia-generar');

  try {
    iaState.proveedores = catalogo();
  } catch (err) {
    setStatus(status, `No se ha podido cargar la lista de servicios: ${err.message}`, 'error');
    return;
  }

  // Los servicios sin clave primero: son los que funcionan sin registrarse.
  const ordenados = [...iaState.proveedores].sort(
    (a, b) => Number(a.claveObligatoria) - Number(b.claveObligatoria)
  );

  select.innerHTML = '';
  ordenados.forEach((p) => {
    const opcion = document.createElement('option');
    opcion.value = p.id;
    opcion.textContent = p.nombre;
    select.appendChild(opcion);
  });

  const guardada = leerConfigIA();
  const inicial =
    guardada.proveedor && ordenados.some((p) => p.id === guardada.proveedor)
      ? guardada.proveedor
      : ordenados[0].id;

  select.value = inicial;
  aplicarProveedor(inicial);

  select.addEventListener('change', () => {
    aplicarProveedor(select.value);
    setStatus(status, '');
  });

  ['ia-url', 'ia-modelo', 'ia-clave'].forEach((id) => {
    document.getElementById(id).addEventListener('change', persistirIA);
  });

  document.getElementById('btn-ia-olvidar').addEventListener('click', () => {
    document.getElementById('ia-clave').value = '';
    const config = leerConfigIA();
    if (config.porProveedor[select.value]) delete config.porProveedor[select.value].apiKey;
    guardarConfigIA(config);
    setStatus(status, 'Clave borrada de este navegador.', 'ok');
  });

  // «Ver modelos» y «Probar conexión» hacen la misma llamada; cambia el mensaje.
  const consultarModelos = async (esPrueba) => {
    const config = configIAEnPantalla();
    if (iaState.proveedor.claveObligatoria && !config.apiKey) {
      setStatus(status, `El servicio «${iaState.proveedor.nombre}» necesita una clave de API.`, 'error');
      return;
    }

    persistirIA();
    botonModelos.disabled = true;
    botonProbar.disabled = true;
    setStatus(status, esPrueba ? 'Probando la conexión…' : 'Consultando los modelos disponibles…');

    try {
      const normalizada = normalizarConfig(config, { requiereModelo: false });
      const modelos = (await listarModelos(normalizada)) || [];
      const datalist = document.getElementById('ia-modelos');
      datalist.innerHTML = '';
      modelos.forEach((nombre) => {
        const opcion = document.createElement('option');
        opcion.value = nombre;
        datalist.appendChild(opcion);
      });

      if (modelos.length === 0) {
        setStatus(status, 'La conexión funciona, pero el servicio no ha devuelto ningún modelo.', 'error');
        return;
      }

      const campoModelo = document.getElementById('ia-modelo');
      if (!campoModelo.value.trim()) campoModelo.value = modelos[0];

      const muestra = modelos.slice(0, 4).join(', ');
      setStatus(
        status,
        esPrueba
          ? `Conexión correcta con ${normalizada.proveedor.nombre}. ${modelos.length} modelos disponibles. Por ejemplo: ${muestra}${modelos.length > 4 ? '…' : ''}`
          : `${modelos.length} modelos disponibles: ${muestra}${modelos.length > 4 ? '…' : ''}`,
        'ok'
      );
    } catch (err) {
      setStatus(status, err.message, 'error');
    } finally {
      botonModelos.disabled = false;
      botonProbar.disabled = false;
    }
  };

  botonModelos.addEventListener('click', () => consultarModelos(false));
  botonProbar.addEventListener('click', () => consultarModelos(true));

  botonGenerar.addEventListener('click', async () => {
    if (!state.lineas.length) {
      setStatus(status, 'Pulsa primero «Leer el PDF» con el documento elegido.', 'error');
      return;
    }

    const config = configIAEnPantalla();
    if (!config.modelo) {
      setStatus(status, 'Escribe el nombre del modelo (o pulsa «Ver modelos»).', 'error');
      return;
    }
    if (iaState.proveedor.claveObligatoria && !config.apiKey) {
      setStatus(status, `El servicio «${iaState.proveedor.nombre}» necesita una clave de API.`, 'error');
      return;
    }

    const cantidad = cantidadPedida();
    persistirIA();

    botonGenerar.disabled = true;
    botonModelos.disabled = true;
    setStatus(
      status,
      `Consultando a «${config.modelo}»… puede tardar un poco (los modelos locales son más lentos). ` +
        'Si el servicio gratuito pone un límite de peticiones, la aplicación esperará y reintentará sola.'
    );

    try {
      // `generarConIA` valida y normaliza la configuración por dentro.
      const data = await generarConIA({
        config,
        texto: state.texto,
        paginas: state.paginas,
        cantidad,
      });

      const generadas = data.questions || [];
      if (generadas.length === 0) throw new Error('La IA no ha devuelto ninguna pregunta.');

      volcarPreguntas(generadas);

      const titulo = document.getElementById('quiz-title');
      if (!titulo.value.trim()) {
        titulo.value = (state.archivo ? state.archivo.name : 'Cuestionario').replace(/\.pdf$/i, '');
      }

      const avisos = data.avisos && data.avisos.length ? ` Avisos: ${data.avisos.join(' ')}` : '';
      setStatus(
        status,
        `Se han generado ${generadas.length} preguntas con IA (${data.modelo}) a partir de ` +
          `${data.caracteres} caracteres en ${data.tandas} tanda(s). Revísalas y descárgalas en Word.${avisos}`,
        'ok'
      );
    } catch (err) {
      // Respaldo acordado: avisar del fallo y seguir con el motor local.
      setStatus(
        status,
        `${err.message} — Se continúa con el motor local para que no te quedes sin cuestionario…`,
        'error'
      );

      try {
        const local = generarLocal(cantidad);
        const generadas = local.preguntas || [];
        if (generadas.length === 0) {
          setStatus(status, `${err.message} El motor local tampoco ha encontrado preguntas.`, 'error');
          return;
        }

        volcarPreguntas(generadas);
        const titulo = document.getElementById('quiz-title');
        if (!titulo.value.trim()) titulo.value = sugerirTitulo(local);

        setStatus(
          status,
          `La IA ha fallado, así que se han generado ${generadas.length} preguntas con el ` +
            `motor local. Motivo: ${err.message}`,
          'error'
        );
      } catch (errLocal) {
        setStatus(status, `${err.message} Y el motor local también ha fallado: ${errLocal.message}`, 'error');
      }
    } finally {
      botonGenerar.disabled = false;
      botonModelos.disabled = false;
    }
  });
}

/* ------------------------------------------------------------------ */
/* 4 · Constructor de preguntas (revisión y edición)                   */
/* ------------------------------------------------------------------ */

function initQuestionBuilder() {
  document.getElementById('btn-add-question').addEventListener('click', () => {
    addQuestion();
  });

  document.getElementById('questions').addEventListener('input', (event) => {
    const card = event.target.closest('.question-card');
    if (!card) return;
    const index = Number(card.dataset.index);

    if (event.target.classList.contains('q-text')) {
      state.questions[index].text = event.target.value;
    } else if (event.target.classList.contains('q-option')) {
      state.questions[index].options[event.target.dataset.key] = event.target.value;
    }
  });

  document.getElementById('questions').addEventListener('change', (event) => {
    if (!event.target.classList.contains('q-correct')) return;
    const card = event.target.closest('.question-card');
    state.questions[Number(card.dataset.index)].correct = event.target.value;
  });

  document.getElementById('questions').addEventListener('click', (event) => {
    const btn = event.target.closest('.q-remove');
    if (!btn) return;
    const card = btn.closest('.question-card');
    state.questions.splice(Number(card.dataset.index), 1);
    renderQuestions();
  });

  addQuestion(); // arranca con una pregunta en blanco
}

function addQuestion() {
  state.questions.push({ text: '', options: { A: '', B: '', C: '', D: '' }, correct: 'A' });
  renderQuestions();
}

function renderQuestions() {
  const wrap = document.getElementById('questions');
  wrap.innerHTML = '';

  state.questions.forEach((question, index) => {
    const card = document.createElement('div');
    card.className = 'question-card';
    card.dataset.index = index;

    const head = document.createElement('div');
    head.className = 'question-card__head';

    const num = document.createElement('span');
    num.className = 'question-card__num';
    num.textContent = `Pregunta ${index + 1}`;

    const spacer = document.createElement('span');
    spacer.className = 'question-card__spacer';

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'mdl-button mdl-js-button q-remove';
    remove.textContent = 'Eliminar';

    head.append(num, spacer, remove);
    card.appendChild(head);

    const textField = document.createElement('div');
    textField.className = 'mdl-textfield mdl-js-textfield full-width';
    const textInput = document.createElement('input');
    textInput.className = 'mdl-textfield__input q-text';
    textInput.type = 'text';
    textInput.id = `q-text-${index}`;
    textInput.value = question.text;
    const textLabel = document.createElement('label');
    textLabel.className = 'mdl-textfield__label';
    textLabel.setAttribute('for', textInput.id);
    textLabel.textContent = 'Enunciado de la pregunta';
    textField.append(textInput, textLabel);
    card.appendChild(textField);

    OPTION_KEYS.forEach((key) => {
      const row = document.createElement('div');
      row.className = 'option-row';

      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = `correct-${index}`;
      radio.value = key;
      radio.className = 'q-correct';
      radio.checked = question.correct === key;
      radio.title = 'Marcar como respuesta correcta';

      const keyLabel = document.createElement('span');
      keyLabel.className = 'option-key';
      keyLabel.textContent = key;

      const field = document.createElement('div');
      field.className = 'mdl-textfield mdl-js-textfield';
      const optionInput = document.createElement('input');
      optionInput.className = 'mdl-textfield__input q-option';
      optionInput.type = 'text';
      optionInput.dataset.key = key;
      optionInput.id = `q-${index}-${key}`;
      optionInput.value = question.options[key];
      const optionLabel = document.createElement('label');
      optionLabel.className = 'mdl-textfield__label';
      optionLabel.setAttribute('for', optionInput.id);
      optionLabel.textContent = `Opción ${key}`;
      field.append(optionInput, optionLabel);

      row.append(radio, keyLabel, field);
      card.appendChild(row);
    });

    const help = document.createElement('p');
    help.className = 'hint';
    help.textContent = 'Marca el círculo de la opción correcta.';
    card.appendChild(help);

    wrap.appendChild(card);
  });

  // MDL necesita saber que hay componentes nuevos en el DOM.
  if (window.componentHandler) window.componentHandler.upgradeDom();
}

/* ------------------------------------------------------------------ */
/* 5 · Validación del editor                                           */
/* ------------------------------------------------------------------ */

/** Comprueba que las preguntas del editor estén completas. Devuelve un error o null. */
function revisarPreguntas() {
  if (state.questions.length === 0) {
    return 'No hay ninguna pregunta. Genera el cuestionario o añade una a mano.';
  }

  const incompleta = state.questions.findIndex(
    (q) => !q.text.trim() || OPTION_KEYS.some((key) => !String(q.options[key]).trim())
  );
  if (incompleta !== -1) {
    return `Completa el enunciado y las 4 opciones de la pregunta ${incompleta + 1}.`;
  }

  return null;
}

/* ------------------------------------------------------------------ */
/* 6 · Descarga en Word (.docx) · se genera en el navegador            */
/* ------------------------------------------------------------------ */

/** Dispara la descarga de un Blob con el nombre indicado. */
function descargarBlob(blob, nombre) {
  const enlace = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = enlace;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(enlace), 4000);
}

/** Botones de la tarjeta «Descargar en Word»: exportan lo que hay en el editor. */
function initDocx() {
  const status = document.getElementById('docx-status');

  const botones = [
    { id: 'btn-docx-examen', tipo: 'examen', que: 'el examen (.docx)' },
    { id: 'btn-docx-soluciones', tipo: 'soluciones', que: 'el solucionario (.docx)' },
  ];

  botones.forEach(({ id, tipo, que }) => {
    document.getElementById(id).addEventListener('click', async () => {
      const problema = revisarPreguntas();
      if (problema) {
        setStatus(status, problema, 'error');
        return;
      }

      const docxLib = window.docx;
      if (!docxLib) {
        setStatus(
          status,
          'No se ha cargado la librería de Word. Recarga la página y vuelve a intentarlo.',
          'error'
        );
        return;
      }

      const titulo = document.getElementById('quiz-title').value.trim() || 'Cuestionario';
      setStatus(status, `Preparando ${que}…`);

      try {
        const documento = construirDocumento(
          tipo,
          {
            titulo,
            pdfNombre: state.archivo ? state.archivo.name : null,
            questions: state.questions,
          },
          docxLib
        );

        const blob = await docxLib.Packer.toBlob(documento);
        const nombre = nombreArchivoDocx(tipo, titulo);
        descargarBlob(blob, nombre);
        setStatus(status, `Descargado ${que}: ${nombre}`, 'ok');
      } catch (err) {
        setStatus(status, `No se ha podido generar el Word: ${err.message}`, 'error');
      }
    });
  });
}

/* ------------------------------------------------------------------ */
/* Arranque                                                            */
/* ------------------------------------------------------------------ */

initArchivo();
initGenerate();
initIA();
initQuestionBuilder();
initDocx();
