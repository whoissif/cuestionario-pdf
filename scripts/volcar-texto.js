/**
 * Volcado del texto de un PDF tal como lo ve el generador (línea a línea).
 * Uso: node scripts/volcar-texto.js <ruta.pdf>
 */
import { extraerTextoDeArchivo } from './lib/pdf-nodo.js';

const file = process.argv[2];
if (!file) {
  console.error('Falta la ruta del PDF.');
  process.exit(1);
}

extraerTextoDeArchivo(file)
  .then(({ numPages, pages }) => {
    console.log(`PÁGINAS: ${numPages}`);
    pages.forEach((lines, i) => {
      console.log(`\n========== PÁGINA ${i + 1} (${lines.length} líneas) ==========`);
      lines.forEach((line, j) => {
        console.log(`${String(j + 1).padStart(3)}| ${line}`);
      });
    });
  })
  .catch((err) => {
    console.error('ERROR:', err.message);
    process.exit(1);
  });
