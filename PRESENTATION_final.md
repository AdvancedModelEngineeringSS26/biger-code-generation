# Final Presentation: Code Generation (ER → SQL)

**Blaž Bone · Tilen Ožbot** — 2026-06

---

## Slide 1 · Code Generation

- Goal: generate SQL DDL from bigER `.er` models
- Scope: generator part of the project
- Targets: generic SQL, PostgreSQL, MySQL
- Output: `CREATE TABLE`, primary keys, foreign keys, constraints
- Integration: VS Code commands, LSP request, CLI export path

---

## Slide 2 · Supported ER Concepts

| ER Concept | Textual | Graphical | Generator | Additional information |
| --- | --- | --- | --- | --- |
| **Entities** |  |  |  |  |
| Strong Entity | ✅ | ✅ | ✅ | Generated as a SQL table. |
| Weak Entity | ✅ | ✅ | ✅ | Generated as a SQL table with owner key columns and `ON DELETE CASCADE` when connected through a weak relationship. |
| **Relationships** |  |  |  |  |
| Binary Relationship | ✅ | ✅ | ✅ | `A -> B`; generated as a bridge table with primary and foreign keys. |
| Unary Relationship | ✅ | ✅ | ⏺ | Supported when roles disambiguate repeated entity columns, e.g. <code>Employee[1&#124;"manager"] -> Employee[N&#124;"reports"]</code>. |
| Ternary Relationship | ✅ | ✅ | ✅ | `A -> B -> C`; generated as a bridge table with all participant keys. |
| N-ary Relationship | ❌ | ❌ | ⏺ | SQL emitter can build a bridge table from all relationship participants, but only ternary relationships are documented/tested. |
| Cardinality Constraints | ✅ | ✅ | ⏺ | `1`, `N`, `0..1`, `0..N`; binary max-one constraints are generated as `UNIQUE` constraints. |
| Participation Constraints | ✅ | ✅ | ❌ | Optional/mandatory participation is expressible textually/graphically, but mandatory participation is not enforced in generated SQL. |
| Roles | ✅ | ✅ | ⏺ | <code>A[N&#124;"role"]</code>; used by the generator mainly to name columns in self-referential relationships. |
| **Attributes** |  |  |  |  |
| Entity Attributes | ✅ | ✅ | ✅ | Generated as table columns. |
| Relationship Attributes | ✅ | ⏺ | ✅ | Generated as columns on the relationship bridge table. |
| Keys | ✅ | ✅ | ✅ | `attr key`; weak entities use `attr partial_key` in the generated composite primary key. |
| Datatypes | ✅ | ✅ | ✅ | `attr1: INT` or `attr2: VARCHAR(50)`; PostgreSQL/MySQL dialect mapping and decimal precision are supported. |
| Composite Attribute | ❌ | ❌ | ❌ |  |
| Multi-valued Attribute | ✅ | ✅ | ✅ | `attr multivalued`; generated as a separate side table named `<Entity>_<attr>`. |
| Derived Attribute | ✅ | ✅ | ✅ | `attr derived`; omitted from generated SQL because derived values are not stored. |
| **EER Concepts** |  |  |  |  |
| Generalization | ✅ | ✅ | ✅ | `A extends B`; generated as a child table whose primary key is also a foreign key to the parent table. |

---

## Slide 3 · Assumption 1 — Explicit Relational Artifacts

- The generator uses deterministic ER → relational mapping rules
- Strong entities become tables
- Relationships become bridge tables
- Weak entities copy the owner key and add their `partial_key`
- Multivalued attributes become side tables
- Inheritance becomes a child table with a primary-key foreign key to the parent

Why:
- SQL output stays easy to inspect
- Golden fixtures stay readable
- Generated schemas can be validated with real database engines

---

## Slide 4 · Assumption 2 — Constraints Where SQL Can Express Them

- Primary keys are generated from `key` attributes
- Weak entity identity is generated from owner key + `partial_key`
- Relationship participants become foreign keys
- Binary max-one cardinalities become `UNIQUE` constraints
- Weak ownership and composition use `ON DELETE CASCADE`
- Optional attributes become nullable columns

Boundary:
- Mandatory participation is not enforced in generated SQL
- We do not generate triggers or assertions
- Some ER semantics remain modeling-level information

---

## Slide 5 · Assumption 3 — Dialects Normalize Types, Not Semantics

Example input:

```er
score: DOUBLE
photo: BLOB
bio: CLOB
birthday: DATETIME
```

| ER datatype | PostgreSQL | MySQL |
| --- | --- | --- |
| `DOUBLE` | `DOUBLE PRECISION` | `DOUBLE` |
| `BLOB` | `BYTEA` | `BLOB` |
| `CLOB` | `TEXT` | `TEXT` |
| `DATETIME` | `TIMESTAMP` | `TIMESTAMP` |
| `BOOLEAN` | `BOOLEAN` | `BOOLEAN` |

Assumptions:
- Dialect mapping only changes SQL type names
- Table and column names are emitted as written
- Unknown datatypes are passed through unchanged
- The generator produces DDL, not migrations or ORM models
