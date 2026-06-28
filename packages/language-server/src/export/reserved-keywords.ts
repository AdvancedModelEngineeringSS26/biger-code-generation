interface ReservedKeywordDialect {
    readonly label: string;
    readonly keywords: ReadonlySet<string>;
}

// Generic SQL has no concrete target parser. Keep this as a conservative core
// set for the generic SQL export command while the SQL emitters output
// identifiers unquoted.
const GENERIC_SQL_RESERVED_KEYWORDS = [
    'all', 'and', 'any', 'as', 'asc', 'between', 'both', 'by', 'case', 'cast',
    'check', 'column', 'constraint', 'create', 'current_date', 'current_time',
    'current_timestamp', 'current_user', 'delete', 'desc', 'distinct', 'else',
    'end', 'except', 'exists', 'false', 'fetch', 'for', 'foreign', 'from',
    'grant', 'group', 'having', 'in', 'inner', 'insert', 'intersect', 'into',
    'is', 'join', 'leading', 'left', 'like', 'not', 'null', 'on', 'or',
    'order', 'primary', 'references', 'right', 'select', 'table', 'then', 'to',
    'trailing', 'true', 'union', 'unique', 'update', 'user', 'using', 'values',
    'when', 'where', 'with',
] as const;

// Source: PostgreSQL 18 docs, Appendix C "SQL Key Words", Table C.1:
// https://www.postgresql.org/docs/current/sql-keywords-appendix.html
// Cross-checked with dt-sql-parser's PostgreSQL reservedKeyword parser rule.
// Checked 2026-06-26. Keep hard-reserved tokens because SQL identifiers are
// currently emitted unquoted.
const POSTGRES_RESERVED_KEYWORDS = [
    'all', 'analyse', 'analyze', 'and', 'any', 'array', 'as', 'asc',
    'asymmetric', 'both', 'case', 'cast', 'check', 'collate', 'column',
    'constraint', 'create', 'current_catalog', 'current_date', 'current_role',
    'current_time', 'current_timestamp', 'current_user', 'deferrable', 'desc',
    'distinct', 'do', 'else', 'end', 'except', 'false', 'fetch', 'for',
    'foreign', 'from', 'grant', 'group', 'having', 'in', 'initially',
    'intersect', 'lateral', 'leading', 'limit', 'localtime', 'localtimestamp',
    'not', 'null', 'offset', 'on', 'only', 'or', 'order', 'placing', 'primary',
    'references', 'returning', 'select', 'session_user', 'some', 'symmetric',
    'table', 'then', 'to', 'trailing', 'true', 'union', 'unique', 'user',
    'using', 'variadic', 'when', 'where', 'window', 'with',
] as const;

// Source: MySQL 8.4 Reference Manual, "Keywords and Reserved Words":
// https://dev.mysql.com/doc/refman/8.4/en/keywords.html
// Cross-checked with dt-sql-parser's MySQL keyword categories. Checked
// 2026-06-26. Keep reserved tokens because SQL identifiers are currently emitted
// unquoted.
const MYSQL_RESERVED_KEYWORDS = [
    'accessible', 'add', 'all', 'alter', 'analyze', 'and', 'as', 'asc',
    'asensitive', 'before', 'between', 'bigint', 'binary', 'blob', 'both', 'by',
    'call', 'cascade', 'case', 'change', 'char', 'character', 'check',
    'collate', 'column', 'condition', 'constraint', 'continue', 'convert',
    'create', 'cross', 'cube', 'cume_dist', 'current_date', 'current_time',
    'current_timestamp', 'current_user', 'cursor', 'database', 'databases',
    'day_hour', 'day_microsecond', 'day_minute', 'day_second', 'dec', 'decimal',
    'declare', 'default', 'delayed', 'delete', 'dense_rank', 'desc', 'describe',
    'deterministic', 'distinct', 'distinctrow', 'div', 'double', 'drop', 'dual',
    'each', 'else', 'elseif', 'empty', 'enclosed', 'escaped', 'except',
    'exists', 'exit', 'explain', 'false', 'fetch', 'first_value', 'float',
    'float4', 'float8', 'for', 'force', 'foreign', 'from', 'fulltext',
    'function', 'generated', 'get', 'grant', 'group', 'grouping', 'groups',
    'having', 'high_priority', 'hour_microsecond', 'hour_minute', 'hour_second',
    'if', 'ignore', 'in', 'index', 'infile', 'inner', 'inout', 'insensitive',
    'insert', 'int', 'int1', 'int2', 'int3', 'int4', 'int8', 'integer',
    'intersect', 'interval', 'into', 'io_after_gtids', 'io_before_gtids', 'is',
    'iterate', 'join', 'json_table', 'lag', 'last_value', 'lateral', 'lead',
    'leading', 'leave', 'left', 'like', 'limit', 'linear', 'lines', 'load',
    'localtime', 'localtimestamp', 'lock', 'long', 'longblob', 'longtext',
    'loop', 'low_priority', 'master_bind', 'master_ssl_verify_server_cert',
    'match', 'maxvalue', 'mediumblob', 'mediumint', 'mediumtext', 'middleint',
    'minute_microsecond', 'minute_second', 'mod', 'modifies', 'natural', 'not',
    'no_write_to_binlog', 'nth_value', 'ntile', 'null', 'numeric', 'of', 'on',
    'optimize', 'optimizer_costs', 'option', 'optionally', 'or', 'order', 'out',
    'outer', 'outfile', 'over', 'partition', 'percent_rank', 'precision',
    'primary', 'procedure', 'purge', 'range', 'rank', 'read', 'reads',
    'read_write', 'real', 'recursive', 'references', 'regexp', 'release',
    'rename', 'repeat', 'replace', 'require', 'resignal', 'restrict', 'return',
    'revoke', 'right', 'rlike', 'row', 'row_number', 'rows', 'schema',
    'schemas', 'second_microsecond', 'select', 'sensitive', 'separator', 'set',
    'show', 'signal', 'smallint', 'spatial', 'specific', 'sql', 'sqlexception',
    'sqlstate', 'sqlwarning', 'sql_big_result', 'sql_calc_found_rows',
    'sql_small_result', 'ssl', 'starting', 'stored', 'straight_join', 'system',
    'table', 'terminated', 'then', 'tinyblob', 'tinyint', 'tinytext', 'to',
    'trailing', 'trigger', 'true', 'undo', 'union', 'unique', 'unlock',
    'unsigned', 'update', 'usage', 'use', 'using', 'utc_date', 'utc_time',
    'utc_timestamp', 'values', 'varbinary', 'varchar', 'varcharacter',
    'varying', 'virtual', 'when', 'where', 'while', 'window', 'with', 'write',
    'xor', 'year_month', 'zerofill',
] as const;

// MongoDB has no SQL-style reserved keyword list. `_id` is included because
// MongoDB reserves it as the primary key field for documents:
// https://www.mongodb.com/docs/manual/core/document/#field-names
// Checked 2026-06-26.
const MONGO_RESERVED_KEYWORDS = [
    '_id',
] as const;

const RESERVED_KEYWORD_DIALECTS: readonly ReservedKeywordDialect[] = [
    { label: 'SQL', keywords: toKeywordSet(GENERIC_SQL_RESERVED_KEYWORDS) },
    { label: 'PostgreSQL', keywords: toKeywordSet(POSTGRES_RESERVED_KEYWORDS) },
    { label: 'MySQL', keywords: toKeywordSet(MYSQL_RESERVED_KEYWORDS) },
    { label: 'MongoDB', keywords: toKeywordSet(MONGO_RESERVED_KEYWORDS) },
];

/**
 * True when `identifier` is a reserved keyword for the given dialect label
 * ('PostgreSQL' or 'MySQL'). Used by the SQL emitter to decide whether an
 * identifier must be quoted. Case-insensitive.
 */
export function isReservedKeyword(identifier: string, dialectLabel: string): boolean {
    const normalized = normalizeIdentifier(identifier);
    if (!normalized) return false;
    const dialect = RESERVED_KEYWORD_DIALECTS.find((d) => d.label === dialectLabel);
    return dialect ? dialect.keywords.has(normalized) : false;
}

export function getReservedKeywordWarning(identifier: string | undefined): string | undefined {
    if (!identifier) return undefined;

    const dialectLabels = findReservedKeywordDialectLabels(identifier);
    if (dialectLabels.length === 0) return undefined;

    return `"${identifier}" is a reserved keyword in ${formatDialectLabels(dialectLabels)} and may cause generation issues.`;
}

function findReservedKeywordDialectLabels(identifier: string): string[] {
    const normalized = normalizeIdentifier(identifier);
    if (!normalized) return [];

    return RESERVED_KEYWORD_DIALECTS
        .filter(dialect => dialect.keywords.has(normalized))
        .map(dialect => dialect.label);
}

function normalizeIdentifier(identifier: string): string {
    return identifier.trim().toLowerCase();
}

function formatDialectLabels(labels: readonly string[]): string {
    if (labels.length === 1) return labels[0];
    if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;

    const head = labels.slice(0, -1).join(', ');
    return `${head}, and ${labels[labels.length - 1]}`;
}

function toKeywordSet(keywords: readonly string[]): ReadonlySet<string> {
    return new Set(keywords);
}
