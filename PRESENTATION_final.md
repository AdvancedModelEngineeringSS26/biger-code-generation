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

## Assumptions — Types and Constraints

- Datatype mapping
- Nullability — `NOT NULL` by default
- Cardinality — `UNIQUE` from look-across constraints
- Aggregation and composition

---

## Assumptions — Relational Mapping

- Weak entity → folded into one table with owner FK
- Generalization — class-table inheritance
- Multi-valued attribute → side table
- Roles → FK column-name prefix for self-references

---

## Assumptions — Export Behavior

- `generateDrop` flag → reverse-emission `DROP` order
- `DROP TABLE IF EXISTS` is dialect-agnostic
- Parent entities are declared before subclasses
