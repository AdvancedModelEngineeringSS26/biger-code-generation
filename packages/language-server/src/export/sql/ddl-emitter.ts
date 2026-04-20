import type { Attribute, DataType, Entity, Model, Relationship } from '../../generated/ast.js';
import type { Dialect } from './dialects.js';

export class DdlEmitter {
    constructor(private readonly dialect: Dialect) {}

    emit(model: Model): string {
        const parts: string[] = [];
        for (const entity of model.entities) {
            parts.push(this.emitEntity(entity));
        }
        for (const relationship of model.relationships) {
            parts.push(this.emitRelationship(relationship));
        }
        return parts.join('');
    }

    private emitEntity(entity: Entity): string {
        const columns = this.nonDerivedAttrs(entity.attributes).map((a) => this.renderAttribute(a));
        const keys = this.keyAttrs(entity);
        return this.renderTable(entity.name, columns, keys.map((k) => k.name));
    }

    private emitRelationship(rel: Relationship): string {
        const participants: Entity[] = [];
        const sourceEntity = rel.source.entity.ref;
        if (sourceEntity) participants.push(sourceEntity);
        for (const target of rel.targets) {
            const targetEntity = target.relationEntity.entity.ref;
            if (targetEntity) participants.push(targetEntity);
        }

        const pkColumnLines: string[] = [];
        const pkColumnNames: string[] = [];
        for (const entity of participants) {
            for (const keyAttr of this.keyAttrs(entity)) {
                pkColumnLines.push(
                    `${keyAttr.name} ${this.renderDatatype(keyAttr.datatype)} references ${entity.name}(${keyAttr.name})`
                );
                pkColumnNames.push(keyAttr.name);
            }
        }

        const relAttrLines = this.nonDerivedAttrs(rel.attributes).map((a) => this.renderAttribute(a));
        const columns = [...pkColumnLines, ...relAttrLines];

        return this.renderTable(rel.name, columns, pkColumnNames);
    }

    private renderTable(name: string, columnLines: string[], pkColumnNames: string[]): string {
        const body = columnLines.map((c) => `    ${c}`);
        if (pkColumnNames.length > 0) {
            body.push(`    PRIMARY KEY (${pkColumnNames.join(', ')})`);
        }
        return `CREATE TABLE ${name}(\n${body.join(',\n')}\n);\n`;
    }

    private renderAttribute(attr: Attribute): string {
        return `${attr.name} ${this.renderDatatype(attr.datatype)}`;
    }

    private renderDatatype(dt: DataType | undefined): string {
        if (!dt) return '';
        const mapped = this.dialect.mapDataType(dt.type);
        if (dt.size && dt.d) return `${mapped}(${dt.size}, ${dt.d})`;
        if (dt.size) return `${mapped}(${dt.size})`;
        return mapped;
    }

    private nonDerivedAttrs(attrs: Attribute[]): Attribute[] {
        return attrs.filter((a) => !a.type?.DERIVED);
    }

    private keyAttrs(entity: Entity): Attribute[] {
        return entity.attributes.filter((a) => a.type?.KEY);
    }
}
