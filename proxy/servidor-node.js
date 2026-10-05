/**
 * Adaptador para Node: sirve el proxy en tu PC o dentro de un GitHub Codespace.
 *
 * Uso:
 *   node proxy/servidor-node.js
 *   node --env-file=proxy/.env proxy/servidor-node.js     (clave en un archivo)
 *
 * Escucha en 0.0.0.0 a propósito: dentro de un Codespace hay que escuchar en
 * todas las interfaces para que el reenvío de puertos de GitHub funcione.
 *
 * Variables de entorno: OLLAMA_API_KEY, ORIGENES y DESTINO (ver nucleo.js).
 */

import http from 'node:http';
import { manejar } from './nucleo.js';

const PUERTO = Number(process.env.PUERTO || process.env.PORT || 8787);
const HOST = process.env.HOST || '0.0.0.0';

const servidor = http.createServer(async (req, res) => {
  let cuerpo = '';
  try {
    const trozos = [];
    for await (const trozo of req) trozos.push(trozo);
    cuerpo = Buffer.concat(trozos).toString('utf8');
  } catch {
    cuerpo = '';
  }

  let resultado;
  try {
    resultado = await manejar(
      { metodo: req.method, ruta: req.url, cabeceras: req.headers, cuerpo },
      process.env
    );
  } catch (err) {
    resultado = {
      estado: 500,
      cabeceras: { 'content-type': 'application/json; charset=utf-8' },
      cuerpo: JSON.stringify({ message: `Error interno del proxy: ${err.message}` }),
    };
  }

  res.writeHead(resultado.estado, resultado.cabeceras);
  res.end(resultado.cuerpo || undefined);
});

servidor.listen(PUERTO, HOST, () => {
  console.log(`Proxy de Ollama escuchando en http://localhost:${PUERTO}`);
  console.log(`Orígenes autorizados: ${process.env.ORIGENES || '(los de por defecto)'}`);
  console.log(
    process.env.OLLAMA_API_KEY
      ? 'Clave: configurada.'
      : 'Aviso: sin OLLAMA_API_KEY. «Ver modelos» funcionará, pero generar preguntas dará 401.'
  );
  if (process.env.CODESPACES) {
    console.log(
      'Codespace detectado: abre la pestaña «Ports», pon este puerto en «Public» y copia su URL https://...'
    );
  }
});
