/**
 * Prueba de extracción de texto con pdfjs-dist (build legacy para Node).
 * Uso: node scripts/probar-extraccion.js <ruta.pdf>
 *
 * Diagnóstico rápido: cuántos caracteres salen de cada página y si el PDF
 * tiene texto extraíble o es un escaneo. Para ver el texto línea a línea
 * (tal como lo ve el generador) usa scripts/volcar-texto.js.
 */
import { extraerTextoDeArchivo } from './lib/pdf-nodo.js';

const file = process.argv[2];
if (!file) {
  console.error('Falta la ruta del PDF.');
  process.exit(1);
}

const { numPages, pages } = await extraerTextoDeArchivo(file);

console.log(`Páginas: ${numPages}`);

let total = 0;
pages.forEach((lines, i) => {
  const text = lines.join(' ').replace(/\s+/g, ' ').trim();
  total += text.length;
  console.log(`--- página ${i + 1} (${text.length} caracteres) ---`);
  console.log(text.slice(0, 600));
});

console.log(`\nTOTAL caracteres extraídos: ${total}`);
console.log(total > 100 ? 'RESULTADO: PDF con texto extraíble.' : 'RESULTADO: PDF SIN texto (posible escaneo/imagen).');
