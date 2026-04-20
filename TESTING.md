# Testing

Vitest + hand-authored `.sql` specs. The exporter must conform to the spec (TDD-style), not the other way around.

## Layout

- `packages/language-server/test/fixtures/<name>.er` — input.
- `packages/language-server/test/fixtures/<name>.<dialect>.sql` — expected output, one file per supported dialect.
- `packages/language-server/test/support/sql-validity.ts` — parser-backed validators (libpg-query for postgres, dt-sql-parser for mysql).
- `packages/language-server/test/sql-exporter.test.ts` — auto-discovers fixtures and runs them through three stages (see below).
- `packages/extension/test/cli.test.ts` — single CLI smoke test (fixed fixture, not auto-discovered).

## Three-stage test flow

Every fixture flows through three numbered stages in order. Each stage answers a different question; each uses a different tool. Failure at an earlier stage causes later stages for the same fixture to skip with a clear message.

1. **Grammar** — does the `.<dialect>.sql` golden file parse as valid SQL for its dialect?
   - postgres: `libpg-query` (official Postgres C parser, compiled to WASM).
   - mysql: `dt-sql-parser` (ANTLR grammar extracted from MySQL Workbench).
2. **Exporter output** — does the exporter's emitted SQL match the golden file byte-for-byte, and does the emitted SQL itself parse? (Defensive re-check on the output, not just the golden.)
3. **Engine** — does the golden SQL actually execute on a real database? Postgres only, via **PGlite** (in-memory Postgres in WASM; no Docker, cross-OS). MySQL semantic execution is deferred — no pure-Node MySQL engine; adding Testcontainers would break the CI matrix.

## Add a test

1. Drop `<name>.er` and one `<name>.<dialect>.sql` for **every** dialect in `SQL_DIALECTS` (`packages/common/src/export/protocol.ts`). Duplicate content across dialects if identical today — they will diverge as the exporter learns dialect-specific syntax. Note: stem names must not contain `.`.
2. `yarn test`. New cases appear under each stage for each dialect. No code changes.

Missing any (fixture, dialect) pair fails the coverage check with the exact missing files listed. Adding a dialect to `SQL_DIALECTS` immediately demands a `.<dialect>.sql` for every existing fixture — the suite stays red until you write them.

## Keep fixtures valid

Because stage 1 and stage 3 run real parsers / a real engine against the golden files, **every golden must be valid SQL for its dialect** — universal types like `INT`, `VARCHAR(n)`, `TIMESTAMP` are safe; MySQL-only types like `DATETIME` or placeholder names like `string` will trip stage 1 or stage 3. Dialect-specific type mapping (so that an `.er` `DATETIME` becomes `TIMESTAMP` in postgres but stays `DATETIME` in mysql) is an exporter concern, not a fixture concern.

## TDD flow

1. Write `.er` + the `.sql` describing what the exporter *should* produce.
2. `yarn test` → red, with a diff that is your TODO list.
3. Implement `SqlExporter` until the diff disappears.
4. Commit `.er`, `.sql`, and the exporter change together.

## Run

- `yarn test` — both packages.
- `yarn --cwd packages/<pkg> test:watch` — TDD loop.

## Conventions

- Files end with a single `\n`; LF pinned via `.gitattributes`.
- Assertions use `expect(actual).toBe(await readFile(...))` — never `toMatchFileSnapshot` (would let `vitest -u` overwrite a spec).
- One feature per fixture — easier to diagnose failures.

## CI

`.github/workflows/build.yml` runs `yarn test` on every push/PR to `main` (ubuntu/macos/windows, Node 22). Failures block.
