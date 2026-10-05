# Proxy de Ollama Cloud

Un intermediario pequeño que permite usar **los modelos gratuitos de Ollama Cloud**
desde la web publicada de CUESTIONARIO.

## Por qué hace falta

Comprobado con peticiones reales: la API de Ollama Cloud **no manda ni una cabecera
CORS** y contesta **405** al preflight `OPTIONS`. Eso significa que **ningún navegador
puede llamarla**, ni con la ruta `/api` ni con la `/v1`, ni con la clave correcta. El
navegador aborta antes de enviar nada. No es un fallo de tu clave ni de la aplicación.

Un proxy es un programa que **no es un navegador**, así que sí puede llamarla. Recibe la
petición de la página, le añade tu clave y la reenvía; después devuelve la respuesta con
las cabeceras CORS que el navegador exige.

**Importante:** GitHub Pages **no puede** hacer de proxy, porque solo sirve archivos
estáticos. Por eso el proxy se aloja en un servicio que sí ejecuta código. Tienes dos
caminos gratis, y el código es el mismo:

| Camino | Necesitas | Ventaja |
|---|---|---|
| **A. Cloudflare Workers** (recomendado) | Cuenta gratuita de Cloudflare (solo correo) | URL fija, siempre encendido, 100.000 peticiones al día |
| **B. GitHub Codespaces** | Solo tu cuenta de GitHub | No creas cuentas nuevas, pero hay que arrancarlo cada vez |

## Qué hace exactamente

- Reenvía a `https://api.ollama.com` **solo** las rutas que empiezan por `/api/` o `/v1/`.
- Pone la clave de Ollama en la cabecera `Authorization`.
- Contesta el preflight `OPTIONS` (lo que Ollama rechaza) con los permisos correctos.
- Solo atiende a las páginas autorizadas de la lista `ORIGENES`, para que nadie más
  gaste tu cuota gratuita.
- Rechaza los cuerpos de más de 512 KB.
- **No guarda nada**, no registra nada y no conoce tu documento.

La clave **nunca** llega al navegador: vive como secreto en el proxy.

---

## Camino A · Cloudflare Workers

### A1. Desde el panel, sin instalar nada (lo más rápido)

1. Crea una cuenta gratuita en <https://dash.cloudflare.com/sign-up>.
2. En el menú lateral: **Compute (Workers)** → **Create** → **Start with Hello World!**.
3. Ponle de nombre `cuestionario-proxy-ollama` y pulsa **Deploy**.
4. Pulsa **Edit code**, **borra todo** lo que haya y **pega el contenido completo** de
   [`desplegar/trabajador.js`](desplegar/trabajador.js) (es el proxy entero en un solo
   archivo). Pulsa **Deploy**.
5. Ve a **Settings** → **Variables and Secrets** → **Add**:
   - Tipo: **Secret**
   - Nombre: `OLLAMA_API_KEY`
   - Valor: tu clave de <https://ollama.com/settings/keys>
   - Guarda (si te deja, vuelve a pulsar **Deploy**).
6. Copia la URL del Worker, que verás en **Overview** o **Settings**: tiene la forma
   `https://cuestionario-proxy-ollama.TU-CUENTA.workers.dev`.
7. **Comprueba que funciona:** abre en el navegador esa URL seguida de `/api/tags`
   (por ejemplo `https://cuestionario-proxy-ollama.TU-CUENTA.workers.dev/api/tags`).
   Debe aparecer un JSON con una lista de modelos. Si sale, el proxy está listo.

### A2. Desde la terminal, con Wrangler

```cmd
cd proxy
npx wrangler login
npx wrangler secret put OLLAMA_API_KEY
npx wrangler deploy
```

`wrangler deploy` imprime la URL al terminar.

### A3. Automático desde GitHub

Para que cada cambio en `proxy/` se despliegue solo:

1. El repositorio debe contener las carpetas `proxy/` y el archivo
   `.github/workflows/desplegar-proxy.yml`.
2. En GitHub: **Settings** → **Secrets and variables** → **Actions** → **New repository
   secret**, y crea estos dos:
   - `CLOUDFLARE_API_TOKEN` — un token de Cloudflare con permiso **Workers Scripts: Edit**
     (<https://dash.cloudflare.com/profile/api-tokens>).
   - `CLOUDFLARE_ACCOUNT_ID` — el identificador de tu cuenta (lo muestra
     `npx wrangler whoami`).
3. A partir de ahí, cada `push` que toque `proxy/` despliega el proxy. También puedes
   lanzarlo a mano desde la pestaña **Actions** → **Desplegar el proxy de IA** →
   **Run workflow**.

La clave de Ollama **no** se pone aquí: sigue viviendo como secreto dentro de Cloudflare.

---

## Camino B · GitHub Codespaces

Sin cuentas nuevas: todo dentro de GitHub. A cambio, hay que arrancarlo cada vez y la
cuota gratuita son unas 60 horas al mes.

1. En tu repositorio: botón verde **Code** → pestaña **Codespaces** →
   **Create codespace on main**.
2. En la terminal del Codespace:

   ```bash
   export OLLAMA_API_KEY=tu_clave_de_ollama
   node proxy/servidor-node.js
   ```

3. Abre la pestaña **Ports**, busca el puerto **8787**, haz clic derecho →
   **Port Visibility** → **Public**, y copia la URL `https://...-8787.app.github.dev`.
4. Esa URL es la que va en la aplicación, igual que en el camino A.

Aviso honesto: he probado el programa (arranca y responde bien), pero **no he podido
comprobar** si el reenvío de puertos de GitHub deja pasar las cabeceras CORS tal cual. Si
el navegador se queja, usa el camino A, que sí está verificado de extremo a extremo.

---

## Configurar la aplicación

En <https://whoissif.github.io/cuestionario-pdf/>, tarjeta **3 · Generar con IA**:

| Campo | Qué poner |
|---|---|
| **Servicio** | `Otro servidor Ollama (por ejemplo, en tu red)` |
| **URL del servicio** | La URL del proxy (por ejemplo `https://cuestionario-proxy-ollama.TU-CUENTA.workers.dev`) |
| **Modelo** | Pulsa **Ver modelos** y elige uno de la lista |
| **Clave de API** | **Déjala vacía**: la clave vive en el proxy |

Después: **Probar conexión** (debe decir «Conexión correcta») y **Generar con IA**.

Modelos que ofrece el servicio ahora mismo (17): `gpt-oss:120b`, `gpt-oss:20b`,
`deepseek-v4.1-flash`, `deepseek-v4-pro:0813`, `minimax-m3`, `minimax-m2.7`, `glm-5.3`,
`glm-5.3-flash`, `glm-5.2`, `kimi-k2.7-code`, `kimi-k2.6`, `kimi-k3`, `gemma4:31b`,
`mistral-large-3:675b`, `nemotron-3-ultra`, `nemotron-3-super`, `nemotron-3-nano:30b`.

Si algún nombre ha cambiado, **Ver modelos** siempre trae la lista de verdad.

---

## Seguridad

- **La clave no entra en el navegador** ni en el repositorio: se queda en el secreto del
  proxy. Es más seguro que escribirla en la página.
- **`ORIGENES` limita quién puede usarlo.** Por defecto solo la web publicada y la app
  local. Si pones `ORIGENES=*`, cualquiera que descubra la URL podrá gastar tu cuota.
- **No es un proxy abierto:** el destino está fijado a `api.ollama.com` y solo se
  reenvían las rutas `/api/...` y `/v1/...`.
- Tu PDF sigue enviándose a Ollama Cloud cuando usas la IA (como con cualquier servicio
  de IA en la nube). El motor local, en cambio, nunca saca el documento de tu equipo.

## Si algo falla

| Lo que ves | Qué significa |
|---|---|
| `403` y «El origen … no está autorizado» | Tu página no está en `ORIGENES`. Añádela (sin barra final). |
| `401` y «Falta la clave de Ollama» | No has definido el secreto `OLLAMA_API_KEY` en el proxy. |
| `401` con «Unauthorized» | La clave del proxy no es válida o ha caducado. |
| `502` | El proxy no consigue contactar con `api.ollama.com`. |
| `504` | Ollama ha tardado más de 3 minutos: pide menos preguntas u otro modelo. |
| «Failed to fetch» en la consola del navegador | Estás llamando a Ollama Cloud directamente en vez de al proxy. |

## Archivos y pruebas

| Archivo | Para qué sirve |
|---|---|
| `nucleo.js` | Toda la lógica, sin depender de ninguna plataforma |
| `trabajador.js` | Adaptador de Cloudflare Workers (con `import`) |
| `servidor-node.js` | Adaptador de Node y Codespaces |
| `desplegar/trabajador.js` | **Generado**: el proxy entero en un archivo, para pegar en el panel |
| `empaquetar.js` | Genera el archivo anterior |
| `wrangler.toml` | Configuración de Cloudflare |
| `probar.js` | 38 comprobaciones, dos de ellas contra Ollama Cloud de verdad |

```cmd
npm run proxy:empaquetar   :: regenera desplegar/trabajador.js
npm run proxy:probar       :: 38 comprobaciones (incluye llamadas reales)
npm run proxy              :: arranca el proxy en http://localhost:8787
```
