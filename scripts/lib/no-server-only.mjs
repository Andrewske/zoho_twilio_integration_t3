// Node ESM loader hook that intercepts `import 'server-only'` and resolves
// it to an empty module. Lets CLI scripts import action modules that
// transitively pull in `~/utils/prisma` (which has `import 'server-only'`).
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve as pathResolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const EMPTY_URL = pathToFileURL(pathResolve(HERE, 'empty-module.mjs')).href;

export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'server-only') {
    return { url: EMPTY_URL, shortCircuit: true, format: 'module' };
  }
  return nextResolve(specifier, context);
}
