// Multiidioma: claves de datos, aplicación de traducciones, validación y elección de idioma.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync, mkdirSync, writeFileSync, rmSync, mkdtempSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { L, raiz, leerDatos, leerIdioma, fuenteEspanola, compararConOriginal } from '../i18n/comun.mjs';
import { validarIdioma } from '../i18n/validar.mjs';
import { trocear, grupoDe } from '../i18n/extraer.mjs';

const datos = leerDatos();
const claves = L.clavesDeDatos(datos);
const es = fuenteEspanola(datos);

describe('clavesDeDatos', () => {
  test('claves estables derivadas de los ids', () => {
    const e = datos.cientifico.entradas.find((x) => x.id === 'enuma-elish');
    assert.equal(claves['c.entradas.enuma-elish.resumen'], e.resumen);
    assert.equal(claves['c.entradas.enuma-elish.detalles.0'], e.detalles[0]);
    assert.equal(claves['c.entradas.enuma-elish.fuentes_primarias.0'], e.fuentes_primarias[0]);
    const rel = e.relaciones.find((r) => r.tipo);
    assert.equal(claves[`c.entradas.enuma-elish.relaciones.${rel.id}.tipo`], rel.tipo);
    assert.equal(claves['c.periodos.ubaid.nombre'], datos.cientifico.periodos[0].nombre);
    assert.equal(claves['c.glosario.0.termino'], datos.cientifico.glosario[0].termino);
    assert.equal(claves['c.glosario.0.definicion'], datos.cientifico.glosario[0].definicion);
    assert.equal(claves['a.autores.sitchin.formacion'], datos.astronautas.autores.find((a) => a.id === 'sitchin').formacion);
    assert.equal(claves['a.entradas.anunnaki.afirmaciones.0.replica'], datos.astronautas.entradas.find((a) => a.id === 'anunnaki').afirmaciones[0].replica);
    const hito = datos.astronautas.cronologia[0];
    assert.equal(claves[`a.cronologia.${hito.anio}-0.evento`], hito.evento);
    assert.equal(claves['a.metodo.errores_frecuentes.0'], datos.astronautas.metodo.errores_frecuentes[0]);
    assert.equal(claves['a.metodo.por_que_atrae'], datos.astronautas.metodo.por_que_atrae);
  });

  test('no incluye ids, años, URL, bibliografía, nombres de autores ni obras', () => {
    const ks = Object.keys(claves);
    assert.ok(ks.every((k) => /^[caslt]\.[a-z_]+\./.test(k)), 'prefijo c., a., l., s. o t.');
    const prohibido = /^[caslt]\.[a-z_]+\.[^.]+\.(id|anio|inicio|fin|url|categoria|culturas|periodo|autores|bibliografia|obras|nombre_autor)(\.|$)/;
    assert.deepEqual(ks.filter((k) => prohibido.test(k)), []);
    assert.ok(!ks.some((k) => /^a\.autores\.[^.]+\.nombre$/.test(k)), 'nombres de autores');
    const valores = new Set(Object.values(claves));
    for (const au of datos.astronautas.autores) for (const o of au.obras) assert.ok(!valores.has(o.titulo) || claves[`a.autores.${au.id}.tesis`] === o.titulo, o.titulo);
    // Sin cadenas vacías ni valores no textuales.
    assert.ok(Object.values(claves).every((v) => typeof v === 'string' && v.trim() !== ''));
  });

  test('años repetidos en la cronología llevan contador', () => {
    const c = L.clavesDeDatos({ astronautas: { cronologia: [{ anio: 1990, evento: 'a' }, { anio: 1990, evento: 'b' }, { anio: 'x', evento: 'c' }] } });
    assert.deepEqual(c, { 'a.cronologia.1990-0.evento': 'a', 'a.cronologia.1990-1.evento': 'b' });
  });

  test('datos malformados no rompen', () => {
    for (const x of [null, undefined, 3, 'x', [], { cientifico: { entradas: [null, 4, { id: '' }, { id: 'a', detalles: 'no' }] } }]) {
      assert.equal(typeof L.clavesDeDatos(x), 'object');
      L.aplicarTraducciones(x, { 'c.entradas.a.nombre': 'z' });
    }
  });
});

describe('aplicarTraducciones', () => {
  test('extraer → aplicar con el mapa español devuelve datos idénticos', () => {
    assert.deepEqual(L.aplicarTraducciones(datos, claves), datos);
    assert.deepEqual(L.aplicarTraducciones(datos, leerIdioma('es').mapa), datos, 'con los trozos de i18n/es/');
    assert.deepEqual(L.aplicarTraducciones(datos, {}), datos);
  });

  test('no modifica los datos originales', () => {
    const antes = JSON.stringify(datos);
    L.aplicarTraducciones(datos, { 'c.entradas.enuma-elish.resumen': 'Otro' });
    assert.equal(JSON.stringify(datos), antes);
  });

  test('un mapa parcial cae al español', () => {
    const mapa = { 'c.entradas.nibiru.nombre': 'Nibiru (EN)', 'c.glosario.0.termino': 'Cuneiform', 'a.autores.sitchin.tesis': '', 'ui.nav.mapa': 'Map' };
    const n = L.normalizarDatos(L.aplicarTraducciones(datos, mapa));
    const orig = L.normalizarDatos(datos);
    const nib = n.cientifico.entradas.find((e) => e.id === 'nibiru');
    const nibOrig = orig.cientifico.entradas.find((e) => e.id === 'nibiru');
    assert.equal(nib.nombre, 'Nibiru (EN)');
    assert.equal(nib.resumen, nibOrig.resumen, 'resumen sin traducir: castellano');
    assert.ok(n.cientifico.glosario.some((g) => g.termino === 'Cuneiform'));
    assert.equal(n.astronautas.autores.find((a) => a.id === 'sitchin').tesis, orig.astronautas.autores.find((a) => a.id === 'sitchin').tesis, 'cadena vacía: castellano');
    assert.equal(n.cientifico.entradas.length, orig.cientifico.entradas.length);
    // Interfaz: lo traducido y lo que cae al castellano.
    assert.equal(L.texto(mapa, 'ui.nav.mapa'), 'Map');
    assert.equal(L.texto(mapa, 'ui.nav.glosario'), 'Glosario');
    assert.equal(L.texto({ 'ui.nav.glosario': '  ' }, 'ui.nav.glosario'), 'Glosario');
  });
});

describe('textos de interfaz', () => {
  test('todas las claves son ui.* y tienen texto', () => {
    for (const [k, v] of Object.entries(L.TEXTOS)) {
      assert.match(k, /^ui\.[a-z_]+\.[a-z_]+$/);
      assert.ok(typeof v === 'string' && v.trim(), k);
    }
  });
  test('marcadores {x}', () => {
    assert.equal(L.texto(null, 'ui.catalogo.recuento_varios', { n: 7 }), '7 entradas');
    assert.equal(L.texto({ 'ui.catalogo.recuento_varios': '{n} entries' }, 'ui.catalogo.recuento_varios', { n: 7 }), '7 entries');
    assert.equal(L.texto(null, 'ui.catalogo.recuento_varios'), '{n} entradas', 'sin valor se deja el marcador');
    assert.deepEqual(L.marcadores('{b} y {a} y {a}'), ['{a}', '{b}']);
  });
  test('la plantilla usa claves existentes con el mismo texto en castellano', () => {
    const html = readFileSync(join(raiz, 'src/template.html'), 'utf8');
    const usos = [...html.matchAll(/<(\w+)[^>]*\bdata-i18n="([^"]+)"[^>]*>([^<]*)</g)];
    assert.ok(usos.length >= 15, `usos: ${usos.length}`);
    for (const [, , k, txt] of usos) assert.equal(L.TEXTOS[k], txt.trim(), k);
    for (const [, k] of html.matchAll(/data-i18n-aria-label="([^"]+)"/g)) assert.ok(k in L.TEXTOS, k);
    assert.match(html, /<select id="selector-idioma"/);
    assert.match(html, /<label for="selector-idioma"/);
  });
  test('fechas con la abreviatura del idioma', () => {
    assert.equal(L.formatearAnio(-3100), '3100 a. C.');
    assert.equal(L.formatearRango(-5500, -4000), 'c. 5500–4000 a. C.');
    const en = { 'ui.fecha.ac': '{n} BC', 'ui.fecha.dc': 'AD {n}', 'ui.fecha.circa': 'c. {fecha}', 'ui.fecha.rango_ac': 'c. {inicio}–{fin} BC' };
    assert.equal(L.formatearAnio(-3100, false, en), '3100 BC');
    assert.equal(L.formatearAnio(-3100, true, en), 'c. 3100 BC');
    assert.equal(L.formatearAnio(70, false, en), 'AD 70');
    assert.equal(L.formatearRango(-5500, -4000, en), 'c. 5500–4000 BC');
    assert.equal(L.formatearRango(-500, 100, en), 'c. 500 BC – AD 100');
    assert.equal(L.formatearAnio(-3100, false, { 'ui.fecha.ac': 'K.a. {n}' }), 'K.a. 3100');
  });
  test('glosario ordenado según el idioma', () => {
    const g = [{ termino: 'Zigurat' }, { termino: 'Ëa' }, { termino: 'abzu' }, { termino: 'Ñu' }, { termino: 'Nu' }];
    assert.deepEqual(L.ordenarGlosario(g, 'es').map((x) => x.termino), ['abzu', 'Ëa', 'Nu', 'Ñu', 'Zigurat']);
    assert.equal(g[0].termino, 'Zigurat', 'no modifica la lista');
  });
});

describe('idiomaPreferido', () => {
  const sop = L.IDIOMAS.map((x) => x.codigo);
  test('mapea etiquetas BCP 47 a los códigos soportados', () => {
    assert.equal(L.idiomaPreferido(['ca-ES'], sop), 'ca');
    assert.equal(L.idiomaPreferido(['ca-ES-valencia'], sop), 'ca');
    assert.equal(L.idiomaPreferido(['pt-BR', 'en'], sop), 'pt');
    assert.equal(L.idiomaPreferido(['eu-ES'], sop), 'eu');
    assert.equal(L.idiomaPreferido(['GL_es'], sop), 'gl');
    assert.equal(L.idiomaPreferido(['ast-ES'], sop), 'ast');
    assert.equal(L.idiomaPreferido(['mwl'], sop), 'mwl');
    assert.equal(L.idiomaPreferido(['oc-aranes'], sop), 'oc');
    assert.equal(L.idiomaPreferido(['en-US', 'en'], sop), 'en');
    assert.equal(L.idiomaPreferido('an-ES', sop), 'an');
  });
  test('respeta el orden y cae al castellano', () => {
    assert.equal(L.idiomaPreferido(['fr-FR', 'de', 'eu'], sop), 'eu');
    assert.equal(L.idiomaPreferido(['fr-FR', 'de'], sop), 'es');
    assert.equal(L.idiomaPreferido([], sop), 'es');
    assert.equal(L.idiomaPreferido(null, sop), 'es');
    assert.equal(L.idiomaPreferido([undefined, ''], sop), 'es');
    assert.equal(L.idiomaPreferido(['ca-ES'], ['es', 'en']), 'es', 'solo los disponibles');
  });
});

describe('texto fuente i18n/es/', () => {
  test('está al día con los datos y la interfaz', () => {
    const { mapa, problemas, archivos } = leerIdioma('es');
    assert.deepEqual(problemas, []);
    assert.deepEqual(mapa, es, 'ejecuta node i18n/extraer.mjs');
    assert.deepEqual(Object.keys(mapa), Object.keys(es), 'mismo orden');
    assert.equal(mapa['meta.revision'], 'original');
    assert.ok(archivos.length >= 2);
  });
  test('trozos de 20 KB como mucho, con nombres 01.json, 02.json…', () => {
    const dir = join(raiz, 'i18n/es');
    const archivos = readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
    archivos.forEach((f, i) => {
      assert.equal(f, String(i + 1).padStart(2, '0') + '.json');
      assert.ok(statSync(join(dir, f)).size <= 20 * 1024, `${f}: ${statSync(join(dir, f)).size} bytes`);
    });
  });
  test('trocear no separa grupos ni pierde claves', () => {
    const trozos = trocear(es, 4096);
    assert.deepEqual(Object.assign({}, ...trozos), es);
    const dondeGrupo = {};
    trozos.forEach((t, i) => Object.keys(t).forEach((k) => {
      const g = grupoDe(k);
      assert.ok(dondeGrupo[g] === undefined || dondeGrupo[g] === i, `grupo ${g} partido`);
      dondeGrupo[g] = i;
    }));
    assert.ok(Object.keys(trozos[0]).every((k) => grupoDe(k) === 'ui'), 'la interfaz va sola en el primer trozo');
  });
});

describe('validar', () => {
  const leido = (mapa) => ({ mapa, problemas: [] });
  const completo = () => ({ ...es, 'meta.revision': 'automatica' });

  test('una traducción completa es válida', () => {
    assert.deepEqual(validarIdioma('en', es, leido(completo())), []);
  });
  test('detecta claves que faltan o sobran', () => {
    const m = completo();
    delete m['ui.nav.mapa'];
    m['ui.nav.inventada'] = 'x';
    const err = validarIdioma('en', es, leido(m));
    assert.ok(err.some((e) => /falta.*ui\.nav\.mapa/.test(e)), err.join('\n'));
    assert.ok(err.some((e) => /sobra.*ui\.nav\.inventada/.test(e)), err.join('\n'));
  });
  test('detecta marcadores rotos y cadenas vacías', () => {
    const m = completo();
    m['ui.catalogo.recuento_varios'] = '{num} entries';
    m['ui.mapa.nota'] = '{aristas} links';
    m['ui.nav.mapa'] = '   ';
    const err = validarIdioma('en', es, leido(m));
    assert.ok(err.some((e) => /recuento_varios.*marcadores/.test(e)), err.join('\n'));
    assert.ok(err.some((e) => /ui\.mapa\.nota.*marcadores/.test(e)), err.join('\n'));
    assert.ok(err.some((e) => /ui\.nav\.mapa.*vacía/.test(e)), err.join('\n'));
    assert.equal(err.length, 3);
  });
  test('meta.revision y código de idioma', () => {
    assert.ok(validarIdioma('en', es, leido({ ...es })).some((e) => /meta\.revision/.test(e)), 'original no vale en una traducción');
    assert.ok(validarIdioma('fr', es, leido(completo())).some((e) => /no es un idioma/.test(e)));
    assert.deepEqual(compararConOriginal(es, es, 'es').problemas, []);
  });

  test('CLI: código de salida y JSON no válido', () => {
    // Se trabaja sobre una copia temporal (MESO_I18N_DIR): las carpetas de los traductores no se tocan.
    const tmp = mkdtempSync(join(tmpdir(), 'meso-i18n-'));
    const dir = join(tmp, 'gl');
    cpSync(join(raiz, 'i18n/es'), join(tmp, 'es'), { recursive: true });
    const correr = (...a) => spawnSync(process.execPath, ['i18n/validar.mjs', ...a], { cwd: raiz, encoding: 'utf8', env: { ...process.env, MESO_I18N_DIR: tmp } });
    try {
      assert.equal(correr('es').status, 0);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, '01.json'), JSON.stringify({ ...es, 'meta.revision': 'revisada' }), 'utf8');
      const ok = correr('gl');
      assert.equal(ok.status, 0, ok.stdout + ok.stderr);
      writeFileSync(join(dir, '02.json'), '{ "ui.nav.mapa": "Mapa", ', 'utf8');
      const mal = correr('--todos');
      assert.notEqual(mal.status, 0);
      assert.match(mal.stderr, /02\.json: JSON no válido/);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
