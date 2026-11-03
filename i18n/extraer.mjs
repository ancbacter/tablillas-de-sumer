// Uso: node i18n/extraer.mjs
// Genera el texto fuente en castellano (i18n/es/01.json, 02.json…): objetos planos {clave: texto}
// con la interfaz (ui.*), los datos (c.*, a.*, l.*, s.*, t.*) y meta.revision. Borra antes los trozos anteriores.
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { dirI18n, fuenteEspanola, leerDatos, ORIGINAL } from './comun.mjs';

export const TAM_MAXIMO = 18 * 1024;

/**
 * Grupo de una clave: no se parte entre trozos (una entrada, un periodo, una sección de la interfaz…).
 * En los textos (t.*) cada pasaje es un grupo, porque un texto entero puede pasar del tamaño de un trozo.
 */
export function grupoDe(clave) {
  const p = clave.split('.');
  if (p[0] === 'meta' || p[0] === 'ui') return 'ui';
  if (p[0] === 't' && p[3] === 'pasajes' && p.length > 5) return p.slice(0, 5).join('.');
  return p.slice(0, 3).join('.');
}

/**
 * Conjuntos de datos añadidos en la versión 2 (lecturas actuales, asiriólogos, textos): cada uno empieza
 * en un trozo nuevo, así los trozos anteriores (los que ya tienen los traductores) no cambian de límites.
 */
export const CONJUNTOS_APARTE = ['l', 's', 't'];
const conjunto = (g) => g.split('.')[0];

const serializar = (o) => JSON.stringify(o, null, 2) + '\n';
const bytes = (o) => Buffer.byteLength(serializar(o), 'utf8');

/**
 * Reparte un mapa plano en trozos de hasta `tam` bytes sin separar un grupo.
 * La interfaz (meta + ui.*) va siempre sola en el primer trozo.
 */
export function trocear(mapa, tam = TAM_MAXIMO) {
  const grupos = [];
  for (const [k, v] of Object.entries(mapa)) {
    const g = grupoDe(k);
    if (!grupos.length || grupos[grupos.length - 1].g !== g) grupos.push({ g, claves: {} });
    grupos[grupos.length - 1].claves[k] = v;
  }
  const trozos = [];
  let actual = null;
  for (const { g, claves } of grupos) {
    const aparte = CONJUNTOS_APARTE.includes(conjunto(g)) && actual && actual.conjunto !== conjunto(g);
    const nuevo = !actual || g === 'ui' || actual.ui || aparte || bytes({ ...actual.claves, ...claves }) > tam;
    if (nuevo) { actual = { ui: g === 'ui', conjunto: conjunto(g), claves: {} }; trozos.push(actual); }
    Object.assign(actual.claves, claves);
  }
  return trozos.map((x) => x.claves);
}

/** Prefijo común legible de las claves de un trozo («c.entradas.enuma-elish … c.entradas.gilgamesh»). */
export function describirTrozo(claves) {
  const ks = Object.keys(claves);
  const primero = grupoDe(ks[0]), ultimo = grupoDe(ks[ks.length - 1]);
  if (primero === 'ui') return 'meta.revision + ui.*';
  return primero === ultimo ? primero : `${primero} … ${ultimo}`;
}

function main() {
  const fuente = fuenteEspanola(leerDatos());
  const trozos = trocear(fuente);
  const dir = join(dirI18n, ORIGINAL);
  mkdirSync(dir, { recursive: true });
  for (const f of readdirSync(dir)) if (f.endsWith('.json')) rmSync(join(dir, f));
  let total = 0;
  const filas = trozos.map((claves, i) => {
    const nombre = String(i + 1).padStart(2, '0') + '.json';
    const texto = serializar(claves);
    writeFileSync(join(dir, nombre), texto, 'utf8');
    const b = Buffer.byteLength(texto, 'utf8');
    total += b;
    return `  ${nombre}  ${String(Object.keys(claves).length).padStart(4)} claves  ${(b / 1024).toFixed(1).padStart(5)} KB  ${describirTrozo(claves)}`;
  });
  const soloTexto = Object.values(fuente).reduce((n, v) => n + Buffer.byteLength(v, 'utf8'), 0);
  console.log(`i18n/${ORIGINAL}/: ${Object.keys(fuente).length} claves en ${trozos.length} trozos, ${(total / 1024).toFixed(1)} KB en disco (${(soloTexto / 1024).toFixed(1)} KB de texto).`);
  console.log(filas.join('\n'));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
