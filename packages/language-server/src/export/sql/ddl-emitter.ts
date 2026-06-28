import type { DataTypeMappingConfiguration, SqlExportOptions, SqlInheritanceStrategy } from '@biger/common';
import type { Attribute, DataType, Entity, Model, Relationship } from '../../generated/ast.js';
import { ancestorsOf, descendantsOf, findWeakOwner, hasChildren, isAtMostOne, rootOf } from '../../model/model-queries.js';
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
    private model!: Model;

    constructor(
        private readonly dialect: Dialect,
        private readonly typeMappings?: DataTypeMappingConfiguration,
        private readonly inheritanceStrategy: SqlInheritanceStrategy = 'joined',
    ) {}

    emit(model: Model, opts?: SqlExportOptions): string {
        this.model = model;
        const tables: { name: string; sql: string }[] = [];

        for (const entity of model.entities) {
            const sql = this.emitEntityTable(entity);
            if (sql !== null) tables.push({ name: entity.name, sql });
            if (this.emitsOwnTable(entity)) {
                for (const attr of entity.attributes) {
                    if (attr.type?.MULTIVALUED) {
                        tables.push({
                            name: `${entity.name}_${attr.name}`,
                            sql: this.emitMultivaluedTable(entity, attr),
                        });
                    }
                }
            }
        }
        for (const relationship of model.relationships) {
            if (relationship.weak) continue;
            tables.push({ name: relationship.name, sql: this.emitRelationship(relationship) });
        }

        let head = '';
        if (opts?.generateDrop) {
            const dropLines = [...tables].reverse().map((t) => `DROP TABLE IF EXISTS ${this.quote(t.name)};`);
            head = dropLines.join('\n') + '\n';
        }
        return head + tables.map((t) => t.sql).join('');
    }

    private emitEntityTable(entity: Entity): string | null {
        if (!this.emitsOwnTable(entity)) return null;
        if (entity.weak) return this.emitWeakEntity(entity, this.model);

        switch (this.inheritanceStrategy) {
            case 'singleTable':
                return hasChildren(entity, this.model)
                    ? this.emitSingleTable(entity)
                    : this.emitPlainEntity(entity);
            case 'tablePerClass':
                return this.emitFlattenedTable(entity);
            default: {
                const parent = entity.extends?.ref;
                return parent ? this.emitInheritedEntity(entity, parent) : this.emitPlainEntity(entity);
            }
        }
    }

    /** Whether `entity` produces its own CREATE TABLE under the active strategy. */
    private emitsOwnTable(entity: Entity): boolean {
        if (entity.weak) return true;
        switch (this.inheritanceStrategy) {
            case 'singleTable':
                // Subclasses collapse into their root's single table.
                return !entity.extends?.ref;
            case 'tablePerClass':
                // Only concrete leaves get a table; ancestors are treated as abstract.
                return !hasChildren(entity, this.model);
            default:
                return true;
        }
    }

    /** SINGLE_TABLE: one table for the whole hierarchy rooted at `root`. */
    private emitSingleTable(root: Entity): string {
        const keyNames = new Set(this.keyAttrs(root).map((k) => k.name));
        const columns: string[] = [];
        const seen = new Set<string>();
        for (const a of this.emittableAttrs(root)) {
            columns.push(this.renderAttribute(a, keyNames.has(a.name)));
            seen.add(a.name);
        }
        // Subclass-specific columns are nullable — a row only fills the columns for its own type.
        for (const sub of descendantsOf(root, this.model)) {
            for (const a of this.emittableAttrs(sub)) {
                if (seen.has(a.name)) continue;
                seen.add(a.name);
                columns.push(this.renderAttribute(a, false, true));
            }
        }
        return this.renderTable({ name: root.name, columns, pk: [...keyNames] });
    }

    /** TABLE_PER_CLASS: a self-contained table for a concrete leaf, inherited columns flattened in. */
    private emitFlattenedTable(entity: Entity): string {
        const chain = [...ancestorsOf(entity).reverse(), entity]; // root … entity
        const keyNames = new Set(this.collectKeys(entity).map((k) => k.name));
        const columns: string[] = [];
        const seen = new Set<string>();
        for (const e of chain) {
            for (const a of this.emittableAttrs(e)) {
                if (seen.has(a.name)) continue;
                seen.add(a.name);
                columns.push(this.renderAttribute(a, keyNames.has(a.name)));
            }
        }
        return this.renderTable({ name: entity.name, columns, pk: [...keyNames] });
    }

    /** The table an FK should target for `entity` under the active strategy. */
    private refTableName(entity: Entity): string {
        return this.inheritanceStrategy === 'singleTable' ? rootOf(entity).name : entity.name;
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

        for (const [index, p] of participants.entries()) {
            const participantFkCols: string[] = [];
            // When the same entity participates more than once (e.g. a self-reference),
            // disambiguate column names by the participant role, or — if no role was
            // given — by a positional suffix so the columns/PK/FKs never collide.
            const prefix = hasDuplicates ? (p.role ?? `${p.entity.name}${index + 1}`) : undefined;
            for (const keyAttr of this.collectKeys(p.entity)) {
                const colName = prefix ? `${prefix}_${keyAttr.name}` : keyAttr.name;
                pkColumns.push(`${this.quote(colName)} ${this.renderDatatype(keyAttr.datatype)}`);
                pkColumnNames.push(colName);
                participantFkCols.push(colName);

                const cascade = p.isWhole ? ' ON DELETE CASCADE' : '';
                fk.push(
                    `FOREIGN KEY (${this.quote(colName)}) REFERENCES ${this.quote(this.refTableName(p.entity))}(${this.quote(keyAttr.name)})${cascade}`,
                );
            }
            if (p.atMostOne && participantFkCols.length > 0) {
                unique.push(`UNIQUE (${participantFkCols.map((c) => this.quote(c)).join(', ')})`);
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
        const fkCols = pkNames.map((n) => this.quote(n)).join(', ');
        const suffix = cascade ? ' ON DELETE CASCADE' : '';
        const fkClause = `FOREIGN KEY (${fkCols}) REFERENCES ${this.quote(this.refTableName(parent))}(${fkCols})${suffix}`;
        return { columns, pkNames, fkClause };
    }

    private renderTable(def: TableDef): string {
        const body = def.columns.map((c) => `    ${c}`);
        if (def.pk.length > 0) {
            body.push(`    PRIMARY KEY (${def.pk.map((n) => this.quote(n)).join(', ')})`);
        }
        for (const u of def.unique ?? []) {
            body.push(`    ${u}`);
        }
        for (const fk of def.fk ?? []) {
            body.push(`    ${fk}`);
        }
        return `CREATE TABLE ${this.quote(def.name)}(\n${body.join(',\n')}\n);\n`;
    }

    private renderAttribute(attr: Attribute, inPrimaryKey: boolean, forceNullable = false): string {
        const typeStr = this.renderDatatype(attr.datatype);
        const name = this.quote(attr.name);
        if (inPrimaryKey) return `${name} ${typeStr}`;
        const nullSuffix = attr.type?.OPTIONAL || forceNullable ? '' : ' NOT NULL';
        return `${name} ${typeStr}${nullSuffix}`;
    }

    private quote(name: string): string {
        return this.dialect.quoteIdentifier(name);
    }

    private renderDatatype(dt: DataType | undefined): string {
        if (!dt) return '';
        const mapped = this.dialect.mapDataType(dt.type, this.typeMappings);
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
