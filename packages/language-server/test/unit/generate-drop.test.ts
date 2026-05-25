import { readFile } from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { NodeFileSystem } from 'langium/node';
import { describe, expect, it } from 'vitest';
import { createEntityRelationshipServices } from '../../src/entity-relationship-module.js';
import { createDefaultExportService } from '../../src/export/export-service.js';

// generateDrop is the only export option that doesn't flow through the
// fixture-driven golden pipeline (which always passes `{ dialect }` only).
// We test it directly here against a representative fixture per shape:
//   - chain-three: a vanilla entity+relationship topology
//   - inheritance: subclass FK -> parent
//   - multivalued: child side-table -> parent
//   - weak-entity:  weak FK -> owner

const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');
const { EntityRelationship } = createEntityRelationshipServices({ ...NodeFileSystem });
const exporter = createDefaultExportService(EntityRelationship);

async function exportWithDrop(stem: string, dialect: 'postgres' | 'mysql' = 'postgres'): Promise<string> {
    const erPath = path.join(fixturesDir, `${stem}.er`);
    const erContent = await readFile(erPath, 'utf-8');
    const result = await exporter.exportModel({
        sourceUri: pathToFileURL(erPath).toString(),
        erContent,
        target: 'sql',
        targetOptions: { dialect, generateDrop: true },
    });
    return result.content;
}

function dropLines(sql: string): string[] {
    return sql.split('\n').filter((l) => l.startsWith('DROP TABLE IF EXISTS '));
}

function createOrder(sql: string): string[] {
    // Table names in the order their CREATE TABLE statement appears.
    const lines = sql.split('\n');
    const created: string[] = [];
    for (const l of lines) {
        const m = l.match(/^CREATE TABLE (\w+)\(/);
        if (m) created.push(m[1]);
    }
    return created;
}

describe('generateDrop option', () => {
    it('does NOT emit drops when the flag is absent or false', async () => {
        const erPath = path.join(fixturesDir, 'chain-three.er');
        const erContent = await readFile(erPath, 'utf-8');
        const result = await exporter.exportModel({
            sourceUri: pathToFileURL(erPath).toString(),
            erContent,
            target: 'sql',
            targetOptions: { dialect: 'postgres' },
        });
        expect(dropLines(result.content)).toHaveLength(0);
    });

    it('emits a DROP TABLE IF EXISTS for every emitted table', async () => {
        const sql = await exportWithDrop('chain-three');
        const drops = dropLines(sql);
        const creates = createOrder(sql);

        const dropNames = drops.map((l) => l.replace(/^DROP TABLE IF EXISTS (\w+);$/, '$1'));
        // Same set of table names — every CREATE has a matching DROP and vice versa.
        expect(new Set(dropNames)).toEqual(new Set(creates));
    });

    it('orders drops as the reverse of create order so FK references unwind cleanly', async () => {
        // chain-three emits: Author, Book, Chapter (entities), then Wrote,
        // Contains (relationships). Bridge tables FK back to entities, so
        // dropping them first means entity drops have no incoming references.
        const sql = await exportWithDrop('chain-three');
        const drops = dropLines(sql).map((l) => l.replace(/^DROP TABLE IF EXISTS (\w+);$/, '$1'));
        const creates = createOrder(sql);
        expect(drops).toEqual([...creates].reverse());
    });

    it('handles inheritance: subclass drops before parent', async () => {
        // inheritance.er: Person, Employee extends Person. Employee FKs Person.id.
        // If Person dropped first, MySQL rejects the drop. Reverse order
        // (Employee then Person) is safe.
        const sql = await exportWithDrop('inheritance');
        const drops = dropLines(sql).map((l) => l.replace(/^DROP TABLE IF EXISTS (\w+);$/, '$1'));
        expect(drops).toEqual(['Employee', 'Person']);
    });

    it('handles multivalued side tables: child drops before parent', async () => {
        // multivalued.er: Person + Person_phoneNumber (FK to Person).
        const sql = await exportWithDrop('multivalued');
        const drops = dropLines(sql).map((l) => l.replace(/^DROP TABLE IF EXISTS (\w+);$/, '$1'));
        expect(drops).toEqual(['Person_phoneNumber', 'Person']);
    });

    it('handles weak entities: weak drops before owner', async () => {
        // weak-entity.er: Invoice + InvoiceLine (weak, FK to Invoice).
        // The `weak relationship` itself does NOT emit a separate table, so
        // it must not appear in the drops either.
        const sql = await exportWithDrop('weak-entity');
        const drops = dropLines(sql).map((l) => l.replace(/^DROP TABLE IF EXISTS (\w+);$/, '$1'));
        expect(drops).toEqual(['InvoiceLine', 'Invoice']);
    });

    it('drops come before any CREATE in the output', async () => {
        const sql = await exportWithDrop('chain-three');
        const lines = sql.split('\n');
        const lastDropIdx = lines.findLastIndex((l) => l.startsWith('DROP TABLE IF EXISTS '));
        const firstCreateIdx = lines.findIndex((l) => l.startsWith('CREATE TABLE '));
        expect(lastDropIdx).toBeLessThan(firstCreateIdx);
    });

    it('works for both postgres and mysql', async () => {
        // Sanity — both dialects honour the flag identically (dialect only
        // affects column types, not DROP statements).
        const pg = await exportWithDrop('chain-three', 'postgres');
        const my = await exportWithDrop('chain-three', 'mysql');
        expect(dropLines(pg)).toEqual(dropLines(my));
    });
});
