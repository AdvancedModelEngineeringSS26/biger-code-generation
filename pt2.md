When the bigER → SQL generator translates an `.er` model into DDL, several
gaps in the source notation force the emitter to make choices. The notation
says "this is a string"; SQL needs `VARCHAR(80)`. The notation says
`Author[1] -> Book[N]`; SQL has no native "cardinality" — only PK / FK /
UNIQUE / NOT NULL. This file lists every such choice, why it was made, and
where in the code it lives.

All file/line references point at the emitter on this branch:
[packages/language-server/src/export/sql/](packages/language-server/src/export/sql/).

---

## 1. Datatype mapping

**Where**: [dialects.ts](packages/language-server/src/export/sql/dialects.ts), [`renderDatatype`](packages/language-server/src/export/sql/ddl-emitter.ts) in the emitter.

**Assumptions**:

- bigER datatypes are not restricted by the grammar — any identifier works
  (`int`, `INT`, `INTEGER`, `string`, `DATETIME`, `FOOBAR`). The emitter
  asks the active `Dialect` to map the input to a dialect-native name.
- Each dialect declares "first-of-category" types. Anything mapped into
  category `INTEGER` resolves to that dialect's first INTEGER type
  (postgres → `BIGINT`; mysql → `BIGINT` too). Same for `FLOAT`, `DECIMAL`,
  `VARCHAR`, `CHAR`, `DATE`, `DATE_TIME`, `BLOB`, `CLOB`, `BOOLEAN`.
- bigER `string` → dialect's first CHARACTER type (postgres `VARCHAR`,
  mysql `VARCHAR`). Sizeless. MySQL will accept this; some MySQL versions
  may reject `VARCHAR` without a size — if you hit that, declare a size.
- Datatypes the dialect doesn't recognise pass through unchanged. The DB
  decides whether to accept them at engine time (Stage 3 catches this).
- `DATETIME` is mapped to `TIMESTAMP` in postgres (because `DATETIME` is
  not a native postgres type). `DOUBLE` maps to `DOUBLE PRECISION` in
  postgres but stays `DOUBLE` in mysql.

**Limitation**: there is no way for a user to override the default size of
a category-mapped type. If you want `VARCHAR(255)`, write `VARCHAR(255)`
explicitly in the `.er`; writing `string` gives sizeless `VARCHAR`.

---

## 2. Nullability — NOT NULL by default

**Where**: [`renderAttribute`](packages/language-server/src/export/sql/ddl-emitter.ts) in `ddl-emitter.ts`.

**Rule**: every column gets `NOT NULL` unless it's part of the PRIMARY KEY
(in which case the PK clause implies NOT NULL) or the attribute is marked
`optional`.

**Why default-NOT-NULL and not default-nullable**:

- Matches typical DDL convention — `NOT NULL` is the well-known default
  recommendation in most style guides.
- `optional` in the grammar reads as the explicit annotation. It's clearer
  to mark the exception than to mark the rule.
- The alternative (default-nullable, NOT NULL only when cardinality is 1)
  would mean every entity attribute is nullable unless explicitly
  cardinality-constrained — surprising and lossy.

**Limitations**:

- Min cardinality on a relationship participant (e.g. `Author[1]` meaning
  "every Book has an Author") is **not** translated into NOT NULL on the
  bridge table's FK column. Bridge FK columns are already part of the PK,
  so they're NOT NULL anyway — adding the constraint there is redundant.
  Min cardinality on the OPPOSITE side (e.g. "every Author writes at least
  one Book") cannot be enforced by SQL constraints on the bridge alone;
  it would need triggers or check constraints. Skipped.

---

## 3. Cardinality — `UNIQUE` from look-across constraints

**Where**: [`emitRelationship`](packages/language-server/src/export/sql/ddl-emitter.ts) and `isAtMostOne` at the bottom of `ddl-emitter.ts`.

**Interpretation**: bigER uses Chen-style "look-across" cardinality. In
`A[m..n] -> B[p..q]`, the `m..n` describes A's participation per instance
of B, and `p..q` describes B's participation per instance of A. So:

- `Author[1] -> Book[N]` means "each Book has 1 Author; each Author has N
  Books." Each Book appears at most once in the bridge → `UNIQUE` on the
  bridge's `book_id` column.
- `Book[N] -> Tag[N]` means "each Tag has many Books; each Book has many
  Tags." Neither side is UNIQUE.
- `Husband[1] -> Wife[1]` means each side participates once → both FK
  columns are UNIQUE.

**Encoding rule**: a participant's FK column in the bridge is UNIQUE iff
the OPPOSITE participant has cardinality `1`, `1..1`, `0..1`, or any
synonym thereof. See `isAtMostOne` for the exact mapping.

**Limitations**:

- Only binary relationships get UNIQUE constraints. Ternary+ relationships
  emit a plain bridge table with PK across all participants. Encoding
  cardinality across ≥3 participants requires functional-dependency
  analysis we don't do.
- Min cardinality (the `1..` part of `1..N`) doesn't influence emission
  beyond the NOT NULL story in §2.
- The shape inspectors at
  [test/support/inspectors/](packages/language-server/test/support/inspectors/)
  don't capture UNIQUE constraints, so Stage 4 (per-dialect structural
  comparison) and Stage 5 (cross-dialect equivalence) won't catch UNIQUE
  drift between dialects. Stage 2 (golden match) does.

---

## 4. Aggregation and composition

**Where**: [`emitRelationship`](packages/language-server/src/export/sql/ddl-emitter.ts), the `isWhole` branch.

**Assumptions**:

- **Composition** (`*-` / `-*`): the side with the `*` is the *whole*.
  Bridge → whole FK gets `ON DELETE CASCADE`. Deleting the whole removes
  the relationship rows referencing it, matching the "part's lifecycle is
  bound to the whole" semantics.
- **Aggregation** (`o-` / `-o`): plain FK, no CASCADE. SQL has no
  built-in notion of "aggregation" beyond foreign-key reference, and
  the part can outlive the whole.
- Only **binary** composition is honoured. For ternary+ the type-decorator
  is ignored and a plain FK is emitted (the validator already warns about
  ternary aggregation/composition under UML at
  [entity-relationship-validator.ts:154](packages/language-server/src/entity-relationship-validator.ts#L154)).

**Limitations**:

- Composition does NOT cause flattening — the bridge table is still
  emitted even when cardinality + composition together would naturally
  fold into "FK on the part's own table." That's a separate stretch
  feature (see GENERATOR_HANDOFF.md → Stretch).

---

## 5. Weak entity → folded into one table with owner FK

**Where**: [`emitWeakEntity`](packages/language-server/src/export/sql/ddl-emitter.ts) and [`findWeakOwner`](packages/language-server/src/export/sql/ddl-emitter.ts).

**Assumptions**:

- A weak entity is identified by the first `weak relationship` in the
  model that mentions it. The first non-weak participant of that
  relationship is taken as the owner.
- The owner's PK columns are inlined into the weak entity's table. The
  combined PK is `(owner_pk_cols ∪ partial_key_cols)`. An FK with
  `ON DELETE CASCADE` from the inlined owner-PK columns points back at
  the owner — deleting the owner removes its weak rows.
- The `weak relationship` itself does NOT emit a separate bridge table
  (the FK is already in the weak entity's table). This is enforced at
  [`emit`](packages/language-server/src/export/sql/ddl-emitter.ts) via
  `if (rel.weak) continue`.
- If no identifying weak relationship is found, the weak entity is emitted
  with only its `partial_key` columns as PK and no owner FK. The validator
  is the line of defence for this case
  ([entity-relationship-validator.ts:94](packages/language-server/src/entity-relationship-validator.ts#L94)).

**Limitations**:

- If a weak entity participates in *multiple* weak relationships, we
  use the first one and ignore the others. Ambiguous case; no real-world
  precedent for one.
- If both participants of a weak relationship are weak, the lookup picks
  the first non-weak participant — which doesn't exist — and emits
  without an owner. Conceptually invalid; document as a validator
  follow-up.

---

## 6. Generalization — class-table inheritance

**Where**: [`emitInheritedEntity`](packages/language-server/src/export/sql/ddl-emitter.ts).

**Strategy chosen**: class-table inheritance. The subclass table duplicates
the parent's PK columns as its own PK and points an FK at the parent.
The subclass row's existence is bound to the parent row. The subclass
table holds only its own (non-derived, non-multivalued) attributes — it
does NOT copy parent's non-key attrs.

**Why class-table over alternatives**:

- Single-table (everything in one wide table with a discriminator) loses
  the entity boundary and bloats the parent table; awkward when subclasses
  have many type-specific attrs.
- Concrete-table (each subclass flattens parent attrs in) requires marking
  parents as abstract — bigER has no such marker — and duplicates schema.
- Class-table is the cleanest faithful translation of bigER's `extends`.

**The inheritance FK does NOT cascade.** Today, attempting to delete a
parent row while a subclass row exists raises an FK violation. Open
question — both `ON DELETE CASCADE` (the subclass IS the same entity
viewed more specifically) and the current RESTRICT default are defensible.
Left as is; raise an issue if needed.

**Limitations**:

- Multi-level inheritance (`C extends B extends A`) works (each level
  FKs to its direct parent and the PK propagates up via `collectKeys`),
  but generates a chain of joins for any query — performance-aware users
  may want single-table. Not a generator concern.
- No cycle detection in the `extends` chain. If you write
  `A extends B; B extends A`, `collectKeys` loops forever. The validator
  should reject this — currently doesn't (see TESTING_TODO.md #14).

---

## 7. Multi-valued attribute → side table

**Where**: [`emitMultivaluedTable`](packages/language-server/src/export/sql/ddl-emitter.ts).

**Assumptions**:

- An attribute marked `multivalued` is dropped from the entity's main
  table (excluded by `emittableAttrs`) and emitted as a side table named
  `<Entity>_<attr>`.
- Side table schema: parent's PK columns + the multivalued attribute
  column; composite PK across all of them; `ON DELETE CASCADE` FK back to
  parent. The multivalued column is in the PK, so it's implicitly NOT
  NULL and duplicate values per parent are rejected.
- Side table names are unquoted concatenation. Collisions (e.g. two
  entities both named `Item` with multivalued `tag`) would produce two
  tables with the same name. Not handled.

---

## 8. Roles → FK column-name prefix for self-references

**Where**: [`emitRelationship`](packages/language-server/src/export/sql/ddl-emitter.ts), the `hasDuplicates`
block.

**Assumptions**:

- A role label is used as an FK-column-name prefix *only* when the same
  entity appears more than once in the relationship (self-reference, or a
  pair of participants of the same entity). In other cases the role is
  parsed but doesn't affect emission.
- The column-name pattern is `<role>_<keyName>` — e.g. `manager_id` and
  `reports_id` for `Employee[1|"manager"] -> Employee[N|"reports"]`.

**Limitations**:

- If a relationship has duplicated participants but no roles, FK columns
  collide on the entity's key name (`id`, `id`). The emitter emits both;
  the database rejects the table. The validator should catch this —
  currently it doesn't. Easy follow-up: add a "role required for
  self-reference" check.

---

## 9. `generateDrop` flag → reverse-emission DROP order

**Where**: [`emit`](packages/language-server/src/export/sql/ddl-emitter.ts) with `opts.generateDrop`.

**Assumptions**:

- When `opts.generateDrop` is true, the emitter prepends `DROP TABLE IF
  EXISTS <name>;` for every table the run will create. The drops appear
  in **reverse emission order**.
- Reverse-emission order is correct because every FK reference points
  "upward":
  - Bridge tables FK to entity tables → bridge tables emit after entities.
  - Subclass tables FK to parent tables → subclasses extend their parent
    declared earlier in the source.
  - Multivalued side tables FK to their owner → emitted in the same loop
    iteration as their owner (right after).
  - Weak entity tables FK to their owner → no separate bridge for the
    weak relationship.
  Dropping in reverse means every dropped table has no remaining incoming
  FK references at the moment of its DROP.
- The flag is dialect-agnostic — `DROP TABLE IF EXISTS X;` is identical
  syntax in postgres and mysql.

**Limitations / required source-order discipline**:

- The "subclasses come after parents" invariant requires the user to
  declare parents before children in the `.er` file. The grammar permits
  the opposite order (`Entity Child extends Parent` before
  `Entity Parent`), and emission walks `model.entities` in source order
  — so an inverted source produces inverted drop order, which can fail
  in MySQL. Workaround: declare parents first.
- The reverse-emission heuristic doesn't model cross-cutting FKs in
  exotic ER models (e.g. an entity-table FK pointing at a bridge table).
  The generator never emits those today, so the heuristic stands.
- The flag goes only through the language server's export path; the test
  harness exercises it via a dedicated unit test at
  [test/unit/generate-drop.test.ts](packages/language-server/test/unit/generate-drop.test.ts).
  The fixture pipeline does not currently support per-fixture options
  sidecars (planned in TESTING_TODO.md).

---

## 10. Things we deliberately do NOT generate

These are valid bigER inputs that produce no SQL artefact and no
warning. Document so the engineer doesn't think they're bugs:

- `derived` attributes — by definition computed from other columns; no
  storage. Skipped at `emittableAttrs`.
- `aggregation` operators (`o-` / `-o`) decoration — emitted as plain
  FK. SQL has no semantic distinction.
- Visibility modifiers (`public`, `private`, `+`, `-`, etc.) — UML-only
  surface concern; ignored for SQL.
- `notation = chen|bachman|...` declarations — affect diagram rendering
  only.
- The model's name (`erdiagram MyModel`) — not used in any table or
  schema name. SQL output has no enclosing namespace.

---

## 11. Known limitations affecting all generated SQL

These bite real users; flagged here so they're not lost.

- **Reserved-word collision**: entity named `Order`, `User`, `Group`,
  `Date`, etc. produces SQL that fails to execute. The emitter never
  quotes identifiers. Per-dialect quoting (e.g. `"Order"` in postgres,
  `` `Order` `` in mysql) is a follow-up.
- **Anonymous constraints**: FK and UNIQUE constraints are emitted
  without `CONSTRAINT <name>` clauses. DB-level violation messages
  reference auto-generated names instead of the relationship name,
  hurting diagnosability. Adding `CONSTRAINT fk_<rel>_<role_or_target>`
  is a small follow-up.
- **No indexes**: only PKs and the constraints above get indexes
  (typically auto-created). FK columns are not explicitly indexed; on
  MySQL InnoDB this is usually fine (FKs get an implicit index), on
  PostgreSQL FK indexes must be explicit for query performance. Future
  work.
- **No `CREATE TABLE IF NOT EXISTS`**: cannot re-run the generator into
  an existing DB without first running with `generateDrop`. A second
  flag would address this.

---

## 12. Maintaining the goldens

When you change the emitter:

1. Run `REGEN_GOLDENS=1 yarn vitest run test/regen-fixtures.test.ts`
   from `packages/language-server/`. This rewrites every
   `<stem>.{postgres,mysql}.sql` fixture from the corresponding `.er`.
2. Review the diffs.
3. Run `SNAPSHOT_SHAPES=1 yarn test` to refresh the matching
   `<stem>.<dialect>.shape.json` sidecars. Review those diffs too.
4. Then run `yarn test` to confirm Stages 0-5 are green.

The regen helper lives at
[test/regen-fixtures.test.ts](packages/language-server/test/regen-fixtures.test.ts);
it's a vitest spec gated on the `REGEN_GOLDENS=1` env var and skipped
otherwise.