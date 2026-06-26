import type { DataTypeMappingConfiguration, MongoExportOptions } from '@biger/common';
import type { Attribute, DataType, Entity, Model, Relationship } from '../../generated/ast.js';
import { findWeakOwner, isAtMostOne } from '../../model/model-queries.js';
import { mapBsonType } from './bson-types.js';
import type { MongoCollectionDef, MongoIndexDef, MongoJsonValue } from './types.js';

interface Participant {
    entity: Entity;
    role?: string;
    atMostOne: boolean;
}

interface FieldDef {
    name: string;
    datatype: DataType | undefined;
}

export class MongoEmitter {
    constructor(private readonly typeMappings?: DataTypeMappingConfiguration) {}

    emit(model: Model, opts?: MongoExportOptions): string {
        const collections = this.buildCollections(model);
        const chunks: string[] = [];

        if (opts?.generateDrop) {
            for (const collection of [...collections].reverse()) {
                chunks.push(
                    `await db.getCollection(${quote(collection.name)}).drop().catch((error) => { if (error.codeName !== "NamespaceNotFound") throw error; });`,
                );
            }
        }

        for (const collection of collections) {
            chunks.push(this.renderCreateCollection(collection));
            for (const index of collection.indexes) {
                chunks.push(this.renderCreateIndex(collection.name, index));
            }
        }

        return `${chunks.join('\n\n')}\n`;
    }

    private buildCollections(model: Model): MongoCollectionDef[] {
        const collections = new Map<string, MongoCollectionDef>();
        const weakChildren = this.groupWeakChildren(model);

        for (const entity of model.entities) {
            if (entity.weak) continue;
            const collection = this.buildEntityCollection(entity, weakChildren.get(entity) ?? []);
            collections.set(collection.name, collection);
        }

        for (const relationship of model.relationships) {
            if (relationship.weak) continue;
            this.applyRelationship(relationship, collections);
        }

        return [...collections.values()];
    }

    private groupWeakChildren(model: Model): Map<Entity, Entity[]> {
        const grouped = new Map<Entity, Entity[]>();
        for (const entity of model.entities) {
            if (!entity.weak) continue;
            const owner = findWeakOwner(entity, model);
            if (!owner) continue;
            const children = grouped.get(owner) ?? [];
            children.push(entity);
            grouped.set(owner, children);
        }
        return grouped;
    }

    private buildEntityCollection(entity: Entity, weakChildren: Entity[]): MongoCollectionDef {
        const properties: Record<string, MongoJsonValue> = {};
        const required: string[] = [];
        const indexes: MongoIndexDef[] = [];

        const parent = entity.extends?.ref;
        const keyAttrs = parent ? this.collectKeys(parent) : this.keyAttrs(entity);
        const singleKey = keyAttrs.length === 1;

        if (singleKey) {
            properties._id = this.fieldSchema(keyAttrs[0]);
            required.push('_id');
        } else {
            for (const key of keyAttrs) {
                properties[key.name] = this.fieldSchema(key);
                required.push(key.name);
            }
            if (keyAttrs.length > 1) {
                indexes.push(this.uniqueIndex(entity.name, keyAttrs.map((a) => a.name)));
            }
        }

        for (const attr of this.emittableAttrs(entity)) {
            if (keyAttrs.includes(attr)) continue;
            properties[attr.name] = this.fieldSchema(attr);
            if (!attr.type?.OPTIONAL) required.push(attr.name);
        }

        for (const child of weakChildren) {
            properties[child.name] = {
                bsonType: 'array',
                items: this.embeddedWeakSchema(child),
            };
        }

        return {
            name: entity.name,
            schema: this.objectSchema(required, properties),
            indexes,
        };
    }

    private embeddedWeakSchema(entity: Entity): MongoJsonValue {
        const properties: Record<string, MongoJsonValue> = {};
        const required: string[] = [];

        for (const attr of this.emittableAttrs(entity)) {
            properties[attr.name] = this.fieldSchema(attr);
            if (attr.type?.PARTIAL_KEY || !attr.type?.OPTIONAL) {
                required.push(attr.name);
            }
        }

        return this.objectSchema(required, properties);
    }

    private applyRelationship(
        relationship: Relationship,
        collections: Map<string, MongoCollectionDef>,
    ): void {
        const participants = this.buildParticipants(relationship);
        const relAttrs = this.emittableAttrs(relationship);
        const inlineTarget = this.inlineReferenceTarget(participants, relAttrs);

        if (inlineTarget) {
            const dependent = inlineTarget;
            const principal = participants.find((p) => p !== dependent);
            const collection = dependent.entity ? collections.get(dependent.entity.name) : undefined;
            if (!principal || !collection) return;

            const fields = this.collectKeys(principal.entity).map((key) => ({
                name: this.referenceFieldName(principal, key),
                datatype: key.datatype,
            }));
            this.addReferenceFields(collection, fields, false);
            return;
        }

        const collection = this.buildRelationshipCollection(relationship, participants, relAttrs);
        collections.set(collection.name, collection);
    }

    private inlineReferenceTarget(participants: Participant[], relAttrs: Attribute[]): Participant | undefined {
        if (participants.length !== 2 || relAttrs.length > 0) return undefined;
        const atMostOne = participants.filter((p) => p.atMostOne);
        if (atMostOne.length !== 1) return undefined;
        return atMostOne[0];
    }

    private addReferenceFields(collection: MongoCollectionDef, fields: FieldDef[], required: boolean): void {
        const schema = collection.schema as { required?: MongoJsonValue; properties?: Record<string, MongoJsonValue> };
        const schemaRequired = (schema.required as string[] | undefined) ?? [];
        const properties = schema.properties ?? {};

        for (const field of fields) {
            properties[field.name] = this.fieldSchema(field);
            if (required) schemaRequired.push(field.name);
        }

        schema.properties = properties;
        if (schemaRequired.length > 0) schema.required = schemaRequired;
        collection.indexes.push({
            keys: Object.fromEntries(fields.map((field) => [field.name, 1] as const)),
            options: { name: `${collection.name}_${fields.map((f) => f.name).join('_')}_idx` },
        });
    }

    private buildRelationshipCollection(
        relationship: Relationship,
        participants: Participant[],
        relAttrs: Attribute[],
    ): MongoCollectionDef {
        const properties: Record<string, MongoJsonValue> = {};
        const required: string[] = [];
        const participantFieldGroups = this.participantFieldGroups(participants);
        const participantFields = participantFieldGroups.flat();

        for (const field of participantFields) {
            properties[field.name] = this.fieldSchema(field);
            required.push(field.name);
        }
        for (const attr of relAttrs) {
            properties[attr.name] = this.fieldSchema(attr);
            if (!attr.type?.OPTIONAL) required.push(attr.name);
        }

        const indexes = [this.uniqueIndex(relationship.name, participantFields.map((field) => field.name))];
        participantFieldGroups.forEach((fields, index) => {
            if (participants[index]?.atMostOne && fields.length > 0) {
                indexes.push(this.uniqueIndex(relationship.name, fields.map((field) => field.name)));
            }
        });

        return {
            name: relationship.name,
            schema: this.objectSchema(required, properties),
            indexes,
        };
    }

    private participantFieldGroups(participants: Participant[]): FieldDef[][] {
        const keyCounts = new Map<string, number>();
        const entityCounts = new Map<string, number>();
        for (const participant of participants) {
            entityCounts.set(participant.entity.name, (entityCounts.get(participant.entity.name) ?? 0) + 1);
            for (const key of this.collectKeys(participant.entity)) {
                keyCounts.set(key.name, (keyCounts.get(key.name) ?? 0) + 1);
            }
        }

        return participants.map((participant, index) =>
            this.collectKeys(participant.entity).map((key) => ({
                    name: this.participantFieldName(participant, key, index, keyCounts, entityCounts),
                    datatype: key.datatype,
            })),
        );
    }

    private participantFieldName(
        participant: Participant,
        key: Attribute,
        index: number,
        keyCounts: Map<string, number>,
        entityCounts: Map<string, number>,
    ): string {
        if (participant.role) return `${participant.role}_${key.name}`;
        if ((entityCounts.get(participant.entity.name) ?? 0) > 1) {
            return `${participant.entity.name}_${index + 1}_${key.name}`;
        }
        if ((keyCounts.get(key.name) ?? 0) > 1) return `${participant.entity.name}_${key.name}`;
        return key.name;
    }

    private referenceFieldName(participant: Participant, key: Attribute): string {
        const prefix = participant.role ?? participant.entity.name;
        return `${prefix}_${key.name}`;
    }

    private buildParticipants(rel: Relationship): Participant[] {
        const participants: Participant[] = [];
        const sourceEntity = rel.source.entity.ref;
        if (sourceEntity) {
            participants.push({ entity: sourceEntity, role: rel.source.role, atMostOne: false });
        }
        for (const target of rel.targets) {
            const targetEntity = target.relationEntity.entity.ref;
            if (targetEntity) {
                participants.push({
                    entity: targetEntity,
                    role: target.relationEntity.role,
                    atMostOne: false,
                });
            }
        }

        if (participants.length === 2) {
            participants[0].atMostOne = isAtMostOne(rel.targets[0].relationEntity.cardinality);
            participants[1].atMostOne = isAtMostOne(rel.source.cardinality);
        }

        return participants;
    }

    private objectSchema(required: string[], properties: Record<string, MongoJsonValue>): MongoJsonValue {
        const schema: Record<string, MongoJsonValue> = {
            bsonType: 'object',
        };
        if (required.length > 0) schema.required = required;
        schema.properties = properties;
        return schema;
    }

    private fieldSchema(field: Attribute | FieldDef): MongoJsonValue {
        if ('type' in field && field.type?.MULTIVALUED) {
            return {
                bsonType: 'array',
                items: { bsonType: mapBsonType(field.datatype, this.typeMappings) },
            };
        }
        return { bsonType: mapBsonType(field.datatype, this.typeMappings) };
    }

    private renderCreateCollection(collection: MongoCollectionDef): string {
        const options = {
            validator: {
                $jsonSchema: collection.schema,
            },
            validationLevel: 'strict',
            validationAction: 'error',
        };
        return `await db.createCollection(${quote(collection.name)}, ${renderValue(options)});`;
    }

    private renderCreateIndex(collectionName: string, index: MongoIndexDef): string {
        return `await db.getCollection(${quote(collectionName)}).createIndex(${renderValue(index.keys)}, ${renderValue(index.options)});`;
    }

    private uniqueIndex(collectionName: string, fields: string[]): MongoIndexDef {
        return {
            keys: Object.fromEntries(fields.map((field) => [field, 1] as const)),
            options: { name: `${collectionName}_${fields.join('_')}_unique`, unique: true },
        };
    }

    private emittableAttrs(owner: Entity | Relationship): Attribute[] {
        return owner.attributes.filter((a) => !a.type?.DERIVED);
    }

    private keyAttrs(entity: Entity): Attribute[] {
        return entity.attributes.filter((a) => a.type?.KEY);
    }

    private collectKeys(entity: Entity): Attribute[] {
        let current: Entity | undefined = entity;
        while (current) {
            const own = this.keyAttrs(current);
            if (own.length > 0) return own;
            current = current.extends?.ref;
        }
        return [];
    }
}

function renderValue(value: MongoJsonValue | Record<string, unknown>): string {
    if (Array.isArray(value)) {
        return `[${value.map((item) => renderValue(item)).join(', ')}]`;
    }
    if (value && typeof value === 'object') {
        const entries = Object.entries(value);
        if (entries.length === 0) return '{}';
        const lines = entries.map(([key, child]) => `${renderKey(key)}: ${renderValue(child as MongoJsonValue)}`);
        return `{\n${indent(lines.join(',\n'))}\n}`;
    }
    if (typeof value === 'string') return quote(value);
    return String(value);
}

function renderKey(key: string): string {
    return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? key : quote(key);
}

function quote(value: string): string {
    return JSON.stringify(value);
}

function indent(value: string): string {
    return value
        .split('\n')
        .map((line) => `  ${line}`)
        .join('\n');
}
