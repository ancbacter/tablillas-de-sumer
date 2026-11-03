// Uso: node i18n/validar.mjs <idioma>      (p. ej. ca, eu, en)
//      node i18n/validar.mjs --todos       (todos los idiomas con carpeta en i18n/)
// Comprueba que i18n/<idioma>/*.json tiene exactamente las claves de i18n/es/, sin cadenas vacías,
// con los mismos marcadores {x}, JSON válido y meta.revision correcta. Sale con código 1 si hay errores.
// Con «es» comprueba además que el texto fuente está al día con los datos y la interfaz.
import { pathToFileURL } from 'node:url';
import { CODIGOS, compararConOriginal, fuenteEspanola, idiomasPresentes, leerDatos, leerIdioma, ORIGINAL } from './comun.mjs';

const MAX_LISTA = 40;

/** Problemas de un idioma frente al mapa castellano `es`. Lista vacía = válido. */
export function validarIdioma(idioma, es, leido) {
  const { mapa, problemas: deLectura } = leido;
  const errores = [...deLectura];
  if (!CODIGOS.includes(idioma)) errores.push(`«${idioma}» no es un idioma de la página (${CODIGOS.join(', ')})`);
  const { faltan, sobran, problemas } = compararConOriginal(es, mapa, idioma);
  for (const k of faltan) errores.push(`falta la clave «${k}»`);
  for (const k of sobran) errores.push(`sobra la clave «${k}»`);
  return errores.concat(problemas);
}

function validarCLI(idioma, esLeido) {
  const leido = leerIdioma(idioma);
  let errores;
  if (idioma === ORIGINAL) {
    // El castellano se compara con lo que generaría extraer.mjs ahora mismo.
    const fuente = fuenteEspanola(leerDatos());
    errores = validarIdioma(idioma, fuente, leido);
    const distintos = Object.keys(fuente).filter((k) => k in leido.mapa && leido.mapa[k] !== fuente[k]);
    for (const k of distintos) errores.push(`«${k}» no coincide con los datos actuales`);
    if (errores.length) errores.push('i18n/es/ está desactualizado: ejecuta node i18n/extraer.mjs');
  } else {
    errores = validarIdioma(idioma, esLeido.mapa, leido);
  }
  const n = Object.keys(leido.mapa).length;
  if (!errores.length) {
    console.log(`${idioma}: correcto (${n} claves en ${leido.archivos.length} archivos${idioma !== ORIGINAL ? ', revisión «' + leido.mapa['meta.revision'] + '»' : ''}).`);
    return true;
  }
  console.error(`${idioma}: ${errores.length} problema${errores.length === 1 ? '' : 's'}`);
  for (const e of errores.slice(0, MAX_LISTA)) console.error('  - ' + e);
  if (errores.length > MAX_LISTA) console.error(`  … y ${errores.length - MAX_LISTA} más`);
  return false;
}

function main() {
  const args = process.argv.slice(2);
  const todos = args.includes('--todos');
  const idiomas = todos ? idiomasPresentes() : args.filter((a) => !a.startsWith('--'));
  if (!idiomas.length) {
    console.error(todos ? 'No hay idiomas en i18n/.' : 'Uso: node i18n/validar.mjs <idioma> | --todos');
    process.exit(2);
  }
  const esLeido = leerIdioma(ORIGINAL);
  if (esLeido.problemas.length || !Object.keys(esLeido.mapa).length) {
    console.error('No se puede leer el texto fuente i18n/es/ (ejecuta node i18n/extraer.mjs):\n  ' + esLeido.problemas.join('\n  '));
    process.exit(1);
  }
  let ok = true;
  for (const idioma of idiomas) ok = validarCLI(idioma, esLeido) && ok;
  process.exit(ok ? 0 : 1);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
