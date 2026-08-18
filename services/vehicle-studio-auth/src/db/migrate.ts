// Runs the schema (idempotent — CREATE TABLE IF NOT EXISTS). Safe to run any time.
import { config } from '../config';
import { SqliteStore } from './sqlite';

new SqliteStore(config.databaseUrl);
console.log(`[vst-auth] migrations applied to ${config.databaseUrl}`);
