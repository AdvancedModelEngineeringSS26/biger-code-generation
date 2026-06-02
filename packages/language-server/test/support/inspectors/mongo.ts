import type { MongoEngineDriver } from '../engines/types.js';
import { normalizeMongoShape, type MongoScriptShape } from '../mongo-script.js';
import type { MongoInspector } from './types.js';

interface MongoCollectionInfo {
    name: string;
    options?: {
        validator?: unknown;
    };
}

export class MongoDbInspector implements MongoInspector {
    async snapshot(driver: MongoEngineDriver): Promise<MongoScriptShape> {
        const db = driver.db();
        const result = await db.command({ listCollections: 1, nameOnly: false });
        const collections = ((result.cursor as { firstBatch?: MongoCollectionInfo[] } | undefined)?.firstBatch) ?? [];
        const shape: MongoScriptShape = { collections: {} };

        for (const collectionInfo of collections) {
            const name = collectionInfo.name;
            const indexes = await db.collection(name).listIndexes().toArray();
            shape.collections[name] = {
                validator: collectionInfo.options?.validator,
                indexes: indexes
                    .filter((index) => index.name !== '_id_')
                    .map((index) => ({
                        keys: index.key,
                        options: {
                            name: index.name,
                            ...(index.unique ? { unique: true } : {}),
                        },
                    })),
            };
        }

        return normalizeMongoShape(shape);
    }
}
