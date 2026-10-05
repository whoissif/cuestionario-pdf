/**
 * Pruebas del proxy. Se ejecutan sin desplegar nada:
 *   node proxy/probar.js            (incluye dos llamadas reales a Ollama Cloud)
 *   node proxy/probar.js --sin-red  (solo comprobaciones locales, para CI)
 *
 * Las pruebas locales sustituyen `fetch` por uno falso para poder mirar con lupa
 * QUÉ se envía a Ollama (URL, cabeceras y clave) sin gastar cuota.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { manejar, listaDeOrigenes, origenPermitido } from './nucleo.js';
import { generar } from './empaquetar.js';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const SIN_RED = process.argv.includes('--sin-red');
const ORIGEN = 'https://whoissif.github.io';

let pasan = 0;
let fallan = 0;

function comprobar(titulo, condicion, detalle = '') {
  if (condicion) {
    pasan += 1;
    console.log(`  OK   ${titulo}`);
  } else {
    fallan += 1;
    console.log(`  FALLA ${titulo}${detalle ? ` -> ${detalle}` : ''}`);
  }
}

const peticion = (extra = {}) => ({
  metodo: 'GET',
  ruta: '/api/tags',
  cabeceras: { origin: ORIGEN },
  cuerpo: '',
  ...extra,
});

const fetchReal = globalThis.fetch;
let capturado = {};

function fetchFalso(respuesta, error = null) {
  capturado = {};
  globalThis.fetch = async (url, opciones) => {
    capturado = { url, opciones };
    if (error) throw error;
    return respuesta;
  };
}

function restaurarFetch() {
  globalThis.fetch = fetchReal;
}

/* ------------------------------------------------------------------ */
/* 1. Sin red: preflight, permisos y avisos                            */
/* ------------------------------------------------------------------ */

console.log('\n1. Preflight y permisos (sin red)');

{
  const r = await manejar(peticion({ metodo: 'OPTIONS' }), {});
  comprobar('El preflight del origen autorizado responde 204', r.estado === 204, `estado ${r.estado}`);
  comprobar(
    'Devuelve el origen exacto en Access-Control-Allow-Origin',
    r.cabeceras['access-control-allow-origin'] === ORIGEN,
    String(r.cabeceras['access-control-allow-origin'])
  );
  comprobar(
    'Permite la cabecera authorization (la que lleva la clave)',
    String(r.cabeceras['access-control-allow-headers']).includes('authorization')
  );
  comprobar(
    'Permite POST y lleva Access-Control-Max-Age',
    String(r.cabeceras['access-control-allow-methods']).includes('POST') &&
      Boolean(r.cabeceras['access-control-max-age'])
  );
  comprobar('El preflight no llama a Ollama', !capturado.url);
}

{
  const r = await manejar(peticion({ metodo: 'OPTIONS', cabeceras: { origin: 'https://malicioso.example' } }), {});
  comprobar('El preflight de un origen ajeno responde 403', r.estado === 403, `estado ${r.estado}`);
  comprobar('Un origen ajeno no recibe Access-Control-Allow-Origin', !r.cabeceras['access-control-allow-origin']);
}

{
  fetchFalso(new Response('{}', { status: 200 }));
  const r = await manejar(peticion({ cabeceras: { origin: 'https://malicioso.example' } }), {});
  comprobar('Una petición normal de un origen ajeno responde 403', r.estado === 403, `estado ${r.estado}`);
  comprobar('Y no llega a contactar con Ollama', !capturado.url);
  restaurarFetch();
}

{
  const r = await manejar(peticion({ ruta: '/otra/cosa' }), {});
  comprobar('Una ruta fuera de /api y /v1 responde 404', r.estado === 404, `estado ${r.estado}`);
}

{
  const r = await manejar(peticion({ metodo: 'DELETE' }), {});
  comprobar('Un método que no sea GET/POST responde 405', r.estado === 405, `estado ${r.estado}`);
}

console.log('\n2. Clave y cuerpo (sin red)');

{
  const r = await manejar(peticion({ metodo: 'POST', ruta: '/api/chat', cuerpo: '{}' }), {});
  comprobar('Un POST sin ninguna clave responde 401', r.estado === 401, `estado ${r.estado}`);
  comprobar(
    'El aviso explica qué falta y en español',
    String(r.cuerpo).includes('OLLAMA_API_KEY'),
    r.cuerpo.slice(0, 120)
  );
}

{
  const r = await manejar(peticion({ metodo: 'POST', cuerpo: 'x'.repeat(600 * 1024) }), {});
  comprobar('Un cuerpo mayor de 512 KB responde 413', r.estado === 413, `estado ${r.estado}`);
}

{
  fetchFalso(new Response('{"ok":true}', { status: 200, headers: { 'content-type': 'application/json' } }));
  await manejar(
    peticion({
      metodo: 'POST',
      ruta: '/api/chat',
      cuerpo: '{"model":"x"}',
      cabeceras: { origin: ORIGEN, authorization: 'Bearer clave-del-navegador' },
    }),
    { OLLAMA_API_KEY: 'clave-del-proxy' }
  );
  comprobar(
    'El secreto del proxy manda sobre la clave del navegador',
    capturado.opciones?.headers?.authorization === 'Bearer clave-del-proxy',
    String(capturado.opciones?.headers?.authorization)
  );
  comprobar(
    'Reenvía a la ruta correcta de Ollama Cloud',
    capturado.url === 'https://api.ollama.com/api/chat',
    String(capturado.url)
  );
  comprobar(
    'Envía Content-Type de JSON en el POST',
    capturado.opciones?.headers?.['content-type'] === 'application/json'
  );
}

{
  fetchFalso(new Response('{"ok":true}', { status: 200 }));
  await manejar(
    peticion({
      metodo: 'POST',
      ruta: '/api/chat',
      cuerpo: '{}',
      cabeceras: { origin: ORIGEN, authorization: 'Bearer clave-del-navegador' },
    }),
    {}
  );
  comprobar(
    'Sin secreto configurado, se usa la clave que manda el navegador',
    capturado.opciones?.headers?.authorization === 'Bearer clave-del-navegador',
    String(capturado.opciones?.headers?.authorization)
  );
}

{
  fetchFalso(new Response('{"error":"boom"}', { status: 500, headers: { 'content-type': 'application/json' } }));
  const r = await manejar(peticion(), {});
  comprobar('El estado de Ollama se devuelve tal cual (500)', r.estado === 500, `estado ${r.estado}`);
  comprobar('El tipo de contenido se conserva', String(r.cabeceras['content-type']).includes('application/json'));
  comprobar('Y el cuerpo llega íntegro', String(r.cuerpo).includes('boom'));
}

{
  const vencido = new Error('El tiempo ha expirado');
  vencido.name = 'TimeoutError';
  fetchFalso(null, vencido);
  const r = await manejar(peticion(), {});
  comprobar('Si Ollama no contesta a tiempo, responde 504', r.estado === 504, `estado ${r.estado}`);
}

{
  fetchFalso(null, new Error('fallo de red de prueba'));
  const r = await manejar(peticion(), {});
  comprobar('Si no se puede contactar, responde 502', r.estado === 502, `estado ${r.estado}`);
  restaurarFetch();
}

console.log('\n3. Configuración de orígenes (sin red)');

{
  const permitidos = listaDeOrigenes({});
  comprobar('Por defecto se autoriza la web publicada', permitidos.includes('https://whoissif.github.io'));
  comprobar('Por defecto se autoriza la app local', permitidos.includes('http://localhost:3000'));
  comprobar('Sin cabecera Origin (curl) se permite', origenPermitido('', permitidos));
  comprobar(
    'Se ignoran las barras finales al comparar',
    origenPermitido('https://whoissif.github.io/', permitidos)
  );
  comprobar(
    'ORIGENES=* lo permite todo (bajo tu responsabilidad)',
    origenPermitido('https://otro.example', listaDeOrigenes({ ORIGENES: '*' }))
  );
}

/* ------------------------------------------------------------------ */
/* 4. El archivo empaquetado                                           */
/* ------------------------------------------------------------------ */

console.log('\n4. Archivo para pegar en el panel de Cloudflare');

const RUTA_EMPAQUETADO = path.join(AQUI, 'desplegar', 'trabajador.js');
let empaquetado = '';
try {
  empaquetado = await readFile(RUTA_EMPAQUETADO, 'utf8');
} catch {
  empaquetado = '';
}

comprobar('Existe proxy/desplegar/trabajador.js', Boolean(empaquetado));
comprobar(
  'Está al día (se regenera igual)',
  empaquetado === (await generar()),
  'ejecuta: node proxy/empaquetar.js'
);
comprobar('No contiene ningún import', !/^\s*import\s/m.test(empaquetado));
comprobar('No contiene ninguna clave', !/OLLAMA_API_KEY\s*[:=]\s*["'][^"']+["']/.test(empaquetado));

if (empaquetado) {
  const { default: trabajador } = await import('./desplegar/trabajador.js');

  const preflight = await trabajador.fetch(
    new Request('https://proxy.example/api/chat', {
      method: 'OPTIONS',
      headers: {
        Origin: ORIGEN,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'authorization,content-type',
      },
    }),
    {}
  );
  comprobar(
    'El archivo empaquetado contesta el preflight con 204 y CORS',
    preflight.status === 204 && preflight.headers.get('access-control-allow-origin') === ORIGEN,
    `estado ${preflight.status}`
  );

  const ajeno = await trabajador.fetch(
    new Request('https://proxy.example/api/chat', { method: 'POST', headers: { Origin: 'https://otro.example' } }),
    {}
  );
  comprobar('El archivo empaquetado rechaza orígenes ajenos (403)', ajeno.status === 403, `estado ${ajeno.status}`);
}

/* ------------------------------------------------------------------ */
/* 5. Con red: la prueba de verdad                                     */
/* ------------------------------------------------------------------ */

if (SIN_RED) {
  console.log('\n5. Llamadas reales a Ollama Cloud: OMITIDAS (--sin-red)');
} else {
  console.log('\n5. Llamadas reales a Ollama Cloud');

  try {
    const r = await manejar(peticion(), {});
    comprobar('GET /api/tags a través del proxy responde 200', r.estado === 200, `estado ${r.estado}`);
    comprobar(
      'Y devuelve una lista de modelos de verdad',
      String(r.cuerpo).includes('"models"'),
      String(r.cuerpo).slice(0, 120)
    );
    comprobar('Con cabeceras CORS para el navegador', Boolean(r.cabeceras['access-control-allow-origin']));
  } catch (err) {
    comprobar('GET /api/tags a través del proxy responde 200', false, err.message);
  }

  try {
    const { default: trabajador } = await import('./desplegar/trabajador.js');
    const res = await trabajador.fetch(
      new Request('https://proxy.example/api/tags', { headers: { Origin: ORIGEN } }),
      {}
    );
    const cuerpo = await res.text();
    comprobar(
      'El archivo empaquetado devuelve los modelos (extremo a extremo)',
      res.status === 200 && cuerpo.includes('"models"'),
      `estado ${res.status}`
    );
  } catch (err) {
    comprobar('El archivo empaquetado devuelve los modelos (extremo a extremo)', false, err.message);
  }
}

console.log(`\nResultado: ${pasan} correctas, ${fallan} fallidas.`);
if (fallan > 0) process.exitCode = 1;
