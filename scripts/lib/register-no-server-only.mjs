// Registers the no-server-only loader hook via the modern register() API.
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

register('./no-server-only.mjs', import.meta.url);
