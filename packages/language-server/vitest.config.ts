import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        include: ['test/**/*.test.ts'],
        environment: 'node',
        globalSetup: ['./test/globalSetup.ts'],
        // MySQL container boot can take 30-60s on first pull; vitest's default
        // hook timeout (10s) would otherwise abort globalSetup itself.
        hookTimeout: 180_000,
        testTimeout: 30_000,
    }
});
