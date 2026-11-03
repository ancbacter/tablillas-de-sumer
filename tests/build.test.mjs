// Build: node build.mjs [--muestra] y comprobaciones estáticas de dist/index.html.
// Termina dejando dist/index.html construido con los datos reales.
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(raiz, 'dist/index.html');

function construir(muestra) {
  const r = spawnSync(process.execPath, ['build.mjs', ...(muestra ? ['--muestra'] : [])], { cwd: raiz, encoding: 'utf8' });
  return { codigo: r.status, salida: r.stdout + r.stderr, html: r.status === 0 ? readFileSync(dist, 'utf8') : '' };
}

/** Contenido de cada <script> según lo partiría un navegador (cierra en el primer </script). */
function scripts(html) {
  const res = [];
  const re = /<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi;
  let m;
  while ((m = re.exec(html))) res.push(m[1]);
  return res;
}

const muestra = construir(true);
const real = construir(false);
after(() => { construir(false); });

for (const [nombre, b] of [['muestra', muestra], ['reales', real]]) {
  describe(`build con datos ${nombre}`, () => {
    test('termina con código 0', () => {
      assert.equal(b.codigo, 0, b.salida);
    });
    test('<title> en los primeros 8 KB', () => {
      const ini = Buffer.from(b.html, 'utf8').subarray(0, 8192).toString('utf8');
      assert.match(ini, /<title>[^<]+<\/title>/);
    });
    test('sin <!doctype>, <html>, <head> ni <body> propios', () => {
      assert.doesNotMatch(b.html, /<!doctype/i);
      assert.doesNotMatch(b.html, /<html[\s>]/i);
      assert.doesNotMatch(b.html, /<head[\s>]/i);
      assert.doesNotMatch(b.html, /<body[\s>]/i);
    });
    test('exactamente dos <script> y ambos son JS válido', () => {
      const s = scripts(b.html);
      assert.equal(s.length, 2, 'un </script> en los datos partiría el documento');
      // Un «<script>» literal dentro de los datos es inocuo (sin «<!--» delante); se descuenta.
      const dentro = (s[0].match(/<script\b/gi) || []).length;
      assert.equal((b.html.match(/<script\b/gi) || []).length - dentro, 2);
      assert.equal((b.html.match(/<\/script/gi) || []).length, 2);
      for (const code of s) new vm.Script(code); // lanza si hay error de sintaxis
      assert.doesNotMatch(b.html, /<!--/, 'sin comentarios HTML que puedan alterar el parseo del script');
    });
    test('los datos inyectados se recuperan intactos', () => {
      const [datos] = scripts(b.html);
      const ctx = { window: {} };
      vm.runInNewContext(datos, ctx);
      const esperado = {
        cientifico: JSON.parse(readFileSync(join(raiz, 'data', nombre === 'muestra' ? 'muestra-cientifico.json' : 'cientifico.json'), 'utf8')),
        astronautas: JSON.parse(readFileSync(join(raiz, 'data', nombre === 'muestra' ? 'muestra-astronautas.json' : 'astronautas.json'), 'utf8'))
      };
      assert.deepEqual(JSON.parse(JSON.stringify(ctx.window.__MESO_DATA__)), esperado);
      // Idiomas publicados: el castellano siempre, delante.
      assert.ok(Array.isArray(ctx.window.__MESO_IDIOMAS__));
      assert.equal(ctx.window.__MESO_IDIOMAS__[0], 'es');
    });
    test('solo orígenes externos permitidos', () => {
      const permitidos = new Set(['fonts.googleapis.com', 'fonts.gstatic.com', 'cdnjs.cloudflare.com']);
      const hosts = new Set();
      // URLs en atributos, @import y url(); se ignora el contenido de los datos (enlaces de bibliografía, que no se cargan).
      const [, app] = scripts(b.html);
      const sinDatos = b.html.replace(scripts(b.html)[0], '');
      for (const m of sinDatos.matchAll(/(?:src|href)\s*=\s*["']?(https?:)?\/\/([^/"'\s>]+)/gi)) hosts.add(m[2].toLowerCase());
      for (const m of sinDatos.matchAll(/(?:@import\s+(?:url\()?|url\()\s*["']?(?:https?:)?\/\/([^/"'\s)]+)/gi)) hosts.add(m[1].toLowerCase());
      for (const m of app.matchAll(/["'`](?:https?:)?\/\/([^/"'`\s]+)/g)) {
        if (m[1] !== 'www.w3.org') hosts.add(m[1].toLowerCase()); // espacio de nombres SVG, no se carga
      }
      for (const h of hosts) assert.ok(permitidos.has(h), `origen no permitido: ${h}`);
      assert.doesNotMatch(b.html, /<(?:link|iframe|img|object|embed)\b[^>]*\b(?:src|href)\s*=\s*["']?https?:/i);
      assert.doesNotMatch(b.html, /<script\b[^>]*\bsrc=/i);
    });
    test('sin alert(, confirm(, prompt( ni window.print', () => {
      const [, app] = scripts(b.html);
      for (const re of [/\balert\s*\(/, /\bconfirm\s*\(/, /\bprompt\s*\(/, /window\.print/]) assert.doesNotMatch(app, re);
      assert.doesNotMatch(b.html, /window\.print/);
    });
    test('colores como tokens en :root con bloques oscuros', () => {
      const css = (b.html.match(/<style>([\s\S]*?)<\/style>/) || [])[1] || '';
      assert.match(css, /:root\s*\{[^}]*--fondo\s*:/);
      const oscuroMedia = css.match(/@media\s*\(prefers-color-scheme:\s*dark\)\s*\{\s*:root:not\(\[data-theme="light"\]\)\s*\{([^}]*)\}/);
      const oscuroAttr = css.match(/:root\[data-theme="dark"\]\s*\{([^}]*)\}/);
      assert.ok(oscuroMedia, 'falta @media (prefers-color-scheme: dark) :root:not([data-theme="light"])');
      assert.ok(oscuroAttr, 'falta :root[data-theme="dark"]');
      const tokens = (bloque) => [...bloque.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]).sort();
      const claros = (css.match(/:root\s*\{([^}]*)\}/) || [])[1];
      const colores = tokens(claros).filter((t) => /#|rgb/.test(claros.split(t + ':')[1].split(';')[0]));
      assert.deepEqual(tokens(oscuroMedia[1]), tokens(oscuroAttr[1]), 'los dos bloques oscuros definen los mismos tokens');
      for (const t of colores) if (t !== '--transparente') assert.ok(tokens(oscuroMedia[1]).includes(t), `token ${t} sin valor oscuro`);
      // Fuera de :root no hay colores literales.
      const resto = css.replace(/:root[^{]*\{[^}]*\}/g, '').replace(/@import[^;]*;/g, '');
      const literales = resto.match(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/gi) || [];
      assert.deepEqual(literales, [], 'colores literales fuera de :root');
      assert.match(css, /body\s*\{[^}]*background:\s*var\(--fondo\)/);
    });
  });
}

describe('build de muestra: <script> inyectado', () => {
  test('aparece escapado dentro del bloque de datos', () => {
    const [datos] = scripts(muestra.html);
    assert.match(datos, /<script>prueba de escape<\\\/script>/);
  });
});
