/**
 * Prueba del generador local sobre un PDF.
 * Uso: node scripts/probar-generador.js <ruta.pdf> [cantidad]
 *
 * La extracción del texto (con Node) y el motor de generación (módulo
 * compartido) van separados: aquí solo se unen para la prueba de consola.
 */
import { extraerTextoDeArchivo } from './lib/pdf-nodo.js';
import { generarPreguntasDeLineas } from '../nucleo/generador.js';

const file = process.argv[2];
const cantidad = Number(process.argv[3] || 10);

if (!file) {
  console.error('Falta la ruta del PDF.');
  process.exit(1);
}

extraerTextoDeArchivo(file)
  .then(({ numPages, lines }) => {
    const r = generarPreguntasDeLineas(lines, cantidad);

    console.log(`Páginas: ${numPages} · Tema detectado: ${r.tema || '(ninguno)'}`);
    console.log(`Semillas candidatas: ${r.candidatas} · Preguntas generadas: ${r.preguntas.length}`);
    console.log(`Reparto por tipo: ${JSON.stringify(r.tipos)}\n`);

    r.preguntas.forEach((p, i) => {
      console.log(`${i + 1}. [${p.tipo}] ${p.text}`);
      Object.entries(p.options).forEach(([k, v]) => {
        console.log(`   ${k === p.correct ? '✔' : ' '} ${k}) ${v}`);
      });
      console.log('');
    });
  })
  .catch((err) => {
    console.error('ERROR:', err.stack || err.message);
    process.exit(1);
  });
