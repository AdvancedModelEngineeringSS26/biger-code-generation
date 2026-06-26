import type { DataTypeMappingConfiguration } from '@biger/common';
import type { DataType } from '../../generated/ast.js';

const INTEGER_TYPES = new Set(['INT', 'INT2', 'INT4', 'INTEGER', 'SMALLINT', 'MEDIUMINT', 'TINYINT']);
const LONG_TYPES = new Set(['BIGINT', 'INT8']);
const DOUBLE_TYPES = new Set(['BINARY_DOUBLE', 'BINARY_FLOAT', 'DOUBLE', 'DOUBLE PRECISION', 'FLOAT', 'REAL']);
const DECIMAL_TYPES = new Set(['DECIMAL', 'NUMBER', 'NUMBER DECIMAL', 'DECIMAL NUMBER', 'NUMERIC', 'NUMERIC FLOAT']);
const STRING_TYPES = new Set([
    'CHAR',
    'CHARACTER',
    'CHARACTER VARYING',
    'CLOB',
    'NCHAR',
    'NTEXT',
    'NVARCHAR',
    'STRING',
    'TEXT',
    'VARCHAR',
    'VARCHAR2',
]);
const DATE_TYPES = new Set([
    'DATE',
    'DATETIME',
    'DATETIME2',
    'DATETIMEOFFSET',
    'SMALLDATETIME',
    'TIME',
    'TIME WITH TIME ZONE',
    'TIME WITHOUT TIME ZONE',
    'TIMESTAMP',
    'TIMESTAMP WITH TIME ZONE',
    'TIMESTAMP WITHOUT TIME ZONE',
]);
const BINARY_TYPES = new Set(['BLOB', 'BYTEA', 'IMAGE', 'IO', 'VARBINARY']);
const BOOLEAN_TYPES = new Set(['BIT', 'BOOLEAN']);

interface BsonTypeFamilyMatcher {
    readonly aliases: readonly string[];
    matches(type: string): boolean;
}

const NUMERIC_TYPES = new Set<string>([
    ...INTEGER_TYPES,
    ...LONG_TYPES,
    ...DOUBLE_TYPES,
    ...DECIMAL_TYPES,
]);

const BSON_TYPE_FAMILY_MATCHERS: readonly BsonTypeFamilyMatcher[] = [
    { aliases: ['long'], matches: (type) => LONG_TYPES.has(type) },
    { aliases: ['integer'], matches: (type) => INTEGER_TYPES.has(type) || LONG_TYPES.has(type) },
    { aliases: ['float', 'double', 'floatdouble'], matches: (type) => DOUBLE_TYPES.has(type) },
    { aliases: ['decimal'], matches: (type) => DECIMAL_TYPES.has(type) },
    { aliases: ['numeric'], matches: (type) => NUMERIC_TYPES.has(type) },
    { aliases: ['string', 'character'], matches: (type) => STRING_TYPES.has(type) },
    { aliases: ['date', 'datetime', 'timing'], matches: (type) => DATE_TYPES.has(type) },
    { aliases: ['binary'], matches: (type) => BINARY_TYPES.has(type) },
    { aliases: ['boolean', 'bool'], matches: (type) => BOOLEAN_TYPES.has(type) },
];

const CANONICAL_BSON_TYPES = [
    'double',
    'string',
    'object',
    'array',
    'binData',
    'undefined',
    'objectId',
    'bool',
    'date',
    'null',
    'regex',
    'dbPointer',
    'javascript',
    'symbol',
    'javascriptWithScope',
    'int',
    'timestamp',
    'long',
    'decimal',
    'minKey',
    'maxKey',
] as const;

const BSON_TYPE_ALIASES = new Map<string, string>([
    ...CANONICAL_BSON_TYPES.map((type) => [normalizeBsonTypeKey(type), type] as const),
    ['boolean', 'bool'],
    ['binary', 'binData'],
]);

export function mapBsonType(dt: DataType | undefined, overrides?: DataTypeMappingConfiguration): string {
    if (!dt) return 'string';
    const upper = dt.type.toUpperCase();
    const override = mapBsonTypeOverride(dt.type, upper, overrides);
    if (override) return override;

    if (INTEGER_TYPES.has(upper)) return 'int';
    if (LONG_TYPES.has(upper)) return 'long';
    if (DOUBLE_TYPES.has(upper)) return 'double';
    if (DECIMAL_TYPES.has(upper)) return 'decimal';
    if (STRING_TYPES.has(upper)) return 'string';
    if (DATE_TYPES.has(upper)) return 'date';
    if (BINARY_TYPES.has(upper)) return 'binData';
    if (BOOLEAN_TYPES.has(upper)) return 'bool';
    return 'string';
}

function mapBsonTypeOverride(
    originalType: string,
    upperType: string,
    overrides: DataTypeMappingConfiguration | undefined,
): string | undefined {
    const exact = findExactOverride(overrides?.types, originalType);
    if (exact) return exact;

    for (const matcher of BSON_TYPE_FAMILY_MATCHERS) {
        if (!matcher.matches(upperType)) continue;
        const family = findFamilyOverride(overrides?.typeFamilies, matcher.aliases);
        if (family) return family;
    }

    return undefined;
}

function findExactOverride(mappings: Record<string, unknown> | undefined, dataType: string): string | undefined {
    if (!isRecord(mappings)) return undefined;

    const normalizedDataType = normalizeDataTypeKey(dataType);
    for (const [key, value] of Object.entries(mappings)) {
        if (normalizeDataTypeKey(key) !== normalizedDataType) continue;
        return normalizeBsonTypeValue(value);
    }

    return undefined;
}

function findFamilyOverride(
    mappings: Record<string, unknown> | undefined,
    aliases: readonly string[],
): string | undefined {
    if (!isRecord(mappings)) return undefined;

    const normalizedAliases = new Set(aliases.map(normalizeFamilyKey));
    for (const [key, value] of Object.entries(mappings)) {
        if (!normalizedAliases.has(normalizeFamilyKey(key))) continue;
        return normalizeBsonTypeValue(value);
    }

    return undefined;
}

function normalizeBsonTypeValue(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined;
    return BSON_TYPE_ALIASES.get(normalizeBsonTypeKey(value));
}

function normalizeBsonTypeKey(value: string): string {
    return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function normalizeDataTypeKey(value: string): string {
    return value.trim().toUpperCase();
}

function normalizeFamilyKey(value: string): string {
    return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
