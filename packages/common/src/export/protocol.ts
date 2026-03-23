export const EXPORT_MODEL_REQUEST = 'biger/exportModel';

export type ExportTarget = 'sql' | (string & {});

export interface SqlExportOptions {
    dialect?: string;
}

export interface ExportModelParams {
    sourceUri: string;
    erContent: string;
    target: ExportTarget;
    targetOptions?: Record<string, unknown>;
}

export interface ExportModelResult {
    target: ExportTarget;
    fileExtension: string;
    content: string;
}
