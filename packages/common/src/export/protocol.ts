export const EXPORT_MODEL_REQUEST = 'biger/exportModel';

export type ExportTarget = 'sql' | (string & {});

// Canonical list of SQL dialects the exporter supports.
// Adding a dialect here forces every test fixture to gain a matching
// `<fixture>.<dialect>.sql` (enforced by sql-exporter.test.ts coverage check).
export const SQL_DIALECTS = ['postgres', 'mysql'] as const;
export type SqlDialect = (typeof SQL_DIALECTS)[number];
export const SQL_GENERATION_DIALECTS = ['generic', ...SQL_DIALECTS] as const;
export type SqlGenerationDialect = (typeof SQL_GENERATION_DIALECTS)[number];

export interface SqlExportOptions {
    dialect?: SqlGenerationDialect;
    generateDrop?: boolean;
}

export interface ExportModelParams {
    sourceUri: string;
    erContent: string;
    target: ExportTarget;
    targetOptions?: Record<string, unknown>;
}

export interface ExportModelResult {
    target: ExportTarget;
    fileExtension: string;
    content: string;
}
