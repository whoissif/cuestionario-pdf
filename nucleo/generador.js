/**
 * Motor local de generación de cuestionarios. MÓDULO COMPARTIDO.
 *
 * No sabe nada de Node ni del navegador: recibe las líneas de texto ya
 * extraídas del PDF y devuelve las preguntas. Lo usan por igual la aplicación
 * web (public/app.js) y las herramientas de consola (scripts/).
 *
 * No usa internet ni servicios de IA: analiza el texto y construye preguntas
 * de 4 opciones a partir de patrones propios de un temario (definiciones,
 * artículos, listas de conceptos y enumeraciones).
 *
 * Fases:
 *   1. Recibir las líneas del documento (las extrae quien llama, con PDF.js).
 *   2. Reconstruir bloques: títulos de sección, viñetas y párrafos.
 *   3. Detectar «hechos» respondibles (semillas de pregunta).
 *   4. Elegir distractores plausibles y montar las 4 opciones.
 */

const OPTION_KEYS = ['A', 'B', 'C', 'D'];
const MAX_ENUNCIADO = 240;
const MAX_OPCION = 240;

/* ------------------------------------------------------------------ */
/* 1. Utilidades de texto                                              */
/* ------------------------------------------------------------------ */

/** Quita tildes y diéresis, para comparar textos sin depender de ellas. */
function sinAcentos(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/** Forma canónica de un texto para comparar y detectar duplicados. */
function normalizar(texto) {
  return sinAcentos(texto)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Arregla los restos de formato del PDF: «nulidad .» -> «nulidad.» */
function limpiar(texto) {
  return String(texto || '')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/\(\s*art\.?\s*[\d.]+\s*(?:CC|del Código Civil)\s*\)/gi, '')
    .replace(/\s*\(\s*\)\s*/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.;:])/g, '$1')
    .trim();
}

function capitalizar(texto) {
  const t = String(texto || '').trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : t;
}

function minusculizar(texto) {
  const t = String(texto || '').trim();
  return t ? t.charAt(0).toLowerCase() + t.slice(1) : t;
}

/** Pasa a minúsculas respetando el caso: «TIPOS» -> «tipos», «TIPOS de X» -> «tipos de X». */
function aMinusculasNatural(texto) {
  const t = String(texto || '').trim();
  if (!t) return t;
  const letras = t.replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g, '');
  const mayusculas = t.replace(/[^A-ZÁÉÍÓÚÜÑ]/g, '');
  if (letras.length > 1 && mayusculas.length / letras.length >= 0.75) {
    return t.toLocaleLowerCase('es');
  }
  return minusculizar(t);
}

/** Limpia una opción de respuesta: sin coletillas, ni dos puntos ni comas finales. */
function limpiarOpcion(texto) {
  const t = limpiar(texto)
    // Quita una frase final que solo introduce una lista del documento.
    .replace(
      /[.;]\s*(Sin embargo|No obstante|Además|También|Por tanto|Así pues|En cambio|Ahora bien|Por ello)\b[^.;]*[.;]?\s*$/i,
      '.'
    )
    .replace(/[:;,]\s*$/, '')
    .trim();

  if (!t) return t;
  return /[.!?…]$/.test(t) ? t : `${t}.`;
}

/**
 * Quita los ejemplos finales de una descripción para que la opción sea más
 * breve y legible: «… se ponen de acuerdo. Por ejemplo, la compraventa.»
 */
function limpiarDescripcion(texto) {
  return limpiar(texto)
    .replace(/\s*(Por ejemplo|Un ejemplo de|Un ejemplo sería|Como por ejemplo)[^.]*\.\s*$/i, '')
    .replace(/\s*(Por ejemplo|Como por ejemplo)[^.]*\.\s*$/i, '')
    .trim();
}

function terminaFrase(texto) {
  return /[.;:!?]\s*$/.test(String(texto || '').trim());
}

/** Parte un párrafo en frases. Respeta los puntos de cifras («art. 1.254»). */
function dividirEnFrases(texto) {
  return String(texto || '')
    .split(/(?<=[.;])\s+(?=[A-ZÁÉÍÓÚÑÜ¿¡])/)
    .map((f) => f.trim())
    .filter((f) => f.length > 0);
}

/** Baraja una copia del array (Fisher-Yates). */
function mezclar(array) {
  const copia = [...array];
  for (let i = copia.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}

/** Recorta un texto largo por un separador natural, sin cortar palabras. */
function recortar(texto, maximo) {
  const t = String(texto || '').trim();
  if (t.length <= maximo) return t;
  const corte = t.slice(0, maximo);
  const ultimo = Math.max(corte.lastIndexOf('; '), corte.lastIndexOf(', '), corte.lastIndexOf(' y '));
  if (ultimo > maximo * 0.5) return `${corte.slice(0, ultimo).trim()}.`;
  return `${corte.slice(0, corte.lastIndexOf(' ')).trim()}…`;
}

const CONECTORES_INICIALES = [
  'por ultimo', 'ademas', 'tambien', 'en cambio', 'sin embargo', 'es decir',
  'por ejemplo', 'no obstante', 'asi pues', 'ahora bien', 'por tanto',
  'en principio', 'en estos casos', 'por ello',
];

const VERBOS_PROHIBIDOS = [
  'existe', 'debe', 'deben', 'puede', 'pueden', 'tiene', 'tienen', 'hay',
  'se', 'son', 'es', 'esta', 'estan', 'sirve', 'sirven', 'consiste',
  'produce', 'producen', 'permite', 'permiten', 'pretende', 'impide', 'supone',
];

/** ¿Es un término válido para usar como concepto en una pregunta? */
function terminoValido(termino) {
  const t = String(termino || '').trim();
  if (t.length < 4 || t.length > 60) return false;
  if (!/^[A-Za-zÁÉÍÓÚÑÜáéíóúñü]/.test(t)) return false;
  if (/[.;!?]$/.test(t)) return false;

  const plano = normalizar(t);
  if (CONECTORES_INICIALES.some((c) => plano.startsWith(c))) return false;

  const palabras = plano.split(' ');
  if (palabras.some((p) => VERBOS_PROHIBIDOS.includes(p))) return false;

  return true;
}

/* ------------------------------------------------------------------ */
/* 2. Parseo del documento en bloques                                  */
/* ------------------------------------------------------------------ */

const RE_VINETA = /^[●•·▪‣–—-]\s*/;
const RE_NUMERADO = /^\d+(\.\d+)*\.?\s+\S/;

function pareceTitulo(linea, bloquePrevio, esPrimeraLinea = false) {
  const t = linea.trim();
  if (!t || RE_VINETA.test(t)) return false;
  if (RE_NUMERADO.test(t) && t.length <= 80) return true;

  // Primera línea del documento: «TEMA 3 - El contrato».
  if (esPrimeraLinea && t.length <= 60 && !/[.;:!?,]$/.test(t)) return true;
  if (/^TEMA\b/i.test(t) && t.length <= 90 && !/[.;]$/.test(t)) return true;

  // MAYÚSCULAS: «TIPOS», «ARRAS», «OFERTA Y ACEPTACIÓN»
  const letras = t.replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g, '');
  const mayusculas = t.replace(/[^A-ZÁÉÍÓÚÜÑ]/g, '');
  if (letras.length >= 4 && mayusculas.length / letras.length >= 0.75 && t.length <= 90) {
    return true;
  }

  // Subtítulo en minúsculas: corto, sin puntuación final y tras una frase cerrada.
  if (
    t.length <= 60 &&
    /^[A-ZÁÉÍÓÚÑÜ]/.test(t) &&
    !/[.;:!?,]$/.test(t) &&
    bloquePrevio &&
    terminaFrase(bloquePrevio.texto)
  ) {
    return true;
  }

  return false;
}

/**
 * Convierte las líneas del PDF en bloques con contexto.
 * @returns {{tipo:'titulo'|'vineta'|'texto', texto:string, seccion:string|null, intro:string|null}[]}
 */
function parsearBloques(lines) {
  const bloques = [];
  let seccion = null;
  let intro = null;
  let actual = null;

  lines.forEach((linea, indice) => {
    const previo = bloques[bloques.length - 1] || null;

    if (pareceTitulo(linea, previo, indice === 0)) {
      seccion = limpiar(linea);
      intro = null;
      actual = null;
      bloques.push({ tipo: 'titulo', texto: seccion, seccion, intro: null });
      return;
    }

    if (RE_VINETA.test(linea)) {
      actual = { tipo: 'vineta', texto: limpiar(linea.replace(RE_VINETA, '')), seccion, intro };
      bloques.push(actual);
      return;
    }

    // Continuación de la frase anterior (el PDF corta las líneas a lo ancho).
    if (actual && !terminaFrase(actual.texto)) {
      actual.texto = limpiar(`${actual.texto} ${linea}`);
      return;
    }

    const texto = limpiar(linea);
    actual = { tipo: 'texto', texto, seccion, intro };
    bloques.push(actual);

    if (texto.endsWith(':')) intro = texto;
  });

  return bloques;
}

/* ------------------------------------------------------------------ */
/* 3. Detección de hechos (semillas de pregunta)                       */
/* ------------------------------------------------------------------ */

/** Patrones de definición: «El contrato es …», «La oferta supone que …». */
const PATRONES_DEFINICION = [
  { re: /^((?:El|La|Los|Las|Un|Una)\s+[^.;:]{3,60}?)\s+es\s+(.{15,260})$/i, tipo: 'es', forma: 'nominal' },
  { re: /^((?:El|La|Los|Las|Un|Una)\s+[^.;:]{3,60}?)\s+son\s+(.{15,260})$/i, tipo: 'son', forma: 'nominal' },
  { re: /^((?:El|La|Los|Las|Un|Una)\s+[^.;:]{3,60}?)\s+sirven?\s+para\s+(.{15,260})$/i, tipo: 'sirven', forma: 'infinitiva' },
  { re: /^((?:El|La|Los|Las|Un|Una)\s+[^.;:]{3,60}?)\s+consiste\s+en\s+(.{15,260})$/i, tipo: 'consiste', forma: 'nominal' },
  { re: /^((?:El|La|Los|Las|Un|Una)\s+[^.;:]{3,60}?)\s+supone\s+(que\s+.{15,260})$/i, tipo: 'supone', forma: 'clausal' },
  { re: /^((?:El|La|Los|Las|Un|Una)\s+[^.;:]{3,60}?)\s+pretende\s+(.{15,260})$/i, tipo: 'pretende', forma: 'infinitiva' },
  { re: /^((?:El|La|Los|Las|Un|Una)\s+[^.;:]{3,60}?)\s+impide\s+(que\s+.{15,260})$/i, tipo: 'impide', forma: 'clausal' },
];

/** Convierte la definición detectada en el enunciado de la pregunta. */
function enunciadoDeDefinicion(termino, tipo) {
  const t = minusculizar(termino);
  switch (tipo) {
    case 'es':
      return `¿Qué es ${t}?`;
    case 'son':
      return `¿Qué son ${t}?`;
    case 'sirven':
      return `¿Para qué sirve${/^las|^los/.test(t) ? 'n' : ''} ${t}?`;
    case 'consiste':
      return `¿En qué consiste ${t}?`;
    case 'supone':
      return `¿Qué supone ${t}?`;
    case 'pretende':
      return `¿Qué pretende ${t}?`;
    case 'impide':
      return `¿Qué impide ${t}?`;
    default:
      return `¿Qué es ${t}?`;
  }
}

/**
 * Deduce el tema del documento a partir de sus títulos.
 * «TEMA 3 - El contrato» -> «contrato». Si no lo encuentra, devuelve null.
 */
function extraerTema(bloques) {
  const titulos = bloques.filter((b) => b.tipo === 'titulo').map((b) => b.texto);
  const candidatos = [];

  titulos.forEach((t) => {
    const partes = t.split(/\s+[-–:]\s+/);
    if (partes.length > 1) {
      candidatos.push(partes[partes.length - 1]);
    } else if (/^TEMA\b/i.test(t)) {
      candidatos.push(t.replace(/^TEMA\s*\d+\s*/i, ''));
    }
  });

  const elegido = candidatos
    .map((c) => c.replace(/^(el|la|los|las)\s+/i, '').trim())
    .find((c) => c.length >= 4 && c.length <= 40 && !/[?¿!.]/.test(c) && !/^\d/.test(c));

  return elegido ? aMinusculasNatural(elegido) : null;
}

/**
 * Recorre los bloques y reúne todos los materiales del documento.
 */
function recolectar(bloques) {
  const definiciones = []; // { termino, predicado, enunciado, seccion, forma }
  const articulos = []; // { referencia, clausula, seccion }
  const listas = []; // { seccion, intro, items: [{termino, descripcion}] }
  const descripciones = []; // pool: descripciones de viñetas
  const terminos = []; // pool: términos de viñetas
  const frases = []; // pool: frases para huecos
  const tema = extraerTema(bloques);

  let listaActual = null;

  bloques.forEach((bloque) => {
    if (bloque.tipo === 'titulo') {
      listaActual = null;
      return;
    }

    const frasesBloque = dividirEnFrases(bloque.texto);
    frases.push(...frasesBloque.map((f) => ({ texto: f, seccion: bloque.seccion })));

    // --- Artículos del Código Civil ---
    const original = bloque.texto;
    const artEstablece = original.match(
      /art\.?\s*([\d.]+)\s*CC\s+establece\s+que\s+(.{20,220})/i
    );
    if (artEstablece) {
      articulos.push({
        referencia: `art. ${artEstablece[1]} CC`,
        clausula: capitalizar(limpiar(artEstablece[2])),
        seccion: bloque.seccion,
      });
    }
    const artSegun = original.match(/Según el art\.?\s*([\d.]+)\s*CC,?\s+(.{20,220})/i);
    if (artSegun) {
      articulos.push({
        referencia: `art. ${artSegun[1]} CC`,
        clausula: capitalizar(limpiar(artSegun[2])),
        seccion: bloque.seccion,
      });
    }

    // --- Viñetas «Término: descripción» ---
    if (bloque.tipo === 'vineta') {
      const conDosPuntos = bloque.texto.match(/^([^:]{4,60}):\s*(.{15,260})$/);
      if (conDosPuntos && terminoValido(conDosPuntos[1])) {
        const termino = limpiar(conDosPuntos[1]);
        const descripcion = capitalizar(limpiarDescripcion(conDosPuntos[2]));
        if (!descripcion || descripcion.length < 15) return;

        if (!listaActual || listaActual.intro !== bloque.intro || listaActual.seccion !== bloque.seccion) {
          listaActual = { seccion: bloque.seccion, intro: bloque.intro, items: [] };
          listas.push(listaActual);
        }
        listaActual.items.push({ termino, descripcion });
        terminos.push({ texto: termino, seccion: bloque.seccion });
        descripciones.push({ texto: descripcion, seccion: bloque.seccion });
        return;
      }

      // «– Son las conversaciones…» con el título de la sección como sujeto.
      const sinSujeto = bloque.texto.match(/^(Es|Son|Sirven? para|Consiste en|Se trata de)\s+(.{15,260})$/i);
      if (sinSujeto && bloque.seccion && bloque.seccion.length <= 45 && !RE_NUMERADO.test(bloque.seccion)) {
        const termino = `los ${aMinusculasNatural(bloque.seccion)}`;
        definiciones.push({
          termino,
          predicado: capitalizar(limpiar(sinSujeto[2])),
          enunciado: `¿Qué son ${termino}?`,
          seccion: bloque.seccion,
          forma: 'nominal',
        });
      }
    }

    // --- Definiciones «X es/son …» ---
    frasesBloque.forEach((frase) => {
      for (const patron of PATRONES_DEFINICION) {
        const m = frase.match(patron.re);
        if (!m) continue;
        const termino = limpiar(m[1]);
        if (!terminoValido(termino)) continue;

        const predicado = capitalizar(recortar(limpiar(m[2]), 200));
        if (predicado.length < 12) continue;

        // Un predicado que empieza por «que» es una subordinada, no una definición nominal.
        const forma = /^que\s/i.test(predicado) ? 'clausal' : patron.forma;

        definiciones.push({
          termino,
          predicado,
          enunciado: enunciadoDeDefinicion(termino, patron.tipo),
          seccion: bloque.seccion,
          forma,
        });
        break; // una definición por frase
      }
    });
  });

  // Listas útiles: al menos 2 items y una sección corta que las nombre.
  const listasValidas = listas.filter((l) => l.items.length >= 2);

  return {
    definiciones,
    articulos,
    listas: listasValidas,
    descripciones,
    terminos,
    frases,
    tema,
  };
}

/* ------------------------------------------------------------------ */
/* 4. Elección de distractores y montaje de opciones                   */
/* ------------------------------------------------------------------ */

/**
 * Elige distractores plausibles para una respuesta correcta.
 *
 * @param {string} correcta texto de la opción correcta
 * @param {Array<Array<{texto:string,seccion:string|null}>>} pools fondos donde buscar,
 *        por orden de preferencia (el primero es el propio del tipo de pregunta)
 * @param {string|null} seccion sección del documento donde está la pregunta
 * @param {number} cuantos número de distractores necesarios
 * @param {Function|null} filtro preferencia suave (p. ej. misma forma gramatical)
 */
function elegirDistractores(correcta, pools, seccion, cuantos = 3, filtro = null) {
  const objetivo = normalizar(correcta);
  const validos = [];
  const vistos = new Set();

  pools.forEach((pool) => {
    (pool || []).forEach((item) => {
      const t = normalizar(item.texto);
      if (!t || t === objetivo || vistos.has(t)) return;
      if (t.includes(objetivo) || objetivo.includes(t)) return;
      if (!item.texto || item.texto.length > MAX_OPCION) return;
      const ratio = item.texto.length / correcta.length;
      if (ratio < 0.5 || ratio > 1.9) return;
      vistos.add(t);
      validos.push(item);
    });
  });

  const enSeccion = (i) => Boolean(seccion) && i.seccion === seccion;
  const cumple = (i) => (filtro ? filtro(i) : true);

  // Orden de preferencia: misma sección y misma forma, misma forma, misma
  // sección, y por último cualquier candidato válido.
  const grupos = [
    validos.filter((i) => enSeccion(i) && cumple(i)),
    validos.filter((i) => !enSeccion(i) && cumple(i)),
    validos.filter((i) => enSeccion(i) && !cumple(i)),
    validos.filter((i) => !enSeccion(i) && !cumple(i)),
  ];

  const elegidos = [];
  const usados = new Set();

  for (const grupo of grupos) {
    for (const item of mezclar(grupo)) {
      if (elegidos.length >= cuantos) break;
      const t = normalizar(item.texto);
      if (usados.has(t)) continue;
      usados.add(t);
      elegidos.push(item.texto);
    }
  }

  return elegidos.length >= cuantos ? elegidos.slice(0, cuantos) : null;
}

/** Monta las 4 opciones barajadas y marca la correcta. */
function montarOpciones(correcta, distractores) {
  const correctaLimpia = limpiarOpcion(correcta);
  const opciones = mezclar([correctaLimpia, ...distractores.map(limpiarOpcion)]);

  // Sin cuatro opciones distintas la pregunta sería ambigua.
  const distintas = new Set(opciones.map(normalizar));
  if (distintas.size !== OPTION_KEYS.length) return null;

  const options = {};
  let letraCorrecta = null;

  opciones.forEach((texto, i) => {
    const clave = OPTION_KEYS[i];
    options[clave] = texto;
    if (normalizar(texto) === normalizar(correctaLimpia)) letraCorrecta = clave;
  });

  if (!letraCorrecta) return null;
  return { options, correct: letraCorrecta };
}

/* ------------------------------------------------------------------ */
/* 5. Construcción y selección de preguntas                            */
/* ------------------------------------------------------------------ */

const PRIORIDAD = {
  articulo: 1,
  definicion: 2,
  vineta_termino: 3,
  vineta_descripcion: 4,
  enumeracion: 5,
  hueco: 6,
};

/** Límite de longitud del enunciado según el tipo (los huecos son más largos). */
const MAX_ENUNCIADO_POR_TIPO = { hueco: 340 };

function construirSemillas(datos) {
  const semillas = [];
  const push = (tipo, enunciado, correcta, poolClaves, seccion, forma = null) => {
    if (!enunciado || !correcta) return;
    const maxEnunciado = MAX_ENUNCIADO_POR_TIPO[tipo] || MAX_ENUNCIADO;
    if (String(enunciado).length > maxEnunciado) return;
    if (String(correcta).length > MAX_OPCION) return;
    semillas.push({
      tipo,
      enunciado,
      correcta,
      poolClaves,
      seccion: seccion || null,
      forma,
    });
  };

  // Artículos del Código Civil. Si no hay bastantes artículos para los
  // distractores, se completan con definiciones del propio documento.
  datos.articulos.forEach((a) => {
    push(
      'articulo',
      `¿Qué establece el ${a.referencia}?`,
      a.clausula,
      ['articulo', 'definicion'],
      a.seccion
    );
  });

  // Definiciones del texto principal.
  datos.definiciones.forEach((d) => {
    push('definicion', d.enunciado, d.predicado, ['definicion'], d.seccion, d.forma);
  });

  // Listas de conceptos: dos direcciones, alternando para no repetir el mismo hecho.
  let alternar = 0;
  datos.listas.forEach((lista) => {
    lista.items.forEach((item) => {
      if (alternar % 2 === 0) {
        push(
          'vineta_termino',
          `¿Qué se entiende por «${item.termino}»?`,
          item.descripcion,
          ['descripcion'],
          lista.seccion
        );
      } else {
        push(
          'vineta_descripcion',
          `¿A qué concepto corresponde esta definición: «${recortar(item.descripcion, 130)}»?`,
          item.termino,
          ['termino'],
          lista.seccion
        );
      }
      alternar += 1;
    });
  });

  // Enumeraciones: listas precedidas de una introducción «Según …».
  datos.listas.forEach((lista) => {
    const intro = lista.intro;
    if (!intro || !/^según/i.test(intro)) return;
    if (!lista.seccion || lista.seccion.length > 30) return;
    if (!datos.tema) return;
    if (lista.items.length < 3) return;

    const genero = aMinusculasNatural(lista.seccion);
    const complemento = aMinusculasNatural(intro.replace(/:$/, ''));
    const terminosLista = lista.items.map((i) => i.termino);
    const respuesta = capitalizar(
      `${terminosLista.slice(0, -1).join(', ')} y ${terminosLista[terminosLista.length - 1]}`
    );

    push(
      'enumeracion',
      `¿Cuáles son los ${genero} de ${datos.tema} ${complemento}?`,
      `${respuesta}.`,
      ['enumeracion'],
      lista.seccion
    );
  });

  // Huecos: frases con un término reconocible, como último recurso.
  datos.terminos.forEach((termino) => {
    const objetivo = new RegExp(`\\b${termino.texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    const frase = datos.frases.find((f) => {
      if (f.texto.length < 50 || f.texto.length > 230) return false;
      const coincidencias = f.texto.match(new RegExp(objetivo.source, 'gi'));
      if (!coincidencias || coincidencias.length !== 1) return false;
      return f.texto.search(objetivo) > 10;
    });
    if (!frase) return;

    const conHueco = frase.texto.replace(objetivo, '_____');
    push('hueco', `Completa la frase: «${conHueco}»`, termino.texto, ['termino'], frase.seccion);
  });

  return semillas;
}

/**
 * Elige las preguntas definitivas entre las ya construidas.
 *
 * Se construyen antes de elegir: así una semilla que no encuentre distractores
 * no descuenta cupo y, si el documento da para lo pedido, se entregan tantas
 * preguntas como se hayan pedido.
 *
 * @param {{tipo:string,enunciado:string,respuesta:string}[]} construidas
 * @param {number} cantidad
 */
function seleccionar(construidas, cantidad) {
  const porTipo = new Map();
  const claves = new Set();
  const respuestas = new Set();

  construidas.forEach((q) => {
    const clave = `${normalizar(q.enunciado)}|${q.respuesta}`;
    if (claves.has(clave) || respuestas.has(q.respuesta)) return;
    claves.add(clave);
    respuestas.add(q.respuesta);

    if (!porTipo.has(q.tipo)) porTipo.set(q.tipo, []);
    porTipo.get(q.tipo).push(q);
  });

  const tipos = [...porTipo.keys()].sort((a, b) => PRIORIDAD[a] - PRIORIDAD[b]);
  const grupos = tipos.map((t) => mezclar(porTipo.get(t)));

  const elegidas = [];
  let ronda = 0;
  while (elegidas.length < cantidad && grupos.some((g) => g.length > ronda)) {
    for (const grupo of grupos) {
      if (elegidas.length >= cantidad) break;
      if (grupo[ronda]) elegidas.push(grupo[ronda]);
    }
    ronda += 1;
  }

  return elegidas;
}

/* ------------------------------------------------------------------ */
/* 6. API pública                                                      */
/* ------------------------------------------------------------------ */

/**
 * Genera preguntas de 4 opciones a partir de un PDF.
 * @param {string[]} lines líneas de texto del documento, en orden
 * @param {number} cantidad número deseado de preguntas
 */
function generarPreguntasDeLineas(lines, cantidad = 10) {
  const bloques = parsearBloques(lines);
  const datos = recolectar(bloques);
  const semillas = construirSemillas(datos);

  const pools = {
    definicion: datos.definiciones.map((d) => ({
      texto: d.predicado,
      seccion: d.seccion,
      forma: d.forma,
    })),
    articulo: datos.articulos.map((a) => ({ texto: a.clausula, seccion: a.seccion })),
    descripcion: datos.descripciones,
    termino: datos.terminos,
    enumeracion: [],
  };

  // Todas las respuestas de enumeración posibles sirven de distractores entre sí.
  datos.listas.forEach((lista) => {
    const t = lista.items.map((i) => i.termino);
    if (t.length >= 2) {
      pools.enumeracion.push({
        texto: `${capitalizar(`${t.slice(0, -1).join(', ')} y ${t[t.length - 1]}`)}.`,
        seccion: lista.seccion,
      });
    }
  });

  const construidas = [];
  for (const semilla of semillas) {
    const listas = (semilla.poolClaves || []).map((clave) => pools[clave] || []);
    // Las definiciones nominales no deben mezclarse con predicados clausulares,
    // y las preguntas de artículos no admiten distractores en infinitivo.
    let filtro = null;
    if (semilla.tipo === 'definicion' && semilla.forma) {
      filtro = (item) => !item.forma || item.forma === semilla.forma;
    } else if (semilla.tipo === 'articulo') {
      filtro = (item) => item.forma !== 'infinitiva';
    }

    const distractores = elegirDistractores(semilla.correcta, listas, semilla.seccion, 3, filtro);
    if (!distractores) continue;

    const montaje = montarOpciones(semilla.correcta, distractores);
    if (!montaje) continue;

    construidas.push({
      tipo: semilla.tipo,
      enunciado: semilla.enunciado,
      respuesta: normalizar(semilla.correcta),
      text: semilla.enunciado,
      options: montaje.options,
      correct: montaje.correct,
    });
  }

  // Solo después de construir se eligen: así ninguna pregunta se pierde en balde.
  const preguntas = seleccionar(construidas, cantidad).map((q) => ({
    text: q.text,
    options: q.options,
    correct: q.correct,
    tipo: q.tipo,
  }));

  const tipos = {};
  preguntas.forEach((p) => {
    tipos[p.tipo] = (tipos[p.tipo] || 0) + 1;
  });

  return {
    preguntas,
    candidatas: semillas.length,
    tipos,
    tema: datos.tema,
  };
}

export {
  generarPreguntasDeLineas,
  // Exportadas para pruebas y para otros módulos:
  parsearBloques,
  recolectar,
  dividirEnFrases,
  limpiar,
  normalizar,
};
