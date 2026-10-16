import { mkdir, copyFile } from 'node:fs/promises';
await mkdir(new URL('./.pages-dist/', import.meta.url), { recursive:true });
await copyFile(new URL('./worker.js', import.meta.url), new URL('./.pages-dist/_worker.js', import.meta.url));
