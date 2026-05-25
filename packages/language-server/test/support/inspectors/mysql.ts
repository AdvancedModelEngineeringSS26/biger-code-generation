import type { SqlEngineDriver } from '../engines/types.js';
import { assemble } from './postgres.js';
import type { SchemaShape, SqlInspector } from './types.js';

// MySQL inspector — information_schema.COLUMNS gives the full COLUMN_TYPE
// (e.g. "varchar(255)", "tinyint(1)") so no extra formatting is needed.
// FK metadata lives in KEY_COLUMN_USAGE with REFERENCED_TABLE_NAME populated.

interface ColumnRow {
    table_name: string;
    column_name: string;
    column_type: string;
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

export class MysqlInspector implements SqlInspector {
    async snapshot(driver: SqlEngineDriver): Promise<SchemaShape> {
        const dbName = process.env.MYSQL_TEST_DATABASE;
        if (!dbName) throw new Error('MysqlInspector: MYSQL_TEST_DATABASE not set');

        const columns = await driver.query<ColumnRow>(
            `SELECT TABLE_NAME    AS table_name,
                    COLUMN_NAME   AS column_name,
                    COLUMN_TYPE   AS column_type,
                    IS_NULLABLE   AS is_nullable,
                    ORDINAL_POSITION AS ordinal_position
             FROM information_schema.columns
             WHERE table_schema = '${dbName}'
             ORDER BY TABLE_NAME, ORDINAL_POSITION`
        );

        const pks = await driver.query<PkRow>(
            `SELECT TABLE_NAME  AS table_name,
                    COLUMN_NAME AS column_name
             FROM information_schema.key_column_usage
             WHERE table_schema = '${dbName}' AND constraint_name = 'PRIMARY'
             ORDER BY TABLE_NAME, ORDINAL_POSITION`
        );

        const fks = await driver.query<FkRow>(
            `SELECT CONSTRAINT_NAME       AS constraint_name,
                    TABLE_NAME            AS table_name,
                    COLUMN_NAME           AS column_name,
                    REFERENCED_TABLE_NAME AS foreign_table_name,
                    REFERENCED_COLUMN_NAME AS foreign_column_name,
                    ORDINAL_POSITION      AS ordinal_position
             FROM information_schema.key_column_usage
             WHERE table_schema = '${dbName}' AND referenced_table_name IS NOT NULL
             ORDER BY CONSTRAINT_NAME, ORDINAL_POSITION`
        );

        return assemble(columns, pks, fks, (c) => c.column_type);
    }
}
