```

---

## Slide 1: What We Test

```
  .er file  ──►  Generator  ──►  SQL output
  (input)        (our code)      (Postgres / MySQL)
```

**The question:** Is the generated SQL correct?

"Correct" has 5 meanings — so we test 5 ways:

| # | Stage | Question |
|---|---|---|
| 1 | Grammar parse | Does the SQL parse as valid syntax? |
| 2 | Golden match | Does the generator produce *exactly* the SQL we specified? |
| 3 | Engine execution | Does the SQL run on a real Postgres / MySQL database? |
| 4 | Cross-dialect equivalence | Do Postgres and MySQL schemas agree? |
| 5 | Behavioural | Do constraints actually reject bad data? |

**+ property tests** (random model generation) **+ unit tests** (validator, options)

---

## Slide 2: How It Works

```
┌─────────────────────────────────────────────────────────┐
│  15 fixtures   ×   2 dialects   =   30 test scenarios   │
│                                                         │
│  Each fixture:   foo.er                                 │
│                  foo.postgres.sql  (hand-written spec)  │
│                  foo.mysql.sql     (hand-written spec)  │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌──── Stage 1 ────────────────────────────────────────────┐
│  Parse each .sql through a real SQL parser              │
│  Postgres: libpg-query (C parser → WASM)               │
│  MySQL:    dt-sql-parser (ANTLR4 grammar)              │
└─────────────────────────┬───────────────────────────────┘
                          ▼
┌──── Stage 2 ────────────────────────────────────────────┐
│  Run generator on .er → compare output vs .sql golden   │
│  Byte-for-byte match (toBe, not snapshot)               │
│  ⭐ This is the core correctness test                   │
└─────────────────────────┬───────────────────────────────┘
                          ▼
┌──── Stage 3 ────────────────────────────────────────────┐
│  Execute SQL on real databases                          │
│  Postgres: PGlite (in-process WASM, no Docker)          │
│  MySQL:    Testcontainers (Docker container)            │
└─────────────────────────┬───────────────────────────────┘
                          ▼
┌──── Stage 4 ────────────────────────────────────────────┐
│  Load into both DBs → snapshot schemas → normalize      │
│  types → assert Postgres shape == MySQL shape            │
│  Catches: dialect drift between the two goldens         │
└─────────────────────────┬───────────────────────────────┘
                          ▼
┌──── Behavioural ────────────────────────────────────────┐
│  INSERT bad data → assert FK / PK constraints reject it │
│  Proves constraints work, not just exist                │
└─────────────────────────────────────────────────────────┘
```

---

## Slide 3: The Numbers

| Layer | Tests | Technology |
|---|---|---|
| Stage 0 — fixture coverage | 1 | File scanning |
| Stage 1 — grammar parse | 30 | libpg-query, dt-sql-parser |
| Stage 2 — golden match | 30 | Vitest `toBe` |
| Stage 3 — engine execution | 30 | PGlite (WASM), Testcontainers (Docker) |
| Stage 4 — cross-dialect | 15 | information_schema + normalization |
| Behavioural | 10 | Live INSERT / REJECT |
| Property (fast-check) | 4 | Random .er models → determinism check |
| Unit tests | 22 | Validator + generateDrop option |
| **Total** | **142** | |

**Adding a new test case:** drop 3 files (`foo.er` + 2 `.sql` goldens) → `yarn test` → done. Zero code changes.

**TDD workflow:**

```
 1. Write .er + .sql specs       ← you define what's correct
 2. yarn test                    ← red (Stage 2 shows the diff)
 3. Fix the generator            ← make the diff disappear
 4. yarn test                    ← green ✅
```
```