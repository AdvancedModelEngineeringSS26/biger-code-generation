import type { SqlDialect } from '@biger/common';
import { readFile } from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { NodeFileSystem } from 'langium/node';
import { describe, expect, it } from 'vitest';
import { createEntityRelationshipServices } from '../../src/entity-relationship-module.js';
import { createDefaultExportService } from '../../src/export/export-service.js';

const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');
const { EntityRelationship } = createEntityRelationshipServices({ ...NodeFileSystem });
const exportService = createDefaultExportService(EntityRelationship);

const TYPE_MAPPING_ER = `
erdiagram TypeMapping

entity A {
    id: INT key
    score: DOUBLE
    price: DECIMAL
    name: VARCHAR
    created_at: TIMESTAMP
    active: BOOLEAN
}
`;

describe('export datatype mapping configuration', () => {
    it('keeps default SQL and Mongo exports unchanged when no config is present', async () => {
        const stem = 'dialect-types';
        const erPath = path.join(fixturesDir, `${stem}.er`);
        const [erContent, expectedSql, expectedMongo] = await Promise.all([
            readFile(erPath, 'utf-8'),
            readFile(path.join(fixturesDir, `${stem}.postgres.sql`), 'utf-8'),
            readFile(path.join(fixturesDir, `${stem}.mongo.js`), 'utf-8'),
        ]);

        const sql = await exportService.exportModel({
            sourceUri: pathToFileURL(erPath).toString(),
            erContent,
            target: 'sql',
            targetOptions: { dialect: 'postgres' },
        });
        const mongo = await exportService.exportModel({
            sourceUri: pathToFileURL(erPath).toString(),
            erContent,
            target: 'mongo',
        });

        expect(sql.content).toBe(expectedSql);
        expect(mongo.content).toBe(expectedMongo);
    });

    it('applies SQL exact datatype overrides before built-in dialect mappings', async () => {
        const sql = await exportSql('postgres', {
            typeMappings: {
                sql: {
                    postgres: {
                        types: {
                            int: 'BIGINT',
                            double: 'REAL',
                        },
                    },
                },
            },
        });

        expect(sql).toContain('    id BIGINT,');
        expect(sql).toContain('    score REAL NOT NULL,');
    });

    it('applies SQL type family overrides before built-in dialect mappings', async () => {
        const sql = await exportSql('postgres', {
            typeMappings: {
                sql: {
                    postgres: {
                        typeFamilies: {
                            integer: 'BIGINT',
                            double: 'REAL',
                            decimal: 'NUMERIC(38, 8)',
                            string: 'TEXT',
                            date: 'TIMESTAMPTZ',
                            boolean: 'BOOL',
                        },
                    },
                },
            },
        });

        expect(sql).toContain('    id BIGINT,');
        expect(sql).toContain('    score REAL NOT NULL,');
        expect(sql).toContain('    price NUMERIC(38, 8) NOT NULL,');
        expect(sql).toContain('    name TEXT NOT NULL,');
        expect(sql).toContain('    created_at TIMESTAMPTZ NOT NULL,');
        expect(sql).toContain('    active BOOL NOT NULL,');
    });

    it('does not leak SQL overrides into other dialects', async () => {
        const exportConfig = {
            typeMappings: {
                sql: {
                    postgres: {
                        types: {
                            int: 'BIGINT',
                        },
                    },
                },
            },
        };

        const postgres = await exportSql('postgres', exportConfig);
        const mysql = await exportSql('mysql', exportConfig);

        expect(postgres).toContain('    id BIGINT,');
        expect(mysql).toContain('    id INT,');
        expect(mysql).not.toContain('    id BIGINT,');
    });

    it('applies Mongo BSON exact and type family overrides', async () => {
        const mongo = await exportMongo({
            typeMappings: {
                mongo: {
                    typeFamilies: {
                        integer: 'long',
                        double: 'decimal',
                    },
                    types: {
                        decimal: 'double',
                    },
                },
            },
        });

        expect(mongo).toMatch(/_id: \{\s+bsonType: "long"\s+\}/);
        expect(mongo).toMatch(/score: \{\s+bsonType: "decimal"\s+\}/);
        expect(mongo).toMatch(/price: \{\s+bsonType: "double"\s+\}/);
    });

    it('falls back safely for invalid or partial config', async () => {
        const malformedConfig = {
            typeMappings: {
                sql: {
                    postgres: {
                        typeFamilies: {
                            integer: 42,
                            double: '',
                        },
                        types: {
                            int: ['BIGINT'],
                            double: '   ',
                        },
                    },
                },
                mongo: {
                    typeFamilies: {
                        integer: 'not-a-bson-type',
                        double: 42,
                    },
                    types: {
                        int: 'not-a-bson-type',
                    },
                },
            },
        };

        const sql = await exportSql('postgres', malformedConfig);
        const mongo = await exportMongo(malformedConfig);

        expect(sql).toContain('    id INT,');
        expect(sql).toContain('    score DOUBLE PRECISION NOT NULL,');
        expect(mongo).toMatch(/_id: \{\s+bsonType: "int"\s+\}/);
        expect(mongo).toMatch(/score: \{\s+bsonType: "double"\s+\}/);
    });
});

async function exportSql(dialect: SqlDialect, exportConfig?: unknown): Promise<string> {
    const result = await exportService.exportModel({
        sourceUri: pathToFileURL(path.join(fixturesDir, `type-mapping-${dialect}.er`)).toString(),
        erContent: TYPE_MAPPING_ER,
        target: 'sql',
        targetOptions: {
            dialect,
            ...(exportConfig ? { exportConfig } : {}),
        },
    });
    return result.content;
}

async function exportMongo(exportConfig?: unknown): Promise<string> {
    const result = await exportService.exportModel({
        sourceUri: pathToFileURL(path.join(fixturesDir, 'type-mapping-mongo.er')).toString(),
        erContent: TYPE_MAPPING_ER,
        target: 'mongo',
        targetOptions: {
            ...(exportConfig ? { exportConfig } : {}),
        },
    });
    return result.content;
}
