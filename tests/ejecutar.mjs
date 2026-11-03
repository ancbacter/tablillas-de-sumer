// Uso: node tests/ejecutar.mjs
// Ejecuta todos los tests en serie (build y navegador reescriben dist/index.html)
// y deja dist/index.html construido con los datos reales.
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const aqui = dirname(fileURLToPath(import.meta.url));
const raiz = join(aqui, '..');
const archivos = ['logica', 'datos', 'build', 'navegador']
  .map((n) => `tests/${n}.test.mjs`)
  .concat(readdirSync(aqui).filter((f) => f.endsWith('.test.mjs') && !/^(logica|datos|build|navegador)\./.test(f)).map((f) => `tests/${f}`));

const r = spawnSync(process.execPath, ['--test', '--test-concurrency=1', '--test-reporter=spec', ...archivos], { cwd: raiz, stdio: 'inherit' });
const b = spawnSync(process.execPath, ['build.mjs'], { cwd: raiz, stdio: 'inherit' });
process.exit(r.status || b.status || 0);
