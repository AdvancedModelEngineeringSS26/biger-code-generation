export type MongoJsonValue =
    | string
    | number
    | boolean
    | null
    | MongoJsonValue[]
    | { [key: string]: MongoJsonValue };

export interface MongoCollectionDef {
    name: string;
    schema: MongoJsonValue;
    indexes: MongoIndexDef[];
}

export interface MongoIndexDef {
    keys: Record<string, 1 | -1>;
    options: Record<string, MongoJsonValue>;
}
