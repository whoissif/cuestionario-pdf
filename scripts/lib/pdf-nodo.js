/**
 * Helper de lectura de PDF SOLO PARA NODE.
 *
 * Aquí vive lo que no puede estar en nucleo/pdf.js: leer el archivo del disco
 * y cargar el build legacy de PDF.js. La lógica de extracción se delega en el
 * módulo compartido nucleo/pdf.js.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { extraerLineas } from '../../nucleo/pdf.js';

/** Caché del módulo (la importación de PDF.js es dinámica y algo costosa). */
let pdfjsPromise = null;

function cargarPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import('pdfjs-dist/legacy/build/pdf.mjs');
  }
  return pdfjsPromise;
}

/**
 * Lee un PDF del disco y devuelve su texto agrupado en líneas.
 * @param {string} ruta ruta absoluta o relativa del PDF
 * @returns {Promise<{numPages:number, pages:string[][], lines:string[], text:string}>}
 */
async function extraerTextoDeArchivo(ruta) {
  const pdfjs = await cargarPdfjs();
  const datos = new Uint8Array(await readFile(path.resolve(ruta)));
  return extraerLineas(pdfjs, datos);
}

export { extraerTextoDeArchivo };
