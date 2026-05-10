import {
    EXPORT_MODEL_REQUEST,
    type ExportModelParams,
    type ExportModelResult,
    type SqlGenerationDialect
} from '@biger/common';
import * as path from 'node:path';
import * as vscode from 'vscode';
import type { LanguageClient } from 'vscode-languageclient/node.js';
import { getGenerationConfig } from './config';

interface SqlExportCommand {
    readonly id: string;
    readonly dialect: SqlGenerationDialect;
}

const SQL_EXPORT_COMMANDS: readonly SqlExportCommand[] = [
    { id: 'biger.generate.sql.generic', dialect: 'generic' },
    { id: 'biger.generate.postgres', dialect: 'postgres' },
    { id: 'biger.generate.mysql', dialect: 'mysql' }
];

export function registerExportCommands(context: vscode.ExtensionContext, languageClient: LanguageClient): void {
    for (const command of SQL_EXPORT_COMMANDS) {
        context.subscriptions.push(
            vscode.commands.registerCommand(command.id, async (resource?: unknown) => {
                await exportDocumentAsSql(languageClient, command.dialect, toResourceUri(resource));
            })
        );
    }
}

function toResourceUri(resource: unknown): vscode.Uri | undefined {
    if (resource instanceof vscode.Uri) {
        return resource;
    }
    return undefined;
}

async function exportDocumentAsSql(
    languageClient: LanguageClient,
    dialect: SqlGenerationDialect,
    resourceUri?: vscode.Uri
): Promise<void> {
    const document = await resolveDocument(resourceUri);
    if (!document) {
        void vscode.window.showWarningMessage('Open an ER document to run export.');
        return;
    }

    if (!isEntityRelationshipDocument(document)) {
        void vscode.window.showWarningMessage('Export is only available for Entity Relationship documents.');
        return;
    }

    if (document.isUntitled || document.uri.scheme !== 'file') {
        void vscode.window.showWarningMessage('Save the ER document to disk before exporting.');
        return;
    }

    try {
        const generationConfig = getGenerationConfig();
        const request: ExportModelParams = {
            sourceUri: document.uri.toString(),
            erContent: document.getText(),
            target: 'sql',
            targetOptions: {
                dialect,
                generateDrop: generationConfig.generateDrop
            }
        };

        const result = await languageClient.sendRequest<ExportModelResult>(EXPORT_MODEL_REQUEST, request);
        const outputUri = await createOutputUri(document.uri, result.fileExtension);

        await vscode.workspace.fs.writeFile(outputUri, new TextEncoder().encode(result.content));
        const outputDocument = await vscode.workspace.openTextDocument(outputUri);
        await vscode.window.showTextDocument(outputDocument, { preview: false });

        void vscode.window.showInformationMessage(
            `Exported ${path.basename(document.uri.fsPath)} to ${path.basename(outputUri.fsPath)}.`
        );
    } catch (error) {
        console.error('[biger.export] Failed to export document.', error);
        const message = error instanceof Error ? error.message : 'Unknown export error.';
        void vscode.window.showErrorMessage(`Export failed: ${message}`);
    }
}

async function resolveDocument(resourceUri?: vscode.Uri): Promise<vscode.TextDocument | undefined> {
    if (resourceUri) {
        return vscode.workspace.openTextDocument(resourceUri);
    }
    return vscode.window.activeTextEditor?.document;
}

function isEntityRelationshipDocument(document: vscode.TextDocument): boolean {
    if (document.languageId === 'entity-relationship') {
        return true;
    }

    const extension = path.extname(document.uri.fsPath).toLowerCase();
    return extension === '.er' || extension === '.erd';
}

async function createOutputUri(sourceUri: vscode.Uri, fileExtension: string): Promise<vscode.Uri> {
    const normalizedExtension = fileExtension.startsWith('.') ? fileExtension : `.${fileExtension}`;
    const sourceDirectory = path.dirname(sourceUri.fsPath);
    const sourceName = path.basename(sourceUri.fsPath, path.extname(sourceUri.fsPath));

    const preferredUri = vscode.Uri.file(path.join(sourceDirectory, `${sourceName}${normalizedExtension}`));
    if (!(await pathExists(preferredUri))) {
        return preferredUri;
    }

    let counter = 1;
    while (true) {
        const suffix = counter === 1 ? '.generated' : `.generated-${counter}`;
        const candidateUri = vscode.Uri.file(
            path.join(sourceDirectory, `${sourceName}${suffix}${normalizedExtension}`)
        );
        if (!(await pathExists(candidateUri))) {
            return candidateUri;
        }
        counter += 1;
    }
}

async function pathExists(uri: vscode.Uri): Promise<boolean> {
    try {
        await vscode.workspace.fs.stat(uri);
        return true;
    } catch {
        return false;
    }
}
