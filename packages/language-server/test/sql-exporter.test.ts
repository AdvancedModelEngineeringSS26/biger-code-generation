import { describe, it, expect } from 'vitest';
import { readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as path from 'node:path';
import { NodeFileSystem } from 'langium/node';
import { SQL_DIALECTS, type SqlDialect } from '@biger/common';
import { createEntityRelationshipServices } from '../src/entity-relationship-module.js';
import { createDefaultExportService } from '../src/export/export-service.js';

const { EntityRelationship } = createEntityRelationshipServices({ ...NodeFileSystem });
const exportService = createDefaultExportService(EntityRelationship);

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
        if (!match) continue;
        presentSqls.add(`${match[1]}.${match[2]}`);
    }
    return { erStems, presentSqls };
}

const { erStems, presentSqls } = discoverFixtures();

const missing: Array<{ stem: string; dialect: SqlDialect }> = [];
for (const stem of erStems) {
    for (const dialect of SQL_DIALECTS) {
        if (!presentSqls.has(`${stem}.${dialect}`)) {
            missing.push({ stem, dialect });
        }
    }
}

describe('SqlExporter > fixture coverage', () => {
    it('every .er fixture has a .<dialect>.sql for every supported dialect', () => {
        if (missing.length > 0) {
            const list = missing.map((m) => `  ${m.stem}.${m.dialect}.sql`).join('\n');
            throw new Error(
                `Missing dialect specs (every fixture must cover every supported dialect):\n${list}`
            );
        }
    });
});

for (const dialect of SQL_DIALECTS) {
    const dialectStems = erStems.filter((s) => presentSqls.has(`${s}.${dialect}`));
    if (dialectStems.length === 0) continue;
    describe(`SqlExporter > ${dialect}`, () => {
        it.each(dialectStems)('generates SQL for %s.er', async (stem) => {
            const erPath = path.join(fixturesDir, `${stem}.er`);
            const sqlPath = path.join(fixturesDir, `${stem}.${dialect}.sql`);
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
        });
    });
}
