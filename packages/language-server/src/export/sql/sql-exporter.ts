import { sanitizeExportConfiguration, type ExportModelParams, type SqlExportOptions, type SqlGenerationDialect } from '@biger/common';
import { URI } from 'langium';
import type { EntityRelationshipServices } from '../../entity-relationship-module.js';
import type { Model } from '../../generated/ast.js';
import type { Exporter } from '../export-service.js';
import { DdlEmitter } from './ddl-emitter.js';
import { DIALECTS } from './dialects.js';

export class SqlExporter implements Exporter {
    readonly target = 'sql';
    readonly fileExtension = '.sql';

    constructor(private readonly services: EntityRelationshipServices) {}

    async exportModel(params: ExportModelParams): Promise<string> {
        const opts = params.targetOptions as SqlExportOptions | undefined;
        const dialectName: SqlGenerationDialect = opts?.dialect ?? 'generic';
        const dialect = DIALECTS[dialectName];
        if (!dialect) {
            throw new Error(`Unknown SQL dialect: ${dialectName}`);
        }

        const model = await this.parseToModel(params.erContent, params.sourceUri);
        const exportConfig = sanitizeExportConfiguration(opts?.exportConfig);
        const typeMappings = exportConfig?.typeMappings?.sql?.[dialectName];
        return new DdlEmitter(dialect, typeMappings).emit(model, opts);
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
