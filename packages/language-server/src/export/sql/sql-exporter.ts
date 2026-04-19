import type { ExportModelParams, SqlExportOptions } from '@biger/common';
import { URI } from 'langium';
import type { EntityRelationshipServices } from '../../entity-relationship-module.js';
import type { Model } from '../../generated/ast.js';
import type { Exporter } from '../export-service.js';

export class SqlExporter implements Exporter {
    readonly target = 'sql';
    readonly fileExtension = '.sql';

    constructor(private readonly services: EntityRelationshipServices) {}

    async exportModel(params: ExportModelParams): Promise<string> {
        const options = params.targetOptions as SqlExportOptions | undefined;
        const dialect = options?.dialect ?? 'generic';

        const model = await this.parseToModel(params.erContent, params.sourceUri);
        return this.emitScaffold(model, dialect);
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

    private emitScaffold(model: Model, dialect: string): string {
        const lines: string[] = [];
        lines.push('-- biger SQL export (scaffold, step 1)');
        lines.push(`-- Model: ${model.name}`);
        lines.push(`-- Dialect: ${dialect}`);
        lines.push(`-- Entities: ${model.entities.length}`);
        lines.push(`-- Relationships: ${model.relationships.length}`);
        lines.push('');
        for (const e of model.entities) {
            const weakFlag = e.weak ? ' [weak]' : '';
            lines.push(`-- Entity: ${e.name}${weakFlag} (attributes: ${e.attributes.length})`);
        }
        if (model.relationships.length > 0) lines.push('');
        for (const r of model.relationships) {
            const weakFlag = r.weak ? ' [weak]' : '';
            const src = r.source.entity.ref?.name ?? '?';
            lines.push(`-- Relationship: ${r.name}${weakFlag} (source: ${src}, targets: ${r.targets.length})`);
        }
        return lines.join('\n') + '\n';
    }
}
