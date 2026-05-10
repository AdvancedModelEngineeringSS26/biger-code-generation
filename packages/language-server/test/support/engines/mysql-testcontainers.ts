import mysql from 'mysql2/promise';
import type { SqlEngineDriver } from './types.js';

// MySQL driver backed by a Docker container started in globalSetup.ts.
//
// init() reads connection info from the env vars globalSetup populates. If
// MYSQL_TEST_AVAILABLE !== 'true' (Docker missing, container failed to start),
// init() throws — the test file's pre-probe catches that and the MySQL
// describe block is skipped with `describe.skipIf`.
//
// reset() drops every user table in the test database. Cheaper than DROP
// DATABASE / CREATE DATABASE because the connection pool stays valid.
//
// `multipleStatements: true` is required to execute the goldens, which
// concatenate multiple `CREATE TABLE` statements separated by `;`.

interface RowDataPacketLike {
    [key: string]: unknown;
}

export class MysqlContainerDriver implements SqlEngineDriver {
    readonly target = 'sql' as const;
    readonly dialect = 'mysql';
    private pool?: mysql.Pool;

    async init(): Promise<void> {
        if (process.env.MYSQL_TEST_AVAILABLE !== 'true') {
            throw new Error(
                'MySQL container unavailable — globalSetup did not start one (Docker missing or container failed to start)'
            );
        }
        this.pool = mysql.createPool({
            host: process.env.MYSQL_TEST_HOST,
            port: Number(process.env.MYSQL_TEST_PORT),
            user: process.env.MYSQL_TEST_USER,
            password: process.env.MYSQL_TEST_PASSWORD,
            database: process.env.MYSQL_TEST_DATABASE,
            multipleStatements: true,
            connectionLimit: 4,
        });
        // Ping to surface auth/network errors immediately rather than at first query.
        const conn = await this.pool.getConnection();
        try {
            await conn.ping();
        } finally {
            conn.release();
        }
    }

    async reset(): Promise<void> {
        const pool = this.requirePool();
        const conn = await pool.getConnection();
        try {
            const [rows] = await conn.query(
                'SELECT TABLE_NAME AS name FROM information_schema.tables WHERE table_schema = ?',
                [process.env.MYSQL_TEST_DATABASE],
            );
            const tables = (rows as RowDataPacketLike[]).map((r) => String(r.name));
            if (tables.length > 0) {
                // FK_CHECKS=0 lets DROP TABLE proceed regardless of FK ordering.
                await conn.query('SET FOREIGN_KEY_CHECKS = 0');
                await conn.query(`DROP TABLE ${tables.map((t) => `\`${t}\``).join(', ')}`);
                await conn.query('SET FOREIGN_KEY_CHECKS = 1');
            }
        } finally {
            conn.release();
        }
    }

    async load(sql: string): Promise<void> {
        await this.requirePool().query(sql);
    }

    async query<Row = Record<string, unknown>>(sql: string): Promise<Row[]> {
        const [rows] = await this.requirePool().query(sql);
        return rows as Row[];
    }

    async close(): Promise<void> {
        if (this.pool) {
            await this.pool.end();
            this.pool = undefined;
        }
    }

    private requirePool(): mysql.Pool {
        if (!this.pool) throw new Error('MysqlContainerDriver: init() not called');
        return this.pool;
    }
}
