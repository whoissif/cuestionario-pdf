/**
 * Extracción de texto de un PDF con PDF.js. MÓDULO COMPARTIDO.
 *
 * Este archivo es la mitad «extracción» del motor: convierte los fragmentos que
 * devuelve PDF.js en líneas de texto, que es como llegan en el documento
 * original. Conservar las líneas permite al generador (nucleo/generador.js)
 * detectar listas, viñetas y frases completas.
 *
 * No sabe nada de Node ni del navegador:
 *   - La librería PDF.js se INYECTA desde fuera (`pdfjs`). El navegador pasa el
 *     build web (/vendor/pdfjs/build/pdf.min.mjs) y Node el build legacy de
 *     pdfjs-dist (pdfjs-dist/legacy/build/pdf.mjs).
 *   - Los bytes del PDF se reciben ya leídos, como Uint8Array. Aquí no se abre
 *     ningún archivo: de la lectura se encarga quien llama (en Node,
 *     scripts/lib/pdf-nodo.js).
 *
 * Por eso este módulo no usa `require`, `fs`, `path` ni ninguna API exclusiva
 * de Node: funciona igual en el navegador y en Node.
 */

/**
 * Agrupa los fragmentos de texto de una página en líneas.
 * PDF.js entrega cada trozo con su matriz de transformación; la componente Y
 * (índice 5) indica la altura, así que los trozos con la misma Y son la misma línea.
 *
 * @param {Array<{str?:string, transform?:number[], hasEOL?:boolean}>} items
 * @returns {string[]} líneas recortadas, sin líneas vacías
 */
function agruparEnLineas(items) {
  const lines = [];
  let current = null;

  items.forEach((item) => {
    const raw = typeof item.str === 'string' ? item.str : '';
    const y = item.transform ? Math.round(item.transform[5]) : 0;

    if (!current || current.y !== y) {
      current = { y, parts: [] };
      lines.push(current);
    }
    if (raw.length) current.parts.push(raw);
    if (item.hasEOL && current) current = null;
  });

  return lines
    .map((line) => line.parts.join(' ').replace(/\s+/g, ' ').trim())
    .filter((line) => line.length > 0);
}

/**
 * Extrae el texto de un PDF ya cargado en memoria.
 *
 * @param {object} pdfjs librería PDF.js inyectada (debe exponer getDocument)
 * @param {Uint8Array} datos bytes del PDF
 * @returns {Promise<{numPages:number, pages:string[][], lines:string[], text:string}>}
 */
async function extraerLineas(pdfjs, datos) {
  const doc = await pdfjs.getDocument({
    data: datos,
    useWorkerFetch: false,
    isEvalSupported: false,
    useSystemFonts: true,
  }).promise;

  const pages = [];
  for (let n = 1; n <= doc.numPages; n += 1) {
    const page = await doc.getPage(n);
    const content = await page.getTextContent();
    pages.push(agruparEnLineas(content.items));
  }

  const lines = pages.flat();
  return {
    numPages: doc.numPages,
    pages,
    lines,
    text: lines.join('\n'),
  };
}

export { agruparEnLineas, extraerLineas };
