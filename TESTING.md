# Testing

Vitest + hand-authored export specs. Exporters must conform to the spec (TDD-style), not the other way around.

## Layout

- `packages/language-server/test/fixtures/<name>.er` — input.
- `packages/language-server/test/fixtures/<name>.<dialect>.sql` — expected SQL output, one file per supported SQL dialect.
- `packages/language-server/test/fixtures/<name>.mongo.js` — expected MongoDB initialization script, one file per ER fixture.
- `packages/language-server/test/support/sql-validity.ts` — parser-backed validators (libpg-query for postgres, dt-sql-parser for mysql).
- `packages/language-server/test/support/mongo-script.ts` — static validation and shape extraction for generated MongoDB scripts.
- `packages/language-server/test/sql-exporter.test.ts` — auto-discovers SQL fixtures and runs them through the SQL stages.
- `packages/language-server/test/mongo-exporter.test.ts` — auto-discovers Mongo fixtures and runs them through Mongo-specific stages.
- `packages/extension/test/cli.test.ts` — single CLI smoke test (fixed fixture, not auto-discovered).

## Export Targets

SQL dialects and MongoDB are intentionally registered differently:

- Adding a SQL dialect means adding it to `SQL_DIALECTS` in `packages/common/src/export/protocol.ts`, then providing `<name>.<dialect>.sql` for every fixture.
- MongoDB is a separate export target (`target: 'mongo'`), so it uses `<name>.mongo.js` fixtures and Mongo-specific validators, engine tests, and inspectors.

## SQL test flow

Every SQL fixture flows through numbered stages in order. Each stage answers a different question; each uses a different tool. Failure at an earlier stage causes later stages for the same fixture to skip with a clear message.

1. **Grammar** — does the `.<dialect>.sql` golden file parse as valid SQL for its dialect?
   - postgres: `libpg-query` (official Postgres C parser, compiled to WASM).
   - mysql: `dt-sql-parser` (ANTLR grammar extracted from MySQL Workbench).
2. **Exporter output** — does the exporter's emitted SQL match the golden file byte-for-byte, and does the emitted SQL itself parse? (Defensive re-check on the output, not just the golden.)
3. **Engine** — does the golden SQL actually execute on a real database?
4. **Cross-dialect equivalence** — do Postgres and MySQL produce the same normalized relational schema shape?
5. **Behavioural** — do generated constraints reject invalid data on real engines?

## MongoDB test flow

MongoDB fixtures use mongosh-compatible `.mongo.js` scripts with top-level `await`.

1. **Static script validity** — does the script compile and use the supported `db.createCollection` / `db.getCollection(...).createIndex` subset?
2. **Exporter output** — does the Mongo exporter match the golden file byte-for-byte?
3. **Engine** — does the script execute against a real MongoDB database?
4. **Structural shape** — do live collection validators and indexes match the normalized shape recorded from the script?
5. **Behavioural** — do `_id`, unique indexes, and `$jsonSchema` validators reject invalid documents?

## Add a test

1. Drop `<name>.er`, one `<name>.<dialect>.sql` for **every** dialect in `SQL_DIALECTS` (`packages/common/src/export/protocol.ts`), and one `<name>.mongo.js`. Duplicate content across SQL dialects if identical today — they will diverge as the exporter learns dialect-specific syntax. Note: stem names must not contain `.`.
2. `yarn test`. New cases appear under each stage for each dialect. No code changes.

Missing any fixture/target pair fails the coverage check with the exact missing files listed. Adding a dialect to `SQL_DIALECTS` immediately demands a `.<dialect>.sql` for every existing fixture. Adding a new ER fixture also demands a `.mongo.js` spec.

## Keep fixtures valid

Because stage 1 and stage 3 run real parsers / a real engine against the golden files, **every golden must be valid SQL for its dialect** — universal types like `INT`, `VARCHAR(n)`, `TIMESTAMP` are safe; MySQL-only types like `DATETIME` or placeholder names like `string` will trip stage 1 or stage 3. Dialect-specific type mapping (so that an `.er` `DATETIME` becomes `TIMESTAMP` in postgres but stays `DATETIME` in mysql) is an exporter concern, not a fixture concern.

## TDD flow

1. Write `.er` + the `.sql` / `.mongo.js` describing what the exporter *should* produce.
2. `yarn test` → red, with a diff that is your TODO list.
3. Implement the relevant exporter until the diff disappears.
4. Commit `.er`, golden files, and the exporter change together.

## Run

- `yarn test` — both packages.
- `yarn --cwd packages/<pkg> test:watch` — TDD loop.

## Conventions

- Files end with a single `\n`; LF pinned via `.gitattributes`.
- Assertions use `expect(actual).toBe(await readFile(...))` — never `toMatchFileSnapshot` (would let `vitest -u` overwrite a spec).
- One feature per fixture — easier to diagnose failures.

## CI

`.github/workflows/build.yml` runs `yarn test` on every push/PR to `main` (ubuntu/macos/windows, Node 22). Failures block.
