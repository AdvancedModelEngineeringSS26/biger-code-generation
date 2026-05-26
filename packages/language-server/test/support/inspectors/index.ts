import type { SqlDialect } from '@biger/common';
import { MysqlInspector } from './mysql.js';
import { PostgresInspector } from './postgres.js';
import type { ColumnShape, ForeignKeyShape, SchemaShape, SqlInspector, TableShape } from './types.js';

// Per-dialect inspectors. Same registry pattern as SQL_ENGINES — a dialect
// without an inspector is a clean skip at the test-definition level.

export const SQL_INSPECTORS: Partial<Record<SqlDialect, SqlInspector>> = {
    postgres: new PostgresInspector(),
    mysql: new MysqlInspector(),
};

export type { SchemaShape, TableShape, ColumnShape, ForeignKeyShape, SqlInspector };

// ──────────────────────────────────────────────────────────────────────────
// Cross-dialect normalisation — used by the equivalence test (Stage 4).
//
// Maps dialect-native types ("character varying(255)", "varchar(255)",
// "tinyint(1)", "double precision") into a canonical category form
// ("VARCHAR(255)", "BOOLEAN", "DOUBLE"). Identifiers are also lowercased;
// MySQL on a case-insensitive filesystem may fold table names.
// ──────────────────────────────────────────────────────────────────────────

export function normalizeShape(shape: SchemaShape): SchemaShape {
    const tables: Record<string, TableShape> = {};
    for (const [name, t] of Object.entries(shape.tables)) {
        tables[name.toLowerCase()] = {
            columns: t.columns.map((c) => ({
                name: c.name.toLowerCase(),
                type: normalizeType(c.type),
                nullable: c.nullable,
            })),
            primaryKey: t.primaryKey.map((c) => c.toLowerCase()),
            foreignKeys: t.foreignKeys.map((fk) => ({
                columns: fk.columns.map((c) => c.toLowerCase()),
                referencedTable: fk.referencedTable.toLowerCase(),
                referencedColumns: fk.referencedColumns.map((c) => c.toLowerCase()),
            })),
        };
    }
    // Re-sort table names after lowercasing.
    const out: Record<string, TableShape> = {};
    for (const k of Object.keys(tables).sort()) out[k] = tables[k];
    return { tables: out };
}

function normalizeType(t: string): string {
    const lower = t.toLowerCase().trim();
    const m = lower.match(/^([a-z ]+?)(?:\s*\(\s*([0-9, ]+)\s*\))?$/);
    if (!m) return lower;
    const base = m[1].trim();
    const args = m[2]?.replace(/\s+/g, '');

    // tinyint(1) is MySQL's BOOLEAN. Special-cased.
    if (base === 'tinyint' && args === '1') return 'BOOLEAN';

    let category: string;
    if (base === 'int' || base === 'integer') category = 'INT';
    else if (base === 'bigint') category = 'BIGINT';
    else if (base === 'smallint') category = 'SMALLINT';
    else if (base === 'tinyint') category = 'TINYINT';
    else if (base === 'mediumint') category = 'MEDIUMINT';
    else if (base === 'varchar' || base === 'character varying') category = 'VARCHAR';
    else if (base === 'char' || base === 'character') category = 'CHAR';
    else if (base === 'text') category = 'TEXT';
    else if (base === 'blob' || base === 'bytea') category = 'BLOB';
    else if (base === 'date') category = 'DATE';
    else if (base.startsWith('timestamp')) category = 'TIMESTAMP';
    else if (base.startsWith('time')) category = 'TIME';
    else if (base === 'boolean' || base === 'bool') category = 'BOOLEAN';
    else if (base === 'double' || base === 'double precision') category = 'DOUBLE';
    else if (base === 'float' || base === 'real') category = 'FLOAT';
    else if (base === 'decimal' || base === 'numeric') category = 'DECIMAL';
    else category = base.toUpperCase();

    return args ? `${category}(${args})` : category;
}
