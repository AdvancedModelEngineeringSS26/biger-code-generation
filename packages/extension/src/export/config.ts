import * as vscode from 'vscode';

const GENERATION_CONFIGURATION_SECTION = 'erdiagram';
const GENERATE_DROP_CONFIGURATION_KEY = 'generateDrop';

export interface GenerationConfiguration {
    generateDrop: boolean;
}

export function getGenerationConfig(): GenerationConfiguration {
    const configuration = vscode.workspace.getConfiguration(GENERATION_CONFIGURATION_SECTION);
    return {
        generateDrop: configuration.get<boolean>(GENERATE_DROP_CONFIGURATION_KEY, false)
    };
}
