// Integridad de los datos reales (data/cientifico.json y data/astronautas.json).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const leer = (f) => JSON.parse(readFileSync(join(raiz, 'data', f), 'utf8').replace(/^﻿/, ''));
const C = leer('cientifico.json');
const A = leer('astronautas.json');
const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const vacio = (x) => typeof x !== 'string' || x.trim() === '';
const avisar = (msg) => console.log('AVISO: ' + msg);

const idsCien = new Set(C.entradas.map((e) => e.id));

describe('ids', () => {
  for (const [nombre, lista] of [['periodos', C.periodos], ['entradas científicas', C.entradas], ['autores', A.autores], ['entradas astronautas', A.entradas]]) {
    test(`${nombre}: únicos y ASCII con guiones`, () => {
      const ids = lista.map((x) => x.id);
      const malos = ids.filter((id) => typeof id !== 'string' || !ID.test(id));
      assert.deepEqual(malos, [], 'ids no válidos');
      const dup = ids.filter((id, i) => ids.indexOf(id) !== i);
      assert.deepEqual(dup, [], 'ids duplicados');
    });
  }
});

describe('entradas científicas', () => {
  test('todo periodo existe', () => {
    const per = new Set(C.periodos.map((p) => p.id));
    const malos = C.entradas.filter((e) => !per.has(e.periodo)).map((e) => `${e.id} → ${e.periodo}`);
    assert.deepEqual(malos, []);
  });
  test('campos obligatorios no vacíos (nombre, resumen, interpretacion)', () => {
    const malos = [];
    for (const e of C.entradas) for (const k of ['nombre', 'resumen', 'interpretacion']) if (vacio(e[k])) malos.push(`${e.id}.${k}`);
    assert.deepEqual(malos, []);
  });
  test('categoría y culturas válidas', () => {
    const malos = C.entradas.filter((e) => !['mito', 'deidad', 'concepto'].includes(e.categoria)
      || !Array.isArray(e.culturas) || !e.culturas.length
      || e.culturas.some((c) => !['sumeria', 'acadia', 'babilonia', 'asiria'].includes(c))).map((e) => e.id);
    assert.deepEqual(malos, []);
  });
  test('relaciones a ids inexistentes o autorreferencias (aviso, no falla)', () => {
    const rotas = [];
    for (const e of C.entradas) for (const r of e.relaciones || []) {
      if (!r || !idsCien.has(r.id)) rotas.push(`${e.id} → ${r && r.id}`);
      else if (r.id === e.id) rotas.push(`${e.id} → sí misma`);
    }
    if (rotas.length) avisar(`${rotas.length} relaciones rotas: ${rotas.join('; ')}`);
    else console.log('Relaciones rotas: 0');
    assert.ok(true);
  });
  test('URL de la bibliografía son http(s)', () => {
    const malas = [];
    for (const e of C.entradas) for (const b of e.bibliografia || []) {
      if (b.url !== undefined && b.url !== null && b.url !== '' && !/^https?:\/\/[^\s]+$/i.test(b.url)) malas.push(`${e.id}: ${b.url}`);
    }
    assert.deepEqual(malas, []);
  });
  test('cada entrada tiene bibliografía con título o autor', () => {
    const sin = C.entradas.filter((e) => !(e.bibliografia || []).some((b) => b && (b.titulo || b.autor))).map((e) => e.id);
    if (sin.length) avisar(`entradas sin bibliografía: ${sin.join(', ')}`);
    assert.ok(true);
  });
});

describe('periodos', () => {
  test('inicio < fin, numéricos y con nombre', () => {
    const malos = C.periodos.filter((p) => typeof p.inicio !== 'number' || typeof p.fin !== 'number' || !(p.inicio < p.fin) || vacio(p.nombre))
      .map((p) => `${p.id} (${p.inicio}, ${p.fin})`);
    assert.deepEqual(malos, []);
  });
});

describe('glosario', () => {
  test('términos y definiciones no vacíos, sin duplicados', () => {
    const malos = C.glosario.filter((g) => vacio(g.termino) || vacio(g.definicion)).map((g) => g.termino);
    assert.deepEqual(malos, []);
    const t = C.glosario.map((g) => g.termino.trim().toLowerCase());
    assert.deepEqual(t.filter((x, i) => t.indexOf(x) !== i), []);
  });
});

describe('astronautas', () => {
  const autores = new Set(A.autores.map((a) => a.id));
  test('todo autor citado existe', () => {
    const malos = [];
    for (const e of A.entradas) for (const a of e.autores || []) if (!autores.has(a)) malos.push(`${e.id} → ${a}`);
    assert.deepEqual(malos, []);
  });
  test('cada entrada cita al menos un autor', () => {
    assert.deepEqual(A.entradas.filter((e) => !Array.isArray(e.autores) || !e.autores.length).map((e) => e.id), []);
  });
  test('cada entrada tiene entrada académica con el mismo id', () => {
    assert.deepEqual(A.entradas.filter((e) => !idsCien.has(e.id)).map((e) => e.id), []);
  });
  test('cada afirmación tiene replica y fuente_replica no vacías', () => {
    const malos = [];
    for (const e of A.entradas) {
      if (!Array.isArray(e.afirmaciones) || !e.afirmaciones.length) malos.push(`${e.id}: sin afirmaciones`);
      (e.afirmaciones || []).forEach((x, i) => {
        for (const k of ['afirmacion', 'replica', 'fuente_replica']) if (vacio(x && x[k])) malos.push(`${e.id}[${i}].${k}`);
      });
    }
    assert.deepEqual(malos, []);
  });
  test('interpretacion y veredicto no vacíos', () => {
    const malos = [];
    for (const e of A.entradas) for (const k of ['interpretacion', 'veredicto']) if (vacio(e[k])) malos.push(`${e.id}.${k}`);
    assert.deepEqual(malos, []);
  });
  test('autores con nombre, tesis y formación', () => {
    const malos = [];
    for (const a of A.autores) for (const k of ['nombre', 'tesis', 'formacion']) if (vacio(a[k])) malos.push(`${a.id}.${k}`);
    assert.deepEqual(malos, []);
  });
  test('autores sin entradas (aviso)', () => {
    const usados = new Set(A.entradas.flatMap((e) => e.autores || []));
    const sin = A.autores.filter((a) => !usados.has(a.id)).map((a) => a.id);
    if (sin.length) avisar(`autores no citados en ninguna entrada: ${sin.join(', ')}`);
    assert.ok(true);
  });
  test('cronología con años numéricos y evento', () => {
    assert.deepEqual(A.cronologia.filter((h) => typeof h.anio !== 'number' || vacio(h.evento)).map((h) => h.anio), []);
  });
});
