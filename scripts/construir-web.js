/**
 * Construye la carpeta `docs/`, que es la que publica GitHub Pages.
 *
 * La aplicación es 100 % estática, pero necesita tener al lado:
 *   - los módulos compartidos de `nucleo/` (motor de preguntas, IA y Word),
 *   - PDF.js (para leer el PDF dentro del navegador),
 *   - la librería `docx` en su versión de navegador,
 *   - Material Design Lite (estilos y etiquetas flotantes de los campos).
 *
 * Se copian SOLO los archivos imprescindibles de cada librería, no los paquetes
 * completos: `npm` los tiene en `node_modules`, pero el navegador no.
 *
 * Uso:  npm run construir-web      (o)     node scripts/construir-web.js
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.join(AQUI, '..');
const DESTINO = path.join(RAIZ, 'docs');
const MODULOS = path.join(RAIZ, 'node_modules');

/** Archivos de librerías que hay que copiar, con su ruta dentro de docs/. */
const LIBRERIAS = [
  ['node_modules/pdfjs-dist/build/pdf.min.mjs', 'vendor/pdfjs/build/pdf.min.mjs'],
  ['node_modules/pdfjs-dist/build/pdf.worker.min.mjs', 'vendor/pdfjs/build/pdf.worker.min.mjs'],
  ['node_modules/pdfjs-dist/cmaps', 'vendor/pdfjs/cmaps'],
  ['node_modules/pdfjs-dist/standard_fonts', 'vendor/pdfjs/standard_fonts'],
  ['node_modules/pdfjs-dist/wasm', 'vendor/pdfjs/wasm'],
  ['node_modules/material-design-lite/dist/material.min.css', 'vendor/mdl/material.min.css'],
  ['node_modules/material-design-lite/dist/material.min.js', 'vendor/mdl/material.min.js'],
  ['node_modules/docx/dist/index.iife.js', 'vendor/docx/index.iife.js'],
];

const copiados = [];

function copiar(origen, destinoRelativo) {
  const origenAbs = path.join(RAIZ, origen);
  if (!fs.existsSync(origenAbs)) {
    throw new Error(`Falta ${origen}. Ejecuta «npm install» antes de construir.`);
  }

  const destinoAbs = path.join(DESTINO, destinoRelativo);
  fs.mkdirSync(path.dirname(destinoAbs), { recursive: true });
  fs.cpSync(origenAbs, destinoAbs, { recursive: true });
  copiados.push(destinoRelativo);
}

/** Comprueba que todo lo que la página pide existe dentro de docs/. */
function verificar() {
  const problemas = [];

  const existe = (relativo) => fs.existsSync(path.join(DESTINO, relativo));

  const html = fs.readFileSync(path.join(DESTINO, 'index.html'), 'utf8');
  const referencias = [
    ...html.matchAll(/(?:src|href)="([^"]+)"/g),
    ...html.matchAll(/import\('([^']+)'\)/g),
  ].map((m) => m[1]);

  referencias
    .filter((r) => !/^(https?:|data:|#|mailto:)/.test(r))
    .forEach((r) => {
      const limpio = r.replace(/^\.\//, '').split('?')[0];
      if (!existe(limpio)) problemas.push(`index.html pide «${r}» y no está en docs/`);
    });

  const app = fs.readFileSync(path.join(DESTINO, 'app.js'), 'utf8');
  const imports = [
    ...app.matchAll(/from '([^']+)'/g),
    ...app.matchAll(/import\('([^']+)'\)/g),
    // Rutas construidas con new URL('./…', import.meta.url): así se carga el
    // worker de PDF.js, que es imprescindible y no aparece como import.
    ...app.matchAll(/new URL\('([^']+)'/g),
  ].map((m) => m[1]);

  imports
    .filter((r) => r.startsWith('./'))
    .forEach((r) => {
      const limpio = r.replace(/^\.\//, '').split('?')[0];
      if (!existe(limpio)) problemas.push(`app.js usa «${r}» y no está en docs/`);
    });

  // Los módulos del núcleo no deben depender de nada de Node.
  for (const archivo of fs.readdirSync(path.join(DESTINO, 'nucleo'))) {
    const codigo = fs.readFileSync(path.join(DESTINO, 'nucleo', archivo), 'utf8');
    if (/\brequire\(|module\.exports|from 'node:/.test(codigo)) {
      problemas.push(`nucleo/${archivo} usa algo exclusivo de Node`);
    }
  }

  return problemas;
}

function principal() {
  // Salvaguarda: solo se borra una carpeta llamada «docs» dentro del proyecto.
  if (path.basename(DESTINO) !== 'docs' || path.dirname(DESTINO) !== RAIZ) {
    throw new Error(`Ruta de destino inesperada: ${DESTINO}`);
  }

  fs.rmSync(DESTINO, { recursive: true, force: true });
  fs.mkdirSync(DESTINO, { recursive: true });

  // 1) La aplicación
  for (const archivo of fs.readdirSync(path.join(RAIZ, 'public'))) {
    copiar(path.join('public', archivo), archivo);
  }

  // 2) Los módulos compartidos (los importa el navegador con ./nucleo/…)
  copiar('nucleo', 'nucleo');

  // 3) Las librerías del navegador
  LIBRERIAS.forEach(([origen, destino]) => copiar(origen, destino));

  // 4) GitHub Pages no debe procesar nada con Jekyll
  fs.writeFileSync(path.join(DESTINO, '.nojekyll'), '');

  const problemas = verificar();

  const archivos = [];
  const recorrer = (dir) => {
    for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
      const completo = path.join(dir, entrada.name);
      if (entrada.isDirectory()) recorrer(completo);
      else archivos.push(completo);
    }
  };
  recorrer(DESTINO);
  const bytes = archivos.reduce((s, a) => s + fs.statSync(a).size, 0);

  console.log('Carpeta construida: docs/');
  console.log(`  Archivos: ${archivos.length} · ${(bytes / 1024 / 1024).toFixed(1)} MB`);
  copiados.forEach((c) => console.log(`  · ${c}`));

  if (problemas.length) {
    console.error('\nFALLOS DE VERIFICACIÓN:');
    problemas.forEach((p) => console.error(`  ✘ ${p}`));
    process.exit(1);
  }

  console.log('\n  ✔ Todo lo que pide la página está dentro de docs/');
  console.log('  ✔ Los módulos de nucleo/ no usan nada exclusivo de Node');
  console.log('\nPara publicarlo: sube la carpeta docs/ y activa GitHub Pages');
  console.log('(Settings → Pages → Deploy from a branch → main → /docs).');
}

try {
  principal();
} catch (err) {
  console.error(`ERROR: ${err.message}`);
  process.exit(1);
}
