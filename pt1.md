# Export Pipeline & Testing Walkthrough

A click-through tour of the SQL export pipeline and the testing suite.
After reading this you should understand how `.er` text becomes SQL, what
every file in the export path does, and how the 6-stage test stack
validates correctness across two database dialects.

> **Tip:** open this in VS Code markdown preview (`Cmd+Shift+V`) so the
> relative links are clickable.

---

## Part 1 — Export pipeline

### The big picture

```
.er text
  │
  ▼
SqlExporter.parseToModel()        ← Langium parses .er into an AST
  │
  ▼
DdlEmitter.emit(model, opts)     ← walks AST, produces SQL string
  │  uses Dialect (postgres | mysql | generic)
  │  uses model-queries (findWeakOwner, isAtMostOne)
  │  reads SqlExportOptions (generateDrop, dialect)
  ▼
SQL string
```

### The files

| File | Role | Lines |
|---|---|---|
| [export-service.ts](packages/language-server/src/export/export-service.ts) | Registry of exporters keyed by target (`'sql'` → `SqlExporter`). |
| [sql-exporter.ts](packages/language-server/src/export/sql/sql-exporter.ts) | Turns raw `.er` string into a Langium `Model` AST, picks a dialect from `SqlExportOptions`, hands off to `DdlEmitter`. |
| [ddl-emitter.ts](packages/language-server/src/export/sql/ddl-emitter.ts) | The core. Walks the AST and emits `CREATE TABLE` statements. Handles plain entities, inherited entities (class-table), weak entities, multivalued side tables, and relationship bridge tables. Also emits NOT NULL, UNIQUE, ON DELETE CASCADE, and optional DROP TABLE IF EXISTS. ~240 lines. |
| [dialects.ts](packages/language-server/src/export/sql/dialects.ts) | Postgres/MySQL type mapping. Maps cross-dialect type names to dialect-native equivalents (e.g. `BLOB` → `BYTEA` in postgres, stays `BLOB` in mysql). |
| [model-queries.ts](packages/language-server/src/model/model-queries.ts) | Two model-level helpers extracted from the emitter: `findWeakOwner` (scans relationships to find a weak entity's identifying owner) and `isAtMostOne` (checks if a cardinality means ≤ 1). |
| [protocol.ts](packages/common/src/export/protocol.ts) | Shared types: `SqlExportOptions` (dialect + generateDrop), `ExportModelParams`, `ExportModelResult`. Lives in `@biger/common` so both language-server and extension can import it. |

### What the emitter does, entity by entity

The emitter dispatches on entity type:

| Entity kind | Detection | What it emits |
|---|---|---|
| Plain entity | No `weak`, no `extends` | One `CREATE TABLE` with columns + PK. Non-PK columns get NOT NULL unless `optional`. |
| Inherited entity | `entity.extends?.ref` is set | Class-table: duplicates parent's PK as own PK, adds own columns, FK to parent. |
| Weak entity | `entity.weak` is true | Folds owner's PK into its table. Composite PK = owner's PK + partial_keys. FK to owner with ON DELETE CASCADE. |
| Multivalued attr | `attr.type?.MULTIVALUED` | Side table `<Entity>_<attr>` with composite PK (parent keys + value). FK to parent with ON DELETE CASCADE. |

For relationships:

| Concept | How it's encoded in the bridge table |
|---|---|
| Binary/ternary/N-ary | Bridge table with FK per participant. PK = all participant keys. |
| Self-reference (unary) | Role labels prefix FK column names (`manager_id`, `reports_id`) to avoid collisions. |
| Composition (`*-` / `-*`) | FK to the "whole" side gets ON DELETE CASCADE. |
| Aggregation (`o-` / `-o`) | Plain FK (no CASCADE). |
| Cardinality 1 or 0..1 | UNIQUE constraint on the opposite participant's FK column (binary only). |
| Relationship attributes | Extra columns on the bridge table, NOT NULL unless `optional`. |
| Weak relationship | Skipped — its FK is folded into the weak entity's own table. |

The `generateDrop` option prepends `DROP TABLE IF EXISTS <name>;` for
every table in reverse emission order (dependents first).

### Example fixture

Input — [test/fixtures/cardinalities.er](packages/language-server/test/fixtures/cardinalities.er):

```
erdiagram Cardinalities
notation = chen

entity Author {
    authId: INT key
    name: VARCHAR(100)
}

entity Book {
    isbn: VARCHAR(13) key
}

relationship Wrote {
    Author[1] -> Book[N]
}
```

Output — [test/fixtures/cardinalities.postgres.sql](packages/language-server/test/fixtures/cardinalities.postgres.sql):

```sql
CREATE TABLE Author(
    authId INT,
    name VARCHAR(100) NOT NULL,
    PRIMARY KEY (authId)
);
CREATE TABLE Book(
    isbn VARCHAR(13),
    PRIMARY KEY (isbn)
);
CREATE TABLE Wrote(
    authId INT,
    isbn VARCHAR(13),
    PRIMARY KEY (authId, isbn),
    UNIQUE (isbn),
    FOREIGN KEY (authId) REFERENCES Author(authId),
    FOREIGN KEY (isbn) REFERENCES Book(isbn)
);
```

Things to notice:
- `name` gets `NOT NULL` (non-PK, non-optional).
- `Wrote` bridge has `UNIQUE (isbn)` because `Author[1]` means each Book
  has at most 1 Author (Chen-style look-across), so `isbn` appears at
  most once.
- FKs are table-level `FOREIGN KEY` clauses, not inline `references`.

### Three entry points, same core

All three call `ExportService.exportModel(...)`:

- **LSP request** — [export-request-handler.ts](packages/language-server/src/export/export-request-handler.ts) registers `EXPORT_MODEL_REQUEST`. The VS Code extension sends this.
- **VS Code commands** — [commands.ts](packages/extension/src/export/commands.ts) registers `biger.generate.sql.generic`, `biger.generate.postgres`, `biger.generate.mysql`. Each sends the LSP request with the appropriate dialect + the `generateDrop` setting from VS Code config.
- **CLI** — [cli.ts](packages/extension/src/export/cli.ts) runs `biger-export export sql <file> --dialect postgres` in-process, skipping LSP.

---

## Part 2 — Testing deep dive

### Overview

```
yarn test  (from packages/language-server)
  │
  ├── globalSetup.ts         boots MySQL container (if Docker available)
  │
  ├── sql-exporter.test.ts   Stages 0-5 + snapshot helper (166 tests)
  ├── behavioural.test.ts    Layer 6: constraint rejection (10 tests)
  ├── property tests         fast-check determinism (4 tests)
  ├── unit/validator          validator checks (14 tests)
  ├── unit/generate-drop      generateDrop option (8 tests)
  └── regen-fixtures          golden regeneration helper (30 tests, always skipped)
```

Total: **232 tests** (172 pass, 60 gated helper tests always skipped).

### Fixture layout

15 fixture families in [test/fixtures/](packages/language-server/test/fixtures/). Each has:

```
<stem>.er                      ← the ER model
<stem>.postgres.sql            ← expected Postgres SQL output (golden)
<stem>.mysql.sql               ← expected MySQL SQL output (golden)
<stem>.postgres.shape.json     ← expected schema shape after loading into Postgres
<stem>.mysql.shape.json        ← expected schema shape after loading into MySQL
```

| Fixture | What it covers |
|---|---|
| entity-to-table | Minimal entity → table |
| attributes | Key, non-key, derived (filtered out), datatypes |
| dialect-types | Cross-dialect type mapping (DOUBLE → DOUBLE PRECISION, BLOB → BYTEA) |
| decimal-precision | DECIMAL(p, s) size preservation |
| composite-pk | Multi-column primary key |
| relationship | Binary relationship → bridge table with FKs |
| self-ref | Unary relationship with roles → prefixed FK columns |
| cardinalities | 1:N and N:N → UNIQUE constraint from cardinality |
| inheritance | `extends` → class-table inheritance with FK to parent |
| weak-entity | Weak entity + identifying relationship → composite PK + CASCADE FK |
| multivalued | Multivalued attr → side table with CASCADE FK |
| mixed-relations | Aggregation (`o-`) vs composition (`*-`) → plain FK vs CASCADE |
| chain-three | Two chained binary relationships |
| star-three | Two relationships sharing an entity |
| ternary-relationship | Three-entity relationship → bridge with 3 FKs |

Adding a fixture: drop `foo.er` + `foo.postgres.sql` + `foo.mysql.sql`
into the fixtures dir, run `SNAPSHOT_SHAPES=1 yarn test` to generate the
shape sidecars, then `yarn test`. Zero code changes.

### Global setup

[test/globalSetup.ts](packages/language-server/test/globalSetup.ts) runs
once before any test file loads. It boots a MySQL 8.4 Docker container
via Testcontainers and sets `MYSQL_TEST_*` env vars. If Docker isn't
available, it sets `MYSQL_TEST_AVAILABLE=false` and MySQL stages skip
cleanly — no hard failure.

### Engine drivers

[test/support/engines/](packages/language-server/test/support/engines/)
provides a `SqlEngineDriver` interface with `init()`, `reset()`,
`load(sql)`, `query<T>(sql)`, and `close()`:

| Driver | Dialect | Requires |
|---|---|---|
| `PostgresPGliteDriver` | postgres | Nothing — PGlite runs Postgres as WASM in-process |
| `MysqlContainerDriver` | mysql | Docker (container booted in globalSetup) |

Both are pre-probed at module load in each test file. A failed `init()`
means the dialect's `describe` block is skipped via `describe.skipIf`.

### Schema inspectors

[test/support/inspectors/](packages/language-server/test/support/inspectors/)
query `information_schema` on a live database and produce a `SchemaShape`:

```ts
interface SchemaShape {
    tables: Record<string, TableShape>;
}
interface TableShape {
    columns: ColumnShape[];  // { name, type, nullable }
    primaryKey: string[];
    foreignKeys: ForeignKeyShape[];  // { columns, referencedTable, referencedColumns }
}
```

Used by Stages 4 and 5. Each dialect has its own inspector
(`PostgresInspector`, `MysqlInspector`) because `information_schema`
semantics differ (Postgres reports `character varying`, MySQL reports
`varchar`; PK column ordering differs, etc.).

### Stage 0 — fixture coverage

**1 test.** Asserts every `.er` file has a matching `.sql` AND
`.shape.json` for every dialect in `SQL_DIALECTS`. Catches "you added a
fixture but forgot a dialect." Skipped during `SNAPSHOT_SHAPES=1` mode.

### Stage 1 — grammar parse

**15 × 2 = 30 tests.** Each golden `.sql` is parsed through a real SQL
parser (libpg-query for Postgres, dt-sql-parser for MySQL). Catches
syntax errors in the golden before the emitter is even involved.

Pre-computed at module load via top-level `await` so downstream stages
can `skipIf(!grammarOk)` at test-definition time.

### Stage 2 — exporter output

**15 × 2 = 30 tests.** The real correctness test. Runs the emitter on
each `.er` and compares output against the golden `.sql` **byte-for-byte**
(`expect(result.content).toBe(expected)`). Also re-parses emitter output
through the grammar validator as a defensive check.

Uses `toBe`, NOT `toMatchFileSnapshot`. The golden is a hand-authored
spec — nobody can accidentally overwrite it with `vitest -u`.

### Stage 3 — engine execution

**15 × 2 = 30 tests** (when Docker available; Postgres-only without).
Loads each golden `.sql` into a real database and checks it executes
without error. Catches semantic issues the parser misses: unknown types,
bad FK targets, reserved-word collisions.

Each test gets a clean schema via `driver.reset()`.

### Stage 4 — structural assertions

**15 × 2 = 30 tests** (when engines available). Loads the golden into a
real database, snapshots the actual schema via the inspector, and compares
against the `.shape.json` sidecar.

Catches when SQL parses and executes fine but the database interprets it
differently than expected (e.g. Postgres silently maps `INT` to `integer`,
a column you expected NOT NULL turns out nullable).

### Stage 5 — cross-dialect equivalence

**15 tests** (needs both Postgres AND MySQL engines). Loads each fixture
into both databases, snapshots both schemas, normalizes dialect-specific
type names to canonical categories (`character varying` → `VARCHAR`,
`tinyint(1)` → `BOOLEAN`), and asserts they're equal.

Catches dialect drift: if someone updates a Postgres golden but forgets
MySQL, or vice versa, this stage breaks even when per-dialect Stage 4
stays green.

### Behavioural tests (Layer 6)

[test/behavioural.test.ts](packages/language-server/test/behavioural.test.ts)
— **10 tests** (5 per dialect). Doesn't test the shape of the schema —
tests that constraints **actually reject** bad data:

| Test | What it asserts |
|---|---|
| relationship bridge FK | Orphan row (non-existent parent) is rejected |
| plain entity PK | Duplicate PK insert is rejected |
| inheritance FK | Subclass row without parent row is rejected |
| self-ref FK | Manages row referencing non-existent Employee is rejected |
| multivalued child FK | Child row without parent is rejected |

These run against live engines (PGlite + MySQL container), not parsers.

### Property tests

[test/property/exporter.property.test.ts](packages/language-server/test/property/exporter.property.test.ts)
— **4 tests** (2 per dialect). Uses `fast-check` to generate 50 random
`.er` models per dialect and asserts:

1. `exportService.exportModel()` is **idempotent** end-to-end (parse → emit → parse → emit produces the same SQL).
2. `DdlEmitter.emit()` on the same parsed model is **deterministic** (same input → same output).

### Validator unit tests

[test/unit/validator.test.ts](packages/language-server/test/unit/validator.test.ts)
— **14 tests.** Tests the Langium validator checks: duplicate entity
names, duplicate attributes, key checks (missing key, inherited key,
UML visibility interaction), cardinality warnings, and
aggregation/composition notation checks.

### generateDrop unit tests

[test/unit/generate-drop.test.ts](packages/language-server/test/unit/generate-drop.test.ts)
— **8 tests.** Tests the `generateDrop` option directly since it doesn't
flow through the fixture pipeline:

- Drops absent when flag is off
- One DROP per CREATE, same table names
- Drops in reverse order (dependents first)
- Specific ordering for inheritance, multivalued, weak entities
- Drops come before all CREATEs
- Works identically for postgres and mysql

### The test count

| Layer | Tests | What it catches |
|---|---|---|
| Stage 0 — coverage | 1 | Missing fixture files |
| Stage 1 — grammar | 30 | Golden SQL doesn't parse |
| Stage 2 — exporter | 30 | Emitter output ≠ golden |
| Stage 3 — engine | 30 | SQL doesn't execute on real DB |
| Stage 4 — structural | 30 | Schema shape ≠ expected |
| Stage 5 — cross-dialect | 15 | Postgres shape ≠ MySQL shape |
| Behavioural | 10 | Constraints don't reject bad data |
| Property | 4 | Emitter not deterministic/idempotent |
| Validator unit | 14 | Validator checks wrong |
| generateDrop unit | 8 | DROP option broken |
| **Subtotal (real)** | **172** | |
| regen-fixtures (gated) | 30 | Helper — always skipped |
| snapshot-shapes (gated) | 30 | Helper — always skipped |
| **Total** | **232** | |

### The TDD loop

1. Write `foo.er` + `foo.postgres.sql` + `foo.mysql.sql` describing what
   you want.
2. `yarn test` — red. Stage 2 shows the byte-delta.
3. Edit `ddl-emitter.ts` until diffs disappear.
4. Run `SNAPSHOT_SHAPES=1 yarn test` to generate shape sidecars.
5. Review the `.shape.json` diffs.
6. `yarn test` — green.

### Maintaining the goldens

When you change the emitter:

```bash
# Regenerate all .sql goldens from .er files
REGEN_GOLDENS=1 yarn vitest run test/regen-fixtures.test.ts

# Review the diffs
git diff -- test/fixtures/*.sql

# Regenerate shape sidecars
SNAPSHOT_SHAPES=1 yarn test

# Review those diffs too
git diff -- test/fixtures/*.shape.json

# Confirm everything passes
yarn test
```

### What's NOT tested

- **Composite attributes** — grammar doesn't support them (see
  `docs/local/COMPOSITE_ATTRIBUTES.md`).
- **Reserved-word quoting** — entity named `Order` or `User` produces
  broken SQL. No test, no fix yet.
- **UNIQUE constraints in shape inspectors** — Stage 4 shapes track
  columns, types, nullable, PKs, and FKs, but not UNIQUE. Stage 2
  (golden match) catches UNIQUE drift, but Stage 5 (cross-dialect
  equivalence) doesn't.
- **Min cardinality enforcement** — e.g. "every Author writes at least
  one Book" can't be expressed with SQL constraints on a bridge table.
  Skipped entirely.