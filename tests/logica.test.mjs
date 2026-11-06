// Tests unitarios de MesoLogic (src/app.js), sin DOM.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const L = require(join(raiz, 'src/app.js'));
const leer = (f) => JSON.parse(readFileSync(join(raiz, 'data', f), 'utf8'));

const real = L.normalizarDatos({ cientifico: leer('cientifico.json'), astronautas: leer('astronautas.json') });
const muestra = L.normalizarDatos({ cientifico: leer('muestra-cientifico.json'), astronautas: leer('muestra-astronautas.json') });

describe('normalizar y slug', () => {
  test('quita diacríticos, pasa a minúsculas y colapsa espacios', () => {
    assert.equal(L.normalizar('  Ištar   ÉNKI\tñu '), 'istar enki nu');
    assert.equal(L.normalizar('Atra-ḫasīs'), 'atra-hasis');
  });
  test('entradas no textuales', () => {
    assert.equal(L.normalizar(null), '');
    assert.equal(L.normalizar(undefined), '');
    assert.equal(L.normalizar({}), '');
    assert.equal(L.normalizar(42), '42');
    assert.equal(L.normalizar(NaN), '');
  });
  test('slug ASCII con guiones', () => {
    assert.equal(L.slug('Enki / Ea'), 'enki-ea');
    assert.equal(L.slug('  Ištar  '), 'istar');
    assert.equal(L.slug('--Sello VA 243!!'), 'sello-va-243');
    assert.equal(L.slug('𒀭'), '');
    assert.equal(L.slug(null), '');
    assert.match(L.slug('Ḫumbaba ša Ḫursag'), /^[a-z0-9]+(-[a-z0-9]+)*$/);
  });
});

describe('escaparHTML y urlSegura', () => {
  test('escapa los cinco caracteres', () => {
    assert.equal(L.escaparHTML(`<a href="x" title='y'>&</a>`), '&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;');
    assert.equal(L.escaparHTML(null), '');
    assert.equal(L.escaparHTML(5), '5');
  });
  test('solo admite http(s)', () => {
    assert.equal(L.urlSegura('https://etcsl.orinst.ox.ac.uk/'), 'https://etcsl.orinst.ox.ac.uk/');
    assert.equal(L.urlSegura('  HTTP://a.b/c  '), 'HTTP://a.b/c');
    assert.equal(L.urlSegura('javascript:alert(1)'), '');
    assert.equal(L.urlSegura('data:text/html,hola'), '');
    assert.equal(L.urlSegura('//evil.com'), '');
    assert.equal(L.urlSegura('https://a b'), '');
    assert.equal(L.urlSegura('https://'), '');
    assert.equal(L.urlSegura(null), '');
  });
});

describe('normalizarDatos', () => {
  const vacio = (d) => {
    assert.deepEqual(d.cientifico, { periodos: [], entradas: [], glosario: [] });
    assert.deepEqual(d.astronautas.autores, []);
    assert.deepEqual(d.astronautas.entradas, []);
    assert.deepEqual(d.astronautas.cronologia, []);
    assert.deepEqual(d.astronautas.metodo, { errores_frecuentes: [], por_que_atrae: '' });
  };
  test('no lanza con null, undefined, {} ni tipos raros', () => {
    for (const x of [null, undefined, {}, [], 'texto', 7, true, { cientifico: null, astronautas: 3 }]) {
      vacio(L.normalizarDatos(x));
    }
  });
  test('tolera datos malformados', () => {
    const d = L.normalizarDatos({
      cientifico: {
        periodos: [null, 5, { id: 'b', inicio: '-100', fin: -900 }, { id: 'B' }, { nombre: 'sin id' }],
        entradas: 'no es lista',
        glosario: [{ termino: '  ' }, { termino: 'Zeta', definicion: 3 }, { termino: 'Álef' }, null]
      },
      astronautas: {
        autores: [{ id: 'x', obras: [null, { titulo: '' }, { titulo: 'Libro', anio: 'nope' }] }],
        entradas: [{ id: 'e', autores: 'sitchin', afirmaciones: [{}, { afirmacion: 'a' }, 'x'] }],
        cronologia: [{ anio: 'abc' }, { anio: 2000, evento: 'b' }, { anio: '1968', evento: 'a' }],
        metodo: { errores_frecuentes: [1, '', null, 'error'] }
      }
    });
    assert.equal(d.cientifico.periodos.length, 1, 'ids duplicados (b/B) e ids vacíos se descartan');
    assert.deepEqual(d.cientifico.periodos[0], { id: 'b', nombre: 'b', inicio: -900, fin: -100, descripcion: '' }, 'inicio > fin se intercambia');
    assert.deepEqual(d.cientifico.entradas, []);
    assert.deepEqual(d.cientifico.glosario.map((g) => g.termino), ['Álef', 'Zeta'], 'glosario ordenado sin acentos');
    assert.equal(d.cientifico.glosario[1].definicion, '3');
    assert.deepEqual(d.astronautas.autores[0].obras, [{ titulo: 'Libro', anio: null }]);
    assert.deepEqual(d.astronautas.entradas[0].autores, []);
    assert.deepEqual(d.astronautas.entradas[0].afirmaciones, [{ afirmacion: 'a', replica: '', fuente_replica: '' }]);
    assert.deepEqual(d.astronautas.cronologia.map((h) => h.anio), [1968, 2000]);
    assert.deepEqual(d.astronautas.metodo.errores_frecuentes, ['1', 'error']);
  });
  test('limpia categoría, culturas, bibliografía y relaciones de una entrada', () => {
    const [e] = L.normalizarDatos({ cientifico: { entradas: [{
      id: 'Enki Ea', categoria: 'DEIDAD', culturas: ['Sumeria', 'sumeria', '', null, 'Asiria'],
      periodo: 'Ur III',
      bibliografia: [null, { titulo: 'T', url: 'javascript:x' }, { url: 'https://x.y' }, { autor: 'A', anio: '1990', url: 'https://x.y' }],
      relaciones: [null, { id: '' }, { id: 'Marduk', tipo: 3 }]
    }, { id: 'otra', categoria: 'planeta' }] } }).cientifico.entradas;
    assert.equal(e.id, 'enki-ea');
    assert.equal(e.categoria, 'deidad');
    assert.deepEqual(e.culturas, ['sumeria', 'asiria']);
    assert.equal(e.periodo, 'ur-iii');
    assert.deepEqual(e.bibliografia, [{ titulo: 'T', autor: '', anio: null, url: '' }, { titulo: '', autor: 'A', anio: 1990, url: 'https://x.y' }]);
    assert.deepEqual(e.relaciones, [{ id: 'marduk', tipo: '3' }]);
  });
  test('categoría desconocida queda vacía', () => {
    const d = L.normalizarDatos({ cientifico: { entradas: [{ id: 'x', categoria: 'planeta' }] } });
    assert.equal(d.cientifico.entradas[0].categoria, '');
  });
  test('carga los datos reales y de muestra', () => {
    assert.ok(real.cientifico.entradas.length >= 30);
    assert.ok(real.astronautas.entradas.length > 0);
    assert.equal(muestra.cientifico.entradas.length, 5);
  });
});

describe('indexarPorId', () => {
  test('mapa id → elemento e ignora basura', () => {
    const m = L.indexarPorId([{ id: 'a', v: 1 }, null, { v: 2 }, { id: '' }, { id: 'b' }]);
    assert.deepEqual(Object.keys(m).sort(), ['a', 'b']);
    assert.equal(m.a.v, 1);
    assert.deepEqual(Object.keys(L.indexarPorId(null)), []);
    assert.equal(L.indexarPorId([])['__proto__'], undefined);
  });
});

describe('búsqueda', () => {
  const porId = L.indexarPorId(real.cientifico.entradas);
  const astro = L.indexarPorId(real.astronautas.entradas);
  test('ISHTAR encuentra la entrada de Inanna/Ištar sin distinguir acentos ni mayúsculas', () => {
    const r = L.filtrarEntradas(real.cientifico.entradas, { texto: 'ISHTAR', enfoque: 'cientifico' }).map((e) => e.id);
    assert.ok(r.includes('inanna-ishtar'), r.join());
    const r2 = L.filtrarEntradas(real.cientifico.entradas, { texto: 'ištar', enfoque: 'cientifico' }).map((e) => e.id);
    assert.ok(r2.includes('inanna-ishtar'), r2.join());
    assert.ok(L.coincideTexto(porId['inanna-ishtar'], 'IŠTAR'));
  });
  test('todos los términos deben aparecer', () => {
    const e = { nombre: 'Enki', resumen: 'Dios del agua dulce' };
    assert.ok(L.coincideTexto(e, 'enki AGUA'));
    assert.ok(!L.coincideTexto(e, 'enki fuego'));
    assert.ok(L.coincideTexto(e, '   '));
    assert.ok(L.coincideTexto(e, null));
    assert.ok(L.coincideTexto(null, ''));
    assert.ok(!L.coincideTexto(null, 'x'));
  });
  test('busca en la lectura alternativa solo si se pasa', () => {
    const e = { nombre: 'Nibiru' };
    const a = { titulo_alternativo: 'El duodécimo planeta', afirmaciones: [{ afirmacion: 'órbita de 3600 años' }] };
    assert.ok(!L.coincideTexto(e, 'duodecimo'));
    assert.ok(L.coincideTexto(e, 'duodecimo', a));
    assert.ok(L.coincideTexto(e, '3600', a));
  });
  test('textoBuscable incluye detalles y culturas', () => {
    const t = L.textoBuscable({ nombre: 'X', detalles: ['Ñandú'], culturas: ['asiria'] });
    assert.match(t, /nandu/);
    assert.match(t, /asiria/);
  });
  test('el enfoque científico no busca en la lectura alternativa', () => {
    const consulta = 'sitchin';
    const cien = L.filtrarEntradas(real.cientifico.entradas, { texto: consulta, enfoque: 'cientifico' }, astro);
    const comp = L.filtrarEntradas(real.cientifico.entradas, { texto: consulta, enfoque: 'comparar' }, astro);
    assert.ok(comp.length >= cien.length);
  });
});

describe('filtrarEntradas', () => {
  const E = muestra.cientifico.entradas;
  const astro = L.indexarPorId(muestra.astronautas.entradas);
  test('sin filtros devuelve todo en el orden original y una copia', () => {
    const r = L.filtrarEntradas(E, {});
    assert.deepEqual(r.map((e) => e.id), E.map((e) => e.id));
    assert.notEqual(r, E);
    assert.deepEqual(L.filtrarEntradas(null, null), []);
    assert.deepEqual(L.filtrarEntradas([null, undefined], {}), []);
  });
  test('por categoría, cultura y periodo', () => {
    assert.deepEqual(L.filtrarEntradas(E, { categoria: 'deidad' }).map((e) => e.id), ['anunnaki', 'enki-ea']);
    assert.deepEqual(L.filtrarEntradas(E, { categoria: 'DEIDAD' }).map((e) => e.id), ['anunnaki', 'enki-ea']);
    assert.deepEqual(L.filtrarEntradas(E, { cultura: 'Acadia' }).map((e) => e.id), ['anunnaki', 'enki-ea', 'sello-va243']);
    assert.deepEqual(L.filtrarEntradas(E, { periodo: 'neoasirio' }).map((e) => e.id), ['nibiru']);
  });
  test('los filtros se combinan (intersección)', () => {
    assert.deepEqual(L.filtrarEntradas(E, { categoria: 'concepto', cultura: 'acadia' }).map((e) => e.id), ['sello-va243']);
    assert.deepEqual(L.filtrarEntradas(E, { categoria: 'concepto', cultura: 'babilonia', periodo: 'acadio' }), []);
    assert.deepEqual(L.filtrarEntradas(E, { categoria: 'deidad', cultura: 'sumeria', texto: 'ENKI' }).map((e) => e.id), ['enki-ea']);
    // Combinación sobre datos reales: el resultado combinado es subconjunto de cada filtro por separado.
    const R = real.cientifico.entradas;
    const a = new Set(L.filtrarEntradas(R, { categoria: 'deidad' }).map((e) => e.id));
    const b = new Set(L.filtrarEntradas(R, { cultura: 'asiria' }).map((e) => e.id));
    const ab = L.filtrarEntradas(R, { categoria: 'deidad', cultura: 'asiria' }).map((e) => e.id);
    assert.deepEqual(ab, R.map((e) => e.id).filter((id) => a.has(id) && b.has(id)));
  });
  test('soloConAstro', () => {
    const r = L.filtrarEntradas(E, { soloConAstro: true }, astro).map((e) => e.id);
    assert.deepEqual(r, ['anunnaki', 'nibiru', 'enuma-elish', 'sello-va243']);
  });
});

describe('contar', () => {
  test('por campo y por culturas', () => {
    const E = muestra.cientifico.entradas;
    assert.deepEqual({ ...L.contar(E, 'categoria') }, { deidad: 2, concepto: 2, mito: 1 });
    assert.equal(L.contar(E, 'culturas').acadia, 3);
    assert.deepEqual({ ...L.contar(null, 'categoria') }, {});
    assert.deepEqual({ ...L.contar([null, { categoria: '' }], 'categoria') }, {});
  });
});

describe('construirGrafo y vecinos', () => {
  const g = L.construirGrafo(muestra.cientifico.entradas);
  test('ignora ids inexistentes y autorreferencias, y une A→B con B→A', () => {
    const claves = g.aristas.map((a) => a.origen + '|' + a.destino);
    assert.ok(!claves.some((k) => k.includes('marduk-inexistente')));
    assert.ok(!g.aristas.some((a) => a.origen === a.destino));
    assert.equal(new Set(claves).size, claves.length, 'sin aristas duplicadas');
    for (const a of g.aristas) assert.ok(a.origen < a.destino);
    assert.deepEqual(claves.sort(), ['anunnaki|enki-ea', 'anunnaki|enuma-elish', 'enki-ea|enuma-elish', 'enuma-elish|nibiru', 'nibiru|sello-va243']);
    const ae = g.aristas.find((a) => a.origen === 'anunnaki' && a.destino === 'enki-ea');
    assert.deepEqual(ae.tipos, ['miembro destacado', 'pertenece a']);
  });
  test('grado coherente con las aristas', () => {
    const grado = Object.fromEntries(g.nodos.map((n) => [n.id, n.grado]));
    assert.deepEqual(grado, { anunnaki: 2, nibiru: 2, 'enuma-elish': 3, 'enki-ea': 2, 'sello-va243': 1 });
    const total = g.nodos.reduce((s, n) => s + n.grado, 0);
    assert.equal(total, 2 * g.aristas.length);
  });
  test('filtra por categorías y tolera basura', () => {
    const gd = L.construirGrafo(muestra.cientifico.entradas, { categorias: ['deidad'] });
    assert.deepEqual(gd.nodos.map((n) => n.id), ['anunnaki', 'enki-ea']);
    assert.equal(gd.aristas.length, 1);
    assert.deepEqual(L.construirGrafo(null), { nodos: [], aristas: [] });
    assert.deepEqual(L.construirGrafo([null, { id: 'a', relaciones: [null, { id: 'a' }, {}] }]).aristas, []);
  });
  test('vecinos en ambas direcciones', () => {
    assert.deepEqual(L.vecinos(g, 'nibiru').map((v) => v.id).sort(), ['enuma-elish', 'sello-va243']);
    assert.deepEqual(L.vecinos(g, 'no-existe'), []);
    assert.deepEqual(L.vecinos(null, 'x'), []);
  });
  test('grafo real: sin aristas a ids inexistentes', () => {
    const gr = L.construirGrafo(real.cientifico.entradas);
    const ids = new Set(gr.nodos.map((n) => n.id));
    for (const a of gr.aristas) assert.ok(ids.has(a.origen) && ids.has(a.destino));
  });
});

describe('aleatorio', () => {
  test('determinista y en [0, 1)', () => {
    const a = L.aleatorio(42), b = L.aleatorio(42), c = L.aleatorio(43);
    const sa = Array.from({ length: 200 }, a), sb = Array.from({ length: 200 }, b), sc = Array.from({ length: 200 }, c);
    assert.deepEqual(sa, sb);
    assert.notDeepEqual(sa, sc);
    for (const v of sa) assert.ok(v >= 0 && v < 1);
  });
  test('semillas raras no lanzan', () => {
    for (const s of [null, undefined, 'x', -1, 1e20, NaN]) {
      const v = L.aleatorio(s)();
      assert.ok(v >= 0 && v < 1);
    }
  });
});

describe('disponerGrafo', () => {
  const gr = L.construirGrafo(real.cientifico.entradas);
  test('misma semilla → mismas posiciones; distinta semilla → distintas', () => {
    const op = { ancho: 900, alto: 600, margen: 50, semilla: 7, iteraciones: 150 };
    assert.deepEqual(L.disponerGrafo(gr, op), L.disponerGrafo(gr, op));
    assert.notDeepEqual(L.disponerGrafo(gr, op), L.disponerGrafo(gr, { ...op, semilla: 8 }));
  });
  test('todo dentro de los márgenes', () => {
    for (const op of [{}, { ancho: 900, alto: 600, margen: 70 }, { ancho: 300, alto: 200, margen: 10, iteraciones: 50 }, { ancho: 720, alto: 420, margen: 0 }]) {
      const pos = L.disponerGrafo(gr, op);
      const W = op.ancho || 800, H = op.alto || 560, m = op.margen ?? 48;
      assert.equal(Object.keys(pos).length, gr.nodos.length);
      for (const [id, p] of Object.entries(pos)) {
        assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y), id);
        assert.ok(p.x >= m - 0.01 && p.x <= W - m + 0.01, `${id}.x=${p.x} fuera de [${m}, ${W - m}]`);
        assert.ok(p.y >= m - 0.01 && p.y <= H - m + 0.01, `${id}.y=${p.y} fuera de [${m}, ${H - m}]`);
      }
    }
  });
  test('casos límite: vacío, un nodo, nodos sin aristas, aristas rotas', () => {
    assert.deepEqual(L.disponerGrafo(null), {});
    assert.deepEqual(L.disponerGrafo({ nodos: [] }), {});
    const uno = L.disponerGrafo({ nodos: [{ id: 'a' }] }, { ancho: 200, alto: 100, margen: 10 });
    assert.deepEqual(uno, { a: { x: 100, y: 50 } });
    const dos = L.disponerGrafo({ nodos: [{ id: 'a' }, { id: 'b' }], aristas: [{ origen: 'a', destino: 'zz' }, { origen: 'a', destino: 'a' }] }, { iteraciones: 0 });
    assert.equal(Object.keys(dos).length, 2);
    assert.notDeepEqual(dos.a, dos.b);
  });
  test('ocupa todo el ancho y el alto útiles (lienzo apaisado)', () => {
    const W = 1180, H = 590, m = 70;
    const pos = Object.values(L.disponerGrafo(gr, { ancho: W, alto: H, margen: m }));
    const xs = pos.map((p) => p.x), ys = pos.map((p) => p.y);
    assert.ok(Math.abs(Math.min(...xs) - m) < 0.5 && Math.abs(Math.max(...xs) - (W - m)) < 0.5, 'eje x');
    assert.ok(Math.abs(Math.min(...ys) - m) < 0.5 && Math.abs(Math.max(...ys) - (H - m)) < 0.5, 'eje y');
  });
  test('los nodos no colapsan en un mismo punto', () => {
    const pos = Object.values(L.disponerGrafo(gr, { ancho: 1000, alto: 640, margen: 70 }));
    let min = Infinity;
    for (let i = 0; i < pos.length; i++) for (let j = i + 1; j < pos.length; j++) {
      min = Math.min(min, Math.hypot(pos[i].x - pos[j].x, pos[i].y - pos[j].y));
    }
    assert.ok(min > 5, `distancia mínima ${min}`);
  });
});

describe('escalaLineal y marcasEje', () => {
  test('proyecta e invierte', () => {
    const f = L.escalaLineal([-3000, -1000], [0, 200]);
    assert.equal(f(-3000), 0);
    assert.equal(f(-1000), 200);
    assert.equal(f(-2000), 100);
    assert.equal(f.invertir(50), -2500);
    assert.deepEqual(f.dominio, [-3000, -1000]);
    assert.deepEqual(f.rango, [0, 200]);
  });
  test('rango invertido y dominio degenerado', () => {
    assert.equal(L.escalaLineal([0, 10], [100, 0])(2), 80);
    assert.equal(L.escalaLineal([5, 5], [0, 100])(123), 50);
    assert.equal(L.escalaLineal([0, 10], [7, 7]).invertir(7), 5);
    const f = L.escalaLineal(null, null);
    assert.equal(f(3), 0);
  });
  test('marcas', () => {
    assert.deepEqual(L.marcasEje(-3100, -1900, 500), [-3000, -2500, -2000]);
    assert.deepEqual(L.marcasEje(-1900, -3100, 500), [-3000, -2500, -2000]);
    assert.deepEqual(L.marcasEje(0, 1000, 500), [0, 500, 1000]);
    assert.deepEqual(L.marcasEje(1, 2, 0), []);
    assert.deepEqual(L.marcasEje(1, 2, -1), []);
    assert.deepEqual(L.marcasEje(null, 2, 1), []);
    assert.ok(L.marcasEje(0, 1e9, 1).length <= 1000, 'acotado');
  });
});

describe('disponerLinea', () => {
  const solapan = (lin) => {
    const op = lin._op;
    const porCarril = {};
    for (const it of lin.items) (porCarril[it.carril] ||= []).push(it);
    for (const lista of Object.values(porCarril)) {
      lista.sort((a, b) => a.x - b.x);
      for (let i = 1; i < lista.length; i++) {
        const prev = lista[i - 1];
        const finPrev = prev.x + Math.max(prev.w, prev.etiqueta.length * op.cw);
        if (finPrev > lista[i].x) return [prev, lista[i]];
      }
    }
    return null;
  };
  test('sin solapes en un carril (incluida la etiqueta) con los periodos reales', () => {
    const items = real.cientifico.periodos.map((p) => ({ id: p.id, etiqueta: p.nombre, inicio: p.inicio, fin: p.fin }));
    const lin = L.disponerLinea(items, { pxPorAnio: 0.32, margen: 28, anchoCaracter: 7.4, separacion: 12 });
    lin._op = { cw: 7.4 };
    assert.equal(solapan(lin), null);
    assert.equal(lin.items.length, items.length);
    for (const it of lin.items) {
      assert.ok(it.x >= 28 - 0.01 && it.x + it.w <= lin.ancho - 28 + 0.01 + 4);
      assert.ok(it.carril >= 0 && it.carril < lin.carriles);
    }
  });
  test('intervalos que se solapan van a carriles distintos', () => {
    const lin = L.disponerLinea([
      { id: 'a', etiqueta: '', inicio: 0, fin: 100 },
      { id: 'b', etiqueta: '', inicio: 50, fin: 150 },
      { id: 'c', etiqueta: '', inicio: 200, fin: 210 },
      { id: 'd', etiqueta: 'una etiqueta muy larga', inicio: 215 },
      { id: 'e', etiqueta: 'x', inicio: 216 }
    ], { pxPorAnio: 1, margen: 0, separacion: 0 });
    lin._op = { cw: 7 };
    assert.equal(solapan(lin), null);
    const c = Object.fromEntries(lin.items.map((i) => [i.id, i.carril]));
    assert.notEqual(c.a, c.b);
    assert.notEqual(c.d, c.e);
  });
  test('ordena por inicio, intercambia inicio>fin y descarta inválidos', () => {
    const lin = L.disponerLinea([null, { id: 'z', inicio: 'x' }, { id: 'b', inicio: 10, fin: 0 }, { id: 'a', inicio: -5 }], {});
    assert.deepEqual(lin.items.map((i) => i.id), ['a', 'b']);
    assert.equal(lin.items[1].inicio, 0);
    assert.equal(lin.items[1].fin, 10);
    assert.ok(lin.items.every((i) => i.w >= 4), 'ancho mínimo');
  });
  test('vacío', () => {
    const lin = L.disponerLinea(null);
    assert.deepEqual(lin.items, []);
    assert.equal(lin.carriles, 0);
    assert.ok(lin.ancho >= 0);
  });
  test('aleatorio: nunca solapa', () => {
    const r = L.aleatorio(3);
    for (let k = 0; k < 30; k++) {
      const items = Array.from({ length: 25 }, (_, i) => {
        const a = Math.round(r() * 1000);
        return { id: 'i' + i, etiqueta: 'e'.repeat(Math.floor(r() * 12)), inicio: a, fin: r() < 0.3 ? undefined : a + Math.round(r() * 200) };
      });
      const lin = L.disponerLinea(items, { pxPorAnio: 0.5, anchoCaracter: 6, separacion: 4 });
      lin._op = { cw: 6 };
      assert.equal(solapan(lin), null);
    }
  });
});

describe('formatearAnio y formatearRango', () => {
  test('años', () => {
    assert.equal(L.formatearAnio(-3100), '3100 a. C.');
    assert.equal(L.formatearAnio(-3100, true), 'c. 3100 a. C.');
    assert.equal(L.formatearAnio(1968), '1968');
    assert.equal(L.formatearAnio(1968, true), '1968');
    assert.equal(L.formatearAnio(300), '300 d. C.');
    assert.equal(L.formatearAnio('-500'), '500 a. C.');
    assert.equal(L.formatearAnio(null), '');
    assert.equal(L.formatearAnio('abc'), '');
  });
  test('rangos', () => {
    assert.equal(L.formatearRango(-5500, -4000), 'c. 5500–4000 a. C.');
    assert.equal(L.formatearRango(-539, 75), 'c. 539 a. C. – 75 d. C.');
    assert.equal(L.formatearRango(null, -4000), 'c. 4000 a. C.');
    assert.equal(L.formatearRango(-4000, null), 'c. 4000 a. C.');
    assert.equal(L.formatearRango(null, null), '');
  });
});

describe('textos completos', () => {
  test('#c-<id> abre el texto completo', () => {
    assert.deepEqual(L.parsearHash('#c-enuma-elish'), { vista: 'completo', id: 'enuma-elish' });
    assert.deepEqual(L.parsearHash('#c-'), { vista: 'catalogo' });
  });
  test('normaliza data/completos.json: siete tablillas y 680 versos del Enuma Elish', () => {
    const x = L.normalizarCompletos(leer('completos.json')).find((c) => c.id === 'enuma-elish');
    assert.equal(x.tablillas.length, 7);
    assert.equal(L.contarVersos(x), 680);
    assert.ok(x.fuente_url.startsWith('https://'));
    const tipos = new Set(x.tablillas.flatMap((tb) => tb.items.map((it) => it.tipo)));
    assert.deepEqual([...tipos].sort(), ['acot', 'epilogo', 'laguna', 'verso']);
  });
  test('Gilgamesh: doce tablillas con columnas, escenas y versos sin número', () => {
    const x = L.normalizarCompletos(leer('completos.json')).find((c) => c.id === 'gilgamesh');
    assert.equal(x.tablillas.length, 12);
    assert.ok(L.contarVersos(x) > 1200);
    const items = x.tablillas.flatMap((tb) => tb.items);
    assert.ok(items.some((it) => it.tipo === 'col') && items.some((it) => it.tipo === 'sub'));
    assert.ok(items.some((it) => it.tipo === 'verso' && it.n === null));
  });
  test('descarta lo mal formado sin romperse', () => {
    assert.deepEqual(L.normalizarCompletos(null), []);
    assert.deepEqual(L.normalizarCompletos({ textos: { a: { tablillas: [{ items: [{ n: 'x' }, {}, null] }] } } }), []);
    const [x] = L.normalizarCompletos({ textos: { 'Mi Texto': { fuente_url: 'javascript:alert(1)', tablillas: [{ items: [{ n: 3, v: 'verso' }, { laguna: 'rota' }] }] } } });
    assert.equal(x.id, 'mi-texto');
    assert.equal(x.fuente_url, '');
    assert.equal(x.tablillas[0].n, 1);
    assert.equal(L.contarVersos(x), 1);
  });
});

describe('otras teorías', () => {
  test('#te-<id> abre una teoría y #teorias la lista', () => {
    assert.deepEqual(L.parsearHash('#te-luna-hueca'), { vista: 'teoria', id: 'luna-hueca' });
    assert.deepEqual(L.parsearHash('#teorias'), { vista: 'teorias' });
    assert.deepEqual(L.parsearHash('#t-enuma-elish'), { vista: 'texto', id: 'enuma-elish' });
  });
  test('normaliza data/teorias.json', () => {
    const x = L.normalizarTeorias(leer('teorias.json')).find((t) => t.id === 'luna-hueca');
    assert.equal(x.id, 'luna-hueca');
    assert.equal(x.afirmaciones.length, 4);
    assert.ok(x.afirmaciones.every((a) => ['sismologia', 'gravimetria', 'muestras', 'laser'].includes(a.evidencia)));
    assert.ok(x.hitos.every((h, i) => i === 0 || h.anio >= x.hitos[i - 1].anio));
    assert.equal(x.interior.capas.length, 5);
    assert.ok(x.prueba.valores.some((v) => v.tipo === 'medido'));
  });
  test('descarta lo mal formado', () => {
    assert.deepEqual(L.normalizarTeorias(null), []);
    const [x] = L.normalizarTeorias({ teorias: [{ id: 'X Y', afirmaciones: [{ afirmacion: 'a' }, { afirmacion: 'b', replica: 'c', evidencia: 'magia' }], interior: { radio: -1 }, enlaces_texto: [{ href: 'javascript:x', texto: 'mal' }], fuentes: [{ titulo: 't', url: 'javascript:alert(1)' }] }] });
    assert.equal(x.id, 'x-y');
    assert.equal(x.afirmaciones.length, 1);
    assert.equal(x.afirmaciones[0].evidencia, 'otra');
    assert.equal(x.interior, null);
    assert.deepEqual(x.enlaces_texto, []);
    assert.equal(x.fuentes[0].url, '');
  });
  test('pasoEscala da pasos redondos', () => {
    assert.equal(L.pasoEscala(0.4), 0.05);
    assert.equal(L.pasoEscala(3700), 500);
    assert.equal(L.pasoEscala(0), 1);
  });
  test('posicionEscala acota entre 0 y 100', () => {
    assert.equal(L.posicionEscala(0.5, 0, 1), 50);
    assert.equal(L.posicionEscala(2, 0, 1), 100);
    assert.equal(L.posicionEscala(1, 1, 1), 0);
  });
});

describe('parsearHash', () => {
  test('vistas válidas', () => {
    for (const v of L.VISTAS) assert.deepEqual(L.parsearHash('#' + v), { vista: v });
    assert.deepEqual(L.parsearHash('mapa'), { vista: 'mapa' });
  });
  test('fichas', () => {
    assert.deepEqual(L.parsearHash('#e-nibiru'), { vista: 'ficha', id: 'nibiru' });
    assert.deepEqual(L.parsearHash('#e-Enki%20Ea'), { vista: 'ficha', id: 'enki-ea' });
    assert.deepEqual(L.parsearHash('#e-I%C5%A1tar'), { vista: 'ficha', id: 'istar' });
    assert.deepEqual(L.parsearHash('#e-<script>'), { vista: 'ficha', id: 'script' });
  });
  test('entradas raras caen en el catálogo sin lanzar', () => {
    for (const h of ['', '#', '#e-', 'e-', '#%', '#%E0%A4%A', '#CATALOGO', '#mapa/extra', '##mapa', null, undefined, 42, {}, '#__proto__', '#constructor']) {
      const r = L.parsearHash(h);
      assert.equal(r.vista, 'catalogo', `hash ${String(h)} → ${JSON.stringify(r)}`);
    }
  });
  test('hash mal codificado con e- no lanza', () => {
    assert.deepEqual(L.parsearHash('#e-%E0%A4%A'), { vista: 'ficha', id: 'e0-a4-a' });
  });
});

describe('relacionesValidas', () => {
  const porId = L.indexarPorId(muestra.cientifico.entradas);
  test('quita inexistentes, autorreferencias y duplicados', () => {
    assert.deepEqual(L.relacionesValidas(porId.nibiru, porId), [{ id: 'enuma-elish', tipo: 'mencionado en' }]);
    assert.deepEqual(L.relacionesValidas(porId['sello-va243'], porId), [{ id: 'nibiru', tipo: 'asociado por Sitchin' }]);
    const e = { id: 'x', relaciones: [{ id: 'nibiru', tipo: 'a' }, { id: 'Nibiru', tipo: 'b' }, null, {}] };
    assert.deepEqual(L.relacionesValidas(e, porId), [{ id: 'nibiru', tipo: 'a' }]);
  });
  test('entradas nulas', () => {
    assert.deepEqual(L.relacionesValidas(null, null), []);
    assert.deepEqual(L.relacionesValidas({ relaciones: [{ id: 'a' }] }, null), []);
  });
});

describe('enfoqueValido', () => {
  test('acepta los tres y devuelve científico por defecto', () => {
    for (const e of L.ENFOQUES) assert.equal(L.enfoqueValido(e), e);
    for (const e of [null, undefined, '', 'Astronautas', 'otro', 1, {}]) assert.equal(L.enfoqueValido(e), 'cientifico');
  });
});
