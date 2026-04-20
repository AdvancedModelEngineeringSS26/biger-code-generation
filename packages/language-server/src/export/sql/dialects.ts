import type { SqlDialect } from '@biger/common';

export interface Dialect {
    readonly name: SqlDialect;
    mapDataType(type: string): string;
}

// Aggregate type sets — union across all 5 bigER dialects (postgres, mysql, mssql, oracle, db2).
// Used for category recognition in mapDataType so inputs like VARBINARY, DATETIME, NUMBER
// are recognized even though we only generate postgres/mysql output.

const ALL_INTEGER_TYPES = new Set([
    'BIGINT', 'INT', 'INT2', 'INT4', 'INT8', 'INTEGER', 'SMALLINT',
    'MEDIUMINT', 'TINYINT',
]);

const ALL_FLOAT_TYPES = new Set([
    'BINARY_DOUBLE', 'BINARY_FLOAT', 'FLOAT', 'REAL', 'DOUBLE', 'DOUBLE PRECISION',
]);

const ALL_DECIMAL_TYPES = new Set([
    'NUMBER', 'DECIMAL', 'NUMBER DECIMAL', 'DECIMAL NUMBER', 'NUMERIC', 'NUMERIC FLOAT',
]);

const ALL_NUMERIC_TYPES = new Set<string>([
    ...ALL_INTEGER_TYPES, ...ALL_FLOAT_TYPES, ...ALL_DECIMAL_TYPES,
]);

const ALL_VARCHAR_TYPES = new Set([
    'VARCHAR2', 'VARCHAR', 'NVARCHAR', 'CHARACTER VARYING',
]);

const ALL_CHAR_TYPES = new Set([
    'CHAR', 'NCHAR', 'CHARACTER',
]);

const ALL_CHARACTER_TYPES = new Set<string>([
    'STRING', ...ALL_VARCHAR_TYPES, ...ALL_CHAR_TYPES,
]);

const ALL_DATE_TYPES = new Set([
    'DATE',
]);

const ALL_DATETIME_TYPES = new Set([
    'TIMESTAMP', 'TIMESTAMP WITH TIME ZONE', 'TIMESTAMP WITHOUT TIME ZONE',
    'TIME', 'TIME WITH TIME ZONE', 'TIME WITHOUT TIME ZONE',
    'DATETIME2', 'DATETIME', 'SMALLDATETIME', 'DATETIMEOFFSET',
]);

const ALL_TIMING_TYPES = new Set<string>([
    ...ALL_DATE_TYPES, ...ALL_DATETIME_TYPES,
]);

const ALL_BLOB_TYPES = new Set([
    'BLOB', 'VARBINARY', 'IMAGE', 'BYTEA', 'IO',
]);

const ALL_CLOB_TYPES = new Set([
    'CLOB', 'TEXT', 'NTEXT',
]);

const ALL_BINARY_TYPES = new Set<string>([
    ...ALL_BLOB_TYPES, ...ALL_CLOB_TYPES,
]);

// Oracle and DB2 have no native boolean — excluded here to match bigER's DataTypes.getAllBooleanTypes.
const ALL_BOOLEAN_TYPES = new Set([
    'BIT', 'BOOLEAN',
]);

// ------ Postgres ------

const POSTGRES_INTEGER_TYPES = ['BIGINT', 'INT', 'INT2', 'INT4', 'INT8', 'INTEGER', 'SMALLINT'];
const POSTGRES_FLOAT_TYPES = ['DOUBLE PRECISION', 'FLOAT', 'REAL'];
const POSTGRES_DECIMAL_TYPES = ['DECIMAL', 'NUMERIC'];
const POSTGRES_VARCHAR_TYPES = ['VARCHAR', 'CHARACTER VARYING'];
const POSTGRES_CHAR_TYPES = ['CHAR', 'CHARACTER'];
const POSTGRES_DATE_TYPES = ['DATE'];
const POSTGRES_DATE_TIME_TYPES = [
    'TIMESTAMP', 'TIMESTAMP WITH TIME ZONE', 'TIMESTAMP WITHOUT TIME ZONE',
    'TIME', 'TIME WITH TIME ZONE', 'TIME WITHOUT TIME ZONE',
];
const POSTGRES_BLOB_TYPES = ['BYTEA', 'IO'];
const POSTGRES_CLOB_TYPES = ['TEXT'];
const POSTGRES_BOOLEAN_TYPES = ['BOOLEAN'];

const POSTGRES_ALL_NUMERIC_TYPES = [...POSTGRES_DECIMAL_TYPES, ...POSTGRES_FLOAT_TYPES, ...POSTGRES_INTEGER_TYPES];
const POSTGRES_ALL_CHARACTER_TYPES = [...POSTGRES_VARCHAR_TYPES, ...POSTGRES_CHAR_TYPES];
const POSTGRES_ALL_DATE_TYPES = [...POSTGRES_DATE_TIME_TYPES, ...POSTGRES_DATE_TYPES];
const POSTGRES_ALL_BINARY_TYPES = [...POSTGRES_BLOB_TYPES, ...POSTGRES_CLOB_TYPES];

const POSTGRES_ALL_TYPES = new Set<string>([
    ...POSTGRES_ALL_NUMERIC_TYPES,
    ...POSTGRES_ALL_CHARACTER_TYPES,
    ...POSTGRES_ALL_DATE_TYPES,
    ...POSTGRES_ALL_BINARY_TYPES,
    ...POSTGRES_BOOLEAN_TYPES,
]);

// ------ MySQL ------

const MYSQL_INTEGER_TYPES = ['BIGINT', 'INT', 'MEDIUMINT', 'SMALLINT', 'TINYINT'];
const MYSQL_FLOAT_TYPES = ['DOUBLE', 'FLOAT'];
const MYSQL_DECIMAL_TYPES = ['NUMBER', 'DECIMAL'];
const MYSQL_VARCHAR_TYPES = ['VARCHAR'];
const MYSQL_CHAR_TYPES = ['CHAR'];
const MYSQL_DATE_TYPES = ['DATE'];
const MYSQL_DATE_TIME_TYPES = ['TIMESTAMP', 'TIME'];
const MYSQL_BLOB_TYPES = ['BLOB'];
const MYSQL_CLOB_TYPES = ['CLOB'];
const MYSQL_BOOLEAN_TYPES = ['BOOLEAN'];

const MYSQL_ALL_NUMERIC_TYPES = [...MYSQL_DECIMAL_TYPES, ...MYSQL_FLOAT_TYPES, ...MYSQL_INTEGER_TYPES];
const MYSQL_ALL_CHARACTER_TYPES = [...MYSQL_VARCHAR_TYPES, ...MYSQL_CHAR_TYPES];
const MYSQL_ALL_DATE_TYPES = [...MYSQL_DATE_TIME_TYPES, ...MYSQL_DATE_TYPES];
const MYSQL_ALL_BINARY_TYPES = [...MYSQL_BLOB_TYPES, ...MYSQL_CLOB_TYPES];

const MYSQL_ALL_TYPES = new Set<string>([
    ...MYSQL_ALL_NUMERIC_TYPES,
    ...MYSQL_ALL_CHARACTER_TYPES,
    ...MYSQL_ALL_DATE_TYPES,
    ...MYSQL_ALL_BINARY_TYPES,
    ...MYSQL_BOOLEAN_TYPES,
]);

// ------ Shared mapper factory ------

interface DialectFirsts {
    INTEGER: string;
    FLOAT: string;
    DECIMAL: string;
    NUMERIC: string;
    VARCHAR: string;
    CHAR: string;
    CHARACTER: string;
    DATE: string;
    DATE_TIME: string;
    TIMING: string;
    BLOB: string;
    CLOB: string;
    BINARY: string;
    BOOLEAN: string;
}

function makeMapper(ownAllTypes: Set<string>, firsts: DialectFirsts): (type: string) => string {
    return (type) => {
        const upper = type.toUpperCase();
        if (ownAllTypes.has(upper)) return type;

        if (ALL_INTEGER_TYPES.has(upper)) return firsts.INTEGER;
        if (ALL_FLOAT_TYPES.has(upper)) return firsts.FLOAT;
        if (ALL_DECIMAL_TYPES.has(upper)) return firsts.DECIMAL;
        if (ALL_NUMERIC_TYPES.has(upper)) return firsts.NUMERIC;

        if (ALL_VARCHAR_TYPES.has(upper)) return firsts.VARCHAR;
        if (ALL_CHAR_TYPES.has(upper)) return firsts.CHAR;
        if (ALL_CHARACTER_TYPES.has(upper)) return firsts.CHARACTER;

        if (ALL_DATE_TYPES.has(upper)) return firsts.DATE;
        if (ALL_DATETIME_TYPES.has(upper)) return firsts.DATE_TIME;
        if (ALL_TIMING_TYPES.has(upper)) return firsts.TIMING;

        if (ALL_BLOB_TYPES.has(upper)) return firsts.BLOB;
        if (ALL_CLOB_TYPES.has(upper)) return firsts.CLOB;
        if (ALL_BINARY_TYPES.has(upper)) return firsts.BINARY;

        if (ALL_BOOLEAN_TYPES.has(upper)) return firsts.BOOLEAN;

        return type;
    };
}

export const postgresDialect: Dialect = {
    name: 'postgres',
    mapDataType: makeMapper(POSTGRES_ALL_TYPES, {
        INTEGER: POSTGRES_INTEGER_TYPES[0],
        FLOAT: POSTGRES_FLOAT_TYPES[0],
        DECIMAL: POSTGRES_DECIMAL_TYPES[0],
        NUMERIC: POSTGRES_ALL_NUMERIC_TYPES[0],
        VARCHAR: POSTGRES_VARCHAR_TYPES[0],
        CHAR: POSTGRES_CHAR_TYPES[0],
        CHARACTER: POSTGRES_ALL_CHARACTER_TYPES[0],
        DATE: POSTGRES_DATE_TYPES[0],
        DATE_TIME: POSTGRES_DATE_TIME_TYPES[0],
        TIMING: POSTGRES_ALL_DATE_TYPES[0],
        BLOB: POSTGRES_BLOB_TYPES[0],
        CLOB: POSTGRES_CLOB_TYPES[0],
        BINARY: POSTGRES_ALL_BINARY_TYPES[0],
        BOOLEAN: POSTGRES_BOOLEAN_TYPES[0],
    }),
};

export const mysqlDialect: Dialect = {
    name: 'mysql',
    mapDataType: makeMapper(MYSQL_ALL_TYPES, {
        INTEGER: MYSQL_INTEGER_TYPES[0],
        FLOAT: MYSQL_FLOAT_TYPES[0],
        DECIMAL: MYSQL_DECIMAL_TYPES[0],
        NUMERIC: MYSQL_ALL_NUMERIC_TYPES[0],
        VARCHAR: MYSQL_VARCHAR_TYPES[0],
        CHAR: MYSQL_CHAR_TYPES[0],
        CHARACTER: MYSQL_ALL_CHARACTER_TYPES[0],
        DATE: MYSQL_DATE_TYPES[0],
        DATE_TIME: MYSQL_DATE_TIME_TYPES[0],
        TIMING: MYSQL_ALL_DATE_TYPES[0],
        BLOB: MYSQL_BLOB_TYPES[0],
        CLOB: MYSQL_CLOB_TYPES[0],
        BINARY: MYSQL_ALL_BINARY_TYPES[0],
        BOOLEAN: MYSQL_BOOLEAN_TYPES[0],
    }),
};

export const DIALECTS: Record<SqlDialect, Dialect> = {
    postgres: postgresDialect,
    mysql: mysqlDialect,
};
