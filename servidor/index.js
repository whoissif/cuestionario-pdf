/**
 * Servidor local para abrir la aplicación cómodamente en http://localhost:3000
 *
 * IMPORTANTE: no hace falta para que la aplicación funcione. CUESTIONARIO es
 * 100 % estático: leer el PDF, redactar las preguntas y crear el Word ocurre
 * dentro del navegador. Puedes abrir `public/index.html` directamente, o
 * publicarlo en GitHub Pages sin servidor ninguno.
 *
 * Este archivo solo sirve los archivos por HTTP (y evita las restricciones de
 * abrir la página con file://, donde los módulos ES no cargan).
 *
 * Uso:  npm run dev     (o)     node servidor/index.js
 */

import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.join(AQUI, '..');
const PUBLICO = path.join(RAIZ, 'public');
const NUCLEO = path.join(RAIZ, 'nucleo');
const MODULOS = path.join(RAIZ, 'node_modules');

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '127.0.0.1';

const VENDOR = {
  '/vendor/pdfjs': path.join(MODULOS, 'pdfjs-dist'),
  '/vendor/mdl': path.join(MODULOS, 'material-design-lite', 'dist'),
  '/vendor/docx': path.join(MODULOS, 'docx', 'dist'),
};

/** Comprueba que las rutas que se van a servir existen de verdad. */
function avisarSiFalta() {
  const rutas = {
    'public/': PUBLICO,
    'nucleo/': NUCLEO,
    'PDF.js': VENDOR['/vendor/pdfjs'],
    'Material Design Lite': VENDOR['/vendor/mdl'],
    'docx': VENDOR['/vendor/docx'],
  };

  Object.entries(rutas).forEach(([nombre, ruta]) => {
    if (!fs.existsSync(ruta)) {
      console.warn(`[aviso] No existe ${nombre} (${ruta}). ¿Falta «npm install»?`);
    }
  });
}

const app = express();
app.disable('x-powered-by');

// La aplicación
app.use(express.static(PUBLICO));

// Los módulos compartidos: los importa el navegador con ./nucleo/…
app.use('/nucleo', express.static(NUCLEO, { setHeaders: (res) => res.setHeader('Content-Type', 'text/javascript; charset=utf-8') }));

// Librerías del frontend, servidas desde node_modules (sin CDN: funciona sin internet)
Object.entries(VENDOR).forEach(([ruta, carpeta]) => {
  app.use(ruta, express.static(carpeta));
});

/** Único endpoint: sirve para comprobar de un vistazo que el servidor responde. */
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'cuestionario-pdf', modo: 'estatico', api: false });
});

app.use((_req, res) => {
  res.status(404).json({ error: 'Recurso no encontrado.' });
});

avisarSiFalta();

const servidor = app.listen(PORT, HOST, () => {
  console.log('──────────────────────────────────────────────');
  console.log(' CUESTIONARIO · servidor local en marcha');
  console.log(`  URL:  http://${HOST}:${PORT}`);
  console.log('  Modo: aplicación estática (todo ocurre en el navegador)');
  console.log('  Para detenerlo: Ctrl + C');
  console.log('──────────────────────────────────────────────');
});

const apagar = (senal) => () => {
  console.log(`\n[${senal}] cerrando servidor...`);
  servidor.close(() => process.exit(0));
};

process.on('SIGINT', apagar('SIGINT'));
process.on('SIGTERM', apagar('SIGTERM'));

export { app, PUBLICO, NUCLEO };
