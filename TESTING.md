# Testing

Vitest + hand-authored `.sql` specs. The exporter must conform to the spec (TDD-style), not the other way around.

## Layout

- `packages/language-server/test/fixtures/<name>.er` — input.
- `packages/language-server/test/fixtures/<name>.<dialect>.sql` — expected output, one file per supported dialect.
- `packages/language-server/test/sql-exporter.test.ts` — auto-discovers fixtures and groups by dialect.
- `packages/extension/test/cli.test.ts` — single CLI smoke test (fixed fixture, not auto-discovered).

## Add a test

1. Drop `<name>.er` and one `<name>.<dialect>.sql` for **every** dialect in `SQL_DIALECTS` (`packages/common/src/export/protocol.ts`). Duplicate content across dialects if identical today — they will diverge as the exporter learns dialect-specific syntax. Note: stem names must not contain `.`.
2. `yarn test`. New cases appear under each `SqlExporter > <dialect>` group. No code changes.

Missing any (fixture, dialect) pair fails the coverage check with the exact missing files listed. Adding a dialect to `SQL_DIALECTS` immediately demands a `.<dialect>.sql` for every existing fixture — the suite stays red until you write them.

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
