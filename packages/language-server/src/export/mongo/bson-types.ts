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

export function mapBsonType(dt: DataType | undefined): string {
    if (!dt) return 'string';
    const upper = dt.type.toUpperCase();
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
