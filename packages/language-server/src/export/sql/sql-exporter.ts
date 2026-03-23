import type { ExportModelParams, SqlExportOptions } from '@biger/common';
import type { Exporter } from '../export-service.js';

export class SqlExporter implements Exporter {
    readonly target = 'sql';
    readonly fileExtension = '.sql';

    async exportModel(params: ExportModelParams): Promise<string> {
        const options = params.targetOptions as SqlExportOptions | undefined;
        const dialect = options?.dialect ?? 'generic';
        console.log(
            `[biger.export.sql] Transforming ${params.sourceUri} using dialect=${dialect} (input length=${params.erContent.length}).`
        );

        // Placeholder for future ER -> SQL transformation.
        return '';
    }
}
