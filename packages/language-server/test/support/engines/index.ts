import type { SqlDialect } from '@biger/common';
import { MysqlContainerDriver } from './mysql-testcontainers.js';
import { PostgresPGliteDriver } from './postgres-pglite.js';
import type { SqlEngineDriver } from './types.js';

// Per-dialect SQL engine factories. Adding a dialect means adding one entry
// here and providing a driver module — Stage 3 (and future Layer 4/5) will
// pick it up automatically.
//
// `Partial<>` is intentional: a dialect listed in SQL_DIALECTS but missing
// here means "no engine yet, skip Stage 3 cleanly." A factory whose init()
// throws (e.g. MySQL when Docker is unavailable) also produces a clean skip
// at the test-file level rather than a hard failure.

export const SQL_ENGINES: Partial<Record<SqlDialect, () => SqlEngineDriver>> = {
    postgres: () => new PostgresPGliteDriver(),
    mysql: () => new MysqlContainerDriver(),
};

export type { SqlEngineDriver, EngineDriver } from './types.js';
