// Utilidades compartidas por extraer.mjs, validar.mjs y build.mjs.
// La lógica de claves vive en src/app.js (MesoLogic.clavesDeDatos), así que la página y las herramientas coinciden.
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
export const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
// MESO_I18N_DIR permite a los tests trabajar sobre una copia sin tocar las carpetas de los traductores.
export const dirI18n = process.env.MESO_I18N_DIR || join(raiz, 'i18n');
export const L = require(join(raiz, 'src/app.js'));

export const ORIGINAL = L.IDIOMA_ORIGINAL;
export const CODIGOS = L.IDIOMAS.map((x) => x.codigo);
export const REVISIONES = ['automatica', 'revisada'];
const BOM = String.fromCharCode(0xfeff);

export function leerJSON(ruta) {
  let texto = readFileSync(ruta, 'utf8');
  if (texto.startsWith(BOM)) texto = texto.slice(1);
  return JSON.parse(texto);
}

/**
 * Archivos de datos por conjunto. Los textos son opcionales: si data/textos.json no existe,
 * la página se construye sin ellos (la sección de textos muestra un aviso).
 */
export const ARCHIVOS = {
  real: { cientifico: 'data/cientifico.json', astronautas: 'data/astronautas.json', actual: 'data/actual.json', asiriologos: 'data/asiriologos.json', textos: 'data/textos.json', completos: 'data/completos.json' },
  muestra: { cientifico: 'data/muestra-cientifico.json', astronautas: 'data/muestra-astronautas.json', actual: 'data/actual.json', asiriologos: 'data/asiriologos.json', textos: 'data/muestra-textos.json', completos: 'data/completos.json' }
};
/** Los textos completos (data/completos.json) solo están en castellano: no generan claves de traducción. */
export const OPCIONALES = ['textos', 'completos'];

/** Datos en bruto, tal como se insertan en la página (los opcionales ausentes valen null). */
export function leerDatos(conjunto = 'real') {
  const res = {};
  for (const [k, ruta] of Object.entries(ARCHIVOS[conjunto])) {
    const p = join(raiz, ruta);
    res[k] = OPCIONALES.includes(k) && !existsSync(p) ? null : leerJSON(p);
  }
  return res;
}

/** Texto fuente completo en castellano: meta, interfaz y datos (orden estable). */
export function fuenteEspanola(datos) {
  return { 'meta.revision': 'original', ...L.TEXTOS, ...L.clavesDeDatos(datos) };
}

/** Idiomas con carpeta en i18n/ que contienen algún .json. */
export function idiomasPresentes() {
  if (!existsSync(dirI18n)) return [];
  return readdirSync(dirI18n).filter((d) => {
    const p = join(dirI18n, d);
    return statSync(p).isDirectory() && readdirSync(p).some((f) => f.endsWith('.json'));
  }).sort();
}

/**
 * Lee y fusiona i18n/<idioma>/*.json en orden de nombre.
 * Devuelve { mapa, archivos, problemas } sin lanzar: los JSON rotos o con valores no textuales se anotan.
 */
export function leerIdioma(idioma) {
  const dir = join(dirI18n, idioma);
  const mapa = {};
  const problemas = [];
  const origen = {};
  if (!existsSync(dir)) return { mapa, archivos: [], problemas: [`no existe la carpeta i18n/${idioma}/`] };
  const archivos = readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
  if (!archivos.length) problemas.push(`i18n/${idioma}/ no contiene archivos .json`);
  for (const f of archivos) {
    const nombre = `i18n/${idioma}/${f}`;
    let trozo;
    try {
      trozo = leerJSON(join(dir, f));
    } catch (e) {
      problemas.push(`${nombre}: JSON no válido (${e.message})`);
      continue;
    }
    if (!trozo || typeof trozo !== 'object' || Array.isArray(trozo)) {
      problemas.push(`${nombre}: debe ser un objeto plano {clave: texto}`);
      continue;
    }
    for (const [k, v] of Object.entries(trozo)) {
      if (typeof v !== 'string') { problemas.push(`${nombre}: «${k}» no es una cadena`); continue; }
      if (k in origen) problemas.push(`${nombre}: «${k}» repetida (ya está en ${origen[k]})`);
      origen[k] = nombre;
      mapa[k] = v;
    }
  }
  return { mapa, archivos, problemas };
}

/**
 * Compara una traducción con el castellano. Devuelve { faltan, sobran, problemas }.
 * problemas incluye cadenas vacías, marcadores {x} distintos y meta.revision no válida.
 */
export function compararConOriginal(es, mapa, idioma) {
  const faltan = Object.keys(es).filter((k) => !(k in mapa));
  const sobran = Object.keys(mapa).filter((k) => !(k in es));
  const problemas = [];
  for (const [k, v] of Object.entries(mapa)) {
    if (!(k in es)) continue;
    if (typeof v !== 'string' || v.trim() === '') { problemas.push(`«${k}» está vacía`); continue; }
    const a = L.marcadores(es[k]).join(' '), b = L.marcadores(v).join(' ');
    if (a !== b) problemas.push(`«${k}»: marcadores distintos (original: ${a || 'ninguno'}; traducción: ${b || 'ninguno'})`);
  }
  if ('meta.revision' in mapa) {
    const validos = idioma === ORIGINAL ? ['original'] : REVISIONES;
    if (!validos.includes(mapa['meta.revision'])) problemas.push(`«meta.revision» debe ser ${validos.map((x) => `"${x}"`).join(' o ')}`);
  }
  return { faltan, sobran, problemas };
}
