import type { ExportTarget } from '@biger/common';
import type { Db } from 'mongodb';

// Generic engine driver — one instance per (target, dialect). The test suite owns
// the lifecycle: init() once per run, reset() per test, close() at teardown.
//
// SQL drivers add `query()` so structural/behavioural layers can introspect.
// Future non-SQL drivers (e.g. Mongo) implement the base interface and add
// their own query shape on top.

export interface EngineDriver {
    readonly target: ExportTarget;
    readonly dialect: string;
    init(): Promise<void>;
    reset(): Promise<void>;
    load(payload: string): Promise<void>;
    close(): Promise<void>;
}

export interface SqlEngineDriver extends EngineDriver {
    readonly target: 'sql';
    query<Row = Record<string, unknown>>(sql: string): Promise<Row[]>;
}

export interface MongoEngineDriver extends EngineDriver {
    readonly target: 'mongo';
    readonly dialect: 'mongo';
    db(): Db;
}
