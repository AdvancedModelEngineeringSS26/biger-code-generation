import type { SqlDialect } from '@biger/common';
import { MySQL } from 'dt-sql-parser';
import { loadModule, parse as parsePostgres } from 'libpg-query';

export type ValidityResult = { ok: true } | { ok: false; message: string };

const mysqlParser = new MySQL();
let libpgReady: Promise<void> | undefined;

function ensureLibpgReady(): Promise<void> {
    // libpg-query ships as a WASM module; loadModule() is idempotent but we only want one init.
    if (!libpgReady) libpgReady = loadModule();
    return libpgReady;
}

export async function validateGrammar(sql: string, dialect: SqlDialect): Promise<ValidityResult> {
    if (dialect === 'postgres') return validatePostgresGrammar(sql);
    if (dialect === 'mysql') return validateMysqlGrammar(sql);
    return { ok: false, message: `No grammar validator registered for dialect '${dialect}'` };
}

async function validatePostgresGrammar(sql: string): Promise<ValidityResult> {
    await ensureLibpgReady();
    try {
        await parsePostgres(sql);
        return { ok: true };
    } catch (error) {
        return { ok: false, message: formatError(error) };
    }
}

function validateMysqlGrammar(sql: string): ValidityResult {
    const errors = mysqlParser.validate(sql);
    if (errors.length === 0) return { ok: true };
    const message = errors
        .map((e) => `line ${e.startLine}:${e.startColumn} ${e.message}`)
        .join('\n');
    return { ok: false, message };
}

function formatError(error: unknown): string {
    if (error instanceof Error) return error.message;
    return String(error);
}
