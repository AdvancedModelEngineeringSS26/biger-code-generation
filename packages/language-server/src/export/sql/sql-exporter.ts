import type { ExportModelParams } from '@biger/common';
import { URI } from 'langium';
import type { EntityRelationshipServices } from '../../entity-relationship-module.js';
import type { Attribute, DataType, Entity, Model, Relationship } from '../../generated/ast.js';
import type { Exporter } from '../export-service.js';

export class SqlExporter implements Exporter {
    readonly target = 'sql';
    readonly fileExtension = '.sql';

    constructor(private readonly services: EntityRelationshipServices) {}

    async exportModel(params: ExportModelParams): Promise<string> {
        // Dialect currently unused: postgres/mysql fixtures are identical. Will branch when fixtures diverge.
        const model = await this.parseToModel(params.erContent, params.sourceUri);
        return this.emitDdl(model);
    }

    private async parseToModel(erContent: string, sourceUri: string): Promise<Model> {
        const uri = URI.parse(sourceUri);
        const documentFactory = this.services.shared.workspace.LangiumDocumentFactory;
        const documentBuilder = this.services.shared.workspace.DocumentBuilder;
        const documents = this.services.shared.workspace.LangiumDocuments;

        if (documents.hasDocument(uri)) {
            documents.deleteDocument(uri);
        }
        const document = documentFactory.fromString<Model>(erContent, uri);
        documents.addDocument(document);
        await documentBuilder.build([document], { validation: false });

        const { parserErrors, lexerErrors } = document.parseResult;
        if (lexerErrors.length > 0 || parserErrors.length > 0) {
            const first = lexerErrors[0] ?? parserErrors[0];
            throw new Error(`Parse error: ${first.message}`);
        }
        return document.parseResult.value;
    }

    private emitDdl(model: Model): string {
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
        if (dt.size && dt.d) return `${dt.type}(${dt.size}, ${dt.d})`;
        if (dt.size) return `${dt.type}(${dt.size})`;
        return dt.type;
    }

    private nonDerivedAttrs(attrs: Attribute[]): Attribute[] {
        return attrs.filter((a) => !a.type?.DERIVED);
    }

    private keyAttrs(entity: Entity): Attribute[] {
        return entity.attributes.filter((a) => a.type?.KEY);
    }
}
