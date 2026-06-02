import { readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { NodeFileSystem } from 'langium/node';
import { Decimal128 } from 'mongodb';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createEntityRelationshipServices } from '../src/entity-relationship-module.js';
import { createDefaultExportService } from '../src/export/export-service.js';
import { MONGO_ENGINE, type MongoEngineDriver } from './support/engines/index.js';
import { MONGO_INSPECTOR } from './support/inspectors/index.js';
import {
    normalizeMongoShape,
    shapeFromMongoScript,
    validateMongoScript,
    type ValidityResult,
} from './support/mongo-script.js';

const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const mongoPattern = /^(.+)\.mongo\.js$/;

interface DiscoveredFixtures {
    erStems: string[];
    presentMongo: Set<string>;
}

function discoverFixtures(): DiscoveredFixtures {
    const allFiles = readdirSync(fixturesDir);
    const erStems = allFiles
        .filter((f) => f.endsWith('.er'))
        .map((f) => path.basename(f, '.er'))
        .sort();
    const presentMongo = new Set<string>();
    for (const file of allFiles) {
        const match = file.match(mongoPattern);
        if (match) presentMongo.add(match[1]);
    }
    return { erStems, presentMongo };
}

const { erStems, presentMongo } = discoverFixtures();

function fixturePair(stem: string) {
    return {
        erPath: path.join(fixturesDir, `${stem}.er`),
        mongoPath: path.join(fixturesDir, `${stem}.mongo.js`),
    };
}

const staticResults = new Map<string, ValidityResult>();
for (const stem of erStems.filter((s) => presentMongo.has(s))) {
    const { mongoPath } = fixturePair(stem);
    staticResults.set(stem, await validateMongoScript(await readFile(mongoPath, 'utf-8')));
}

function staticOk(stem: string): boolean {
    return staticResults.get(stem)?.ok ?? false;
}

const { EntityRelationship } = createEntityRelationshipServices({ ...NodeFileSystem });
const exportService = createDefaultExportService(EntityRelationship);

let mongoDriver: MongoEngineDriver | undefined;
try {
    const candidateDriver = MONGO_ENGINE();
    await candidateDriver.init();
    mongoDriver = candidateDriver;
} catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.warn(`[engine mongo] init failed — Mongo engine tests will skip:\n  ${reason}`);
}

afterAll(async () => {
    if (mongoDriver) await mongoDriver.close();
});

async function loadFixture(stem: string): Promise<void> {
    const { mongoPath } = fixturePair(stem);
    await mongoDriver!.load(await readFile(mongoPath, 'utf-8'));
}

async function expectRejects(action: () => Promise<unknown>, errorPattern: RegExp): Promise<void> {
    let error: unknown;
    try {
        await action();
    } catch (e) {
        error = e;
    }
    if (error === undefined) throw new Error('Expected MongoDB operation to be rejected but it succeeded.');
    const message = error instanceof Error ? error.message : String(error);
    if (!errorPattern.test(message)) {
        throw new Error(`MongoDB rejected with the wrong error.\n  expected: ${errorPattern}\n  got: ${message}`);
    }
}

describe('MongoExporter > fixture coverage', () => {
    it('every .er fixture has a .mongo.js spec', () => {
        const missing = erStems
            .filter((stem) => !presentMongo.has(stem))
            .map((stem) => `  ${stem}.mongo.js`);
        if (missing.length > 0) {
            throw new Error(`Missing Mongo specs (every fixture must cover MongoDB):\n${missing.join('\n')}`);
        }
    });
});

describe('MongoExporter > 1. static script validity', () => {
    for (const stem of erStems.filter((s) => presentMongo.has(s))) {
        it(`validates ${stem}.mongo.js`, () => {
            const result = staticResults.get(stem);
            if (!result) throw new Error('static pre-compute missed this fixture');
            if (!result.ok) throw new Error(result.message);
        });
    }
});

describe('MongoExporter > 2. exporter output', () => {
    for (const stem of erStems.filter((s) => presentMongo.has(s))) {
        it.skipIf(!staticOk(stem))(`exporter matches golden for ${stem}.er`, async () => {
            const { erPath, mongoPath } = fixturePair(stem);
            const [erContent, expected] = await Promise.all([
                readFile(erPath, 'utf-8'),
                readFile(mongoPath, 'utf-8'),
            ]);

            const result = await exportService.exportModel({
                sourceUri: pathToFileURL(erPath).toString(),
                erContent,
                target: 'mongo',
            });

            expect(result.content).toBe(expected);
            expect(await validateMongoScript(result.content)).toEqual({ ok: true });
        });
    }

    it('keeps at-most-one cardinality indexes when relationship attributes require a collection', async () => {
        const erContent = `
            erdiagram CardinalityWithRelationshipAttribute

            entity Author {
                authId: INT key
            }

            entity Book {
                isbn: VARCHAR(13) key
            }

            relationship Wrote {
                Author[1] -> Book[N]
                contribution: VARCHAR(40)
            }
        `;

        const result = await exportService.exportModel({
            sourceUri: pathToFileURL(path.join(fixturesDir, 'cardinality-with-relationship-attribute.er')).toString(),
            erContent,
            target: 'mongo',
        });

        const shape = await shapeFromMongoScript(result.content);
        expect(shape.collections.Wrote?.indexes).toEqual(
            expect.arrayContaining([
                {
                    keys: { authId: 1, isbn: 1 },
                    options: { name: 'Wrote_authId_isbn_unique', unique: true },
                },
                {
                    keys: { isbn: 1 },
                    options: { name: 'Wrote_isbn_unique', unique: true },
                },
            ]),
        );
    });
});

describe('MongoExporter > 3. engine', () => {
    describe.skipIf(!mongoDriver)('mongo', () => {
        beforeEach(async () => {
            await mongoDriver!.reset();
        });

        for (const stem of erStems.filter((s) => presentMongo.has(s))) {
            it.skipIf(!staticOk(stem))(`executes ${stem}.mongo.js`, async () => {
                await loadFixture(stem);
            });
        }
    });
});

describe('MongoExporter > 4. structural shape', () => {
    describe.skipIf(!mongoDriver)('mongo', () => {
        beforeEach(async () => {
            await mongoDriver!.reset();
        });

        for (const stem of erStems.filter((s) => presentMongo.has(s))) {
            it.skipIf(!staticOk(stem))(`${stem}: live validators and indexes match script`, async () => {
                const { mongoPath } = fixturePair(stem);
                const script = await readFile(mongoPath, 'utf-8');
                await mongoDriver!.load(script);

                const [expectedShape, liveShape] = await Promise.all([
                    shapeFromMongoScript(script),
                    MONGO_INSPECTOR.snapshot(mongoDriver!),
                ]);
                expect(normalizeMongoShape(liveShape)).toEqual(normalizeMongoShape(expectedShape));
            });
        }
    });
});

describe('MongoExporter > 5. behavioural', () => {
    describe.skipIf(!mongoDriver)('mongo', () => {
        beforeEach(async () => {
            await mongoDriver!.reset();
        });

        it('entity _id rejects duplicate inserts', async () => {
            await loadFixture('entity-to-table');
            const collection = mongoDriver!.db().collection('A');
            await collection.insertOne({ _id: 1 });
            await expectRejects(() => collection.insertOne({ _id: 1 }), /duplicate key/i);
        });

        it('compound key unique index rejects duplicates', async () => {
            await loadFixture('composite-pk');
            const collection = mongoDriver!.db().collection('Booking');
            await collection.insertOne({ flightId: 1, seatNumber: '1A', passengerName: 'Alice' });
            await expectRejects(
                () => collection.insertOne({ flightId: 1, seatNumber: '1A', passengerName: 'Bob' }),
                /duplicate key/i,
            );
        });

        it('validator rejects missing required fields', async () => {
            await loadFixture('attributes');
            await expectRejects(() => mongoDriver!.db().collection('A').insertOne({ _id: 1 }), /validation/i);
        });

        it('validator rejects wrong BSON types', async () => {
            await loadFixture('decimal-precision');
            await expectRejects(
                () => mongoDriver!.db().collection('Product').insertOne({ _id: 'sku-1', price: '10.00', weight: Decimal128.fromString('1.250') }),
                /validation/i,
            );
        });
    });
});
