import { SQL_DIALECTS, type SqlDialect } from '@biger/common';
import { readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { NodeFileSystem } from 'langium/node';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createEntityRelationshipServices } from '../src/entity-relationship-module.js';
import { createDefaultExportService } from '../src/export/export-service.js';
import { SQL_ENGINES, type SqlEngineDriver } from './support/engines/index.js';
import { validateGrammar, type ValidityResult } from './support/sql-validity.js';

// ──────────────────────────────────────────────────────────────────────────────
// Fixture discovery
// ──────────────────────────────────────────────────────────────────────────────
// Filename convention: <stem>.<dialect>.sql. Stems must not contain '.'.

const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const sqlPattern = /^(.+)\.([^.]+)\.sql$/;

interface DiscoveredFixtures {
    erStems: string[];
    presentSqls: Set<string>;
}

function discoverFixtures(): DiscoveredFixtures {
    const allFiles = readdirSync(fixturesDir);
    const erStems = allFiles
        .filter((f) => f.endsWith('.er'))
        .map((f) => path.basename(f, '.er'))
        .sort();
    const presentSqls = new Set<string>();
    for (const file of allFiles) {
        const match = file.match(sqlPattern);
        if (match) presentSqls.add(`${match[1]}.${match[2]}`);
    }
    return { erStems, presentSqls };
}

const { erStems, presentSqls } = discoverFixtures();

function stemsFor(dialect: SqlDialect): string[] {
    return erStems.filter((s) => presentSqls.has(`${s}.${dialect}`));
}

function fixturePair(stem: string, dialect: SqlDialect) {
    return {
        erPath: path.join(fixturesDir, `${stem}.er`),
        sqlPath: path.join(fixturesDir, `${stem}.${dialect}.sql`)
    };
}

// ──────────────────────────────────────────────────────────────────────────────
// Pre-compute stage 1 (grammar) results
// ──────────────────────────────────────────────────────────────────────────────
// Done at module load (top-level await) so downstream stages can use skipIf at
// test-definition time — invalid fixtures skip cleanly with a message instead
// of producing a cascade of confusing secondary failures.

const grammarResults = new Map<string, ValidityResult>();
for (const dialect of SQL_DIALECTS) {
    for (const stem of stemsFor(dialect)) {
        const { sqlPath } = fixturePair(stem, dialect);
        const sql = await readFile(sqlPath, 'utf-8');
        grammarResults.set(`${stem}.${dialect}`, await validateGrammar(sql, dialect));
    }
}

function grammarOk(stem: string, dialect: SqlDialect): boolean {
    return grammarResults.get(`${stem}.${dialect}`)?.ok ?? false;
}

// ──────────────────────────────────────────────────────────────────────────────
// Shared Langium services / export service
// ──────────────────────────────────────────────────────────────────────────────

const { EntityRelationship } = createEntityRelationshipServices({ ...NodeFileSystem });
const exportService = createDefaultExportService(EntityRelationship);

// ──────────────────────────────────────────────────────────────────────────────
// Pre-probe engine drivers
// ──────────────────────────────────────────────────────────────────────────────
// Each driver's init() runs once at module load. Successful drivers are stored
// and reused across all Stage 3 tests for that dialect. Failed init (e.g. MySQL
// when Docker is unavailable) leaves the dialect absent from the map, and its
// `describe` block is skipped at definition time via `describe.skipIf`.
//
// This shape avoids the cost of init+close in a separate probe and again in
// beforeAll — particularly important for MySQL where each container start is
// several seconds.

const engineDrivers = new Map<SqlDialect, SqlEngineDriver>();
for (const dialect of SQL_DIALECTS) {
    const factory = SQL_ENGINES[dialect];
    if (!factory) continue;
    try {
        const driver = factory();
        await driver.init();
        engineDrivers.set(dialect, driver);
    } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        console.warn(`[engine ${dialect}] init failed — Stage 3 will skip:\n  ${reason}`);
    }
}

// ──────────────────────────────────────────────────────────────────────────────
// Stage 0 — fixture coverage
// ──────────────────────────────────────────────────────────────────────────────
// Every .er must ship a .sql for every supported dialect.

describe('SqlExporter > fixture coverage', () => {
    it('every .er fixture has a .<dialect>.sql for every supported dialect', () => {
        const missing: string[] = [];
        for (const stem of erStems) {
            for (const dialect of SQL_DIALECTS) {
                if (!presentSqls.has(`${stem}.${dialect}`)) {
                    missing.push(`  ${stem}.${dialect}.sql`);
                }
            }
        }
        if (missing.length > 0) {
            throw new Error(
                `Missing dialect specs (every fixture must cover every supported dialect):\n${missing.join('\n')}`
            );
        }
    });
});

// ──────────────────────────────────────────────────────────────────────────────
// Stage 1 — grammar
// ──────────────────────────────────────────────────────────────────────────────
// Parse-only validity of each golden SQL file against its dialect's parser
// (libpg-query for postgres, dt-sql-parser for mysql). Fast, pure JS, cross-OS.

describe('SqlExporter > 1. grammar', () => {
    for (const dialect of SQL_DIALECTS) {
        describe(dialect, () => {
            for (const stem of stemsFor(dialect)) {
                it(`parses ${stem}.${dialect}.sql`, () => {
                    const result = grammarResults.get(`${stem}.${dialect}`);
                    if (!result) throw new Error('grammar pre-compute missed this fixture');
                    if (!result.ok) throw new Error(result.message);
                });
            }
        });
    }
});

// ──────────────────────────────────────────────────────────────────────────────
// Stage 2 — exporter output
// ──────────────────────────────────────────────────────────────────────────────
// The exporter's emitted SQL matches the golden spec byte-for-byte AND is
// itself valid for the target dialect (defensive — catches a golden that
// happens to equal invalid exporter output).

describe('SqlExporter > 2. exporter output', () => {
    for (const dialect of SQL_DIALECTS) {
        describe(dialect, () => {
            for (const stem of stemsFor(dialect)) {
                const ok = grammarOk(stem, dialect);
                it.skipIf(!ok)(`exporter matches golden for ${stem}.er`, async () => {
                    const { erPath, sqlPath } = fixturePair(stem, dialect);
                    const [erContent, expected] = await Promise.all([
                        readFile(erPath, 'utf-8'),
                        readFile(sqlPath, 'utf-8')
                    ]);

                    const result = await exportService.exportModel({
                        sourceUri: pathToFileURL(erPath).toString(),
                        erContent,
                        target: 'sql',
                        targetOptions: { dialect }
                    });

                    expect(result.content).toBe(expected);

                    // Defensive: exporter output must also parse as valid SQL.
                    // Trivially true when the match above holds and stage 1 passed, but
                    // guards against a future divergence between golden and output.
                    const outputValidity = await validateGrammar(result.content, dialect);
                    if (!outputValidity.ok) {
                        throw new Error(
                            `Exporter output did not parse as ${dialect}:\n${outputValidity.message}`
                        );
                    }
                });
            }
        });
    }
});

// ──────────────────────────────────────────────────────────────────────────────
// Stage 3 — engine (real database)
// ──────────────────────────────────────────────────────────────────────────────
// Run each golden through a real engine for its dialect. Catches semantic
// errors the parser misses: unknown types, bad FK targets, reserved-word
// collisions, etc.
//
// Drivers come from SQL_ENGINES (test/support/engines), pre-probed above.
// A dialect missing from `engineDrivers` (no factory, or init failed) skips
// its describe block via `describe.skipIf` — no hard failures.

describe('SqlExporter > 3. engine', () => {
    for (const dialect of SQL_DIALECTS) {
        const driver = engineDrivers.get(dialect);

        describe.skipIf(!driver)(dialect, () => {
            afterAll(async () => {
                if (driver) await driver.close();
            });

            beforeEach(async () => {
                // Reset between tests — each fixture runs against a clean schema.
                if (driver) await driver.reset();
            });

            for (const stem of stemsFor(dialect)) {
                const ok = grammarOk(stem, dialect);
                it.skipIf(!ok)(`executes ${stem}.${dialect}.sql`, async () => {
                    const { sqlPath } = fixturePair(stem, dialect);
                    const sql = await readFile(sqlPath, 'utf-8');
                    await driver!.load(sql);
                });
            }
        });
    }
});
