# Interim 1 — T2: Code Generation (ER → SQL)

**Group:** Blaž Bone, Tilen Ožbot
**Date:** 2026-04-21
**Target runtime:** ~8 min talk + ~2 min demo, then Q/A

---

## Slide 1 — Title

- **T2: Code Generation — ER Database Schemas**
- Langium-based bigER
- Blaž Bone & Tilen Ožbot
- Interim 1 · 2026-04-21

---

## Slide 2 — Topic & Context

- **bigER** = hybrid ER modeling tool for VS Code (textual `.er` + synchronized graphical diagram).
- **17,500+ installs** on the Marketplace — past its prototype stage.
- Original: Xtext/Java server → **being reimplemented in Langium/TypeScript** to kill the Java dependency and align with the VS Code/Node ecosystem.
- A minimal Langium prototype already exists; our job is to **systematically rebuild and extend** capabilities — not a greenfield.
- **Our slice (T2):** turn ER models into **deployable database artifacts** (SQL DDL), configurably and dialect-aware.

---

## Slide 3 — Goals (from the topic brief)

1. **ER → SQL DDL**: tables, columns, PKs, FKs, unique constraints, indexes.
2. **Dialect support**: at minimum **PostgreSQL** and **MySQL** — quoting, types, auto-increment, constraints, namespaces.
3. **Ambiguity handling via configuration**: inheritance strategies, N:M / 1:1 mappings, weak entities, multivalued attributes, optionality.
4. **Naming strategy**: consistent, configurable table/column/constraint names.
5. **Validation & warnings**: risky schemas, collisions, missing datatypes.
6. **Integration**: LSP request in the extension **and** CLI.
7. **Testing**: unit + golden-file + negative tests.
8. *(Optional)* additional targets: Prisma, Hibernate, MongoDB, Neo4j.

---

## Slide 4 — What We Researched

- **bigER reference implementation** (Xtext/Java) — how it currently emits SQL, the ER concepts it supports.
- **Langium** AST / document lifecycle — how to parse `.er` content on demand without a live workspace document.
- **Existing `export/` skeleton** in the Langium prototype — extended rather than replaced.
- **ER → relational mapping rules**: how entities, relationships, weak entities, inheritance, and multivalued attributes translate to tables/columns/FKs.
- **PostgreSQL vs MySQL divergence points**: identifier quoting (`"x"` vs `` `x` ``), `SERIAL` vs `AUTO_INCREMENT`, `BOOLEAN` vs `TINYINT(1)`, `TEXT` vs `VARCHAR`, schema/namespace handling, FK constraint syntax.
- **Golden-file / TDD workflows** with Vitest — one `.er` + one `.<dialect>.sql` per feature, exporter conforms to the spec.

---

## Slide 5 — Current Implementation Status: v0 SQL Exporter

End-to-end path works today (`.er → AST → DDL string → file`):

- **Grammar → AST**: `SqlExporter.parseToModel()` wires Langium's `LangiumDocumentFactory` + `DocumentBuilder` to parse arbitrary `.er` content (throws on lexer/parser errors).
- **Entity → `CREATE TABLE`**: columns from non-derived attributes, `PRIMARY KEY (…)` from `key`-annotated attributes.
- **Relationship → junction table**: inlines PK columns of participants as `… references Parent(pk)` columns, composite PK, plus any relationship attributes.
- **Data types**: rendered with `TYPE`, `TYPE(n)`, `TYPE(n, d)`.
- **Derived attributes**: skipped in output.

Key files:

- `packages/language-server/src/export/sql/sql-exporter.ts` — the exporter.
- `packages/language-server/src/export/export-service.ts` — dispatcher keyed by `ExportTarget`.
- `packages/common/src/export/protocol.ts` — shared protocol, `SQL_DIALECTS = ['postgres', 'mysql']`.

---

## Slide 6 — How It Plugs Into the Tool

Three integration points, one exporter:

1. **LSP request** — `biger/exportModel` (`registerExportRequestHandler` in `language-server/src/main.ts`). The language server owns the exporter, so it runs in the same process as the parser.
2. **VS Code command** — `biger.export.sql` (registered in `extension/src/export/commands.ts`, exposed in the command palette, editor context menu, editor title bar). Sends the active document to the server via the LSP request.
3. **CLI** — `biger-export export sql <file> --dialect postgres|mysql` (`extension/src/export-cli.ts` + `extension/src/export/cli.ts`), built on `commander`, runs the exporter headless with `NodeFileSystem`.

`ExportModelParams.targetOptions.dialect` already flows through all three paths — the **wiring is ready** even though the emitter doesn't branch yet.

---

## Slide 7 — Testing Infrastructure

- **Vitest** in both `language-server` and `extension` packages.
- **Golden-file auto-discovery**: drop `<name>.er` + `<name>.<dialect>.sql` into `packages/language-server/test/fixtures/`; new tests appear automatically.
- **Coverage enforcement**: adding a dialect to `SQL_DIALECTS` turns the suite red until every fixture has a matching `.<dialect>.sql` — you can't silently skip a dialect.
- **Three-stage validation per fixture**, in order:
  1. **Grammar** — does the golden SQL parse? `libpg-query` (real Postgres parser, WASM) for postgres; `dt-sql-parser` (ANTLR MySQL grammar) for mysql.
  2. **Exporter output** — does the exporter's emitted SQL match the golden byte-for-byte, and does the emitted SQL itself parse?
  3. **Engine** — does the golden actually execute on a real database? Postgres via **PGlite** (in-memory Postgres in WASM, no Docker, cross-OS). MySQL semantic execution is deferred — no pure-Node MySQL engine.
- **Fail-fast**: a grammar failure skips stages 2 & 3 for that fixture with a clear message, instead of cascading confusing secondary failures.
- **Current fixtures**: `entity-to-table`, `attributes`, `relationship` — each covered for `postgres` and `mysql`, each flowing through all three stages. 18 tests green across both packages.
- **CI**: GitHub Actions on Ubuntu/macOS/Windows, **Node 22**. `.gitattributes` pins LF so Windows doesn't corrupt golden diffs. Zero Docker/Python — all three layers run in pure Node.

---

## Slide 8 — Demo (live, ~2 min)

Script:

1. Open `examples/test.er` (entities + a relationship) in VS Code.
2. **Command palette → "Export SQL"** → side-by-side `.sql` opens.
3. Switch to terminal: `yarn --cwd packages/extension export:cli export sql examples/test.er --dialect mysql` → show identical output (dialect not yet differentiated — this is the next step).
4. `yarn test` from repo root → green across both packages, show the auto-discovered `SqlExporter > postgres` / `SqlExporter > mysql` groups.

Fallback if demo machine is flaky: play a pre-recorded GIF of the same flow.

> **Demo prep checklist:** `nvm use 22` (repo pins `.nvmrc = 22`; `Object.groupBy` used by chevrotain needs ≥ 21); `yarn` once to build; keep `examples/test.er` and a split terminal open.

---

## Slide 9 — Planned Features This Semester

**Must-have (Interim 2 target):**

- **Dialect branching**: PostgreSQL & MySQL differ on identifier quoting, auto-increment (`SERIAL` / `GENERATED AS IDENTITY` vs `AUTO_INCREMENT`), boolean/text types, FK constraint syntax.
- **Explicit FK constraints** instead of the current inline `references`, with configurable `ON DELETE` / `ON UPDATE`.
- **Naming strategy** (PascalCase ↔ snake_case, `pk_`, `fk_`, `uq_` prefixes) — plumbed through `targetOptions`.
- **Ambiguity configuration**:
  - Inheritance: single-table / joined-table / table-per-class.
  - N:M: always junction table; 1:1: FK+UNIQUE vs merge.
  - Weak entities: composite PK with owner.
  - Multivalued attributes: separate table.
  - Optionality: NULL / NOT NULL defaults.
- **Validation pass**: warn on missing datatypes, nullable FK on mandatory relation, naming collisions, keyword clashes.
- **Documentation**: mapping rules + supported feature matrix + dialect differences.

**Stretch:** one additional target (Prisma schema is the cheapest experiment given TypeScript ecosystem alignment).

---

## Slide 10 — Blockades & Open Questions (feedback, please!)

1. **Where does configuration live?**
   - CLI flag / VS Code setting only, **or**
   - inline directives in the `.er` file (e.g. `generate.inheritance = joined`), **or**
   - a sidecar `biger.config.json`?
   - Trade-off: reproducibility vs. user ergonomics vs. grammar bloat.
2. **How should dialect divergence be structured?** Template-per-dialect, subclass-per-dialect, or feature-flag table? We lean toward a small **emitter abstraction** with dialect-specific strategy objects; want to sanity-check this.
3. **Scope of ER semantics** — the grammar already supports ternary relationships, weak entities, inheritance. How complete must v1 be before moving to ORM targets?
4. **Composition / aggregation** → SQL is genuinely ambiguous (cascade-delete? merged table?). Is it acceptable to emit plain FK + warning and let config override?
5. **CLI distribution** — keep it bundled in the VS Code extension package, or publish as a standalone `@biger/cli` once dialects branch?

---

## Slide 11 — Next Steps Until Interim 2

Concrete backlog, roughly in order:

1. **Dialect split**: introduce `DialectEmitter` (postgres, mysql), migrate the current monolithic emitter behind it; diverge fixtures.
2. **Config schema** in `@biger/common` + round-trip through LSP request / CLI flags / VS Code settings.
3. **Explicit FK / UNIQUE / INDEX emission**, with configurable action clauses.
4. **Naming strategy** with collision detection.
5. **Inheritance** (pick default strategy, support at least one more via config).
6. **Weak entities & multivalued attributes** handling.
7. **Validation-on-export**: collect diagnostics before emitting; surface via LSP + CLI exit codes.
8. **Expand fixture set**: inheritance, weak entity, multivalued, keyword-collision, negative cases.
9. **`docs/mapping-rules.md`** + feature matrix, committed alongside the code.

Team split: Tilen on emitter/dialect core, Blaž on config plumbing + testing/docs. Sync weekly, merge via PR.

---

## Appendix — Recent Activity (last 3 days)

For context during Q/A:

- `7cc9c98` Tilen — CI bump to Node 22, `.nvmrc`.
- `228da8a` Tilen — gitignore generated `.sql` output.
- `479da7d` Tilen — wire Langium services into `SqlExporter`, parse `.er` → AST.
- `fd53068` Tilen — entity + relationship DDL generation; fix test service injection.
- `c716de6` Tilen — merge **PR #1**: v0 SQL exporter.
- `f5df5a5` / `04c2f27` Blaž — merge **PR #2**: Vitest infra, fixtures, CLI smoke test, CI, `TESTING.md`, `.gitattributes` LF-pinning.
- `0aebb78` Blaž — docs: stale identifier rename in `TESTING.md`.
- `cc32929` Blaž — commit the topic PDF for reference.
