# Interim 1 — T2: Code Generation (ER → SQL)

**Blaž Bone · Tilen Ožbot** — 2026-04-21 — ~8 min talk + ~2 min demo

---

## 1 · Title

- T2: Code Generation — ER Database Schemas
- Langium-based bigER
- Blaž Bone & Tilen Ožbot

---

## 2 · Context

- bigER: hybrid ER tool for VS Code, 17,500+ installs
- Original: Xtext / Java
- Being reimplemented in **Langium / TypeScript**
- Our slice: ER → SQL DDL, configurable, dialect-aware

---

## 3 · Goals

- ER → SQL DDL (tables, PK, FK, indexes)
- Postgres + MySQL dialects
- Configurable ambiguity (inheritance, N:M, weak, multivalued)
- Naming strategy + validation
- LSP + CLI integration
- Tests: unit + golden + negative

---

## 4 · Research

- bigER's Java `SqlGenerator` + per-dialect `mapDataType`
- Langium AST lifecycle — must use `DocumentBuilder` for `.ref` to resolve
- Textbook ER→relational mapping rules
- Postgres vs MySQL divergence points
- Reference tools (DBML, real SQL parsers) — bigER has bugs

---

## 5 · Status — Done ✓

- `.er` → AST → DDL → file works end-to-end
- Entity → `CREATE TABLE` + PK
- Relationship → bridge table + composite PK + inline FK
- Postgres + MySQL dialect mapping (full category port)
- Derived attrs skipped
- LSP, VS Code command, CLI — all three wired

---

## 6 · Architecture

```
CLI / VS Code / LSP
       ▼
  SqlExporter
       │  parseToModel()
       ▼
  Langium AST
       │  new DdlEmitter(dialect)
       ▼
  CREATE TABLE …
```

- `sql-exporter.ts` — orchestrator
- `ddl-emitter.ts` — AST walk
- `dialects.ts` — postgres/mysql + type categories

---

## 7 · Dialect divergence — live example

```
score: DOUBLE   photo: BLOB   bio: CLOB
```

| | postgres | mysql |
|---|---|---|
| DOUBLE | DOUBLE PRECISION | DOUBLE |
| BLOB | BYTEA | BLOB |
| CLOB | TEXT | TEXT |

Covered by `dialect-types` fixture, all 3 test stages.

---

## 8 · Testing

- Vitest, **23 green** across Ubuntu / macOS / Windows, Node 22
- Golden files auto-discovered per dialect
- Three stages per fixture:
  1. **Grammar** — real parsers (`libpg-query`, `dt-sql-parser`)
  2. **Exporter** — byte-for-byte diff + parse check
  3. **Engine** — Postgres via PGlite (MySQL deferred)

---

## 9 · Demo (~2 min)

1. `examples/test.er` in VS Code → `Export SQL` command
2. CLI: `--dialect postgres` vs `--dialect mysql`
3. `diff` shows only type columns change
4. `yarn test` → 23 green, three stages visible

---

## 10 · Planned — Interim 2

- Explicit `FOREIGN KEY … ON DELETE/UPDATE`
- Naming strategy (snake_case, prefixes)
- Ambiguity config: inheritance, 1:N, 1:1, weak, multivalued, NULL
- Validation pass (missing types, collisions, risky FKs)
- Config surface: CLI / LSP options / sidecar file
- Docs: mapping rules + feature matrix
- Stretch: Prisma target

---

## 11 · Blockers — feedback please

1. **Cardinality-blind vs -aware** — match bigER or diverge?
2. **Where does config live** — CLI flag / `.er` directive / sidecar?
3. **Dialect abstraction** — scale strategy objects or switch to emitter subclass?
4. **bigER bugs** (e.g. MySQL `CLOB`) — stay faithful or fix?
5. **Composition / aggregation → SQL** — FK + warning OK?

---

## 12 · Next Steps

1. Explicit FK emission
2. Config schema
3. Cardinality decision (post-meeting)
4. Naming strategy + validation
5. Inheritance, weak, multivalued
6. Fixture expansion (+ negative)
7. `docs/mapping-rules.md`

Split: Tilen = emitter core · Blaž = tests / config / docs

---

## Appendix — Commits (last 3 days)

- PR #1 Tilen — v0 exporter (parse + scaffold → real DDL)
- PR #2 Blaž — Vitest infra + fixtures + CI
- PR #3 Tilen — postgres + mysql dialect + `DdlEmitter`
- PR #4 Blaž — 3-stage validation (grammar + engine)
