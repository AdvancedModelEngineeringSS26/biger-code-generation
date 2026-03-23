#!/usr/bin/env node
import { runExportCli } from './export/cli.js';

void runExportCli(process.argv).catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[biger.export] ${message}`);
    process.exitCode = 1;
});
