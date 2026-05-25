import type { SqlEngineDriver } from '../engines/types.js';
import type { ColumnShape, ForeignKeyShape, SchemaShape, SqlInspector, TableShape } from './types.js';

// Postgres inspector — queries information_schema for columns & FKs and
// pg_catalog for primary keys (information_schema lies about PK column order
// in composite cases; pg_index + pg_attribute is authoritative).

interface ColumnRow {
    table_name: string;
    column_name: string;
    data_type: string;
    character_maximum_length: number | null;
    numeric_precision: number | null;
    numeric_scale: number | null;
    is_nullable: 'YES' | 'NO';
    ordinal_position: number;
}

interface PkRow {
    table_name: string;
    column_name: string;
}

interface FkRow {
    constraint_name: string;
    table_name: string;
    column_name: string;
    foreign_table_name: string;
    foreign_column_name: string;
    ordinal_position: number;
}

export class PostgresInspector implements SqlInspector {
    async snapshot(driver: SqlEngineDriver): Promise<SchemaShape> {
        const columns = await driver.query<ColumnRow>(
            `SELECT table_name, column_name, data_type,
                    character_maximum_length, numeric_precision, numeric_scale,
                    is_nullable, ordinal_position
             FROM information_schema.columns
             WHERE table_schema = 'public'
             ORDER BY table_name, ordinal_position`
        );

        const pks = await driver.query<PkRow>(
            `SELECT t.relname AS table_name, a.attname AS column_name
             FROM pg_index i
             JOIN pg_class t ON t.oid = i.indrelid
             JOIN pg_namespace n ON n.oid = t.relnamespace
             JOIN unnest(i.indkey) WITH ORDINALITY AS k(attnum, ord) ON TRUE
             JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.attnum
             WHERE i.indisprimary AND n.nspname = 'public'
             ORDER BY t.relname, k.ord`
        );

        const fks = await driver.query<FkRow>(
            `SELECT tc.constraint_name,
                    kcu.table_name,
                    kcu.column_name,
                    ccu.table_name  AS foreign_table_name,
                    ccu.column_name AS foreign_column_name,
                    kcu.ordinal_position
             FROM information_schema.table_constraints tc
             JOIN information_schema.key_column_usage kcu
               ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
             JOIN information_schema.constraint_column_usage ccu
               ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
             WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'
             ORDER BY tc.constraint_name, kcu.ordinal_position`
        );

        return assemble(columns, pks, fks, formatPostgresType);
    }
}

function formatPostgresType(c: ColumnRow): string {
    if (c.character_maximum_length != null) return `${c.data_type}(${c.character_maximum_length})`;
    if (/^(numeric|decimal)$/i.test(c.data_type) && c.numeric_precision != null) {
        if (c.numeric_scale != null && c.numeric_scale > 0) {
            return `${c.data_type}(${c.numeric_precision},${c.numeric_scale})`;
        }
        return `${c.data_type}(${c.numeric_precision})`;
    }
    return c.data_type;
}

// ──────────────────────────────────────────────────────────────────────────
// Shared assembly — same shape for both dialects, parameterised on type fmt.
// Exported so the MySQL inspector can reuse it.
// ──────────────────────────────────────────────────────────────────────────

export function assemble<C extends { table_name: string; column_name: string; is_nullable: 'YES' | 'NO' }>(
    columns: C[],
    pks: { table_name: string; column_name: string }[],
    fks: { constraint_name: string; table_name: string; column_name: string; foreign_table_name: string; foreign_column_name: string }[],
    formatType: (c: C) => string,
): SchemaShape {
    const tables = new Map<string, TableShape>();
    for (const c of columns) {
        let t = tables.get(c.table_name);
        if (!t) {
            t = { columns: [], primaryKey: [], foreignKeys: [] };
            tables.set(c.table_name, t);
        }
        const col: ColumnShape = { name: c.column_name, type: formatType(c), nullable: c.is_nullable === 'YES' };
        t.columns.push(col);
    }

    for (const p of pks) {
        tables.get(p.table_name)?.primaryKey.push(p.column_name);
    }

    // Group FK rows by constraint_name (in arrival order; the queries already
    // sort by ordinal_position within a constraint).
    const fkGroups = new Map<string, { table: string; cols: string[]; refTable: string; refCols: string[] }>();
    for (const fk of fks) {
        const key = `${fk.table_name}::${fk.constraint_name}`;
        let g = fkGroups.get(key);
        if (!g) {
            g = { table: fk.table_name, cols: [], refTable: fk.foreign_table_name, refCols: [] };
            fkGroups.set(key, g);
        }
        g.cols.push(fk.column_name);
        g.refCols.push(fk.foreign_column_name);
    }
    for (const g of fkGroups.values()) {
        const fk: ForeignKeyShape = { columns: g.cols, referencedTable: g.refTable, referencedColumns: g.refCols };
        tables.get(g.table)?.foreignKeys.push(fk);
    }

    // Stable order for FKs within a table — by joined columns + referenced
    // table. Otherwise driver/query reordering shows up as JSON diff noise.
    for (const t of tables.values()) {
        t.foreignKeys.sort((a, b) => fkSortKey(a).localeCompare(fkSortKey(b)));
    }

    // Stable, alphabetical table order.
    const out: Record<string, TableShape> = {};
    for (const name of [...tables.keys()].sort()) {
        out[name] = tables.get(name)!;
    }
    return { tables: out };
}

function fkSortKey(fk: ForeignKeyShape): string {
    return `${fk.columns.join(',')}|${fk.referencedTable}|${fk.referencedColumns.join(',')}`;
}
