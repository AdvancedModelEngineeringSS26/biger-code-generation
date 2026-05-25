import { PGlite } from '@electric-sql/pglite';
import type { SqlEngineDriver } from './types.js';

// PGlite — Postgres compiled to WASM. In-process, no Docker, ~1-2s cold init.
// Lifecycle: one PGlite per test run; `reset()` drops + recreates `public` so
// fixtures cannot leak schema state into each other.

export class PostgresPGliteDriver implements SqlEngineDriver {
    readonly target = 'sql' as const;
    readonly dialect = 'postgres';
    private db?: PGlite;

    async init(): Promise<void> {
        this.db = await PGlite.create();
    }

    async reset(): Promise<void> {
        this.requireDb().exec('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;');
    }

    async load(sql: string): Promise<void> {
        await this.requireDb().exec(sql);
    }

    async query<Row = Record<string, unknown>>(sql: string): Promise<Row[]> {
        const result = await this.requireDb().query<Row>(sql);
        return result.rows;
    }

    async close(): Promise<void> {
        if (this.db) {
            await this.db.close();
            this.db = undefined;
        }
    }

    private requireDb(): PGlite {
        if (!this.db) throw new Error('PostgresPGliteDriver: init() not called');
        return this.db;
    }
}
