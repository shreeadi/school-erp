import 'reflect-metadata';
import { createApp } from './bootstrap.js';
import { loadConfig } from './config/env.js';

const app = await createApp();
await app.listen(loadConfig().port, '0.0.0.0');
console.log(`School ERP API listening on :${loadConfig().port} (docs at /api/docs)`);
