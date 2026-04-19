import { describe, it, expect } from 'vitest';
import { mkdtemp, readFile, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { SQL_DIALECTS, type SqlDialect } from '@biger/common';
import { runExportCli } from '../src/export/cli';

const fixtureName = 'entity-to-table';
// Cross-package read: smoke test reuses the language-server's fixtures by relative path.
// Acceptable for a 2-package repo; revisit if fixtures move or a third consumer appears.
const fixturesDir = path.join(__dirname, '..', '..', 'language-server', 'test', 'fixtures');
const fixturePath = path.join(fixturesDir, `${fixtureName}.er`);

describe('runExportCli', () => {
    it.each(SQL_DIALECTS)(
        'writes a .sql file matching the %s spec',
        async (dialect: SqlDialect) => {
            const dir = await mkdtemp(path.join(tmpdir(), 'biger-cli-'));
            try {
                const src = path.join(dir, `${fixtureName}.er`);
                await copyFile(fixturePath, src);

                await runExportCli([
                    'node',
                    'biger-export',
                    'export',
                    'sql',
                    src,
                    '--dialect',
                    dialect
                ]);

                const written = await readFile(path.join(dir, `${fixtureName}.sql`), 'utf-8');
                const golden = await readFile(
                    path.join(fixturesDir, `${fixtureName}.${dialect}.sql`),
                    'utf-8'
                );
                expect(written).toBe(golden);
            } finally {
                await rm(dir, { recursive: true, force: true });
            }
        }
    );
});
