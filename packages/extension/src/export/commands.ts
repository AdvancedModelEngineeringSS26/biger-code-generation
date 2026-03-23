import { EXPORT_MODEL_REQUEST, type ExportModelParams, type ExportModelResult } from '@biger/common';
import * as path from 'node:path';
import * as vscode from 'vscode';
import type { LanguageClient } from 'vscode-languageclient/node.js';

export const EXPORT_SQL_COMMAND = 'biger.export.sql';

export function registerExportCommands(context: vscode.ExtensionContext, languageClient: LanguageClient): void {
    context.subscriptions.push(
        vscode.commands.registerCommand(EXPORT_SQL_COMMAND, async () => {
            await exportActiveDocumentAsSql(languageClient);
        })
    );
}

async function exportActiveDocumentAsSql(languageClient: LanguageClient): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        void vscode.window.showWarningMessage('Open an ER document to run export.');
        return;
    }

    const document = editor.document;
    if (document.languageId !== 'entity-relationship') {
        void vscode.window.showWarningMessage('Export is only available for Entity Relationship documents.');
        return;
    }

    if (document.isUntitled || document.uri.scheme !== 'file') {
        void vscode.window.showWarningMessage('Save the ER document to disk before exporting.');
        return;
    }

    try {
        const request: ExportModelParams = {
            sourceUri: document.uri.toString(),
            erContent: document.getText(),
            target: 'sql',
            targetOptions: {
                dialect: 'generic'
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
