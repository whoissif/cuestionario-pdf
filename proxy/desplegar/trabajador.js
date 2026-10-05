/**
 * ARCHIVO GENERADO por proxy/empaquetar.js — NO lo edites a mano.
 *
 * Es el proxy completo en un solo archivo (núcleo + adaptador), pensado para
 * pegarlo en el panel de Cloudflare:
 *   Workers -> Create -> Deploy -> Edit code -> pegar todo -> Deploy
 *
 * La clave NO está aquí: se define como secreto en el panel de Cloudflare
 * (Settings -> Variables and Secrets -> OLLAMA_API_KEY).
 */

/**
 * Núcleo del proxy de IA. MÓDULO COMPARTIDO.
 *
 * ¿Por qué existe esto? Ollama Cloud no manda ni una cabecera CORS y rechaza el
 * preflight con un 405, así que un navegador no puede llamarlo nunca. Un proxy
 * es un intermediario que sí puede, porque no es un navegador: recibe la
 * petición de la página, le pone la clave y la reenvía.
 *
 * Aquí vive TODA la lógica. Los adaptadores de cada plataforma
 * (`trabajador.js` para Cloudflare, `servidor-node.js` para Node y Codespaces)
 * solo traducen su petición a este formato y devuelven el resultado.
 *
 * Este módulo no conoce ninguna API de plataforma: entra y sale información
 * corriente, así que se puede probar entero sin desplegar nada.
 *
 *   entra:  { metodo, ruta, cabeceras, cuerpo }
 *   sale:   { estado, cabeceras, cuerpo }
 *
 * Variables de entorno que entiende (las dos plataformas usan los mismos nombres):
 *   OLLAMA_API_KEY  clave de Ollama Cloud. En Cloudflare, un SECRETO (nunca en el código).
 *   ORIGENES        lista separada por comas de páginas autorizadas a usar el proxy.
 *   DESTINO         servicio al que reenvía. Por defecto, https://api.ollama.com
 */

const DESTINO_POR_DEFECTO = 'https://api.ollama.com';

/** Páginas autorizadas por defecto: la web publicada y la app en tu PC. */
const ORIGENES_POR_DEFECTO =
  'https://whoissif.github.io,http://localhost:3000,http://127.0.0.1:3000';

/** Solo se reenvían estas rutas: un proxy abierto a cualquier ruta es un abuso. */
const RUTA_PERMITIDA = /^\/(api|v1)\//;

/** Tamaño máximo del cuerpo. El material de un PDF ronda los 14.000 caracteres. */
const MAX_CUERPO = 512 * 1024;

/** Ollama puede tardar; 3 minutos es el mismo margen que usa la aplicación. */
const TIEMPO_MAXIMO = 180000;

function listaDeOrigenes(entorno) {
  const crudo = String((entorno && entorno.ORIGENES) || ORIGENES_POR_DEFECTO);
  return crudo
    .split(',')
    .map((origen) => origen.trim().replace(/\/+$/, ''))
    .filter(Boolean);
}

/** ¿Este origen puede usar el proxy? Sin cabecera `Origin` (curl) se permite. */
function origenPermitido(origen, permitidos) {
  const limpio = String(origen || '').trim().replace(/\/+$/, '');
  if (!limpio) return true;
  if (permitidos.includes('*')) return true;
  return permitidos.includes(limpio);
}

/**
 * Cabeceras CORS. El navegador exige que se le devuelva SU origen (o `*`), y
 * sobre todo exige que el preflight OPTIONS incluya `authorization` entre las
 * cabeceras permitidas: es la que lleva la clave.
 */
function cabecerasCors(origen, permitidos) {
  if (!origenPermitido(origen, permitidos)) return { vary: 'origin' };
  return {
    vary: 'origin',
    'access-control-allow-origin': permitidos.includes('*')
      ? '*'
      : String(origen).trim().replace(/\/+$/, ''),
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'authorization, content-type',
    'access-control-max-age': '86400',
  };
}

/**
 * La clave que se usará. Manda el secreto del proxy: así una clave vieja que
 * haya quedado guardada en el navegador no puede romper la conexión.
 */
function claveDe(peticion, entorno) {
  const delEntorno = String((entorno && entorno.OLLAMA_API_KEY) || '').trim();
  if (delEntorno) return delEntorno;

  const cabecera = String((peticion && peticion.cabeceras && peticion.cabeceras.authorization) || '');
  return cabecera.replace(/^Bearer\s+/i, '').trim();
}

function salida(estado, cuerpo, cabeceras) {
  return { estado, cabeceras: cabeceras || {}, cuerpo: cuerpo || '' };
}

/** Error en un formato que la aplicación sabe leer (usa `message`). */
function aviso(texto) {
  return JSON.stringify({ error: texto, message: texto });
}

/**
 * Atiende una petición.
 * @param {{metodo:string, ruta:string, cabeceras:object, cuerpo:string}} peticion
 * @param {object} entorno variables de entorno (clave, orígenes, destino)
 * @returns {Promise<{estado:number, cabeceras:object, cuerpo:string}>}
 */
async function manejar(peticion, entorno = {}) {
  const metodo = String((peticion && peticion.metodo) || 'GET').toUpperCase();
  const cabeceras = (peticion && peticion.cabeceras) || {};
  const origen = cabeceras.origin || cabeceras.Origin || '';
  const permitidos = listaDeOrigenes(entorno);
  const cors = cabecerasCors(origen, permitidos);

  // El preflight se contesta aquí y no se reenvía: Ollama responde 405 y el
  // navegador abortaría antes de enviar la petición de verdad.
  if (metodo === 'OPTIONS') {
    if (!origenPermitido(origen, permitidos)) {
      return salida(403, aviso(`El origen «${origen}» no está autorizado en este proxy.`), cors);
    }
    return salida(204, '', cors);
  }

  if (!origenPermitido(origen, permitidos)) {
    return salida(403, aviso(`El origen «${origen}» no está autorizado en este proxy.`), cors);
  }

  if (metodo !== 'GET' && metodo !== 'POST') {
    return salida(405, aviso('Solo se admiten peticiones GET y POST.'), cors);
  }

  const ruta = String((peticion && peticion.ruta) || '/');
  if (!RUTA_PERMITIDA.test(ruta.split('?')[0])) {
    return salida(404, aviso('Ruta no permitida: este proxy solo atiende /api/... y /v1/...'), cors);
  }

  const cuerpo = typeof (peticion && peticion.cuerpo) === 'string' ? peticion.cuerpo : '';
  if (cuerpo.length > MAX_CUERPO) {
    return salida(413, aviso('La petición es demasiado grande (máximo 512 KB).'), cors);
  }

  const clave = claveDe(peticion, entorno);
  if (metodo === 'POST' && !clave) {
    return salida(
      401,
      aviso(
        'Falta la clave de Ollama. Define el secreto OLLAMA_API_KEY en el proxy (o escribe una clave en la aplicación).'
      ),
      cors
    );
  }

  const destino = String((entorno && entorno.DESTINO) || DESTINO_POR_DEFECTO).replace(/\/+$/, '');

  const cabecerasSalida = { accept: 'application/json' };
  if (clave) cabecerasSalida.authorization = `Bearer ${clave}`;
  if (metodo === 'POST') cabecerasSalida['content-type'] = 'application/json';

  let respuesta;
  try {
    respuesta = await fetch(destino + ruta, {
      method: metodo,
      headers: cabecerasSalida,
      body: metodo === 'POST' ? cuerpo : undefined,
      signal: AbortSignal.timeout(TIEMPO_MAXIMO),
    });
  } catch (err) {
    const tardanza = err && err.name === 'TimeoutError';
    return salida(
      tardanza ? 504 : 502,
      aviso(
        tardanza
          ? 'Ollama ha tardado más de 3 minutos en responder. Pide menos preguntas o usa otro modelo.'
          : `No se ha podido contactar con ${destino}: ${(err && err.message) || err}`
      ),
      cors
    );
  }

  const texto = await respuesta.text().catch(() => '');
  return salida(respuesta.status, texto, {
    ...cors,
    'content-type': respuesta.headers.get('content-type') || 'application/json; charset=utf-8',
  });
}

/**
 * Adaptador para Cloudflare Workers (y para `wrangler dev` en tu PC).
 *
 * Wrangler empaqueta los `import` por su cuenta, así que este archivo es el
 * punto de entrada del despliegue normal. Si prefieres pegar el código a mano
 * en el panel de Cloudflare, usa `desplegar/trabajador.js`, que es este mismo
 * programa con todo dentro (lo genera `empaquetar.js`).
 *
 * Variables de entorno:
 *   OLLAMA_API_KEY  (SECRETO: se define con `wrangler secret put`, nunca aquí)
 *   ORIGENES        (opcional)
 *   DESTINO         (opcional)
 */


export default {
  async fetch(peticion, entorno) {
    const url = new URL(peticion.url);

    // Se copian las cabeceras a minúsculas: el núcleo es agnóstico de plataforma.
    const cabeceras = {};
    peticion.headers.forEach((valor, nombre) => {
      cabeceras[nombre.toLowerCase()] = valor;
    });

    const cuerpo = peticion.method === 'POST' ? await peticion.text() : '';

    const resultado = await manejar(
      { metodo: peticion.method, ruta: url.pathname + url.search, cabeceras, cuerpo },
      entorno
    );

    // Un 204 (preflight) no puede llevar cuerpo: `new Response('')` lanzaría error.
    return new Response(resultado.cuerpo || null, {
      status: resultado.estado,
      headers: resultado.cabeceras,
    });
  },
};
