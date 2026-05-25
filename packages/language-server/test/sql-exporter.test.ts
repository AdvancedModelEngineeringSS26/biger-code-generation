import { SQL_DIALECTS, type SqlDialect } from '@biger/common';
import { readdirSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { NodeFileSystem } from 'langium/node';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createEntityRelationshipServices } from '../src/entity-relationship-module.js';
import { createDefaultExportService } from '../src/export/export-service.js';
import { SQL_ENGINES, type SqlEngineDriver } from './support/engines/index.js';
import { SQL_INSPECTORS, formatShape, normalizeShape } from './support/inspectors/index.js';
import { validateGrammar, type ValidityResult } from './support/sql-validity.js';

// ──────────────────────────────────────────────────────────────────────────────
// Fixture discovery
// ──────────────────────────────────────────────────────────────────────────────
// Filename convention: <stem>.<dialect>.sql. Stems must not contain '.'.

const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const sqlPattern = /^(.+)\.([^.]+)\.sql$/;
const shapePattern = /^(.+)\.([^.]+)\.shape\.json$/;

interface DiscoveredFixtures {
    erStems: string[];
    presentSqls: Set<string>;
    presentShapes: Set<string>;
}

function discoverFixtures(): DiscoveredFixtures {
    const allFiles = readdirSync(fixturesDir);
    const erStems = allFiles
        .filter((f) => f.endsWith('.er'))
        .map((f) => path.basename(f, '.er'))
        .sort();
    const presentSqls = new Set<string>();
    const presentShapes = new Set<string>();
    for (const file of allFiles) {
        const sqlMatch = file.match(sqlPattern);
        if (sqlMatch) presentSqls.add(`${sqlMatch[1]}.${sqlMatch[2]}`);
        const shapeMatch = file.match(shapePattern);
        if (shapeMatch) presentShapes.add(`${shapeMatch[1]}.${shapeMatch[2]}`);
    }
    return { erStems, presentSqls, presentShapes };
}

const { erStems, presentSqls, presentShapes } = discoverFixtures();

function stemsFor(dialect: SqlDialect): string[] {
    return erStems.filter((s) => presentSqls.has(`${s}.${dialect}`));
}

function fixturePair(stem: string, dialect: SqlDialect) {
    return {
        erPath: path.join(fixturesDir, `${stem}.er`),
        sqlPath: path.join(fixturesDir, `${stem}.${dialect}.sql`),
        shapePath: path.join(fixturesDir, `${stem}.${dialect}.shape.json`)
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
        console.warn(`[engine ${dialect}] init failed — Stage 3+ will skip:\n  ${reason}`);
    }
}

// Top-level afterAll — close every driver after all describe blocks finish.
// Cannot live inside Stage 3's describe because Stages 4 and 5 share the same
// driver instances; closing per-stage would leave later stages with dead pools.
afterAll(async () => {
    for (const driver of engineDrivers.values()) {
        try {
            await driver.close();
        } catch {
            /* swallow — tests already finished, nothing to recover */
        }
    }
});

// SNAPSHOT_SHAPES=1 puts the suite in bootstrap mode: only the snapshot block
// runs, writing fresh shape JSON for every fixture. Stages 4 and 5 (which
// would otherwise read stale shape files mid-rewrite) skip cleanly.
const SNAPSHOT_MODE = process.env.SNAPSHOT_SHAPES === '1';

// ──────────────────────────────────────────────────────────────────────────────
// Stage 0 — fixture coverage
// ──────────────────────────────────────────────────────────────────────────────
// Every .er must ship a .sql AND a .shape.json for every supported dialect.
// (Skipped in SNAPSHOT_MODE — that's where the .shape.json files come from.)

describe.skipIf(SNAPSHOT_MODE)('SqlExporter > fixture coverage', () => {
    it('every .er fixture has .sql and .shape.json for every supported dialect', () => {
        const missing: string[] = [];
        for (const stem of erStems) {
            for (const dialect of SQL_DIALECTS) {
                if (!presentSqls.has(`${stem}.${dialect}`)) {
                    missing.push(`  ${stem}.${dialect}.sql`);
                }
                if (!presentShapes.has(`${stem}.${dialect}`)) {
                    missing.push(`  ${stem}.${dialect}.shape.json (run \`SNAPSHOT_SHAPES=1 yarn test\` to generate)`);
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

describe.skipIf(SNAPSHOT_MODE)('SqlExporter > 1. grammar', () => {
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

describe.skipIf(SNAPSHOT_MODE)('SqlExporter > 2. exporter output', () => {
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

describe.skipIf(SNAPSHOT_MODE)('SqlExporter > 3. engine', () => {
    for (const dialect of SQL_DIALECTS) {
        const driver = engineDrivers.get(dialect);

        describe.skipIf(!driver)(dialect, () => {
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

// ──────────────────────────────────────────────────────────────────────────────
// Stage 4 — structural assertions
// ──────────────────────────────────────────────────────────────────────────────
// Load the golden into the engine, snapshot the actual schema via
// information_schema / pg_catalog, compare against the sidecar shape JSON.
//
// The shape file is a per-dialect spec — types stay dialect-native. Cross-
// dialect equivalence is Stage 5.
//
// Skipped when (a) the engine isn't available, or (b) the inspector isn't
// registered, or (c) Stage 1 grammar failed for the fixture, or (d) the
// shape file is missing (for the bootstrap path — once shapes are committed
// Stage 0 catches missing ones up front).

describe.skipIf(SNAPSHOT_MODE)('SqlExporter > 4. structural', () => {
    for (const dialect of SQL_DIALECTS) {
        const driver = engineDrivers.get(dialect);
        const inspector = SQL_INSPECTORS[dialect];

        describe.skipIf(!driver || !inspector)(dialect, () => {
            beforeEach(async () => {
                if (driver) await driver.reset();
            });

            for (const stem of stemsFor(dialect)) {
                const grammarPasses = grammarOk(stem, dialect);
                const haveShape = presentShapes.has(`${stem}.${dialect}`);
                const skip = !grammarPasses || !haveShape;
                const reason = !grammarPasses ? '(grammar failed)' : !haveShape ? '(no shape.json)' : '';

                it.skipIf(skip)(`shape matches ${stem}.${dialect}.shape.json ${reason}`.trim(), async () => {
                    const { sqlPath, shapePath } = fixturePair(stem, dialect);
                    const sql = await readFile(sqlPath, 'utf-8');
                    await driver!.load(sql);

                    const actual = await inspector!.snapshot(driver!);
                    const expected = JSON.parse(await readFile(shapePath, 'utf-8'));
                    expect(actual).toEqual(expected);
                });
            }
        });
    }
});

// ──────────────────────────────────────────────────────────────────────────────
// Stage 5 — cross-dialect equivalence
// ──────────────────────────────────────────────────────────────────────────────
// For every fixture: load it into both engines, snapshot each shape, normalise
// dialect-specific names ("character varying" / "varchar" → "VARCHAR"), assert
// the two normalised shapes are equal.
//
// This catches dialect drift that per-dialect Stage 4 cannot — e.g. emitter
// learns UNIQUE for postgres but forgets MySQL: each per-dialect shape test
// stays green (each was updated in lockstep with its own change), but the
// equivalence test fails immediately.

describe.skipIf(SNAPSHOT_MODE)('SqlExporter > 5. cross-dialect equivalence', () => {
    const pgDriver = engineDrivers.get('postgres');
    const myDriver = engineDrivers.get('mysql');
    const pgInspector = SQL_INSPECTORS.postgres;
    const myInspector = SQL_INSPECTORS.mysql;
    const ready = pgDriver && myDriver && pgInspector && myInspector;

    describe.skipIf(!ready)('postgres ↔ mysql', () => {
        beforeEach(async () => {
            if (pgDriver) await pgDriver.reset();
            if (myDriver) await myDriver.reset();
        });

        for (const stem of erStems) {
            const ok = grammarOk(stem, 'postgres') && grammarOk(stem, 'mysql');
            it.skipIf(!ok)(`${stem}: shapes are isomorphic across dialects`, async () => {
                const { sqlPath: pgSqlPath } = fixturePair(stem, 'postgres');
                const { sqlPath: mySqlPath } = fixturePair(stem, 'mysql');
                const [pgSql, mySql] = await Promise.all([
                    readFile(pgSqlPath, 'utf-8'),
                    readFile(mySqlPath, 'utf-8'),
                ]);
                await pgDriver!.load(pgSql);
                await myDriver!.load(mySql);

                const [pgShape, myShape] = await Promise.all([
                    pgInspector!.snapshot(pgDriver!),
                    myInspector!.snapshot(myDriver!),
                ]);
                expect(normalizeShape(pgShape)).toEqual(normalizeShape(myShape));
            });
        }
    });
});

// ──────────────────────────────────────────────────────────────────────────────
// Snapshot generator (gated)
// ──────────────────────────────────────────────────────────────────────────────
// Bootstrap helper for adding a new fixture: runs the inspector against each
// fixture and writes the produced shape JSON to disk. Always skipped unless
// SNAPSHOT_SHAPES=1 — keeps `yarn test` deterministic.
//
//   yarn test                       # runs Stages 0-5, snapshot block skipped
//   SNAPSHOT_SHAPES=1 yarn test     # also writes/refreshes shape.json files
//
// After running the generator, review the diffs and commit the JSON updates.

describe.skipIf(!SNAPSHOT_MODE)('SqlExporter > snapshot-shapes (gated)', () => {
    for (const dialect of SQL_DIALECTS) {
        const driver = engineDrivers.get(dialect);
        const inspector = SQL_INSPECTORS[dialect];

        describe.skipIf(!driver || !inspector)(dialect, () => {
            beforeEach(async () => {
                if (driver) await driver.reset();
            });

            for (const stem of stemsFor(dialect)) {
                const ok = grammarOk(stem, dialect);
                it.skipIf(!ok)(`writes ${stem}.${dialect}.shape.json`, async () => {
                    const { sqlPath, shapePath } = fixturePair(stem, dialect);
                    const sql = await readFile(sqlPath, 'utf-8');
                    await driver!.load(sql);
                    const shape = await inspector!.snapshot(driver!);
                    await writeFile(shapePath, formatShape(shape));
                });
            }
        });
    }
});
