import type { ExportModelParams } from '@biger/common';
import { Command } from 'commander';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { EntityRelationshipLanguageMetaData } from '../../../language-server/src/generated/module.js';
import { createDefaultExportService } from '../../../language-server/src/export/export-service.js';

interface SqlExportCommandOptions {
    destination?: string;
    dialect: string;
}

export async function runExportCli(argv: string[]): Promise<void> {
    const program = new Command()
        .name('biger-export')
        .description('CLI utilities for bigER exports');

    const exportCommand = program
        .command('export')
        .description('Export an ER model into a target format');

    exportCommand
        .command('sql')
        .argument(
            '<file>',
            `Source ER file (${EntityRelationshipLanguageMetaData.fileExtensions.join(', ')})`
        )
        .option('-d, --destination <path>', 'Destination directory or target SQL file path')
        .option('--dialect <dialect>', 'SQL dialect (e.g. generic, postgres, mysql)', 'generic')
        .action(async (file: string, options: SqlExportCommandOptions) => {
            await exportSql(file, options);
        });

    await program.parseAsync(argv);
}

async function exportSql(file: string, options: SqlExportCommandOptions): Promise<void> {
    const sourcePath = path.resolve(file);
    assertSupportedExtension(sourcePath);
    await assertFileExists(sourcePath);

    const sourceContent = await fs.readFile(sourcePath, 'utf-8');
    const exportService = createDefaultExportService();
    const params: ExportModelParams = {
        sourceUri: pathToFileURL(sourcePath).toString(),
        erContent: sourceContent,
        target: 'sql',
        targetOptions: {
            dialect: options.dialect
        }
    };

    const result = await exportService.exportModel(params);
    const outputPath = await resolveOutputPath(sourcePath, options.destination, result.fileExtension);

    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, result.content, 'utf-8');
    console.log(`[biger.export] Wrote ${outputPath}`);
}

function assertSupportedExtension(filePath: string): void {
    const fileExtension = path.extname(filePath);
    if (!EntityRelationshipLanguageMetaData.fileExtensions.includes(fileExtension)) {
        throw new Error(
            `Unsupported source file extension "${fileExtension}". Supported extensions: ${EntityRelationshipLanguageMetaData.fileExtensions.join(', ')}`
        );
    }
}

async function assertFileExists(filePath: string): Promise<void> {
    try {
        await fs.stat(filePath);
    } catch {
        throw new Error(`Source file does not exist: ${filePath}`);
    }
}

async function resolveOutputPath(
    sourcePath: string,
    destination: string | undefined,
    fileExtension: string
): Promise<string> {
    const normalizedExtension = fileExtension.startsWith('.') ? fileExtension : `.${fileExtension}`;
    const sourceName = path.basename(sourcePath, path.extname(sourcePath));

    const preferredPath = destination
        ? buildDestinationPath(sourceName, normalizedExtension, destination)
        : path.join(path.dirname(sourcePath), `${sourceName}${normalizedExtension}`);

    if (!(await pathExists(preferredPath))) {
        return preferredPath;
    }

    let counter = 1;
    while (true) {
        const suffix = counter === 1 ? '.generated' : `.generated-${counter}`;
        const candidate = path.join(
            path.dirname(preferredPath),
            `${path.basename(preferredPath, normalizedExtension)}${suffix}${normalizedExtension}`
        );
        if (!(await pathExists(candidate))) {
            return candidate;
        }
        counter += 1;
    }
}

function buildDestinationPath(sourceName: string, extension: string, destination: string): string {
    const resolvedDestination = path.resolve(destination);
    if (path.extname(resolvedDestination)) {
        return resolvedDestination;
    }
    return path.join(resolvedDestination, `${sourceName}${extension}`);
}

async function pathExists(candidatePath: string): Promise<boolean> {
    try {
        await fs.stat(candidatePath);
        return true;
    } catch {
        return false;
    }
}
