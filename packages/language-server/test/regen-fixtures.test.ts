// One-shot regeneration of every .{postgres,mysql}.sql and .mongo.js golden from its .er.
// Gated on REGEN_GOLDENS=1 to keep `yarn test` deterministic.
//
//   REGEN_GOLDENS=1 yarn vitest run test/regen-fixtures.test.ts
//
// After running, review the diffs and run `yarn test` to confirm.

import { SQL_DIALECTS } from '@biger/common';
import { readdirSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { NodeFileSystem } from 'langium/node';
import { describe, it } from 'vitest';
import { createEntityRelationshipServices } from '../src/entity-relationship-module.js';
import { createDefaultExportService } from '../src/export/export-service.js';

const REGEN_MODE = process.env.REGEN_GOLDENS === '1';

const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const { EntityRelationship } = createEntityRelationshipServices({ ...NodeFileSystem });
const exporter = createDefaultExportService(EntityRelationship);

describe.skipIf(!REGEN_MODE)('regen-fixtures (gated)', () => {
    const erFiles = readdirSync(fixturesDir).filter((f) => f.endsWith('.er')).sort();
    for (const erFile of erFiles) {
        const stem = path.basename(erFile, '.er');
        for (const dialect of SQL_DIALECTS) {
            it(`regenerates ${stem}.${dialect}.sql`, async () => {
                const erPath = path.join(fixturesDir, erFile);
                const erContent = await readFile(erPath, 'utf-8');
                const result = await exporter.exportModel({
                    sourceUri: pathToFileURL(erPath).toString(),
                    erContent,
                    target: 'sql',
                    targetOptions: { dialect },
                });
                const outPath = path.join(fixturesDir, `${stem}.${dialect}.sql`);
                await writeFile(outPath, result.content);
            });
        }

        it(`regenerates ${stem}.mongo.js`, async () => {
            const erPath = path.join(fixturesDir, erFile);
            const erContent = await readFile(erPath, 'utf-8');
            const result = await exporter.exportModel({
                sourceUri: pathToFileURL(erPath).toString(),
                erContent,
                target: 'mongo',
            });
            const outPath = path.join(fixturesDir, `${stem}.mongo.js`);
            await writeFile(outPath, result.content);
        });
    }
});
