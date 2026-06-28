import { sanitizeExportConfiguration, type ExportConfiguration, type SqlInheritanceStrategy } from '@biger/common';
import * as vscode from 'vscode';

const GENERATION_CONFIGURATION_SECTION = 'biger';
const LEGACY_GENERATION_CONFIGURATION_SECTION = 'erdiagram';
const GENERATE_DROP_CONFIGURATION_KEY = 'generateDrop';
const TYPE_MAPPINGS_CONFIGURATION_KEY = 'export.typeMappings';
const INHERITANCE_STRATEGY_CONFIGURATION_KEY = 'export.inheritanceStrategy';

export interface GenerationConfiguration {
    generateDrop: boolean;
    inheritanceStrategy: SqlInheritanceStrategy;
    exportConfig?: ExportConfiguration;
}

export function getGenerationConfig(): GenerationConfiguration {
    const configuration = vscode.workspace.getConfiguration(GENERATION_CONFIGURATION_SECTION);
    const typeMappings = configuration.get<unknown>(TYPE_MAPPINGS_CONFIGURATION_KEY);
    const exportConfig = sanitizeExportConfiguration({ typeMappings });

    return {
        generateDrop: getGenerateDropConfig(),
        inheritanceStrategy: getInheritanceStrategyConfig(),
        ...(exportConfig ? { exportConfig } : {}),
    };
}

function getInheritanceStrategyConfig(): SqlInheritanceStrategy {
    const value = vscode.workspace
        .getConfiguration(GENERATION_CONFIGURATION_SECTION)
        .get<string>(INHERITANCE_STRATEGY_CONFIGURATION_KEY);
    return value === 'tablePerClass' || value === 'singleTable' ? value : 'joined';
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
