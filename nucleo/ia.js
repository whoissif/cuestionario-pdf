/**
 * Generación de preguntas con IA (opcional). MÓDULO COMPARTIDO.
 *
 * Es un módulo ESM que funciona igual en el navegador y en Node: solo usa
 * `fetch`, `AbortSignal` y `URL`, que existen en los dos. No usa `require`, ni
 * el sistema de archivos, ni ninguna otra API exclusiva de Node. El texto del
 * documento llega ya extraído (lo extrae quien llama, con PDF.js).
 *
 * Soporta dos familias de API, que son las que usan los servicios gratuitos:
 *   - `ollama`  -> API nativa de Ollama (`/api/tags`, `/api/chat`). Sirve para
 *                 Ollama en el propio PC (sin clave) y para Ollama Cloud.
 *   - `openai`  -> API compatible con OpenAI (`/models`, `/chat/completions`).
 *                 Es la que usan Groq, Gemini, OpenRouter, Cerebras, Mistral...
 *
 * La clave de API NUNCA se guarda: llega en cada petición, viaja en la cabecera
 * de esa única llamada y se descarta al terminar.
 */

import { normalizar, parsearBloques } from './generador.js';

const LETRAS = ['A', 'B', 'C', 'D'];
const TIMEOUT_MS = 180000; // 3 minutos: los modelos locales pueden tardar
const MAX_REINTENTOS_429 = 2;

/**
 * Tamaño máximo de cada tanda de material.
 *
 * Se elige alto a propósito: cada tanda es UNA petición al servicio, y los
 * niveles gratuitos limitan mucho el número de peticiones (OVHcloud anónimo
 * solo permite 2 por minuto). Con 14.000 caracteres, un documento normal
 * (~9.000) cabe en una única petición y el límite no se toca. Sigue siendo un
 * tamaño seguro para modelos de contexto pequeño (unos 8.000 tokens).
 */
const MAX_CARACTERES_POR_TANDA = 14000;

/**
 * Catálogo de servicios. Las URL y los modelos son sugerencias: todos los
 * campos se pueden editar desde la interfaz.
 */
const PROVEEDORES = [
  {
    id: 'ollama',
    nombre: 'Ollama en tu PC (gratis, sin clave)',
    tipo: 'ollama',
    baseUrl: 'http://localhost:11434',
    claveObligatoria: false,
    privacidad: 'Tu PDF no sale de tu ordenador.',
    nota: 'Necesita Ollama instalado y arrancado. Para descargar un modelo: ollama pull llama3.2',
    modelos: ['llama3.2', 'qwen2.5:7b', 'mistral', 'gemma2', 'phi4-mini', 'llama3.1:8b'],
  },
  {
    id: 'llm7',
    nombre: 'LLM7.io (gratis, sin registro)',
    tipo: 'openai',
    baseUrl: 'https://api.llm7.io/v1',
    claveObligatoria: false,
    jsonMode: false,
    privacidad: 'Tu PDF se envía a LLM7.io.',
    nota: 'Unas 30 peticiones por minuto: es la opción sin clave con más margen. Los modelos «turbo» son los gratuitos.',
    ayuda: 'https://token.llm7.io',
    modelos: [
      'DeepSeek-V4-Flash-0731',
      'GLM-5.3-Flash',
      'gemini-3.1-flash-lite',
      'minimax-m2.7',
      'codestral-latest',
      'mistral-Nemo-Instruct-2407',
    ],
  },
  {
    id: 'ovhcloud',
    nombre: 'OVHcloud AI Endpoints (gratis, SIN clave)',
    tipo: 'openai',
    baseUrl: 'https://oai.endpoints.kepler.ai.cloud.ovh.net/v1',
    claveObligatoria: false,
    jsonMode: false,
    privacidad: 'Tu PDF se envía a OVHcloud (servidores en la UE).',
    nota: 'Solo 2 peticiones por minuto por IP. Con documentos largos (que se parten en varias tandas) puede agotarse: para eso LLM7.io da más margen.',
    ayuda: 'https://endpoints.ai.cloud.ovh.net/',
    modelos: [
      'gpt-oss-120b',
      'Meta-Llama-3_3-70B-Instruct',
      'Mistral-Small-3.2-24B-Instruct-2506',
      'Qwen3.5-397B-A17B',
    ],
  },
  {
    id: 'groq',
    nombre: 'Groq (gratis con clave)',
    tipo: 'openai',
    baseUrl: 'https://api.groq.com/openai/v1',
    claveObligatoria: true,
    jsonMode: true,
    privacidad: 'Tu PDF se envía a Groq.',
    nota: 'Muy rápido. Nivel gratuito sin tarjeta: 30 peticiones por minuto.',
    ayuda: 'https://console.groq.com/keys',
    modelos: [
      'llama-3.3-70b-versatile',
      'llama-3.1-8b-instant',
      'openai/gpt-oss-120b',
      'qwen/qwen3-32b',
      'moonshotai/kimi-k2-instruct',
    ],
  },
  {
    id: 'openrouter',
    nombre: 'OpenRouter (modelos «:free» con clave)',
    tipo: 'openai',
    baseUrl: 'https://openrouter.ai/api/v1',
    claveObligatoria: true,
    jsonMode: true,
    privacidad: 'Tu PDF se envía a OpenRouter y al proveedor del modelo.',
    nota: 'Busca modelos terminados en «:free»: son gratuitos (unas 200 peticiones al día).',
    ayuda: 'https://openrouter.ai/keys',
    modelos: [
      'deepseek/deepseek-chat-v3-0324:free',
      'meta-llama/llama-3.3-70b-instruct:free',
      'openai/gpt-oss-120b:free',
      'qwen/qwen3-coder-480b-a35b:free',
    ],
  },
  {
    id: 'gemini',
    nombre: 'Google Gemini (gratis con clave)',
    tipo: 'openai',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    claveObligatoria: true,
    jsonMode: true,
    privacidad:
      'Tu PDF se envía a Google (el nivel gratuito puede usar los datos para mejorar sus productos).',
    nota: 'Ojo: el nivel gratuito NO está disponible en la UE, Reino Unido ni Suiza.',
    ayuda: 'https://aistudio.google.com/app/apikey',
    modelos: ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash'],
  },
  {
    id: 'cerebras',
    nombre: 'Cerebras (gratis con clave)',
    tipo: 'openai',
    baseUrl: 'https://api.cerebras.ai/v1',
    claveObligatoria: true,
    jsonMode: true,
    privacidad: 'Tu PDF se envía a Cerebras.',
    nota: 'Nivel gratuito sin tarjeta: hasta 1 millón de tokens al día.',
    ayuda: 'https://cloud.cerebras.ai/',
    modelos: ['llama3.1-8b', 'gpt-oss-120b', 'qwen-3-235b-a22b-instruct-2507'],
  },
  {
    id: 'mistral',
    nombre: 'Mistral AI (plan gratuito con clave)',
    tipo: 'openai',
    baseUrl: 'https://api.mistral.ai/v1',
    claveObligatoria: true,
    jsonMode: true,
    privacidad: 'Tu PDF se envía a Mistral AI (servidores en la UE).',
    nota: 'Plan «Experiment» gratuito, sin tarjeta.',
    ayuda: 'https://console.mistral.ai/api-keys',
    modelos: ['mistral-small-latest', 'mistral-nemo', 'open-mistral-nemo'],
  },
  {
    id: 'ollama-cloud',
    nombre: 'Ollama Cloud (gratis con clave)',
    tipo: 'ollama',
    baseUrl: 'https://api.ollama.com',
    claveObligatoria: true,
    privacidad: 'Tu PDF se envía a Ollama Cloud.',
    nota: 'Nivel gratuito con límites de uso. La clave se pide en ollama.com/settings/keys.',
    ayuda: 'https://ollama.com/settings/keys',
    modelos: ['llama3.1:cloud', 'qwen2.5:cloud', 'deepseek-r1:cloud', 'gemma2:cloud'],
  },
  {
    id: 'openai-compatible',
    nombre: 'Otro servicio compatible con OpenAI',
    tipo: 'openai',
    baseUrl: '',
    claveObligatoria: false,
    jsonMode: false,
    privacidad: 'Tu PDF se envía al servicio que indiques.',
    nota: 'Escribe la URL base del servicio (suele terminar en /v1) y su modelo.',
    modelos: [],
  },
  {
    id: 'ollama-otro',
    nombre: 'Otro servidor Ollama (por ejemplo, en tu red)',
    tipo: 'ollama',
    baseUrl: '',
    claveObligatoria: false,
    privacidad: 'Tu PDF se envía a ese servidor.',
    nota: 'Escribe la URL del servidor Ollama (por ejemplo http://192.168.1.50:11434).',
    modelos: [],
  },
];

/** Catálogo público (sin secretos). */
function catalogo() {
  return PROVEEDORES.map((p) => ({
    id: p.id,
    nombre: p.nombre,
    tipo: p.tipo,
    baseUrl: p.baseUrl,
    claveObligatoria: p.claveObligatoria,
    privacidad: p.privacidad,
    nota: p.nota,
    ayuda: p.ayuda || null,
    modelos: p.modelos,
  }));
}

/**
 * Busca un servicio del catálogo.
 * Acepta el identificador (`'ollama'`) o el propio objeto del servicio, para
 * que `normalizarConfig` se pueda aplicar dos veces sin romperse: así da igual
 * si quien llama pasa la configuración tal cual sale de la interfaz o ya
 * normalizada.
 */
function buscarProveedor(valor) {
  const id = valor && typeof valor === 'object' ? valor.id : String(valor ?? '').trim();
  return PROVEEDORES.find((p) => p.id === id) || null;
}

/** Valida y normaliza la configuración que llega del navegador (idempotente). */
function normalizarConfig(body, { requiereModelo = true } = {}) {
  const proveedor = buscarProveedor(body?.proveedor);
  if (!proveedor) {
    throw new Error('Servicio de IA no reconocido. Elige uno de la lista.');
  }

  const baseUrl = String(body?.baseUrl || proveedor.baseUrl || '')
    .trim()
    .replace(/\/+$/, '');
  if (!baseUrl) throw new Error('Falta la URL del servicio de IA.');

  let url;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new Error(`La URL «${baseUrl}» no es válida. Ejemplo: http://localhost:11434`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('La URL debe empezar por http:// o https://');
  }

  const apiKey = String(body?.apiKey ?? '').trim();
  if (proveedor.claveObligatoria && !apiKey) {
    throw new Error(`El servicio «${proveedor.nombre}» necesita una clave de API.`);
  }

  const modelo = String(body?.modelo ?? '').trim();
  if (requiereModelo && !modelo) throw new Error('Falta el nombre del modelo.');

  return { proveedor, baseUrl, apiKey, modelo };
}

/** Traduce los fallos de red o de HTTP a mensajes claros en español. */
function mensajeDeError(err, proveedor, baseUrl) {
  if (err && err.name === 'TimeoutError') {
    return `La IA ha tardado más de ${TIMEOUT_MS / 1000} segundos en responder. Prueba con menos preguntas o con un modelo más rápido.`;
  }
  if (err && (err.cause?.code === 'ECONNREFUSED' || /ECONNREFUSED/.test(err.message || ''))) {
    return `No se puede conectar con ${baseUrl}. Si es Ollama en tu PC, comprueba que está arrancado (ejecuta «ollama serve»).`;
  }
  if (err && /ENOTFOUND|EAI_AGAIN|fetch failed/i.test(err.message || '')) {
    return `No se ha podido contactar con ${baseUrl}. Revisa la URL y tu conexión a internet.`;
  }

  const estado = err?.estadoHttp;
  if (estado === 401 || estado === 403) {
    return `La clave de API no es válida o ha caducado (HTTP ${estado}). Revisa la clave de ${proveedor.nombre}.`;
  }
  if (estado === 404) {
    return `El servicio no responde en ${baseUrl} (HTTP 404). Revisa la URL (suele terminar en /v1).`;
  }
  if (estado === 429) {
    return 'Se ha agotado el límite gratuito del servicio (HTTP 429) incluso después de esperar y reintentar. Espera un minuto, pide menos preguntas o usa un servicio con un límite más amplio (LLM7.io permite muchas más peticiones que OVHcloud).';
  }
  if (estado === 400 || estado === 422) {
    return `El servicio ha rechazado la petición (HTTP ${estado}). Puede que el modelo no exista o no admita este formato. Pulsa «Ver modelos» para elegir uno disponible. Detalle: ${err.message}`;
  }
  if (estado) {
    return `El servicio ha respondido con un error HTTP ${estado}: ${err.message}`;
  }
  return `Error al hablar con la IA: ${err.message}`;
}

/**
 * ¿El error se debe a que el modelo no existe o no está disponible?
 * Los servicios lo dicen de muchas formas distintas, así que se buscan todas.
 */
function esErrorDeModelo(err) {
  if (err?.esModeloInvalido) return true;
  const texto = `${err?.message || ''}`.toLowerCase();
  return (
    /model[\s\S]{0,60}?(unavailable|not found|does not exist|unknown|invalid|deprecat|no longer|unsupported|does not support)/.test(
      texto
    ) ||
    /model_not_found|(unavailable|unknown|invalid|unsupported) model/.test(texto)
  );
}

/** Descarta modelos que no sirven para redactar (embeddings, audio, imagen…). */
const NO_CONVERSACIONALES =
  /embed|bge|e5-|gte-|jina|nomic|mxbai|whisper|tts|rerank|moderation|safety|guard|stable-diffusion|image|video|sogni|kling|seedance|chroma|voxtral/i;

/**
 * Elige un modelo razonable entre los que ofrece el servicio, para poder
 * reintentar cuando el modelo pedido ya no existe.
 */
function elegirModeloDisponible(disponibles) {
  const validos = (disponibles || []).filter((id) => !NO_CONVERSACIONALES.test(id));
  if (validos.length === 0) return null;

  const preferidos =
    /instruct|chat|versatile|flash|turbo|oss|llama|qwen|mistral|gemini|deepseek|glm|minimax|kimi|codestral|gpt/i;

  return validos.find((id) => preferidos.test(id)) || validos[0];
}

/** Convierte una respuesta HTTP de error en un error con mensaje en español. */
function falloDeServicio(estado, cuerpo, proveedor, baseUrl) {
  const detalle =
    typeof cuerpo === 'string'
      ? cuerpo
      : cuerpo?.error?.message || cuerpo?.message || JSON.stringify(cuerpo || {});

  const original = new Error(String(detalle || 'sin detalle').slice(0, 300));
  original.estadoHttp = estado;
  const traducido = new Error(mensajeDeError(original, proveedor, baseUrl));
  traducido.esModeloInvalido = esErrorDeModelo(original);
  return traducido;
}

async function peticion(url, opciones, proveedor) {
  try {
    return await fetch(url, { ...opciones, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (err) {
    throw new Error(mensajeDeError(err, proveedor, new URL(url).origin));
  }
}

async function leerCuerpo(res) {
  const texto = await res.text().catch(() => '');
  try {
    return JSON.parse(texto);
  } catch {
    return texto.slice(0, 300);
  }
}

const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Cuánto pide esperar el servicio antes de reintentar (cabecera `Retry-After`,
 * en segundos o como fecha). Se limita a 90 s para no dejar al usuario colgado.
 */
function esperaDeCabecera(res) {
  const valor = res.headers?.get?.('retry-after');
  if (!valor) return null;

  const segundos = Number(valor);
  if (Number.isFinite(segundos) && segundos >= 0) return Math.min(segundos, 90) * 1000;

  const fecha = Date.parse(valor);
  if (!Number.isNaN(fecha)) {
    const diferencia = fecha - Date.now();
    if (diferencia > 0) return Math.min(diferencia, 90000);
  }
  return null;
}

/**
 * Hace la petición y, si el servicio responde «límite alcanzado» (429), espera
 * lo que indique y reintenta. En los niveles gratuitos esto es habitual: sin
 * este reintento, una tanda de más arruina todo el cuestionario.
 */
async function enviarConReintento(url, opciones, proveedor, aviso) {
  let intento = 0;

  for (;;) {
    const res = await peticion(url, opciones, proveedor);
    if (res.status !== 429 || intento >= MAX_REINTENTOS_429) return res;

    intento += 1;
    const espera = esperaDeCabecera(res) ?? Math.min(15 * intento + 15, 60) * 1000;

    if (aviso) {
      aviso(
        `El servicio ha alcanzado su límite gratuito; se espera ${Math.round(espera / 1000)} s y se reintenta (${intento} de ${MAX_REINTENTOS_429}).`
      );
    }
    await esperar(espera);
  }
}

/* ------------------------------------------------------------------ */
/* Listar modelos disponibles                                          */
/* ------------------------------------------------------------------ */

async function listarModelos({ proveedor, baseUrl, apiKey }) {
  const cabeceras = {};
  if (apiKey) cabeceras.Authorization = `Bearer ${apiKey}`;

  if (proveedor.tipo === 'ollama') {
    const res = await peticion(`${baseUrl}/api/tags`, { headers: cabeceras }, proveedor);
    if (!res.ok) throw falloDeServicio(res.status, await leerCuerpo(res), proveedor, baseUrl);

    const datos = await res.json();
    return (datos.models || []).map((m) => m.name || m.model).filter(Boolean).sort();
  }

  const res = await peticion(`${baseUrl}/models`, { headers: cabeceras }, proveedor);
  if (!res.ok) throw falloDeServicio(res.status, await leerCuerpo(res), proveedor, baseUrl);

  const datos = await res.json();
  return (datos.data || datos.models || [])
    .map((m) => m.id || m.name || m.model)
    .filter(Boolean)
    .sort();
}

/* ------------------------------------------------------------------ */
/* Material del documento                                              */
/* ------------------------------------------------------------------ */

/**
 * Convierte el texto YA EXTRAÍDO del documento en material estructurado
 * (títulos y viñetas incluidos). No lee ningún archivo.
 *
 * Cuando quien extrae el texto conserva los saltos de página (carácter `\f`),
 * se cuentan las páginas; si no, se puede pasar el número en `paginas`.
 */
function contarPaginas(texto, paginas) {
  const indicado = Number(paginas);
  if (Number.isFinite(indicado) && indicado > 0) return indicado;

  const crudo = String(texto ?? '');
  if (!crudo.includes('\f')) return 1;
  return crudo.split('\f').filter((parte) => parte.trim().length > 0).length || 1;
}

/** Convierte el texto extraído en material estructurado (títulos y viñetas). */
function materialDeTexto(texto, paginas) {
  const lines = String(texto ?? '')
    .split(/\r?\n/)
    .map((linea) => linea.replace(/\f/g, '').trim())
    .filter((linea) => linea.length > 0);

  const bloques = parsearBloques(lines);

  const partes = bloques.map((b) => {
    if (b.tipo === 'titulo') return `## ${b.texto}`;
    if (b.tipo === 'vineta') return `- ${b.texto}`;
    return b.texto;
  });

  return {
    texto: partes.join('\n\n').replace(/\n{3,}/g, '\n\n').trim(),
    paginas: contarPaginas(texto, paginas),
  };
}

/**
 * Parte el material en tandas EQUILIBRADAS que quepan en el contexto del modelo.
 *
 * Los cortes se calculan sobre la longitud ACUMULADA (1/N, 2/N... del texto), no
 * sobre el tamaño de cada tanda. Si cada tanda se llenara hasta el máximo, la
 * última quedaría con cuatro líneas y esa parte del documento apenas generaría
 * preguntas.
 */
function dividirEnTandas(texto, maximo = MAX_CARACTERES_POR_TANDA) {
  if (texto.length <= maximo) return [texto];

  const numeroDeTandas = Math.ceil(texto.length / maximo);
  const objetivo = texto.length / numeroDeTandas;

  // Unidades naturales: párrafos si los hay; los mayores que una tanda, por frases.
  const unidades = [];
  const partes = texto.includes('\n\n') ? texto.split(/\n{2,}/) : [texto];
  partes.forEach((parte) => {
    if (parte.length <= objetivo) {
      unidades.push(parte);
      return;
    }
    unidades.push(...parte.split(/(?<=[.;])\s+/));
  });

  const tandas = [];
  let actual = '';
  let acumulado = 0;
  let corte = objetivo;

  unidades.forEach((unidad) => {
    const coste = unidad.length + 2;
    if (acumulado > 0 && acumulado + coste > corte) {
      tandas.push(actual.trim());
      actual = '';
      acumulado = 0;
      corte += objetivo;
    }
    actual += (actual ? '\n\n' : '') + unidad;
    acumulado += coste;
  });

  if (actual.trim()) tandas.push(actual.trim());
  return tandas;
}

/* ------------------------------------------------------------------ */
/* Generación con IA                                                   */
/* ------------------------------------------------------------------ */

function construirPrompt(material, cantidad) {
  return [
    'Eres un profesor experto que prepara exámenes tipo test en español.',
    `A partir del MATERIAL de abajo, redacta EXACTAMENTE ${cantidad} pregunta(s) de opción múltiple.`,
    '',
    'Reglas obligatorias:',
    '- Cada pregunta tiene 4 opciones (A, B, C, D) y SOLO UNA es correcta.',
    '- Las 3 opciones incorrectas deben ser plausibles y de longitud parecida a la correcta:',
    '  nunca absurdas ni evidentemente falsas.',
    '- Básate SOLO en el contenido del MATERIAL. No inventes datos que no aparezcan.',
    '- Preguntas claras y sin ambigüedad, sobre ideas importantes del material.',
    '- No repitas dos veces la misma idea.',
    '- Escribe en español correcto, con tildes y signos de apertura.',
    '',
    'Devuelve ÚNICAMENTE un JSON válido, sin explicaciones ni bloques de código, con esta forma:',
    '{"questions":[{"text":"enunciado","options":{"A":"...","B":"...","C":"...","D":"..."},"correct":"A"}]}',
    '',
    'MATERIAL:',
    material,
  ].join('\n');
}

/** Extrae el primer objeto JSON del texto que devuelve el modelo. */
function extraerJson(texto) {
  const limpio = String(texto || '')
    .replace(/^\s*```(?:json)?/i, '')
    .replace(/```\s*$/, '')
    .trim();

  try {
    return JSON.parse(limpio);
  } catch {
    /* se sigue buscando */
  }

  const inicio = limpio.indexOf('{');
  if (inicio === -1) return null;

  let profundidad = 0;
  let enCadena = false;
  let escape = false;

  for (let i = inicio; i < limpio.length; i += 1) {
    const c = limpio[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (c === '\\') {
      escape = true;
      continue;
    }
    if (c === '"') enCadena = !enCadena;
    if (enCadena) continue;
    if (c === '{') profundidad += 1;
    if (c === '}') {
      profundidad -= 1;
      if (profundidad === 0) {
        try {
          return JSON.parse(limpio.slice(inicio, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

/** Valida y limpia una pregunta devuelta por la IA. Devuelve null si no sirve. */
function limpiarPreguntaIA(raw) {
  const text = String(raw?.text ?? raw?.pregunta ?? raw?.question ?? raw?.enunciado ?? '').trim();
  const opcionesRaw = raw?.options ?? raw?.opciones ?? raw?.answers ?? {};

  const options = {};
  if (Array.isArray(opcionesRaw)) {
    LETRAS.forEach((letra, i) => {
      const v = opcionesRaw[i];
      options[letra] = String(Array.isArray(v) ? v[0] : (v ?? '')).trim();
    });
  } else {
    LETRAS.forEach((letra) => {
      const v = opcionesRaw[letra] ?? opcionesRaw[letra.toLowerCase()] ?? '';
      options[letra] = String(Array.isArray(v) ? v[0] : v).trim();
    });
  }

  let correct = String(raw?.correct ?? raw?.correcta ?? raw?.answer ?? raw?.respuesta ?? '')
    .trim()
    .toUpperCase();

  // Algunos modelos devuelven el texto de la respuesta en lugar de la letra.
  if (!LETRAS.includes(correct)) {
    const buscado = normalizar(correct);
    correct = LETRAS.find((letra) => normalizar(options[letra]) === buscado) || '';
  }
  if (correct.length > 1 && LETRAS.includes(correct.charAt(0))) {
    correct = correct.charAt(0);
  }

  if (!text || !LETRAS.includes(correct)) return null;
  if (LETRAS.some((letra) => !options[letra])) return null;
  if (text.length > 400) return null;

  // Opciones repetidas = pregunta ambigua.
  const distintas = new Set(LETRAS.map((letra) => normalizar(options[letra])));
  if (distintas.size !== 4) return null;

  return { text, options, correct, tipo: 'ia' };
}

/** Una tanda: pide `cantidad` preguntas al modelo. */
async function pedirAlModelo({ proveedor, baseUrl, apiKey, modelo, material, cantidad, aviso }) {
  const prompt = construirPrompt(material, cantidad);
  const cabeceras = { 'Content-Type': 'application/json' };
  if (apiKey) cabeceras.Authorization = `Bearer ${apiKey}`;

  if (proveedor.tipo === 'ollama') {
    const res = await enviarConReintento(
      `${baseUrl}/api/chat`,
      {
        method: 'POST',
        headers: cabeceras,
        body: JSON.stringify({
          model: modelo,
          messages: [{ role: 'user', content: prompt }],
          stream: false,
          format: 'json',
          options: { temperature: 0.4 },
        }),
      },
      proveedor,
      aviso
    );
    if (!res.ok) throw falloDeServicio(res.status, await leerCuerpo(res), proveedor, baseUrl);

    const datos = await res.json();
    return extraerJson(datos.message?.content ?? datos.response ?? '');
  }

  const cuerpo = {
    model: modelo,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.4,
  };
  if (proveedor.jsonMode) cuerpo.response_format = { type: 'json_object' };

  const enviar = async (payload) =>
    enviarConReintento(
      `${baseUrl}/chat/completions`,
      { method: 'POST', headers: cabeceras, body: JSON.stringify(payload) },
      proveedor,
      aviso
    );

  let res = await enviar(cuerpo);

  // Si el servicio no admite response_format, se reintenta sin él.
  if (res.status === 400 && cuerpo.response_format) {
    const cuerpoSinFormato = { ...cuerpo };
    delete cuerpoSinFormato.response_format;
    res = await enviar(cuerpoSinFormato);
  }

  if (!res.ok) throw falloDeServicio(res.status, await leerCuerpo(res), proveedor, baseUrl);

  const datos = await res.json();
  return extraerJson(datos.choices?.[0]?.message?.content ?? '');
}

/**
 * Genera preguntas con IA a partir del texto ya extraído del documento.
 * @param {object} opciones
 * @param {object} opciones.config configuración del servicio (proveedor, baseUrl, apiKey, modelo)
 * @param {string} opciones.texto texto completo del documento, ya extraído
 * @param {number} opciones.cantidad número de preguntas pedidas
 * @param {number} [opciones.paginas] páginas del documento, si se conocen
 * @returns {Promise<{questions:Array, paginas:number, tandas:number, avisos:string[]}>}
 */
async function generarConIA({ config, texto, cantidad, paginas }) {
  const { proveedor, baseUrl, apiKey, modelo } = normalizarConfig(config);

  const material = materialDeTexto(texto, paginas);
  const contenido = material.texto;
  if (contenido.length < 200) {
    throw new Error(
      'El PDF tiene muy poco texto extraíble (puede ser un escaneo). La IA no tiene material con el que trabajar.'
    );
  }

  const tandas = dividirEnTandas(contenido);

  /** Ejecuta la generación completa con un modelo concreto. */
  const ejecutar = async (modeloUsado) => {
    const total = contenido.length;

    // Reparte las preguntas entre las tandas para pedir exactamente `cantidad`.
    const reparto = tandas.map((t) => Math.max(1, Math.round((cantidad * t.length) / total)));
    let suma = reparto.reduce((a, b) => a + b, 0);
    let i = 0;
    while (suma > cantidad && i < reparto.length) {
      if (reparto[i] > 1) {
        reparto[i] -= 1;
        suma -= 1;
      }
      i += 1;
    }
    i = 0;
    while (suma < cantidad && reparto.length > 0) {
      reparto[i % reparto.length] += 1;
      suma += 1;
      i += 1;
    }

    const avisos = [];
    const preguntas = [];
    const vistas = new Set();

    /** Añade las preguntas válidas de una respuesta, sin repetir enunciados. */
    const anyadirValidas = (datos) => {
      const lista = datos?.questions || datos?.preguntas || datos?.items || [];
      if (!Array.isArray(lista)) return { validas: 0, habiaLista: false };

      let validas = 0;
      lista.forEach((cruda) => {
        const pregunta = limpiarPreguntaIA(cruda);
        if (!pregunta) return;
        const clave = normalizar(pregunta.text);
        if (vistas.has(clave)) return;
        vistas.add(clave);
        preguntas.push(pregunta);
        validas += 1;
      });
      return { validas, habiaLista: true };
    };

    for (let n = 0; n < tandas.length; n += 1) {
      const pedidas = reparto[n];
      const datos = await pedirAlModelo({
        proveedor,
        baseUrl,
        apiKey,
        modelo: modeloUsado,
        material: tandas[n],
        cantidad: pedidas,
        aviso: (texto) => avisos.push(texto),
      });

      if (!datos) {
        avisos.push(`La tanda ${n + 1}: el modelo no devolvió un JSON válido.`);
        continue;
      }

      const { validas, habiaLista } = anyadirValidas(datos);
      if (!habiaLista) {
        avisos.push(`La tanda ${n + 1}: el modelo no devolvió una lista de preguntas.`);
        continue;
      }
      if (validas < pedidas) {
        avisos.push(`La tanda ${n + 1}: ${validas} de ${pedidas} preguntas utilizables.`);
      }
    }

    if (preguntas.length === 0) {
      throw new Error(
        'La IA no ha devuelto ninguna pregunta utilizable. Prueba con otro modelo (los pequeños se pierden con textos largos).'
      );
    }

    // Segunda pasada (una sola vez): si el modelo devolvió menos de lo pedido, o
    // repitió preguntas y el deduplicador las descartó, se le piden las que faltan.
    let reintento = 0;
    while (preguntas.length < cantidad && reintento < 1 && tandas.length > 0) {
      reintento += 1;
      const faltan = cantidad - preguntas.length;
      const indiceMayor = reparto.indexOf(Math.max(...reparto));

      let datos;
      try {
        datos = await pedirAlModelo({
          proveedor,
          baseUrl,
          apiKey,
          modelo: modeloUsado,
          material: tandas[indiceMayor],
          cantidad: faltan,
          aviso: (texto) => avisos.push(texto),
        });
      } catch (err) {
        avisos.push(`La segunda pasada ha fallado: ${err.message}`);
        break;
      }

      const { validas, habiaLista } = anyadirValidas(datos);
      if (!habiaLista) break;

      avisos.push(`Segunda pasada: se pidieron ${faltan} preguntas y se añadieron ${validas}.`);
      if (validas === 0) break; // el modelo se repite: no insistimos más
    }

    return {
      questions: preguntas.slice(0, cantidad),
      paginas: material.paginas,
      tandas: tandas.length,
      caracteres: total,
      proveedor: proveedor.nombre,
      modelo: modeloUsado,
      avisos,
    };
  };

  try {
    return await ejecutar(modelo);
  } catch (err) {
    if (!esErrorDeModelo(err)) throw err;

    // El modelo pedido ya no existe: se busca uno disponible y se reintenta.
    let disponibles;
    try {
      disponibles = await listarModelos({ proveedor, baseUrl, apiKey });
    } catch {
      throw err; // si tampoco se puede listar, se informa del error original
    }

    const elegido = elegirModeloDisponible(disponibles);
    if (!elegido || elegido === modelo) throw err;

    const resultado = await ejecutar(elegido);
    resultado.avisos.unshift(
      `El modelo «${modelo}» no está disponible en este servicio, así que se ha usado «${elegido}».`
    );
    return resultado;
  }
}

export {
  catalogo,
  normalizarConfig,
  listarModelos,
  generarConIA,
  materialDeTexto,
  // Exportadas para pruebas:
  extraerJson,
  limpiarPreguntaIA,
  dividirEnTandas,
  mensajeDeError,
  esErrorDeModelo,
  elegirModeloDisponible,
};
