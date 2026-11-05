// Prueba en Chrome/Edge headless (CDP) sobre dist/index.html con los datos reales.
// La página es un fragmento sin <!doctype>/<head> (el host lo envuelve al publicar); aquí se envuelve igual,
// con doctype, charset UTF-8 y viewport. Se sirve dist/ por HTTP: fetch('i18n/<idioma>.json') no funciona en file://.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve, sep } from 'node:path';
import { buscarNavegador, lanzar } from './cdp.mjs';

const aqui = dirname(fileURLToPath(import.meta.url));
const raiz = join(aqui, '..');
const capturas = join(aqui, 'capturas');
const ruta = buscarNavegador();
const VISTAS = ['catalogo', 'textos', 't-enuma-elish', 'cronologia', 'mapa', 'actual', 'asiriologos', 'as-lambert', 'autores', 'glosario', 'e-nibiru'];
const idsTextos = JSON.parse(readFileSync(join(raiz, 'data/textos.json'), 'utf8')).textos.map((x) => x.id);

const envolver = (frag) => '<!doctype html>\n<html lang="es">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n</head>\n<body>\n' + frag + '\n</body>\n</html>\n';
/** Huella (nombre, tamaño y fecha de cada archivo) de i18n/<idioma>/, para comprobar que los tests no la tocan. */
const huella = (d) => readdirSync(join(raiz, 'i18n', d)).sort().map((f) => { const st = statSync(join(raiz, 'i18n', d, f)); return f + ':' + st.size + ':' + st.mtimeMs; });
const huellas = Object.fromEntries(readdirSync(join(raiz, 'i18n')).filter((d) => statSync(join(raiz, 'i18n', d)).isDirectory()).map((d) => [d, huella(d)]));
const TIPOS = { '.html': 'text/html; charset=utf-8', '.json': 'application/json; charset=utf-8' };

/**
 * Servidor HTTP mínimo: «/» e «/index.html» sirven dist/index.html envuelto (leído en cada petición),
 * «/muestra.html» la copia de muestra y el resto, archivos de dist/ sin salir de la carpeta.
 */
// Traducciones de prueba servidas desde memoria: los tests nunca escriben en i18n/<idioma>/.
// idiomas: lista que se fuerza en window.__MESO_IDIOMAS__; mapas: idioma → objeto (null = 404).
const prueba = { idiomas: null, mapas: {} };
function servir(muestraHTML) {
  const dist = join(raiz, 'dist');
  const srv = createServer((req, res) => {
    const enviar = (codigo, cuerpo, tipo) => { res.writeHead(codigo, { 'content-type': tipo, 'cache-control': 'no-store' }); res.end(cuerpo); };
    let r;
    try { r = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { return enviar(400, 'mal', 'text/plain'); }
    if (r === '/' || r === '/index.html') {
      let html = readFileSync(join(dist, 'index.html'), 'utf8');
      if (prueba.idiomas) html = html.replace(/window\.__MESO_IDIOMAS__ =[^;]*;/, () => 'window.__MESO_IDIOMAS__ = ' + JSON.stringify(prueba.idiomas) + ';');
      return enviar(200, envolver(html), TIPOS['.html']);
    }
    const m = /^\/i18n\/([a-z]+)\.json$/.exec(r);
    if (m && m[1] in prueba.mapas) return prueba.mapas[m[1]] ? enviar(200, JSON.stringify(prueba.mapas[m[1]]), TIPOS['.json']) : enviar(404, 'no encontrado', 'text/plain');
    if (r === '/muestra.html') return enviar(200, muestraHTML, TIPOS['.html']);
    const archivo = resolve(dist, '.' + r);
    if (!archivo.startsWith(dist + sep) || !existsSync(archivo)) return enviar(404, 'no encontrado', 'text/plain');
    enviar(200, readFileSync(archivo), TIPOS[archivo.slice(archivo.lastIndexOf('.'))] || 'application/octet-stream');
  });
  return new Promise((ok) => srv.listen(0, '127.0.0.1', () => ok(srv)));
}

describe('navegador', { skip: ruta ? false : 'no se encontró Chrome ni Edge' }, () => {
  let nav, pag, url, urlMuestra, servidor;
  const errores = [];
  const avisosRed = [];

  async function abrir(u, { ancho = 1280, alto = 900, oscuro = false, enfoque = 'cientifico', idioma = 'es' } = {}) {
    await pag.s('Emulation.setDeviceMetricsOverride', { width: ancho, height: alto, deviceScaleFactor: 1, mobile: false });
    await pag.s('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: oscuro ? 'dark' : 'light' }, { name: 'prefers-reduced-motion', value: 'reduce' }] });
    const carga = pag.evento('Page.loadEventFired');
    await pag.s('Page.navigate', { url: 'about:blank' });
    await carga.catch(() => {});
    // El enfoque y el idioma se guardan en localStorage; se fijan antes de cargar la página.
    const carga2 = pag.evento('Page.loadEventFired');
    await pag.s('Page.navigate', { url: u });
    await carga2;
    await pag.evaluar(`(() => { try { localStorage.setItem('meso.enfoque', ${JSON.stringify(enfoque)}); localStorage.setItem('meso.idioma', ${JSON.stringify(idioma)}); } catch (e) {} })()`);
    const carga3 = pag.evento('Page.loadEventFired');
    await pag.s('Page.reload', { ignoreCache: true });
    await carga3;
    await pag.evaluar(`Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 3000))]).then(() => true)`);
  }
  const irA = (v) => pag.evaluar(`new Promise(r => { location.hash = '#${v}'; requestAnimationFrame(() => requestAnimationFrame(() => r(true))); })`);
  async function captura(nombre, altoMax = 2400) {
    const { width, height } = await pag.evaluar(`({ width: document.documentElement.clientWidth, height: Math.min(document.documentElement.scrollHeight, ${altoMax}) })`);
    const { data } = await pag.s('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width, height, scale: 1 } });
    writeFileSync(join(capturas, nombre + '.png'), Buffer.from(data, 'base64'));
  }

  before(async () => {
    // dist/index.html con los datos reales (y una copia con la muestra para el caso del <script> inyectado).
    const b1 = spawnSync(process.execPath, ['build.mjs', '--muestra'], { cwd: raiz, encoding: 'utf8' });
    assert.equal(b1.status, 0, b1.stderr);
    const muestraHTML = envolver(readFileSync(join(raiz, 'dist/index.html'), 'utf8'));
    const b2 = spawnSync(process.execPath, ['build.mjs'], { cwd: raiz, encoding: 'utf8' });
    assert.equal(b2.status, 0, b2.stderr);
    servidor = await servir(muestraHTML);
    const base = `http://127.0.0.1:${servidor.address().port}/`;
    url = base + 'index.html';
    urlMuestra = base + 'muestra.html';
    mkdirSync(capturas, { recursive: true });
    nav = await lanzar(ruta);
    pag = await nav.nuevaPagina();
    // Recoge errores de consola y excepciones.
    pag.eventos.length = 0;
    const revisar = setInterval(() => {
      for (const m of pag.eventos.splice(0)) {
        if (m.method === 'Runtime.exceptionThrown') errores.push('excepción: ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
        else if (m.method === 'Runtime.consoleAPICalled' && (m.params.type === 'error' || m.params.type === 'assert')) errores.push('console.' + m.params.type + ': ' + m.params.args.map((a) => a.value ?? a.description).join(' '));
        else if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') {
          const e = m.params.entry;
          // Las fuentes de Google pueden fallar sin red: aviso, no error de la página.
          if (e.source === 'network' && /fonts\.(googleapis|gstatic)\.com/.test(e.url || e.text)) avisosRed.push(e.text);
          else errores.push(`log ${e.source}: ${e.text} ${e.url || ''}`);
        }
      }
    }, 20);
    after(() => clearInterval(revisar));
  });

  after(async () => {
    if (avisosRed.length) console.log('AVISO: fuentes externas no cargadas (¿sin red?): ' + avisosRed.length);
    if (nav) await nav.cerrar();
    if (servidor) await new Promise((ok) => servidor.close(ok));
  });

  test('cada vista se muestra y no hay errores en consola', async () => {
    await abrir(url);
    for (const v of VISTAS) {
      await irA(v);
      const r = await pag.evaluar(`(() => {
        const vista = document.getElementById('vista');
        const h2 = vista.querySelector('h2');
        return { h2: h2 ? h2.textContent : null, alto: vista.getBoundingClientRect().height, hijos: vista.children.length,
                 actual: (document.querySelector('.nav a[aria-current="page"]') || {}).textContent || null, titulo: document.title };
      })()`);
      assert.ok(r.h2, `${v}: sin encabezado`);
      assert.ok(r.alto > 100, `${v}: vista vacía (alto ${r.alto})`);
      assert.doesNotMatch(r.h2, /no encontrada/i, v);
      assert.match(r.titulo, /Tablillas de Sumer/);
      if (v === 'e-nibiru') assert.match(r.h2, /^Nibiru/);
    }
    await irA('catalogo');
    const tarjetas = await pag.evaluar(`document.querySelectorAll('#resultados .tarjeta').length`);
    assert.ok(tarjetas >= 30, `tarjetas: ${tarjetas}`);
    await irA('mapa');
    const mapa = await pag.evaluar(`({ nodos: document.querySelectorAll('.grafo .nodo').length, aristas: document.querySelectorAll('.grafo .arista').length,
      nan: [...document.querySelectorAll('.grafo [x],.grafo [cx],.grafo [x1]')].some(e => /NaN/.test(e.outerHTML)) })`);
    assert.ok(mapa.nodos >= 30 && mapa.aristas > 0, JSON.stringify(mapa));
    assert.equal(mapa.nan, false);
    // Etiquetas del mapa que se pisan (se informa; falla solo si son muchas) y etiquetas que se salen del lienzo.
    const etq = await pag.evaluar(`(() => {
      const svg = document.querySelector('.grafo').getBoundingClientRect();
      const b = [...document.querySelectorAll('.grafo .nodo-txt')].map(t => t.getBoundingClientRect());
      let pisan = 0;
      for (let i = 0; i < b.length; i++) for (let j = i + 1; j < b.length; j++) {
        const ox = Math.min(b[i].right, b[j].right) - Math.max(b[i].left, b[j].left);
        const oy = Math.min(b[i].bottom, b[j].bottom) - Math.max(b[i].top, b[j].top);
        if (ox > 2 && oy > 2) pisan++;
      }
      const fuera = b.filter(r => r.left < svg.left - 1 || r.right > svg.right + 1).length;
      return { pisan, fuera, total: b.length };
    })()`);
    console.log(`Mapa a 1280 px: ${etq.pisan} pares de etiquetas solapados de ${etq.total} etiquetas`);
    assert.equal(etq.fuera, 0, 'etiquetas cortadas por el borde del mapa');
    assert.ok(etq.pisan <= 12, `demasiadas etiquetas solapadas: ${etq.pisan}`);
    await irA('cronologia');
    const cron = await pag.evaluar(`({ barras: document.querySelectorAll('.periodo .barra').length, hitos: document.querySelectorAll('.hito').length })`);
    assert.ok(cron.barras >= 5 && cron.hitos > 0, JSON.stringify(cron));
    assert.deepEqual(errores, []);
  });

  for (const enfoque of ['astronautas', 'comparar']) {
    test(`enfoque «${enfoque}» muestra el aviso de teoría sin respaldo`, async () => {
      await abrir(url, { enfoque });
      const leer = () => pag.evaluar(`(() => {
        const g = document.getElementById('aviso-global');
        const visible = g && !g.hidden && g.getBoundingClientRect().height > 0;
        return { visible, texto: g ? g.textContent : '', marcado: document.getElementById('enfoque-${enfoque}').checked,
                 avisosVista: document.querySelectorAll('#vista .aviso').length, replicas: document.querySelectorAll('#vista .replica').length };
      })()`);
      let r = await leer();
      assert.ok(r.visible, 'aviso global oculto');
      assert.match(r.texto, /sin respaldo académico/i);
      assert.ok(r.marcado);
      await irA('e-nibiru');
      r = await leer();
      assert.ok(r.visible);
      assert.ok(r.avisosVista >= 1, 'la ficha no muestra el aviso en la columna marginal');
      assert.ok(r.replicas >= 1, 'la ficha no muestra réplicas');
      if (enfoque === 'comparar') assert.equal(await pag.evaluar(`document.querySelectorAll('#vista .comparar > .columna').length`), 3, 'académica, alternativa y actual');
      // Volver al enfoque científico oculta el aviso.
      await pag.evaluar(`document.getElementById('enfoque-cientifico').click()`);
      assert.equal(await pag.evaluar(`document.getElementById('aviso-global').hidden`), true);
      assert.deepEqual(errores, []);
    });
  }

  test('con el enfoque científico no hay aviso global', async () => {
    await abrir(url);
    assert.equal(await pag.evaluar(`document.getElementById('aviso-global').hidden`), true);
    await pag.evaluar(`document.getElementById('enfoque-astronautas').click()`);
    assert.equal(await pag.evaluar(`document.getElementById('aviso-global').hidden`), false);
  });

  test('a 400 px no hay desbordamiento horizontal en ninguna vista', async () => {
    for (const enfoque of ['cientifico', 'comparar', 'actual']) {
      await abrir(url, { ancho: 400, alto: 860, enfoque });
      for (const v of VISTAS) {
        await irA(v);
        const r = await pag.evaluar(`(() => {
          const malos = [];
          for (const el of document.querySelectorAll('#app *')) {
            if (el.closest('.desliza') && !el.classList.contains('desliza')) continue; // dentro de un desplazable
            const b = el.getBoundingClientRect();
            if (b.width && b.right > 400.5) malos.push((el.id ? '#' + el.id : el.tagName.toLowerCase() + '.' + [...el.classList].join('.')) + ' → ' + Math.round(b.right));
          }
          return { sw: document.documentElement.scrollWidth, bw: document.body.scrollWidth, malos: malos.slice(0, 8) };
        })()`);
        assert.ok(r.sw <= 400, `${enfoque} #${v}: scrollWidth ${r.sw}`);
        assert.deepEqual(r.malos, [], `${enfoque} #${v}: elementos que se salen`);
      }
    }
    assert.deepEqual(errores, []);
  });

  test('el tema oscuro cambia el fondo', async () => {
    const fondo = () => pag.evaluar(`getComputedStyle(document.body).backgroundColor`);
    await abrir(url);
    const claro = await fondo();
    await abrir(url, { oscuro: true });
    const oscuro = await fondo();
    assert.notEqual(claro, oscuro);
    const lum = (c) => { const [r, g, b] = c.match(/\d+/g).map(Number); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
    assert.ok(lum(oscuro) < 60 && lum(claro) > 180, `claro ${claro}, oscuro ${oscuro}`);
    // data-theme="light" fuerza el claro aunque el sistema sea oscuro; data-theme="dark" fuerza el oscuro.
    assert.equal(await pag.evaluar(`document.documentElement.setAttribute('data-theme','light'), getComputedStyle(document.body).backgroundColor`), claro);
    await abrir(url);
    assert.equal(await pag.evaluar(`document.documentElement.setAttribute('data-theme','dark'), getComputedStyle(document.body).backgroundColor`), oscuro);
  });

  test('pulsar un filtro de categoría cambia el número de tarjetas', async () => {
    await abrir(url);
    const n = () => pag.evaluar(`document.querySelectorAll('#resultados .tarjeta').length`);
    const total = await n();
    const porCat = {};
    for (const c of ['mito', 'deidad', 'concepto']) {
      await pag.evaluar(`document.getElementById('cat-${c}').click()`);
      porCat[c] = await n();
      assert.ok(porCat[c] > 0 && porCat[c] < total, `${c}: ${porCat[c]} de ${total}`);
      assert.equal(await pag.evaluar(`document.getElementById('cat-${c}').getAttribute('aria-pressed')`), 'true');
      assert.equal(await pag.evaluar(`document.getElementById('recuento').textContent`), porCat[c] + ' entradas');
    }
    assert.equal(porCat.mito + porCat.deidad + porCat.concepto, total);
    // Se combina con la búsqueda.
    await pag.evaluar(`document.getElementById('cat-deidad').click()`);
    await pag.evaluar(`(() => { const b = document.getElementById('buscar'); b.value = 'ISHTAR'; b.dispatchEvent(new Event('input')); })()`);
    const conTexto = await n();
    assert.ok(conTexto >= 1 && conTexto < porCat.deidad, `deidad + ISHTAR: ${conTexto}`);
    await pag.evaluar(`document.getElementById('cat-todas').click()`);
    assert.ok(await pag.evaluar(`[...document.querySelectorAll('#resultados .tarjeta')].some(t => t.getAttribute('href') === '#e-inanna-ishtar')`));
    assert.deepEqual(errores, []);
  });

  test('muestra: el <script> inyectado se ve como texto y no se ejecuta', async () => {
    await abrir(urlMuestra, { enfoque: 'comparar' });
    await irA('e-sello-va243');
    const r = await pag.evaluar(`({ texto: (document.querySelector('.veredicto') || {}).textContent || '',
      scripts: document.querySelectorAll('#app script').length, totalScripts: document.scripts.length })`);
    assert.match(r.texto, /<script>prueba de escape<\/script>/);
    assert.equal(r.scripts, 0);
    assert.equal(r.totalScripts, 2);
    // Ficha inexistente y autor desconocido no rompen nada.
    await irA('e-no-existe');
    assert.match(await pag.evaluar(`document.querySelector('#vista h2').textContent`), /no encontrada/);
    await irA('autores');
    await irA('mapa');
    assert.deepEqual(errores, []);
  });

  test('el h2 enfocado por código: sin anillo tras un clic, con anillo con el teclado', async () => {
    await abrir(url);
    const foco = () => pag.evaluar(`new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => {
      const a = document.activeElement; r({ tag: a.tagName, outline: getComputedStyle(a).outlineStyle, hash: location.hash });
    })))`);
    // Clic de ratón en «Glosario».
    const { x, y } = await pag.evaluar(`(() => { const b = document.querySelector('.nav a[data-vista="glosario"]').getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; })()`);
    for (const type of ['mousePressed', 'mouseReleased']) await pag.s('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
    let r = await foco();
    assert.equal(r.hash, '#glosario');
    assert.equal(r.tag, 'H2');
    assert.equal(r.outline, 'none', 'anillo tras un clic');
    // Intro sobre «Mapa» con el teclado.
    await pag.evaluar(`document.querySelector('.nav a[data-vista="mapa"]').focus()`);
    await pag.s('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' });
    await pag.s('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    r = await foco();
    assert.equal(r.hash, '#mapa');
    assert.equal(r.tag, 'H2');
    assert.equal(r.outline, 'solid', 'sin anillo con el teclado');
  });

  test('idioma: cambia a «en», conserva la vista y cae al castellano en lo no traducido', async () => {
    // Traducción de prueba servida desde memoria (no se toca i18n/en/): meta, tres claves de interfaz y una entrada.
    prueba.idiomas = ['es', 'en'];
    prueba.mapas.en = {
      'meta.revision': 'automatica',
      'ui.sitio.titulo': 'Tablets of Sumer',
      'ui.nav.catalogo': 'Catalogue',
      'ui.fecha.rango_ac': 'c. {inicio}–{fin} BC',
      'c.entradas.nibiru.nombre': 'Nibiru (the crossing)',
      't.textos.enuma-elish.titulo': 'Enuma Elish (EN)'
    };
    try {
      await abrir(url, { enfoque: 'comparar' });
      await irA('e-nibiru');
      const leer = () => pag.evaluar(`(() => ({
        lang: document.documentElement.lang, titulo: document.title, hash: location.hash,
        h2: document.querySelector('#vista h2').textContent,
        nav: document.querySelector('.nav a[data-vista="catalogo"]').textContent,
        h3: [...document.querySelectorAll('#vista .academica h3')].map(x => x.textContent),
        periodo: (document.getElementById('ficha-periodo') || {}).textContent || '',
        columnas: document.querySelectorAll('#vista .comparar > .columna').length,
        comparar: document.getElementById('enfoque-comparar').checked,
        aviso: !document.getElementById('aviso-traduccion').hidden && document.getElementById('aviso-idioma').getBoundingClientRect().height > 0,
        opciones: [...document.querySelectorAll('#selector-idioma option')].map(o => o.value),
        placeholder: document.getElementById('buscar').placeholder
      }))()`);
      const esperarLang = (l) => pag.evaluar(`new Promise((ok, mal) => { const t0 = Date.now(); (function mirar() {
        if (document.documentElement.lang === ${JSON.stringify(l)}) return requestAnimationFrame(() => ok(true));
        if (Date.now() - t0 > 5000) return mal(new Error('lang sigue siendo ' + document.documentElement.lang));
        setTimeout(mirar, 20); })(); })`);

      const antes = await leer();
      assert.equal(antes.lang, 'es');
      assert.deepEqual(antes.opciones, ['es', 'en']);
      assert.equal(antes.aviso, false);
      assert.match(antes.h2, /^Nibiru/);
      assert.equal(antes.placeholder, 'Enki, diluvio, Nibiru…');
      assert.equal(await pag.evaluar(`document.querySelector('label[for="selector-idioma"]').textContent`), 'Idioma');

      await pag.evaluar(`(() => { const s = document.getElementById('selector-idioma'); s.value = 'en'; s.dispatchEvent(new Event('change')); })()`);
      await esperarLang('en');
      const en = await leer();
      assert.equal(en.h2, 'Nibiru (the crossing)', 'entrada traducida');
      assert.equal(en.nav, 'Catalogue', 'texto de interfaz traducido');
      assert.match(en.titulo, /Nibiru \(the crossing\) · Tablets of Sumer/);
      assert.equal(en.hash, '#e-nibiru', 'conserva la ficha abierta');
      assert.ok(en.comparar && en.columnas === 3, 'conserva el enfoque');
      assert.ok(en.h3.includes('Resumen'), 'clave sin traducir: castellano');
      if (antes.periodo) assert.match(en.periodo, /BC\)$/, en.periodo);
      assert.ok(en.aviso, 'aviso de traducción automática visible');
      // Los textos se traducen con las mismas claves.
      await irA('t-enuma-elish');
      assert.equal(await pag.evaluar(`document.querySelector('#vista h2').textContent`), 'Enuma Elish (EN)');
      await irA('e-nibiru');

      // La elección se recuerda al recargar.
      const carga = pag.evento('Page.loadEventFired');
      await pag.s('Page.reload', {});
      await carga;
      await esperarLang('en');
      assert.equal((await leer()).nav, 'Catalogue');

      // Volver al castellano lo restaura todo.
      await pag.evaluar(`(() => { const s = document.getElementById('selector-idioma'); s.value = 'es'; s.dispatchEvent(new Event('change')); })()`);
      await esperarLang('es');
      const vuelta = await leer();
      assert.equal(vuelta.h2, antes.h2);
      assert.equal(vuelta.nav, 'Catálogo');
      assert.equal(vuelta.aviso, false);
      assert.match(vuelta.titulo, /Tablillas de Sumer/);
      assert.deepEqual(errores, []);

      // Si la traducción no se puede descargar: aviso discreto y la página sigue en castellano.
      prueba.mapas.en = null;
      await abrir(url);
      await pag.evaluar(`(() => { const s = document.getElementById('selector-idioma'); s.value = 'en'; s.dispatchEvent(new Event('change')); })()`);
      const fallo = await pag.evaluar(`new Promise((ok) => { const t0 = Date.now(); (function mirar() {
        const e = document.getElementById('aviso-idioma-error');
        if (!e.hidden || Date.now() - t0 > 5000) return ok({ visible: !e.hidden && e.getBoundingClientRect().height > 0, texto: e.textContent,
          lang: document.documentElement.lang, valor: document.getElementById('selector-idioma').value,
          nav: document.querySelector('.nav a[data-vista="catalogo"]').textContent });
        setTimeout(mirar, 20); })(); })`);
      assert.ok(fallo.visible, 'aviso de error de carga');
      assert.match(fallo.texto, /No se ha podido cargar/);
      assert.equal(fallo.lang, 'es');
      assert.equal(fallo.valor, 'es', 'el selector vuelve al idioma actual');
      assert.equal(fallo.nav, 'Catálogo');
      await new Promise((r) => setTimeout(r, 100));
      // El 404 se registra en la consola; es el error esperado.
      const ajenos = errores.filter((e) => !/404|Not Found/i.test(e));
      errores.length = 0;
      assert.deepEqual(ajenos, []);
    } finally {
      prueba.idiomas = null;
      prueba.mapas = {};
    }
  });

  test('las traducciones reales publicadas se cargan', async () => {
    const publicados = await (async () => { await abrir(url); return pag.evaluar(`[...document.querySelectorAll('#selector-idioma option')].map(o => o.value)`); })();
    const otro = publicados.find((c) => c !== 'es');
    if (!otro) return; // sin traducciones publicadas
    await abrir(url, { idioma: otro });
    const r = await pag.evaluar(`new Promise((ok) => { const t0 = Date.now(); (function mirar() {
      if (document.documentElement.lang !== 'es' || Date.now() - t0 > 5000) return ok({ lang: document.documentElement.lang, nav: document.querySelector('.nav a[data-vista="glosario"]').textContent });
      setTimeout(mirar, 20); })(); })`);
    assert.equal(r.lang, otro);
    assert.ok(r.nav.trim(), 'navegación con texto');
    assert.deepEqual(errores, []);
  });

  test('#textos lista los textos y #t-<id> es un lector con índice, tipos y lecturas', async () => {
    await abrir(url);
    await irA('textos');
    const lista = await pag.evaluar(`[...document.querySelectorAll('#vista .texto-tarjeta')].map(a => a.getAttribute('href'))`);
    assert.deepEqual(lista, idsTextos.map((id) => '#t-' + id));
    await irA('t-enuma-elish');
    const r = await pag.evaluar(`(() => ({
      h2: document.querySelector('#vista h2').textContent,
      estructura: document.querySelectorAll('#indice .estructura li').length,
      indice: document.querySelectorAll('#indice .boton-indice').length,
      pasajes: document.querySelectorAll('#vista .pasaje').length,
      tipos: [...document.querySelectorAll('#vista .pasaje-cab .tipo-pasaje')].map(x => x.textContent),
      fuentes: [...document.querySelectorAll('#vista .pasaje')].every(p => p.querySelector('.pasaje-fuente')),
      pestanas: [...document.querySelectorAll('#vista .pasaje')].map(p => [...p.querySelectorAll('[role=tab]')].map(t => t.id.split('-tab-')[1])),
      seleccion: [...document.querySelectorAll('#vista [role=tab][aria-selected=true]')].map(t => t.id.split('-tab-')[1]),
      visibles: document.querySelectorAll('#vista [role=tabpanel]:not([hidden])').length,
      abierto: document.getElementById('indice').open
    }))()`);
    assert.match(r.h2, /Enuma/);
    assert.ok(r.estructura > 0 && r.indice === r.pasajes && r.pasajes > 0, JSON.stringify(r));
    assert.ok(r.tipos.length === r.pasajes && r.tipos.every((x) => ['Traducción (dominio público)', 'Cita breve', 'Paráfrasis'].includes(x)), r.tipos.join());
    assert.ok(r.fuentes, 'cada pasaje muestra su fuente');
    assert.ok(r.abierto, 'en escritorio el índice está desplegado');
    // Solo hay pestañas de las lecturas que existen (lectura_actual null → sin pestaña).
    const datos = JSON.parse(readFileSync(join(raiz, 'data/textos.json'), 'utf8')).textos.find((x) => x.id === 'enuma-elish');
    datos.pasajes.forEach((p, i) => {
      const esperadas = [p.nota_academica && 'cientifico', p.lectura_astronauta && 'astronautas', p.lectura_actual && 'actual'].filter(Boolean);
      assert.deepEqual(r.pestanas[i], esperadas, `pasaje ${i}`);
    });
    assert.ok(r.seleccion.every((x) => x === 'cientifico'), 'con el enfoque académico se abre la nota académica');
    assert.equal(r.visibles, r.pasajes, 'un panel visible por pasaje');
    // Teclado en las pestañas: flecha derecha pasa a la siguiente lectura.
    await pag.evaluar(`document.getElementById('p0-tab-cientifico').focus()`);
    await pag.s('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 });
    await pag.s('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 });
    const tras = await pag.evaluar(`({ activo: document.activeElement.id, panel: !document.getElementById('p0-panel-astronautas').hidden,
      aviso: !!document.querySelector('#p0-panel-astronautas .aviso'), replica: !!document.querySelector('#p0-panel-astronautas .replica') })`);
    assert.deepEqual(tras, { activo: 'p0-tab-astronautas', panel: true, aviso: true, replica: true });
    // Comparar: todas las lecturas en columnas, sin pestañas; el astronauta siempre con aviso y réplica.
    await pag.evaluar(`document.getElementById('enfoque-comparar').click()`);
    const comp = await pag.evaluar(`(() => ({
      pestanas: document.querySelectorAll('#vista [role=tab]').length,
      columnas: [...document.querySelectorAll('#vista .pasaje')].map(p => p.querySelectorAll('.lecturas-comparar > .lectura').length),
      astro: [...document.querySelectorAll('#vista .lectura.astro')].every(l => l.querySelector('.aviso') && l.querySelector('.replica'))
    }))()`);
    assert.equal(comp.pestanas, 0);
    assert.deepEqual(comp.columnas, r.pestanas.map((x) => x.length));
    assert.ok(comp.astro, 'toda lectura astronauta lleva aviso y réplica');
    // Enlace desde la ficha y texto inexistente.
    await irA('e-enuma-elish');
    assert.equal(await pag.evaluar(`(document.getElementById('leer-texto') || {}).getAttribute && document.getElementById('leer-texto').getAttribute('href')`), '#t-enuma-elish');
    await irA('t-no-existe');
    assert.match(await pag.evaluar(`document.querySelector('#vista h2').textContent`), /no encontrado/);
    assert.deepEqual(errores, []);
  });

  test('#actual: corrientes, hallazgos, recepción filtrable y etiqueta de Sitchin', async () => {
    await abrir(url);
    await irA('actual');
    const datos = JSON.parse(readFileSync(join(raiz, 'data/actual.json'), 'utf8'));
    const r = await pag.evaluar(`(() => ({
      corrientes: document.querySelectorAll('#vista .corriente').length,
      hallazgos: document.querySelectorAll('#vista .linea-hitos > li').length,
      puntos: document.querySelectorAll('#vista .regla-punto').length,
      obras: document.querySelectorAll('#recepcion-lista .obra').length,
      sitchin: document.querySelectorAll('#recepcion-lista .obra.con-sitchin .sello-sitchin').length,
      sinSello: [...document.querySelectorAll('#recepcion-lista .obra:not(.con-sitchin)')].some(o => o.querySelector('.sello-sitchin'))
    }))()`);
    assert.equal(r.corrientes, datos.corrientes.length);
    assert.equal(r.hallazgos, datos.hallazgos.length);
    assert.equal(r.puntos, datos.hallazgos.length);
    assert.equal(r.obras, datos.recepcion.length);
    assert.equal(r.sitchin, datos.recepcion.filter((o) => o.influencia_sitchin).length);
    assert.equal(r.sinSello, false);
    const n = (tipo) => datos.recepcion.filter((o) => o.tipo === tipo).length;
    for (const tipo of ['videojuego', 'serie']) {
      await pag.evaluar(`document.getElementById('rec-${tipo}').click()`);
      assert.equal(await pag.evaluar(`document.querySelectorAll('#recepcion-lista .obra').length`), n(tipo), tipo);
      assert.equal(await pag.evaluar(`document.getElementById('rec-${tipo}').getAttribute('aria-pressed')`), 'true');
    }
    await pag.evaluar(`document.getElementById('rec-todas').click()`);
    assert.equal(await pag.evaluar(`document.querySelectorAll('#recepcion-lista .obra').length`), datos.recepcion.length);
    // Selector de enfoque oculto aquí: no cambia la vista.
    assert.equal(await pag.evaluar(`document.getElementById('contexto').hidden`), true);
    assert.deepEqual(errores, []);
  });

  test('#asiriologos agrupa por etapa, #as-<id> señala al autor y la ficha muestra especialistas', async () => {
    await abrir(url);
    await irA('asiriologos');
    const datos = JSON.parse(readFileSync(join(raiz, 'data/asiriologos.json'), 'utf8'));
    const r = await pag.evaluar(`(() => ({
      autores: document.querySelectorAll('#vista .asiriologo').length,
      etapas: [...document.querySelectorAll('#vista section.etapa')].map(s => s.className.match(/etapa-(\\w+)/)[1]),
      hitos: document.querySelectorAll('#vista .linea-hitos > li').length,
      nav: (document.querySelector('.nav a[aria-current="page"]') || {}).getAttribute('data-vista'),
      sub: (document.querySelector('.subnav [aria-current="page"]') || {}).getAttribute('href')
    }))()`);
    assert.equal(r.autores, datos.autores.length);
    assert.deepEqual(r.etapas, ['desciframiento', 'clasica', 'actual', 'espana', 'critica'].filter((e) => datos.autores.some((a) => a.etapa === e)));
    assert.equal(r.hitos, datos.hitos.length);
    assert.equal(r.nav, 'autores');
    assert.equal(r.sub, '#asiriologos');
    await irA('as-lambert');
    const d = await pag.evaluar(`({ foco: document.activeElement.id, destacado: !!document.querySelector('#asiriologo-lambert.destacado'),
      visible: (() => { const b = document.getElementById('asiriologo-lambert').getBoundingClientRect(); return b.top >= 0 && b.top < innerHeight; })() })`);
    assert.deepEqual(d, { foco: 'asiriologo-lambert', destacado: true, visible: true });
    await irA('e-enuma-elish');
    const esp = await pag.evaluar(`[...document.querySelectorAll('#vista .especialistas a')].map(a => a.getAttribute('href'))`);
    assert.deepEqual(esp.sort(), datos.autores.filter((a) => a.entradas.includes('enuma-elish')).map((a) => '#as-' + a.id).sort());
    await irA('autores');
    assert.equal(await pag.evaluar(`document.querySelector('.subnav [aria-current="page"]').getAttribute('href')`), '#autores');
    assert.deepEqual(errores, []);
  });

  test('atajo «/» enfoca el buscador desde cualquier vista; Escribir en un campo no lo dispara', async () => {
    await abrir(url);
    await irA('mapa');
    const pulsar = async () => {
      await pag.s('Input.dispatchKeyEvent', { type: 'keyDown', key: '/', code: 'Slash', windowsVirtualKeyCode: 191, text: '/' });
      await pag.s('Input.dispatchKeyEvent', { type: 'keyUp', key: '/', code: 'Slash', windowsVirtualKeyCode: 191 });
      return pag.evaluar(`new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r({ hash: location.hash, activo: document.activeElement.id, valor: document.getElementById('buscar').value }))))`);
    };
    await pag.evaluar(`document.body.focus()`);
    let r = await pulsar();
    assert.deepEqual(r, { hash: '#catalogo', activo: 'buscar', valor: '' });
    r = await pulsar();
    assert.equal(r.valor, '/', 'dentro del buscador «/» se escribe');
    assert.deepEqual(errores, []);
  });

  test('móvil: la navegación es un menú compacto', async () => {
    await abrir(url, { ancho: 400, alto: 860 });
    const estadoMenu = () => pag.evaluar(`({ expandido: document.getElementById('menu-boton').getAttribute('aria-expanded'),
      visible: document.querySelector('.nav a[data-vista="glosario"]').getBoundingClientRect().height > 0,
      boton: document.getElementById('menu-boton').getBoundingClientRect().width > 0 })`);
    assert.deepEqual(await estadoMenu(), { expandido: 'false', visible: false, boton: true });
    await pag.evaluar(`document.getElementById('menu-boton').click()`);
    assert.deepEqual(await estadoMenu(), { expandido: 'true', visible: true, boton: true });
    await pag.evaluar(`document.querySelector('.nav a[data-vista="glosario"]').click()`);
    await pag.evaluar(`new Promise(r => setTimeout(r, 50))`);
    assert.equal(await pag.evaluar(`location.hash`), '#glosario');
    assert.deepEqual(await estadoMenu(), { expandido: 'false', visible: false, boton: true });
    assert.deepEqual(errores, []);
  });

  test('las carpetas de los traductores no se modifican', () => {
    // Los tests anteriores no deben haber escrito en i18n/<idioma>/ (salvo es, que genera extraer.mjs).
    for (const d of readdirSync(join(raiz, 'i18n'))) {
      if (d === 'es' || !statSync(join(raiz, 'i18n', d)).isDirectory()) continue;
      const antes = huellas[d];
      assert.deepEqual(huella(d), antes, `i18n/${d}/ ha cambiado durante los tests`);
    }
  });

  test('capturas a 1280 y 400 px, en claro y en oscuro', async () => {
    for (const oscuro of [false, true]) {
      for (const ancho of [1280, 400]) {
        const tema = oscuro ? 'oscuro' : 'claro';
        const alto = ancho === 400 ? 860 : 900;
        await abrir(url, { ancho, alto, oscuro, enfoque: 'cientifico' });
        await captura(`catalogo-${ancho}-${tema}`);
        for (const v of ['cronologia', 'mapa', 'glosario', 'textos', 'actual', 'asiriologos']) { await irA(v); await captura(`${v}-${ancho}-${tema}`); }
        await abrir(url, { ancho, alto, oscuro, enfoque: 'comparar' });
        await irA('e-nibiru');
        await captura(`ficha-nibiru-comparar-${ancho}-${tema}`, 3200);
        await irA('t-enuma-elish');
        await captura(`texto-enuma-comparar-${ancho}-${tema}`, 3200);
        await irA('autores');
        await captura(`autores-${ancho}-${tema}`);
        await abrir(url, { ancho, alto, oscuro, enfoque: 'actual' });
        await captura(`catalogo-actual-${ancho}-${tema}`, 1600);
        await irA('t-enuma-elish');
        await captura(`texto-enuma-actual-${ancho}-${tema}`, 2400);
        await irA('c-enuma-elish');
        await captura(`completo-enuma-${ancho}-${tema}`, 3200);
        await irA('c-gilgamesh');
        await captura(`completo-gilgamesh-${ancho}-${tema}`, 3200);
      }
    }
    assert.deepEqual(errores, []);
  });

  test('#c-enuma-elish: texto completo con sus siete tablillas, notas y lagunas', async () => {
    await abrir(url, { ancho: 1280, alto: 900 });
    await irA('t-enuma-elish');
    assert.equal(await pag.evaluar(`document.querySelector('#leer-completo').getAttribute('href')`), '#c-enuma-elish');
    await irA('c-enuma-elish');
    const r = await pag.evaluar(`({
      h2: document.querySelector('#vista h2').textContent,
      tablillas: document.querySelectorAll('#vista section.tablilla').length,
      versos: document.querySelectorAll('#vista .verso').length,
      lagunas: document.querySelectorAll('#vista .laguna').length,
      notas: document.querySelectorAll('#vista .notas-tablilla li').length,
      llamadas: document.querySelectorAll('#vista .llamada').length,
      indice: document.querySelectorAll('#vista .indice-pasajes button').length,
      aviso: !!document.querySelector('.aviso-solo-es'),
      enfoque: document.getElementById('contexto') ? document.getElementById('contexto').hidden : true,
      actual: document.querySelector('.nav a[aria-current="page"]').getAttribute('data-vista')
    })`);
    assert.equal(r.h2, 'Enuma Elish');
    assert.equal(r.tablillas, 7);
    assert.equal(r.versos, 680);
    assert.equal(r.indice, 7);
    assert.ok(r.lagunas >= 10, 'lagunas: ' + r.lagunas);
    assert.equal(r.notas, r.llamadas);
    assert.ok(r.notas > 20);
    assert.equal(r.aviso, false, 'en castellano no hay aviso de idioma');
    assert.equal(r.enfoque, true, 'el selector de enfoque no se muestra en el texto completo');
    assert.equal(r.actual, 'textos');
    // El índice lleva a la tablilla y la llamada de nota a su nota
    await pag.evaluar(`document.getElementById('ir-tablilla-4').click()`);
    assert.equal(await pag.evaluar(`document.activeElement.id`), 'tablilla-4-tit');
    await pag.evaluar(`document.querySelector('#tablilla-4 .llamada').click()`);
    assert.match(await pag.evaluar(`document.activeElement.id`), /^tablilla-4-nota-\d+$/);
    // A 400 px no se sale nada
    await abrir(url, { ancho: 400, alto: 860 });
    await irA('c-enuma-elish');
    assert.ok(await pag.evaluar(`document.documentElement.scrollWidth`) <= 400);
    assert.deepEqual(errores, []);
  });

  test('#c-gilgamesh: doce tablillas con columnas y escenas', async () => {
    await abrir(url, { ancho: 1280, alto: 900 });
    await irA('t-gilgamesh');
    assert.equal(await pag.evaluar(`document.querySelector('#leer-completo').getAttribute('href')`), '#c-gilgamesh');
    await irA('c-gilgamesh');
    const r = await pag.evaluar(`({
      tablillas: document.querySelectorAll('#vista section.tablilla').length,
      columnas: document.querySelectorAll('#vista .columna-tablilla').length,
      escenas: document.querySelectorAll('#vista .subtitulo-escena').length,
      llamadas: document.querySelectorAll('#vista .llamada').length,
      notas: document.querySelectorAll('#vista .notas-tablilla li').length,
      ids: [...document.querySelectorAll('#vista [id]')].map((e) => e.id)
    })`);
    assert.equal(r.tablillas, 12);
    assert.ok(r.columnas > 40 && r.escenas > 30, JSON.stringify(r).slice(0, 80));
    assert.equal(r.notas, r.llamadas);
    assert.equal(new Set(r.ids).size, r.ids.length, 'ids repetidos');
    // Todos los versos empiezan en la misma columna, tengan número o no
    const lefts = await pag.evaluar(`(() => {
      const res = {};
      for (const p of [...document.querySelectorAll('#tablilla-1 .verso')].slice(0, 12)) {
        const t = p.querySelector('.verso-t'); const rg = document.createRange(); rg.selectNodeContents(t);
        res[p.id] = Math.round(rg.getClientRects()[0].left);
      }
      return res;
    })()`);
    const primeras = new Set(Object.values(lefts));
    assert.equal(primeras.size, 1, 'versos desalineados: ' + JSON.stringify(lefts));
    await pag.evaluar(`document.querySelector('#tablilla-11 .llamada').click()`);
    assert.match(await pag.evaluar(`document.activeElement.id`), /^tablilla-11-nota-\d+$/);
    assert.deepEqual(errores, []);
  });

  test('#c-…: en otro idioma avisa de que el texto completo está en castellano; id desconocido', async () => {
    await abrir(url, { ancho: 1280, alto: 900, idioma: 'en' });
    await irA('c-enuma-elish');
    const r = await pag.evaluar(`({ aviso: (document.querySelector('.aviso-solo-es') || {}).textContent || '', lang: document.querySelector('.lector-cuerpo').getAttribute('lang'), primero: document.querySelector('.verso-t').textContent })`);
    assert.match(r.aviso, /Spanish/);
    assert.equal(r.lang, 'es');
    assert.match(r.primero, /^Cuando en lo alto/);
    await irA('c-no-existe');
    assert.match(await pag.evaluar(`document.querySelector('#vista').textContent`), /no-existe/);
  });
});
