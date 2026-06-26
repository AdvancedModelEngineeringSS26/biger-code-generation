import { sanitizeExportConfiguration, type ExportModelParams, type MongoExportOptions } from '@biger/common';
import { URI } from 'langium';
import type { EntityRelationshipServices } from '../../entity-relationship-module.js';
import type { Model } from '../../generated/ast.js';
import type { Exporter } from '../export-service.js';
import { MongoEmitter } from './mongo-emitter.js';

export class MongoExporter implements Exporter {
    readonly target = 'mongo';
    readonly fileExtension = '.mongo.js';

    constructor(private readonly services: EntityRelationshipServices) {}

    async exportModel(params: ExportModelParams): Promise<string> {
        const opts = params.targetOptions as MongoExportOptions | undefined;
        const model = await this.parseToModel(params.erContent, params.sourceUri);
        const exportConfig = sanitizeExportConfiguration(opts?.exportConfig);
        return new MongoEmitter(exportConfig?.typeMappings?.mongo).emit(model, opts);
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
}
