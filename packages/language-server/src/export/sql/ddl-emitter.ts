import type { SqlExportOptions } from '@biger/common';
import type { Attribute, DataType, Entity, Model, Relationship } from '../../generated/ast.js';
import { findWeakOwner, isAtMostOne } from '../../model/model-queries.js';
import type { Dialect } from './dialects.js';

interface TableDef {
    name: string;
    columns: string[];
    pk: string[];
    fk?: string[];
    unique?: string[];
}

interface Participant {
    entity: Entity;
    role?: string;
    isWhole: boolean;
    atMostOne: boolean;
}

interface ParentKeyBlock {
    columns: string[];
    pkNames: string[];
    fkClause: string | null;
}

export class DdlEmitter {
    constructor(private readonly dialect: Dialect) {}

    emit(model: Model, opts?: SqlExportOptions): string {
        const tables: { name: string; sql: string }[] = [];

        for (const entity of model.entities) {
            tables.push({ name: entity.name, sql: this.emitEntity(entity, model) });
            for (const attr of entity.attributes) {
                if (attr.type?.MULTIVALUED) {
                    tables.push({
                        name: `${entity.name}_${attr.name}`,
                        sql: this.emitMultivaluedTable(entity, attr),
                    });
                }
            }
        }
        for (const relationship of model.relationships) {
            if (relationship.weak) continue;
            tables.push({ name: relationship.name, sql: this.emitRelationship(relationship) });
        }

        let head = '';
        if (opts?.generateDrop) {
            const dropLines = [...tables].reverse().map((t) => `DROP TABLE IF EXISTS ${t.name};`);
            head = dropLines.join('\n') + '\n';
        }
        return head + tables.map((t) => t.sql).join('');
    }

    private emitEntity(entity: Entity, model: Model): string {
        if (entity.weak) return this.emitWeakEntity(entity, model);
        const parent = entity.extends?.ref;
        if (parent) return this.emitInheritedEntity(entity, parent);
        return this.emitPlainEntity(entity);
    }

    private emitPlainEntity(entity: Entity): string {
        const pkNames = new Set(this.keyAttrs(entity).map((k) => k.name));
        const columns = this.emittableAttrs(entity).map((a) =>
            this.renderAttribute(a, pkNames.has(a.name)),
        );
        return this.renderTable({ name: entity.name, columns, pk: [...pkNames] });
    }

    private emitInheritedEntity(entity: Entity, parent: Entity): string {
        const { columns, pkNames, fkClause } = this.buildParentKeyBlock(parent, false);
        for (const a of this.emittableAttrs(entity)) columns.push(this.renderAttribute(a, false));
        return this.renderTable({
            name: entity.name,
            columns,
            pk: pkNames,
            fk: fkClause ? [fkClause] : [],
        });
    }

    private emitWeakEntity(entity: Entity, model: Model): string {
        const owner = findWeakOwner(entity, model);

        let columns: string[] = [];
        let pkNames: string[] = [];
        const fk: string[] = [];

        if (owner) {
            const block = this.buildParentKeyBlock(owner, true);
            columns = block.columns;
            pkNames = block.pkNames;
            if (block.fkClause) fk.push(block.fkClause);
        }

        const partialKeyNames = new Set<string>();
        for (const a of entity.attributes) {
            if (a.type?.PARTIAL_KEY) partialKeyNames.add(a.name);
        }
        for (const a of this.emittableAttrs(entity)) {
            const inPk = partialKeyNames.has(a.name);
            columns.push(this.renderAttribute(a, inPk));
            if (inPk) pkNames.push(a.name);
        }

        return this.renderTable({ name: entity.name, columns, pk: pkNames, fk });
    }

    private emitMultivaluedTable(entity: Entity, attr: Attribute): string {
        const { columns, pkNames, fkClause } = this.buildParentKeyBlock(entity, true);
        columns.push(this.renderAttribute(attr, true));
        pkNames.push(attr.name);
        return this.renderTable({
            name: `${entity.name}_${attr.name}`,
            columns,
            pk: pkNames,
            fk: fkClause ? [fkClause] : [],
        });
    }

    private emitRelationship(rel: Relationship): string {
        const participants = this.buildParticipants(rel);

        const counts = new Map<string, number>();
        for (const p of participants) {
            counts.set(p.entity.name, (counts.get(p.entity.name) ?? 0) + 1);
        }
        const hasDuplicates = [...counts.values()].some((c) => c > 1);

        const pkColumns: string[] = [];
        const pkColumnNames: string[] = [];
        const fk: string[] = [];
        const unique: string[] = [];

        for (const p of participants) {
            const participantFkCols: string[] = [];
            for (const keyAttr of this.collectKeys(p.entity)) {
                const colName = hasDuplicates && p.role ? `${p.role}_${keyAttr.name}` : keyAttr.name;
                pkColumns.push(`${colName} ${this.renderDatatype(keyAttr.datatype)}`);
                pkColumnNames.push(colName);
                participantFkCols.push(colName);

                const cascade = p.isWhole ? ' ON DELETE CASCADE' : '';
                fk.push(
                    `FOREIGN KEY (${colName}) REFERENCES ${p.entity.name}(${keyAttr.name})${cascade}`,
                );
            }
            if (p.atMostOne && participantFkCols.length > 0) {
                unique.push(`UNIQUE (${participantFkCols.join(', ')})`);
            }
        }

        const relAttrs = this.emittableAttrs(rel).map((a) => this.renderAttribute(a, false));
        const columns = [...pkColumns, ...relAttrs];

        return this.renderTable({ name: rel.name, columns, pk: pkColumnNames, fk, unique });
    }

    // ── helpers ──────────────────────────────────────────────────────────

    private buildParticipants(rel: Relationship): Participant[] {
        const participants: Participant[] = [];

        const sourceEntity = rel.source.entity.ref;
        if (sourceEntity) {
            participants.push({
                entity: sourceEntity,
                role: rel.source.role,
                isWhole: false,
                atMostOne: false,
            });
        }
        for (const target of rel.targets) {
            const tEntity = target.relationEntity.entity.ref;
            if (tEntity) {
                participants.push({
                    entity: tEntity,
                    role: target.relationEntity.role,
                    isWhole: false,
                    atMostOne: false,
                });
            }
        }

        const isBinary = participants.length === 2;
        if (isBinary) {
            const targetType = rel.targets[0].type;
            if (targetType.COMPOSITION_LEFT) participants[0].isWhole = true;
            if (targetType.COMPOSITION_RIGHT) participants[1].isWhole = true;

            participants[0].atMostOne = isAtMostOne(rel.targets[0].relationEntity.cardinality);
            participants[1].atMostOne = isAtMostOne(rel.source.cardinality);
        }

        return participants;
    }

    private buildParentKeyBlock(parent: Entity, cascade: boolean): ParentKeyBlock {
        const keys = this.collectKeys(parent);
        const columns = keys.map((k) => this.renderAttribute(k, true));
        const pkNames = keys.map((k) => k.name);
        if (pkNames.length === 0) return { columns, pkNames, fkClause: null };
        const fkCols = pkNames.join(', ');
        const suffix = cascade ? ' ON DELETE CASCADE' : '';
        const fkClause = `FOREIGN KEY (${fkCols}) REFERENCES ${parent.name}(${fkCols})${suffix}`;
        return { columns, pkNames, fkClause };
    }

    private renderTable(def: TableDef): string {
        const body = def.columns.map((c) => `    ${c}`);
        if (def.pk.length > 0) {
            body.push(`    PRIMARY KEY (${def.pk.join(', ')})`);
        }
        for (const u of def.unique ?? []) {
            body.push(`    ${u}`);
        }
        for (const fk of def.fk ?? []) {
            body.push(`    ${fk}`);
        }
        return `CREATE TABLE ${def.name}(\n${body.join(',\n')}\n);\n`;
    }

    private renderAttribute(attr: Attribute, inPrimaryKey: boolean): string {
        const typeStr = this.renderDatatype(attr.datatype);
        if (inPrimaryKey) return `${attr.name} ${typeStr}`;
        const nullSuffix = attr.type?.OPTIONAL ? '' : ' NOT NULL';
        return `${attr.name} ${typeStr}${nullSuffix}`;
    }

    private renderDatatype(dt: DataType | undefined): string {
        if (!dt) return '';
        const mapped = this.dialect.mapDataType(dt.type);
        if (dt.size && dt.d) return `${mapped}(${dt.size}, ${dt.d})`;
        if (dt.size) return `${mapped}(${dt.size})`;
        return mapped;
    }

    private emittableAttrs(owner: Entity | Relationship): Attribute[] {
        return owner.attributes.filter((a) => !a.type?.DERIVED && !a.type?.MULTIVALUED);
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
