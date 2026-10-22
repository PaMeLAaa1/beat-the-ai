import { readdir, readFile, access } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
for (const directory of ['dist', 'scripts', 'tests']) {
  for (const name of await readdir(resolve(root, directory))) {
    if (!/\.(?:m?js)$/.test(name)) continue;
    const filename = resolve(root, directory, name);
    const result = spawnSync(process.execPath, ['--check', filename], { encoding: 'utf8' });
    if (result.status !== 0) throw new Error(result.stderr || 'Syntax check failed: ' + filename);
    const source = await readFile(filename, 'utf8');
    for (const match of source.matchAll(/from\s+['"](\.[^'"]+)['"]/g)) {
      await access(resolve(dirname(filename), match[1]));
    }
  }
}
const html = await readFile(resolve(root, 'dist/index.html'), 'utf8');
for (const match of html.matchAll(/(?:src|href)="(\.\/[^"]+)"/g)) {
  await access(resolve(root, 'dist', match[1]));
}
console.log('JavaScript syntax and local asset references verified.');
