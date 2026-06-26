import { sanitizeExportConfiguration, type ExportConfiguration } from '@biger/common';
import * as vscode from 'vscode';

const GENERATION_CONFIGURATION_SECTION = 'biger';
const LEGACY_GENERATION_CONFIGURATION_SECTION = 'erdiagram';
const GENERATE_DROP_CONFIGURATION_KEY = 'generateDrop';
const TYPE_MAPPINGS_CONFIGURATION_KEY = 'export.typeMappings';

export interface GenerationConfiguration {
    generateDrop: boolean;
    exportConfig?: ExportConfiguration;
}

export function getGenerationConfig(): GenerationConfiguration {
    const configuration = vscode.workspace.getConfiguration(GENERATION_CONFIGURATION_SECTION);
    const typeMappings = configuration.get<unknown>(TYPE_MAPPINGS_CONFIGURATION_KEY);
    const exportConfig = sanitizeExportConfiguration({ typeMappings });

    return {
        generateDrop: getGenerateDropConfig(),
        ...(exportConfig ? { exportConfig } : {}),
    };
}

function getGenerateDropConfig(): boolean {
    const configured = getConfiguredBoolean(GENERATION_CONFIGURATION_SECTION, GENERATE_DROP_CONFIGURATION_KEY);
    const legacyConfigured = getConfiguredBoolean(
        LEGACY_GENERATION_CONFIGURATION_SECTION,
        GENERATE_DROP_CONFIGURATION_KEY,
    );
    const defaultValue = vscode.workspace
        .getConfiguration(GENERATION_CONFIGURATION_SECTION)
        .inspect<boolean>(GENERATE_DROP_CONFIGURATION_KEY)?.defaultValue;

    return configured ?? legacyConfigured ?? defaultValue ?? false;
}

function getConfiguredBoolean(section: string, key: string): boolean | undefined {
    const inspection = vscode.workspace.getConfiguration(section).inspect<boolean>(key);
    if (!inspection) return undefined;

    const values = [
        inspection.workspaceFolderLanguageValue,
        inspection.workspaceFolderValue,
        inspection.workspaceLanguageValue,
        inspection.workspaceValue,
        inspection.globalLanguageValue,
        inspection.globalValue,
    ];

    return values.find((value): value is boolean => typeof value === 'boolean');
}
