export interface MongoScriptShape {
    collections: Record<string, MongoCollectionShape>;
}

export interface MongoCollectionShape {
    validator: unknown;
    indexes: MongoIndexShape[];
}

export interface MongoIndexShape {
    keys: Record<string, unknown>;
    options: Record<string, unknown>;
}

type AsyncFunctionConstructor = new (...args: string[]) => (db: unknown) => Promise<void>;
const AsyncFunction = Object.getPrototypeOf(async function () { /* constructor lookup */ }).constructor as AsyncFunctionConstructor;

export interface ValidityResult {
    ok: boolean;
    message?: string;
}

export async function validateMongoScript(script: string): Promise<ValidityResult> {
    try {
        await shapeFromMongoScript(script);
        return { ok: true };
    } catch (err) {
        return {
            ok: false,
            message: err instanceof Error ? err.message : String(err),
        };
    }
}

export async function shapeFromMongoScript(script: string): Promise<MongoScriptShape> {
    const collections = new Map<string, MongoCollectionShape>();
    const db = {
        async createCollection(name: string, options: { validator?: unknown }) {
            collections.set(name, {
                validator: options.validator,
                indexes: [],
            });
        },
        getCollection(name: string) {
            return {
                async createIndex(keys: Record<string, unknown>, options: Record<string, unknown> = {}) {
                    const collection = collections.get(name);
                    if (!collection) throw new Error(`Index created before collection exists: ${name}`);
                    collection.indexes.push({ keys, options });
                },
                async drop() {
                    collections.delete(name);
                },
            };
        },
    };

    const run = new AsyncFunction('db', script);
    await run(db);
    return normalizeMongoShape({ collections: Object.fromEntries(collections) });
}

export function normalizeMongoShape(shape: MongoScriptShape): MongoScriptShape {
    const collections: Record<string, MongoCollectionShape> = {};
    for (const name of Object.keys(shape.collections).sort()) {
        const collection = shape.collections[name];
        collections[name] = {
            validator: sortJson(collection.validator),
            indexes: [...collection.indexes]
                .map((index) => ({
                    keys: sortJson(index.keys) as Record<string, unknown>,
                    options: sortJson(index.options) as Record<string, unknown>,
                }))
                .sort((a, b) => String(a.options.name ?? '').localeCompare(String(b.options.name ?? ''))),
        };
    }
    return { collections };
}

function sortJson(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(sortJson);
    if (!value || typeof value !== 'object') return value;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
        out[key] = sortJson((value as Record<string, unknown>)[key]);
    }
    return out;
}
