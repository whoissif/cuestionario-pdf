/**
 * Comprueba que los .docx generados por la app son documentos Word válidos.
 *
 * Un .docx es un ZIP: aquí se abre, se verifica que contiene las partes que
 * Word exige (word/document.xml) y se extrae su texto para revisarlo.
 *
 * Uso:
 *   node scripts/verificar-docx.js <carpeta-con-.docx>
 *   node scripts/verificar-docx.js archivo.docx
 *
 * Nota: usa `jszip`, que viene con la librería `docx`. Si no estuviera
 * disponible, el script lo avisa; no afecta a la aplicación.
 */
const fs = require('node:fs');
const path = require('node:path');

let JSZip;
try {
  JSZip = require('jszip');
} catch {
  console.error('Falta el módulo "jszip" (viene con "docx"). Ejecuta: npm install');
  process.exit(1);
}

const objetivo = process.argv[2];

if (!objetivo) {
  console.error('Indica una carpeta o un archivo .docx.');
  process.exit(1);
}

/** Lista de archivos .docx a revisar. */
function buscarDocx(ruta) {
  const info = fs.statSync(ruta);
  if (info.isFile()) return [ruta];
  return fs
    .readdirSync(ruta)
    .filter((n) => n.toLowerCase().endsWith('.docx'))
    .map((n) => path.join(ruta, n))
    .sort();
}

/** Extrae el texto visible de word/document.xml (contenido de las etiquetas <w:t>). */
function textoDeDocumento(xml) {
  const parrafos = xml.split(/<w:p[ >]/).slice(1);

  return parrafos
    .map((p) => {
      const trozos = [...p.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map((m) =>
        m[1]
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&apos;/g, "'")
          .replace(/&amp;/g, '&')
      );
      return trozos.join('');
    })
    .filter((t) => t.trim().length > 0);
}

/** Cuenta las filas de tabla del documento. */
function contarFilas(xml) {
  return (xml.match(/<w:tr[ >]/g) || []).length;
}

async function revisar(archivo) {
  const buffer = fs.readFileSync(archivo);
  console.log('='.repeat(70));
  console.log(`ARCHIVO: ${path.basename(archivo)}  (${buffer.length} bytes)`);
  console.log('='.repeat(70));

  const firma = buffer.subarray(0, 2).toString('latin1');
  console.log(`Firma ZIP: "${firma}" ${firma === 'PK' ? '✔' : '✘ (no es un .docx válido)'}`);

  const zip = await JSZip.loadAsync(buffer);
  const partes = Object.keys(zip.files);
  const obligatorias = ['[Content_Types].xml', 'word/document.xml'];

  obligatorias.forEach((parte) => {
    console.log(`  ${partes.includes(parte) ? '✔' : '✘'} ${parte}`);
  });

  const xml = await zip.file('word/document.xml').async('string');
  const parrafos = textoDeDocumento(xml);
  const filas = contarFilas(xml);

  console.log(`Párrafos con texto: ${parrafos.length}`);
  console.log(`Filas de tabla: ${filas}`);
  console.log('\n--- primeras líneas ---');
  parrafos.slice(0, 8).forEach((t) => console.log(`  ${t.slice(0, 110)}`));

  if (!parrafos.length) throw new Error(`${path.basename(archivo)}: no contiene texto`);
  console.log('\n  OK: documento Word válido y legible\n');
}

(async () => {
  const rutas = buscarDocx(objetivo);
  if (!rutas.length) {
    console.error('No se han encontrado archivos .docx en', objetivo);
    process.exit(1);
  }

  for (const ruta of rutas) {
    await revisar(ruta);
  }
})().catch((err) => {
  console.error('ERROR:', err.message);
  process.exit(1);
});
