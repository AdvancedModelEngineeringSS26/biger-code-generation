import type { SqlEngineDriver } from '../engines/types.js';

// Schema shape — what Layer 4 asserts against. Per-dialect by design: column
// types stay dialect-native (Postgres "character varying" vs MySQL "varchar")
// so the sidecar JSON file is the spec for that dialect.
//
// Cross-dialect equivalence (Layer 5) normalises these into category names
// (VARCHAR, INT, …) before comparing.

export interface SchemaShape {
    tables: Record<string, TableShape>;
}

export interface TableShape {
    columns: ColumnShape[];
    primaryKey: string[];
    foreignKeys: ForeignKeyShape[];
}

export interface ColumnShape {
    name: string;
    type: string;
    nullable: boolean;
}

export interface ForeignKeyShape {
    columns: string[];
    referencedTable: string;
    referencedColumns: string[];
}

export interface SqlInspector {
    snapshot(driver: SqlEngineDriver): Promise<SchemaShape>;
}
