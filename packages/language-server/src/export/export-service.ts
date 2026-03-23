import type { ExportModelParams, ExportModelResult, ExportTarget } from '@biger/common';
import { SqlExporter } from './sql/sql-exporter.js';

export interface Exporter {
    readonly target: ExportTarget;
    readonly fileExtension: string;
    exportModel(params: ExportModelParams): Promise<string>;
}

export class ExportService {
    private readonly exporters = new Map<ExportTarget, Exporter>();

    constructor(exporters: Exporter[]) {
        for (const exporter of exporters) {
            this.exporters.set(exporter.target, exporter);
        }
    }

    async exportModel(params: ExportModelParams): Promise<ExportModelResult> {
        const exporter = this.exporters.get(params.target);
        if (!exporter) {
            throw new Error(`Unsupported export target: ${params.target}`);
        }

        const content = await exporter.exportModel(params);
        return {
            target: exporter.target,
            fileExtension: exporter.fileExtension,
            content
        };
    }
}

export function createDefaultExportService(): ExportService {
    return new ExportService([
        new SqlExporter()
    ]);
}
