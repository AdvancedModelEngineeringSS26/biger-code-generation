import { MySqlContainer, type StartedMySqlContainer } from '@testcontainers/mysql';
import { GenericContainer, type StartedTestContainer } from 'testcontainers';

// Vitest globalSetup — runs once before any test file loads, exposes a teardown.
//
// Boots a single MySQL 8 container for the whole run; connection info is
// passed to test workers via process.env (Vitest forks inherit the parent
// env). On Docker failure (daemon down, image pull blocked, etc.) we record
// MYSQL_TEST_AVAILABLE=false instead of throwing — Stage 3 then skips the
// MySQL block cleanly with a "no engine" notice.

const STARTUP_TIMEOUT_MS = 120_000;

let container: StartedMySqlContainer | undefined;
let mongoContainer: StartedTestContainer | undefined;

export default async function setup(): Promise<() => Promise<void>> {
    try {
        container = await new MySqlContainer('mysql:8.4')
            .withDatabase('biger_test')
            .withRootPassword('root')
            .withStartupTimeout(STARTUP_TIMEOUT_MS)
            .start();

        process.env.MYSQL_TEST_HOST = container.getHost();
        process.env.MYSQL_TEST_PORT = String(container.getPort());
        process.env.MYSQL_TEST_USER = 'root';
        process.env.MYSQL_TEST_PASSWORD = container.getRootPassword();
        process.env.MYSQL_TEST_DATABASE = container.getDatabase();
        process.env.MYSQL_TEST_AVAILABLE = 'true';
    } catch (err) {
        process.env.MYSQL_TEST_AVAILABLE = 'false';
        const reason = err instanceof Error ? err.message : String(err);
        // Surface the reason once; tests will all show as skipped.
        console.warn(`[globalSetup] MySQL container unavailable — Stage 3 mysql tests will skip.\n  reason: ${reason}`);
    }

    try {
        mongoContainer = await new GenericContainer('mongo:7')
            .withExposedPorts(27017)
            .withStartupTimeout(STARTUP_TIMEOUT_MS)
            .start();

        process.env.MONGO_TEST_URI = `mongodb://${mongoContainer.getHost()}:${mongoContainer.getMappedPort(27017)}`;
        process.env.MONGO_TEST_DATABASE = 'biger_test';
        process.env.MONGO_TEST_AVAILABLE = 'true';
    } catch (err) {
        process.env.MONGO_TEST_AVAILABLE = 'false';
        const reason = err instanceof Error ? err.message : String(err);
        console.warn(`[globalSetup] MongoDB container unavailable — mongo engine tests will skip.\n  reason: ${reason}`);
    }

    return async () => {
        if (container) {
            await container.stop();
            container = undefined;
        }
        if (mongoContainer) {
            await mongoContainer.stop();
            mongoContainer = undefined;
        }
    };
}
