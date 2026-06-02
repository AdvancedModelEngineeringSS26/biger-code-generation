import { MongoClient, type Db } from 'mongodb';
import type { MongoEngineDriver } from './types.js';

type AsyncFunctionConstructor = new (...args: string[]) => (db: unknown) => Promise<void>;
const AsyncFunction = Object.getPrototypeOf(async function () { /* constructor lookup */ }).constructor as AsyncFunctionConstructor;

export class MongoContainerDriver implements MongoEngineDriver {
    readonly target = 'mongo' as const;
    readonly dialect = 'mongo' as const;
    private client?: MongoClient;
    private database?: Db;

    async init(): Promise<void> {
        if (process.env.MONGO_TEST_AVAILABLE !== 'true') {
            throw new Error(
                'MongoDB container unavailable — globalSetup did not start one (Docker missing or container failed to start)',
            );
        }

        this.client = new MongoClient(this.requireEnv('MONGO_TEST_URI'));
        await this.client.connect();
        this.database = this.client.db(this.requireEnv('MONGO_TEST_DATABASE'));
        await this.database.command({ ping: 1 });
    }

    async reset(): Promise<void> {
        await this.db().dropDatabase();
    }

    async load(payload: string): Promise<void> {
        const run = new AsyncFunction('db', payload);
        await run(this.scriptDb());
    }

    db(): Db {
        if (!this.database) throw new Error('MongoContainerDriver: init() not called');
        return this.database;
    }

    async close(): Promise<void> {
        if (this.client) {
            await this.client.close();
            this.client = undefined;
            this.database = undefined;
        }
    }

    private scriptDb(): unknown {
        const db = this.db();
        return {
            createCollection: (name: string, options: Record<string, unknown>) =>
                db.createCollection(name, options),
            getCollection: (name: string) => db.collection(name),
        };
    }

    private requireEnv(name: string): string {
        const value = process.env[name];
        if (!value) throw new Error(`Missing required env var: ${name}`);
        return value;
    }
}
