/**
 * Empaquetador: junta `nucleo.js` + `trabajador.js` en UN SOLO archivo
 * (`desplegar/trabajador.js`), sin `import`, para poder pegarlo tal cual en el
 * panel de Cloudflare sin usar Wrangler ni Git.
 *
 * Uso:  node proxy/empaquetar.js
 *
 * Se puede importar `generar()` para comprobar que el archivo está al día
 * (lo hace `probar.js`), sin escribir nada en disco.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const DESTINO = path.join(AQUI, 'desplegar', 'trabajador.js');

const CABECERA = `/**
 * ARCHIVO GENERADO por proxy/empaquetar.js — NO lo edites a mano.
 *
 * Es el proxy completo en un solo archivo (núcleo + adaptador), pensado para
 * pegarlo en el panel de Cloudflare:
 *   Workers -> Create -> Deploy -> Edit code -> pegar todo -> Deploy
 *
 * La clave NO está aquí: se define como secreto en el panel de Cloudflare
 * (Settings -> Variables and Secrets -> OLLAMA_API_KEY).
 */`;

export async function generar() {
  const nucleo = await readFile(path.join(AQUI, 'nucleo.js'), 'utf8');
  const trabajador = await readFile(path.join(AQUI, 'trabajador.js'), 'utf8');

  const nucleoSinExport = nucleo.replace(/^export \{[\s\S]*?\};\s*$/m, '');
  if (nucleoSinExport === nucleo) {
    throw new Error('No se ha podido quitar el bloque «export» de nucleo.js');
  }

  const trabajadorSinImport = trabajador.replace(/^import [^\n]*\n/m, '');
  if (trabajadorSinImport === trabajador) {
    throw new Error('No se ha podido quitar el «import» de trabajador.js');
  }

  // Sin fecha de generación a propósito: así el archivo solo cambia si cambia
  // el código, y la comprobación de «está al día» tiene sentido.
  return [CABECERA, '', nucleoSinExport.trim(), '', trabajadorSinImport.trim(), ''].join('\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const contenido = await generar();
  await mkdir(path.dirname(DESTINO), { recursive: true });
  await writeFile(DESTINO, contenido, 'utf8');
  console.log(
    `Generado proxy/desplegar/trabajador.js (${contenido.length} caracteres, ${contenido.split('\n').length} líneas).`
  );
}
