export const EXPORT_MODEL_REQUEST = 'biger/exportModel';

export type ExportTarget = 'sql' | 'mongo' | (string & {});

// Canonical list of SQL dialects the exporter supports.
// Adding a dialect here forces every test fixture to gain a matching
// `<fixture>.<dialect>.sql` (enforced by sql-exporter.test.ts coverage check).
export const SQL_DIALECTS = ['postgres', 'mysql'] as const;
export type SqlDialect = (typeof SQL_DIALECTS)[number];

// How entity inheritance (`extends`) maps to SQL tables:
//   joined        — a table per entity; each subclass shares the parent PK and
//                   references it with a foreign key (JPA JOINED). Default.
//   tablePerClass — a table per concrete leaf subclass with all inherited
//                   columns flattened in; no parent table (JPA TABLE_PER_CLASS).
//   singleTable   — one table for the whole hierarchy; subclass columns nullable
//                   (JPA SINGLE_TABLE).
export const SQL_INHERITANCE_STRATEGIES = ['joined', 'tablePerClass', 'singleTable'] as const;
export type SqlInheritanceStrategy = (typeof SQL_INHERITANCE_STRATEGIES)[number];

export const EXPORT_TYPE_FAMILIES = [
    'integer',
    'long',
    'float',
    'double',
    'decimal',
    'numeric',
    'string',
    'varchar',
    'char',
    'character',
    'date',
    'datetime',
    'timing',
    'boolean',
    'bool',
    'binary',
    'blob',
    'clob',
] as const;
export type ExportTypeFamily = (typeof EXPORT_TYPE_FAMILIES)[number];

export interface DataTypeMappingConfiguration {
    typeFamilies?: Partial<Record<ExportTypeFamily, string>> & Record<string, string | undefined>;
    types?: Record<string, string | undefined>;
}

export type SqlDataTypeMappingConfiguration = Partial<Record<SqlDialect, DataTypeMappingConfiguration>>;

export interface ExportTypeMappingConfiguration {
    sql?: SqlDataTypeMappingConfiguration;
    mongo?: DataTypeMappingConfiguration;
}

export interface ExportConfiguration {
    typeMappings?: ExportTypeMappingConfiguration;
}

export interface SqlExportOptions {
    dialect?: SqlDialect;
    generateDrop?: boolean;
    inheritanceStrategy?: SqlInheritanceStrategy;
    exportConfig?: ExportConfiguration;
}

export interface MongoExportOptions {
    generateDrop?: boolean;
    exportConfig?: ExportConfiguration;
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

export function sanitizeExportConfiguration(value: unknown): ExportConfiguration | undefined {
    if (!isRecord(value)) return undefined;

    const typeMappings = sanitizeTypeMappings(value.typeMappings);
    if (!typeMappings) return undefined;

    return { typeMappings };
}

function sanitizeTypeMappings(value: unknown): ExportTypeMappingConfiguration | undefined {
    if (!isRecord(value)) return undefined;

    const sql = sanitizeSqlMappings(value.sql);
    const mongo = sanitizeDataTypeMapping(value.mongo);
    if (!sql && !mongo) return undefined;

    return {
        ...(sql ? { sql } : {}),
        ...(mongo ? { mongo } : {}),
    };
}

function sanitizeSqlMappings(value: unknown): SqlDataTypeMappingConfiguration | undefined {
    if (!isRecord(value)) return undefined;

    const sql: SqlDataTypeMappingConfiguration = {};
    for (const dialect of SQL_DIALECTS) {
        const mapping = sanitizeDataTypeMapping(value[dialect]);
        if (mapping) sql[dialect] = mapping;
    }

    return Object.keys(sql).length > 0 ? sql : undefined;
}

function sanitizeDataTypeMapping(value: unknown): DataTypeMappingConfiguration | undefined {
    if (!isRecord(value)) return undefined;

    const typeFamilies = sanitizeStringRecord(value.typeFamilies);
    const types = sanitizeStringRecord(value.types);
    if (!typeFamilies && !types) return undefined;

    return {
        ...(typeFamilies ? { typeFamilies } : {}),
        ...(types ? { types } : {}),
    };
}

function sanitizeStringRecord(value: unknown): Record<string, string> | undefined {
    if (!isRecord(value)) return undefined;

    const sanitized: Record<string, string> = {};
    for (const [rawKey, rawValue] of Object.entries(value)) {
        if (typeof rawValue !== 'string') continue;

        const key = rawKey.trim();
        const mapping = rawValue.trim();
        if (!key || !mapping) continue;

        sanitized[key] = mapping;
    }

    return Object.keys(sanitized).length > 0 ? sanitized : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
