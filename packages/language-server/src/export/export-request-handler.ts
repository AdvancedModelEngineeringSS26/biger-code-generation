import { EXPORT_MODEL_REQUEST, type ExportModelParams, type ExportModelResult } from '@biger/common';
import type { Connection } from 'vscode-languageserver/node.js';
import { createDefaultExportService } from './export-service.js';

export function registerExportRequestHandler(connection: Connection): void {
    const exportService = createDefaultExportService();

    connection.onRequest(EXPORT_MODEL_REQUEST, async (params: ExportModelParams): Promise<ExportModelResult> => {
        return exportService.exportModel(params);
    });
}
