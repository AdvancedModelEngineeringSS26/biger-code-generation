import { SQL_DIALECTS, type SqlDialect } from '@biger/common';
import { readFile } from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeEach, describe, it } from 'vitest';
import { SQL_ENGINES, type SqlEngineDriver } from './support/engines/index.js';

// ──────────────────────────────────────────────────────────────────────────────
// Layer 5 — behavioural assertions
// ──────────────────────────────────────────────────────────────────────────────
// Layer 4 says "the constraint exists in information_schema". Layer 5 says
// "the constraint *actually rejects* the inserts it's supposed to reject."
// We don't test one case per fixture — that's wasteful. We test one case per
// constraint *class* (FK rejection, PK uniqueness, …) using whichever fixture
// best exercises that class.

const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');

// Pre-probe drivers — same pattern as sql-exporter.test.ts. Each test file
// gets its own pool; both share the MySQL container booted in globalSetup.
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
        console.warn(`[engine ${dialect}] init failed — Layer 5 will skip:\n  ${reason}`);
    }
}

afterAll(async () => {
    for (const driver of engineDrivers.values()) {
        try {
            await driver.close();
        } catch {
            /* swallow */
        }
    }
});

async function loadFixture(driver: SqlEngineDriver, stem: string): Promise<void> {
    const sql = await readFile(path.join(fixturesDir, `${stem}.${driver.dialect}.sql`), 'utf-8');
    await driver.load(sql);
}

async function expectRejects(driver: SqlEngineDriver, sql: string, errorPattern: RegExp): Promise<void> {
    let error: unknown;
    try {
        await driver.load(sql);
    } catch (e) {
        error = e;
    }
    if (error === undefined) {
        throw new Error(`Expected SQL to be rejected but it succeeded:\n  ${sql}`);
    }
    const message = error instanceof Error ? error.message : String(error);
    if (!errorPattern.test(message)) {
        throw new Error(
            `SQL was rejected but with the wrong error.\n  sql: ${sql}\n  expected: ${errorPattern}\n  got: ${message}`,
        );
    }
}

// Error patterns that match BOTH Postgres ("violates foreign key constraint")
// and MySQL ("foreign key constraint fails", "Cannot add or update a child row").
const FK_VIOLATION = /foreign key|child row/i;
const PK_DUPLICATE = /duplicate|unique/i;

describe('SqlExporter > 6. behavioural', () => {
    for (const dialect of SQL_DIALECTS) {
        const driver = engineDrivers.get(dialect);

        describe.skipIf(!driver)(dialect, () => {
            beforeEach(async () => {
                if (driver) await driver.reset();
            });

            // FK enforcement on relationships — the bridge table must reject
            // rows that point at non-existent parents.
            it('relationship bridge FK rejects orphan rows', async () => {
                await loadFixture(driver!, 'relationship');
                await driver!.load(`INSERT INTO A (id1) VALUES (1)`);
                await driver!.load(`INSERT INTO B (id2) VALUES (2)`);
                // Happy path — both parents exist.
                await driver!.load(`INSERT INTO Rel (id1, id2, attr) VALUES (1, 2, 'ok')`);
                // FK violation — parents 99/99 don't exist.
                await expectRejects(
                    driver!,
                    `INSERT INTO Rel (id1, id2, attr) VALUES (99, 99, 'bad')`,
                    FK_VIOLATION,
                );
            });

            // PK uniqueness on a plain entity — second INSERT with same key fails.
            it('plain entity PK rejects duplicate inserts', async () => {
                await loadFixture(driver!, 'relationship');
                await driver!.load(`INSERT INTO A (id1) VALUES (1)`);
                await expectRejects(driver!, `INSERT INTO A (id1) VALUES (1)`, PK_DUPLICATE);
            });

            // Inheritance FK — subclass must point at an existing parent row.
            it('inheritance FK rejects subclass row without parent', async () => {
                await loadFixture(driver!, 'inheritance');
                // No Person row inserted → Employee insert should reject.
                await expectRejects(
                    driver!,
                    `INSERT INTO Employee (id, salary) VALUES (1, 50000)`,
                    FK_VIOLATION,
                );
            });

            // Self-referential FK — Manages must point at existing Employee
            // rows on both manager and reports columns.
            it('self-ref relationship FK rejects rows with no matching employee', async () => {
                await loadFixture(driver!, 'self-ref');
                // No Employee rows yet → Manages insert should reject.
                await expectRejects(
                    driver!,
                    `INSERT INTO Manages (manager_id, reports_id) VALUES (1, 2)`,
                    FK_VIOLATION,
                );
            });

            // Multivalued child table — child row must reference existing parent.
            it('multivalued child-table FK rejects orphan rows', async () => {
                await loadFixture(driver!, 'multivalued');
                // Person row not inserted → child insert should reject.
                await expectRejects(
                    driver!,
                    `INSERT INTO Person_phoneNumber (id, phoneNumber) VALUES (1, '555-0100')`,
                    FK_VIOLATION,
                );
            });
        });
    }
});
