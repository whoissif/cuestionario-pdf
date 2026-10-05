'use strict';

/**
 * Genera el PDF de ejemplo con el que probar la aplicación sin necesitar un
 * documento real:  node scripts/make-sample-pdf.js
 *
 * Salida: samples/documento-ejemplo.pdf
 *
 * El texto imita un tema de estudio (definiciones, un artículo, listas de
 * conceptos con viñetas y frases con términos), que es justo lo que el motor
 * de reglas sabe convertir en preguntas de 4 opciones.
 */

const fs = require('node:fs');
const path = require('node:path');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

/** [texto, ¿negrita?, tamaño] */
const LINEAS = [
  ['TEMA 3 - El contrato', true, 16],
  ['', false, 12],
  ['El contrato es un acuerdo de voluntades entre dos o más partes.', false, 11],
  ['La oferta consiste en la declaración de voluntad dirigida a contratar.', false, 11],
  ['Los requisitos esenciales del contrato son el consentimiento, el objeto y la causa.', false, 11],
  ['El art. 1254 CC establece que el contrato existe desde que las partes consienten en obligarse.', false, 11],
  ['', false, 11],
  ['REQUISITOS DEL CONTRATO', true, 12],
  ['', false, 11],
  ['· Consentimiento: la voluntad libre de las partes de celebrar el contrato.', false, 11],
  ['· Objeto: la prestación o cosa sobre la que recae el contrato, posible y lícita.', false, 11],
  ['· Causa: el motivo jurídico por el que las partes se obligan y que debe existir.', false, 11],
  ['', false, 11],
  ['La capacidad consiste en la aptitud para realizar actos jurídicos válidos.', false, 11],
  ['', false, 11],
  ['TIPOS DE CONTRATOS', true, 12],
  ['', false, 11],
  ['· Contrato bilateral: aquel en el que las dos partes se obligan recíprocamente.', false, 11],
  ['· Contrato unilateral: aquel en el que solo una parte asume la obligación.', false, 11],
  ['· Contrato oneroso: aquel en el que cada parte recibe una prestación a cambio.', false, 11],
  ['', false, 11],
  ['En el contrato, el consentimiento debe prestarse sin vicios que lo invaliden.', false, 11],
  ['En todo contrato oneroso, la causa debe ser lícita y verdadera para las partes.', false, 11],
  ['', false, 11],
  ['Documento de ejemplo · temario ficticio de Derecho civil.', false, 9],
];

async function main() {
  const dir = path.join(__dirname, '..', 'samples');
  fs.mkdirSync(dir, { recursive: true });

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const page = pdf.addPage([595.28, 841.89]); // A4
  let y = 780;

  for (const [texto, esNegrita, tamano] of LINEAS) {
    if (texto) {
      page.drawText(texto, {
        x: 60,
        y,
        size: tamano,
        font: esNegrita ? bold : font,
        color: rgb(0.1, 0.12, 0.16),
      });
    }
    y -= tamano + 8;
  }

  const bytes = await pdf.save();
  const out = path.join(dir, 'documento-ejemplo.pdf');
  fs.writeFileSync(out, bytes);

  console.log(`PDF de ejemplo creado en: ${out}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
