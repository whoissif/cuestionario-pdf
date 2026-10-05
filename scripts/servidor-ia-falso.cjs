'use strict';

/**
 * Servidor de IA FALSO, solo para pruebas.
 *
 * Imita a la vez la API de Ollama (`/api/tags`, `/api/chat`) y la compatible
 * con OpenAI (`/v1/models`, `/v1/chat/completions`), para poder comprobar la
 * aplicación sin claves, sin internet y sin gastar cuota.
 *
 * Uso:
 *   node scripts/servidor-ia-falso.js [puerto]        (por defecto 11499)
 *
 * El nombre del modelo decide el comportamiento, para poder probar errores:
 *   llama3.2          → respuesta buena (JSON con las preguntas pedidas)
 *   json-en-texto     → el JSON viene dentro de un bloque de código
 *   opciones-array    → las opciones vienen como lista en vez de objeto
 *   correcta-texto    → la correcta viene como texto en lugar de letra
 *   pocas             → devuelve la mitad de las preguntas pedidas
 *   duplicadas        → repite la misma pregunta
 *   basura            → devuelve texto sin JSON
 *   falla-401         → HTTP 401 (clave inválida)
 *   falla-429         → HTTP 429 siempre (límite agotado de verdad)
 *   limitado          → HTTP 429 la primera vez (con Retry-After: 1) y luego OK
 *   falla-500         → HTTP 500
 *
 * Cualquier modelo que no sea de la lista se rechaza con «model is currently
 * unavailable», para comprobar la recuperación automática de la aplicación.
 */

const http = require('node:http');

const PUERTO = Number(process.argv[2] || 11499);

/** Contador de llamadas: así cada respuesta es distinta, como en un modelo real. */
let llamada = 0;

/** Veces que se ha pedido cada modelo (para simular límites de cuota). */
const veces = new Map();

/** Construye las preguntas falsas que pide el prompt. */
function preguntasFalsas(cantidad, modelo, llamada) {
  const total = modelo === 'pocas' ? Math.max(1, Math.floor(cantidad / 2)) : cantidad;

  return Array.from({ length: total }, (_, i) => {
    const base = {
      text: `Pregunta falsa ${i + 1} de la llamada ${llamada}`,
      options: {
        A: `Respuesta correcta ${i + 1}`,
        B: `Distractor plausible ${i + 1}`,
        C: `Otro distractor ${i + 1}`,
        D: `Un tercer distractor ${i + 1}`,
      },
      correct: 'A',
    };

    if (modelo === 'opciones-array') {
      base.options = [base.options.A, base.options.B, base.options.C, base.options.D];
    }
    if (modelo === 'correcta-texto') {
      base.correct = base.options.A;
    }
    return base;
  });
}

function respuestaChat(cantidad, modelo, llamada) {
  let preguntas = preguntasFalsas(cantidad, modelo, llamada);
  if (modelo === 'duplicadas') {
    preguntas = [preguntas[0], preguntas[0], preguntas[0]];
  }

  const json = JSON.stringify({ questions: preguntas });

  if (modelo === 'basura') return 'Lo siento, no puedo ayudarte con eso.';
  if (modelo === 'json-en-texto') {
    return `Claro, aquí tienes el cuestionario:\n\n\`\`\`json\n${json}\n\`\`\`\n\nEspero que te sirva.`;
  }
  return json;
}

function responderJson(res, estado, datos) {
  const cuerpo = JSON.stringify(datos);
  res.writeHead(estado, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(cuerpo),
  });
  res.end(cuerpo);
}

function leerCuerpo(req) {
  return new Promise((resolve) => {
    let datos = '';
    req.on('data', (trozo) => {
      datos += trozo;
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(datos || '{}'));
      } catch {
        resolve({});
      }
    });
  });
}

const servidor = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PUERTO}`);
  const ruta = url.pathname;

  // --- Listado de modelos, en los dos estilos de API ---
  if (req.method === 'GET' && ruta === '/api/tags') {
    responderJson(res, 200, {
      models: [{ name: 'llama3.2' }, { name: 'qwen2.5:7b' }, { name: 'mistral' }],
    });
    return;
  }

  if (req.method === 'GET' && ruta.endsWith('/models')) {
    responderJson(res, 200, {
      data: [{ id: 'modelo-falso-1' }, { id: 'modelo-falso-2' }],
    });
    return;
  }

  // --- Generación, en los dos estilos de API ---
  const esChat = ruta === '/api/chat' || ruta.endsWith('/chat/completions');
  if (req.method === 'POST' && esChat) {
    const cuerpo = await leerCuerpo(req);
    const modelo = String(cuerpo.model || 'llama3.2');
    const prompt = cuerpo.messages?.[0]?.content || '';
    const coincidencia = prompt.match(/EXACTAMENTE (\d+)/);
    const cantidad = coincidencia ? Number(coincidencia[1]) : 3;

    if (modelo === 'falla-401') {
      responderJson(res, 401, { error: { message: 'Invalid API key' } });
      return;
    }
    if (modelo === 'falla-429') {
      responderJson(res, 429, { error: { message: 'Rate limit exceeded' } });
      return;
    }
    if (modelo === 'falla-500') {
      responderJson(res, 500, { error: { message: 'Internal error' } });
      return;
    }
    // Límite de cuota que se recupera: la primera vez responde 429 con
    // Retry-After y, si la aplicación espera y reintenta, acaba respondiendo.
    if (modelo === 'limitado') {
      const n = (veces.get(modelo) || 0) + 1;
      veces.set(modelo, n);
      if (n === 1) {
        res.writeHead(429, {
          'Content-Type': 'application/json; charset=utf-8',
          'Retry-After': '1',
        });
        res.end(JSON.stringify({ error: { message: 'Rate limit exceeded' } }));
        return;
      }
    }
    // Modelos que este servidor de prueba conoce de verdad.
    const conocidos =
      ruta === '/api/chat' ? ['llama3.2', 'qwen2.5:7b', 'mistral'] : ['modelo-falso-1', 'modelo-falso-2'];
    const comportamientos = [
      'json-en-texto',
      'opciones-array',
      'correcta-texto',
      'pocas',
      'duplicadas',
      'basura',
      'falla-401',
      'falla-429',
      'falla-500',
      'limitado',
    ];

    // Cualquier otro nombre se rechaza como haría un servicio real: así se
    // comprueba la recuperación automática cuando un modelo ya no existe.
    if (!conocidos.includes(modelo) && !comportamientos.includes(modelo)) {
      responderJson(res, 400, {
        error: { message: `Model '${modelo}' is currently unavailable.` },
      });
      return;
    }

    const contenido = respuestaChat(cantidad, modelo, (llamada += 1));

    // El formato de respuesta cambia según el estilo de API.
    if (ruta === '/api/chat') {
      responderJson(res, 200, {
        model: modelo,
        message: { role: 'assistant', content: contenido },
        done: true,
      });
    } else {
      responderJson(res, 200, {
        id: 'chatcmpl-falso',
        model: modelo,
        choices: [{ index: 0, message: { role: 'assistant', content: contenido } }],
      });
    }
    return;
  }

  responderJson(res, 404, { error: { message: `Ruta no soportada: ${req.method} ${ruta}` } });
});

servidor.listen(PUERTO, '127.0.0.1', () => {
  console.log(`Servidor de IA FALSO escuchando en http://127.0.0.1:${PUERTO}`);
  console.log('  API Ollama         : GET /api/tags · POST /api/chat');
  console.log('  API tipo OpenAI    : GET /v1/models · POST /v1/chat/completions');
});
