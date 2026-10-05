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

import { manejar } from './nucleo.js';

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
