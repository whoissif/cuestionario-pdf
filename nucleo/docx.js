/**
 * Construcción de los documentos de Word (.docx). MÓDULO COMPARTIDO.
 *
 * No sabe nada de Node ni del navegador: la librería `docx` se INYECTA como
 * parámetro (`D`). El navegador pasa el global `window.docx` y las herramientas
 * de consola pasan el paquete de npm. Quien llama decide cómo empaquetar el
 * documento: en el navegador `Packer.toBlob`, en Node `Packer.toBuffer`.
 *
 * Se generan dos documentos independientes:
 *   - `examen`     → solo las preguntas con sus 4 opciones, listo para imprimir.
 *   - `soluciones` → el solucionario, con una tabla y la clave rápida.
 */

const OPTION_KEYS = ['A', 'B', 'C', 'D'];
const AZUL = '1A4FD6';
const GRIS = '5F6B7A';

/** Fecha en formato español (dd/mm/aaaa). */
function fechaActual() {
  return new Date().toLocaleDateString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function titulo(texto, D) {
  const { AlignmentType, Paragraph, TextRun } = D;
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 120 },
    children: [new TextRun({ text: texto, bold: true, size: 36, color: AZUL })],
  });
}

function subtitulo(partes, D) {
  const { AlignmentType, Paragraph, TextRun } = D;
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 240 },
    children: [new TextRun({ text: partes.filter(Boolean).join(' · '), size: 20, color: GRIS })],
  });
}

function linea(D) {
  const { BorderStyle, Paragraph } = D;
  return new Paragraph({
    spacing: { after: 240 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'DFE3EA' } },
    children: [],
  });
}

/**
 * Documento de EXAMEN: preguntas numeradas con las cuatro opciones.
 */
function documentoExamen({ titulo: nombre, pdfNombre, questions }, D) {
  const { Document, Paragraph, TextRun } = D;
  const hijos = [
    titulo(nombre, D),
    subtitulo(
      [
        pdfNombre ? `Documento: ${pdfNombre}` : null,
        `Fecha: ${fechaActual()}`,
        `${questions.length} pregunta${questions.length === 1 ? '' : 's'}`,
      ],
      D
    ),
    new Paragraph({
      spacing: { after: 120 },
      children: [
        new TextRun({
          text: 'Instrucciones: marca con una X la opción correcta. Solo hay una respuesta válida por pregunta.',
          italics: true,
          size: 20,
        }),
      ],
    }),
    linea(D),
  ];

  questions.forEach((pregunta, indice) => {
    hijos.push(
      new Paragraph({
        spacing: { before: 240, after: 120 },
        children: [new TextRun({ text: `${indice + 1}. ${pregunta.text}`, bold: true, size: 24 })],
      })
    );

    OPTION_KEYS.forEach((letra) => {
      hijos.push(
        new Paragraph({
          indent: { left: 480 },
          spacing: { after: 60 },
          children: [
            new TextRun({ text: `${letra}) `, bold: true, size: 22 }),
            new TextRun({ text: String(pregunta.options[letra] ?? ''), size: 22 }),
          ],
        })
      );
    });
  });

  return new Document({
    creator: 'CUESTIONARIO',
    title: nombre,
    description: 'Cuestionario de 4 opciones generado desde un PDF',
    sections: [{ properties: {}, children: hijos }],
  });
}

function celda(texto, { negrita = false, ancho } = {}, D) {
  const { Paragraph, TableCell, TextRun, WidthType } = D;
  return new TableCell({
    width: ancho ? { size: ancho, type: WidthType.PERCENTAGE } : undefined,
    margins: { top: 60, bottom: 60, left: 120, right: 120 },
    children: [
      new Paragraph({
        children: [new TextRun({ text: texto, bold: negrita, size: 20 })],
      }),
    ],
  });
}

/**
 * Documento de SOLUCIONES: tabla con la respuesta correcta de cada pregunta
 * y la clave rápida al final.
 */
function documentoSoluciones({ titulo: nombre, questions }, D) {
  const { Document, Paragraph, Table, TableRow, TextRun, WidthType } = D;
  const filas = [
    new TableRow({
      tableHeader: true,
      children: [
        celda('Nº', { negrita: true, ancho: 10 }, D),
        celda('Correcta', { negrita: true, ancho: 15 }, D),
        celda('Respuesta', { negrita: true, ancho: 75 }, D),
      ],
    }),
  ];

  questions.forEach((pregunta, indice) => {
    filas.push(
      new TableRow({
        children: [
          celda(String(indice + 1), { ancho: 10 }, D),
          celda(String(pregunta.correct), { negrita: true, ancho: 15 }, D),
          celda(String(pregunta.options[pregunta.correct] ?? ''), { ancho: 75 }, D),
        ],
      })
    );
  });

  const clave = questions.map((p, i) => `${i + 1}-${p.correct}`).join('   ');

  return new Document({
    creator: 'CUESTIONARIO',
    title: `Solucionario · ${nombre}`,
    description: 'Solucionario del cuestionario generado desde un PDF',
    sections: [
      {
        properties: {},
        children: [
          titulo(`SOLUCIONARIO · ${nombre}`, D),
          subtitulo([`Fecha: ${fechaActual()}`, `${questions.length} preguntas`], D),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: filas,
          }),
          new Paragraph({
            spacing: { before: 360 },
            children: [
              new TextRun({ text: 'Clave rápida: ', bold: true, size: 22 }),
              new TextRun({ text: clave, size: 22 }),
            ],
          }),
        ],
      },
    ],
  });
}

/**
 * Construye el documento solicitado, SIN empaquetarlo.
 *
 * @param {'examen'|'soluciones'} tipo
 * @param {{titulo:string, pdfNombre?:string|null, questions:Array}} datos
 * @param {object} docxLib la librería `docx` (en el navegador, `window.docx`)
 * @returns {object} documento listo para `Packer.toBlob` o `Packer.toBuffer`
 */
function construirDocumento(tipo, datos, docxLib) {
  return tipo === 'soluciones'
    ? documentoSoluciones(datos, docxLib)
    : documentoExamen(datos, docxLib);
}

/** Quita tildes y diéresis para construir nombres de archivo. */
function sinAcentos(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/** Nombre de archivo seguro y legible: «examen-tema-3-el-contrato.docx». */
function nombreArchivoDocx(tipo, tituloCuestionario) {
  const base =
    sinAcentos(tituloCuestionario)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'cuestionario';
  return `${tipo}-${base}.docx`;
}

export { construirDocumento, fechaActual, nombreArchivoDocx };
