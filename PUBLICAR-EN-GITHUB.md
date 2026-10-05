# Publicar CUESTIONARIO en GitHub

Guía paso a paso para subir este proyecto a un repositorio **público** llamado
**`cuestionario-pdf`**.

> **El proyecto ya está publicado** en <https://github.com/whoissif/cuestionario-pdf>.
> Esta guía sirve para **publicar tu propia copia** (un *fork* o una copia local) desde cero.
> Tienes tres caminos: el **Camino B (GitHub Desktop)** es el más fácil si prefieres no escribir
> órdenes, y el **Camino A** es el estándar si te manejas con la consola.

> **Para que se pueda USAR como web app** hay que activar **GitHub Pages** apuntando a la carpeta
> `docs/` (ver el **Paso 2**). Es la gracia de este proyecto: la aplicación funciona entera en el
> navegador, así que no necesita ningún servidor ni servicio de pago: GitHub la sirve tal cual.

---

## Paso 0 · Qué se sube y qué no

**Sí se sube** todo el proyecto, **incluida la carpeta `docs/`**: es el sitio ya construido (HTML,
CSS, los módulos de `nucleo/` y las librerías de `vendor/`) y es exactamente lo que sirve GitHub
Pages. Si cambias algo del código, acuérdate de regenerarla antes de subir:

```bash
npm run build
```

Ya está preparado en el archivo **`.gitignore`**, así que Git **nunca** subirá:

| No se sube | Por qué |
|------------|---------|
| `node_modules/` | Son las dependencias: se reinstalan con `npm install`. Son miles de archivos y más de 100 MB. |
| `.npm-cache/` | Caché de npm de este equipo. |
| `backend/uploads/` | Restos de PDFs de la versión anterior de la aplicación (ya no se sube ningún archivo). |
| `salida-servidor.txt`, `*.log`, `.env` | Archivos temporales y de configuración. |

**No hay ningún secreto que borrar:** la clave de API de la IA se guarda en el navegador
(localStorage), nunca en un archivo del proyecto.

---

## Paso 1 · Crear el repositorio vacío en GitHub

1. Entra en <https://github.com/new> con tu cuenta.
2. **Repository name:** `cuestionario-pdf`
3. **Description** (opcional): `Genera un cuestionario de 4 opciones desde un PDF y lo exporta a Word`
4. Marca **Public**.
5. **No marques** «Add a README file», ni `.gitignore`, ni licencia: déjalo **totalmente vacío**
   (si los marcas, el primer `push` dará error porque habrá contenido que tú no tienes).
6. Pulsa **Create repository**.

Verás una página con órdenes de ejemplo. Esa URL
(`https://github.com/TU-USUARIO/cuestionario-pdf.git`) es la que usarás como `origin`:
sustituye `TU-USUARIO` por tu usuario de GitHub.

---

## Paso 2 · Activar GitHub Pages (para poder usarla como web app)

Una vez subido el proyecto (por cualquiera de los tres caminos):

1. Entra en tu repositorio y pulsa **Settings** (arriba a la derecha).
2. En la barra lateral, **Pages**.
3. En **Source**, elige **Deploy from a branch**.
4. En **Branch**, selecciona **`main`** y en la carpeta de la derecha elige **`/docs`**.
5. Pulsa **Save** y espera un minuto (la primera vez tarda un poco).

Tu aplicación quedará publicada en:

```
https://TU-USUARIO.github.io/cuestionario-pdf/
```

> **Comprueba que funciona:** ábrela, elige `samples/documento-ejemplo.pdf`, pide 8 preguntas y
> descarga el examen. Todo ocurre en tu navegador; el PDF no se sube a ningún sitio.

> **Si sale un error 404:** espera un par de minutos y recarga. Si sigue, revisa que en el paso 4
> hayas elegido la carpeta **`/docs`** (no `/root`) y que la carpeta `docs/` esté de verdad en el
> repositorio.

> **Importante al actualizar:** cada vez que cambies el código, ejecuta `npm run build` **antes**
> de subir los cambios, o Pages seguirá sirviendo la versión antigua de `docs/`.

---

## Camino A · Con Git por línea de órdenes

### A.1 Instalar Git

1. Descarga **Git for Windows**: <https://git-scm.com/download/win>
2. Instálalo con las opciones por defecto (incluye «Git Credential Manager», que sirve para
   autenticarte abriendo el navegador).
3. **Cierra y vuelve a abrir** la terminal y comprueba:
   ```powershell
   git --version
   ```

### A.2 Preparar el repositorio local

Abre **PowerShell**, entra en la carpeta donde tengas el proyecto y ejecuta (copia y pega):

```powershell
cd "C:\ruta\hasta\cuestionario-app"

git config --global user.name  "Tu Nombre"
git config --global user.email "tu-correo@ejemplo.com"
git config --global core.longpaths true      # evita errores de rutas largas en Windows
git config --global core.autocrlf true       # avisos de saltos de línea, sin importancia

git init -b main
git add .
git status
```

En `git status` **comprueba** que aparecen `backend/`, `public/`, `samples/`, `scripts/`,
`README.md`… y que **NO** aparecen `node_modules/` ni `backend/uploads/`. Si aparecen, para y
revisa el `.gitignore`.

```powershell
git commit -m "CUESTIONARIO: genera cuestionarios de 4 opciones desde un PDF y los exporta a Word"
git remote add origin https://github.com/TU-USUARIO/cuestionario-pdf.git
git push -u origin main
```

> Sustituye **`TU-USUARIO`** por tu usuario real de GitHub (aparece en la URL de tu repositorio).

Si te pide usuario y contraseña: la contraseña **ya no vale**. Pulsa **«Sign in with your
browser»** (Credential Manager) o crea un **token** en
<https://github.com/settings/personal-access-tokens/new> y úsalo como contraseña. Para subir
contenido basta un token *fine-grained* con permiso **Contents: Read and write** sobre ese
repositorio; evita los tokens clásicos (`ghp_…`), que dan acceso a **todos** tus repositorios.

---

## Camino B · Con GitHub Desktop (sin escribir órdenes)

1. Descarga e instala **GitHub Desktop**: <https://desktop.github.com/>
2. Inicia sesión con tu cuenta de GitHub.
3. Menú **File → Add local repository…** y elige la carpeta del proyecto
   (`…\cuestionario-app`).
   Te avisará de que no es un repositorio: pulsa **«create a repository»**.
4. En la ventana de creación:
   - **Name:** `cuestionario-pdf`
   - **Local path:** la carpeta **padre** (la que contiene `cuestionario-app`) — GitHub Desktop
     creará el repositorio usando la carpeta existente.
   - **Initialize this repository with a README:** *desmarca* esta casilla.
   - **Git ignore:** deja `None` (el proyecto ya trae su propio `.gitignore`).
5. Pulsa **Create repository**.
6. En la lista de cambios verás los archivos del proyecto y **no** `node_modules`. Escribe el
   resumen del commit y pulsa **Commit to main**.
7. Pulsa **Publish repository**, **desmarca** «Keep this code private» y confirma.

---

## Camino C · Solo con el navegador (sin instalar nada)

Válido si el proyecto es pequeño, que es el caso (unas decenas de archivos).

1. Crea el repositorio vacío como en el **Paso 1**.
2. En la página del repositorio, pulsa **Add file → Upload files**.
3. Abre el Explorador de Windows en la carpeta del proyecto (`…\cuestionario-app`).
4. **Selecciona y arrastra a la ventana del navegador** estos elementos:
   - las carpetas **`nucleo`**, **`public`**, **`servidor`**, **`scripts`**, **`samples`** y
     **`docs`**
   - los archivos **`README.md`**, **`INSTRUCCIONES.md`**, **`PUBLICAR-EN-GITHUB.md`**,
     **`package.json`**, **`package-lock.json`**, **`.gitignore`**, **`iniciar.cmd`**
5. **NO arrastres** `node_modules` ni `.npm-cache` (miles de archivos; el navegador se atascaría).
   Ten en cuenta que **`docs/` son unos 211 archivos y 6,5 MB**: la subida funciona, pero tarda un
   rato. Si te resulta pesado, usa el Camino A o el Camino B.
6. Escribe el mensaje del commit y pulsa **Commit changes**.

> El `.gitignore` se sube igualmente, así que a partir de ahí `git pull` en otros equipos
> respetará las exclusiones.

---

## Comprobar que ha subido bien

En la página del repositorio debe verse:

- `README.md` renderizado con el título **CUESTIONARIO**.
- Las carpetas `backend/`, `public/`, `samples/`, `scripts/`.
- **Ni rastro** de `node_modules/` ni de `backend/uploads/`.

Si ves `node_modules`, borra el repositorio y repite (es más rápido que limpiarlo): casi siempre
significa que el `.gitignore` no llegó a subirse o que se añadieron los archivos antes de crearlo.

---

## Actualizar el proyecto más adelante

**Con Git:**
```powershell
cd "C:\ruta\hasta\cuestionario-app"
npm run build        # regenera docs/ si has tocado public/ o nucleo/
git add .
git commit -m "Describe aquí el cambio"
git push
```

> `docs/` es lo que ve el visitante: si cambias el código y no lo regeneras, la web seguirá
> mostrando la versión antigua.

**Con GitHub Desktop:** los cambios aparecen solos en la lista; escribe el resumen, **Commit to
main** y **Push origin**.

---

## Detalles finales (opcionales pero recomendados)

1. **Tu usuario en el proyecto.** Para que las órdenes de clonado funcionen, sustituye
   `TU-USUARIO` por tu usuario real en:
   - `package.json` → campo `repository.url`
   - este mismo archivo (`PUBLICAR-EN-GITHUB.md`)

   Una vez publicado, el clonado queda así:

   ```bash
   git clone https://github.com/TU-USUARIO/cuestionario-pdf.git
   cd cuestionario-pdf
   npm install
   npm run dev
   ```

   (En este repositorio ya está hecho: el usuario es **`whoissif`**.)

2. **Licencia.** Ahora mismo el proyecto no tiene licencia: sin ella, los derechos quedan
   reservados y nadie puede reutilizarlo legalmente. Si quieres que sea libre, en GitHub entra en
   **Add file → Create new file**, llámalo `LICENSE`, y elige la plantilla **MIT** desde el botón
   «Choose a license template». Después añade `"license": "MIT"` en `package.json`.

3. **Descripción y temas del repositorio.** En la página principal, arriba a la derecha, pulsa el
   engranaje de **About** y añade: descripción, la web (si algún día la publicas) y los temas
   `pdf`, `questionnaire`, `nodejs`, `express`, `docx`, `spanish`.

4. **Para que otros lo prueben sin clonar nada**, no hace falta nada más: el proyecto funciona en
   local con `npm install` y `npm run dev`.

---

## Problemas frecuentes

| Mensaje | Causa y solución |
|---------|------------------|
| `Authentication failed` al hacer `push` | GitHub no acepta la contraseña de la cuenta. Usa el inicio de sesión del navegador (Credential Manager) o un **token fine-grained** con permiso **Contents: Read and write**. |
| `remote origin already exists` | Ya hay un remoto configurado: `git remote set-url origin https://github.com/TU-USUARIO/cuestionario-pdf.git` |
| `failed to push some refs … rejected` | Creaste el repositorio de GitHub **con** README o licencia. Solución: `git pull --rebase origin main` y vuelve a hacer `git push`. |
| `warning: LF will be replaced by CRLF` | Aviso inofensivo en Windows. Se silencia con `git config --global core.autocrlf true`. |
| `filename too long` | Rutas largas de Windows: `git config --global core.longpaths true` y vuelve a intentarlo. |
| `git` no se reconoce como comando | Git no está instalado (o no has reiniciado la terminal después de instalarlo). |
| El `push` tarda muchísimo o falla por tamaño | Se está subiendo `node_modules`. Cancela, revisa el `.gitignore` y repite con `git add .` |
