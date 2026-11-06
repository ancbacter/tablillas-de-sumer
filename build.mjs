// Uso: node build.mjs [--muestra] [--completa]
// Lee los datos JSON y genera dist/index.html con CSS, JS y datos en línea (en castellano),
// y dist/i18n/<idioma>.json por cada traducción presente en i18n/<idioma>/.
// Por defecto index.html es un fragmento (el host de los artifacts añade doctype y <head>);
// con --completa se escribe un documento HTML completo, para servidores estáticos como GitHub Pages.
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';
import { ARCHIVOS, OPCIONALES } from './i18n/comun.mjs';

const raiz = dirname(fileURLToPath(import.meta.url));
const muestra = process.argv.includes('--muestra');
const completa = process.argv.includes('--completa');

/** Envuelve el fragmento en un documento completo: doctype, idioma, charset y viewport. */
function documentoCompleto(fragmento) {
  return '<!doctype html>\n<html lang="es">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n</head>\n<body>\n'
    + fragmento + '\n</body>\n</html>\n';
}
const archivos = ARCHIVOS[muestra ? 'muestra' : 'real'];

const MARCADOR_DATOS = '/*__DATA__*/null';
const MARCADOR_APP = '/*__APP__*/';
const MARCADOR_IDIOMAS = '/*__IDIOMAS__*/null';
const BOM = String.fromCharCode(0xfeff);
const LS = String.fromCharCode(0x2028);
const PS = String.fromCharCode(0x2029);

async function leerJSON(ruta) {
  let texto;
  try {
    texto = await readFile(join(raiz, ruta), 'utf8');
  } catch (e) {
    throw new Error(`No se puede leer ${ruta}: ${e.message}`);
  }
  if (texto.startsWith(BOM)) texto = texto.slice(1);
  try {
    return JSON.parse(texto);
  } catch (e) {
    throw new Error(`JSON no válido en ${ruta}: ${e.message}`);
  }
}

// Evita que el contenido cierre el <script> o abra un comentario HTML.
function seguroEnScript(texto) {
  return texto.replaceAll('</', '<\\/').replaceAll('<!--', '<\\!--');
}

/**
 * Escribe dist/i18n/<idioma>.json (mapa plano) por cada idioma de i18n/ distinto del castellano.
 * Un idioma incompleto se publica igual: en la página, lo que falte cae al castellano.
 * Devuelve la lista de idiomas publicados, con 'es' delante.
 */
async function traducciones(datos) {
  const { CODIGOS, ORIGINAL, compararConOriginal, fuenteEspanola, idiomasPresentes, leerIdioma } = await import('./i18n/comun.mjs');
  const destino = join(raiz, 'dist/i18n');
  await rm(destino, { recursive: true, force: true });
  const es = fuenteEspanola(datos);
  const publicados = [ORIGINAL];
  const presentes = idiomasPresentes();
  if (!muestra) {
    const actual = leerIdioma(ORIGINAL).mapa;
    const igual = Object.keys(es).length === Object.keys(actual).length && Object.keys(es).every((k) => actual[k] === es[k]);
    if (!igual) console.warn('AVISO: i18n/es/ no coincide con los textos actuales; ejecuta node i18n/extraer.mjs');
  }
  for (const idioma of presentes) {
    if (idioma === ORIGINAL) continue;
    if (!CODIGOS.includes(idioma)) { console.warn(`AVISO: i18n/${idioma}/ no es un idioma de la página; se omite`); continue; }
    const { mapa, problemas } = leerIdioma(idioma);
    const { faltan, sobran, problemas: otros } = compararConOriginal(es, mapa, idioma);
    const salida = {};
    for (const k of Object.keys(es)) if (typeof mapa[k] === 'string' && mapa[k].trim() !== '') salida[k] = mapa[k];
    const avisos = problemas.concat(otros);
    if (faltan.length) avisos.push(`faltan ${faltan.length} de ${Object.keys(es).length} claves (se mostrarán en castellano)`);
    if (sobran.length) avisos.push(`${sobran.length} claves que no existen en castellano (se ignoran)`);
    for (const a of avisos) console.warn(`AVISO ${idioma}: ${a}`);
    await mkdir(destino, { recursive: true });
    await writeFile(join(destino, idioma + '.json'), JSON.stringify(salida), 'utf8');
    publicados.push(idioma);
  }
  return publicados;
}

async function main() {
  const claves = Object.keys(archivos);
  const [plantilla, app, ...valores] = await Promise.all([
    readFile(join(raiz, 'src/template.html'), 'utf8'),
    readFile(join(raiz, 'src/app.js'), 'utf8'),
    ...claves.map((k) => {
      if (OPCIONALES.includes(k) && !existsSync(join(raiz, archivos[k]))) {
        console.warn(`AVISO: ${archivos[k]} no existe; la sección correspondiente se mostrará vacía`);
        return null;
      }
      return leerJSON(archivos[k]);
    }),
  ]);
  const todos = Object.fromEntries(claves.map((k, i) => [k, valores[i]]));
  const { cientifico } = todos;

  for (const m of [MARCADOR_DATOS, MARCADOR_APP, MARCADOR_IDIOMAS]) {
    if (plantilla.split(m).length !== 2) throw new Error(`La plantilla debe contener exactamente un marcador ${m}`);
  }

  const datos = seguroEnScript(JSON.stringify(todos))
    .replaceAll(LS, '\\u2028')
    .replaceAll(PS, '\\u2029');
  const codigo = seguroEnScript(app);
  const idiomas = await traducciones(todos);

  // Reemplazo con función: así «$&», «$1»… del contenido no se interpretan.
  // Primero el código (no contiene el marcador de datos); luego los datos, que pueden contener cualquier texto.
  const html = plantilla
    .replace(MARCADOR_APP, () => codigo)
    .replace(MARCADOR_IDIOMAS, () => JSON.stringify(idiomas))
    .replace(MARCADOR_DATOS, () => datos);

  await mkdir(join(raiz, 'dist'), { recursive: true });
  await writeFile(join(raiz, 'dist/index.html'), completa ? documentoCompleto(html) : html, 'utf8');
  const n = Array.isArray(cientifico && cientifico.entradas) ? cientifico.entradas.length : 0;
  const nt = Array.isArray(todos.textos && todos.textos.textos) ? todos.textos.textos.length : 0;
  console.log(`dist/index.html escrito (${(html.length / 1024).toFixed(1)} KB, ${n} entradas, ${nt} textos${muestra ? ', datos de muestra' : ''}; idiomas: ${idiomas.join(', ')}).`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
