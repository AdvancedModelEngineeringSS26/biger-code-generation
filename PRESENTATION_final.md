# Code Generation (ER → SQL)

**Blaž Bone · Tilen Ožbot**

June 2026

---

## Supported ER Concepts — Entities & Relationships

| Concept | T | G | Gen |
| --- | :-: | :-: | :-: |
| Strong entity | ✅ | ✅ | ✅ |
| Weak entity | ✅ | ✅ | ✅ |
| Binary rel. | ✅ | ✅ | ✅ |
| Unary rel. | ✅ | ✅ | ⏺ |
| Ternary rel. | ✅ | ✅ | ✅ |
| N-ary (≥4) | ❌ | ❌ | ⏺ |
| Cardinality | ✅ | ✅ | ⏺ |
| Participation | ✅ | ✅ | ❌ |
| Roles | ✅ | ✅ | ⏺ |

**T** = textual · **G** = graphical · **Gen** = generator · ✅ supported · ⏺ partial · ❌ unsupported

---

## Supported ER Concepts — Attributes & EER

| Concept | T | G | Gen |
| --- | :-: | :-: | :-: |
| Entity attr. | ✅ | ✅ | ✅ |
| Rel. attr. | ✅ | ⏺ | ✅ |
| Keys | ✅ | ✅ | ✅ |
| Datatypes | ✅ | ✅ | ✅ |
| Composite | ❌ | ❌ | ❌ |
| Multivalued | ✅ | ✅ | ✅ |
| Derived | ✅ | ✅ | ✅ |
| Generalization | ✅ | ✅ | ✅ |

**T** = textual · **G** = graphical · **Gen** = generator · ✅ supported · ⏺ partial · ❌ unsupported

---

## Assumption 1 — Explicit Relational Artifacts

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

## Assumption 2 — Constraints Where SQL Can Express Them

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

## Assumption 3 — Dialects Normalize Types, Not Semantics

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
