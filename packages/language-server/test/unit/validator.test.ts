import { EmptyFileSystem } from 'langium';
import { parseHelper } from 'langium/test';
import { describe, expect, it } from 'vitest';
import { createEntityRelationshipServices } from '../../src/entity-relationship-module.js';
import type { Model } from '../../src/generated/ast.js';

// LSP DiagnosticSeverity constants. Hardcoded to keep the file self-contained.
const ERROR = 1;
const WARNING = 2;

const services = createEntityRelationshipServices(EmptyFileSystem).EntityRelationship;
const parse = parseHelper<Model>(services);

async function diagnose(input: string) {
    const doc = await parse(input, { validation: true });
    return doc.diagnostics ?? [];
}

function findDiagnostic(diagnostics: { severity?: number; message: string }[], severity: number, pattern: RegExp) {
    return diagnostics.find((d) => d.severity === severity && pattern.test(d.message));
}

function reservedKeywordDiagnostics(diagnostics: { message: string }[]) {
    return diagnostics.filter((d) => /reserved keyword/.test(d.message));
}

// ──────────────────────────────────────────────────────────────────────────────
// Sanity check — a valid model must not produce diagnostics.
// Guards against "we accidentally always warn."
// ──────────────────────────────────────────────────────────────────────────────

describe('validator > positive control', () => {
    it('emits no diagnostics for a well-formed model', async () => {
        const ds = await diagnose(`
            erdiagram M
            entity A { id: INT key }
            entity B { id: INT key }
            relationship R { A -> B }
        `);
        expect(ds).toEqual([]);
    });
});

// ──────────────────────────────────────────────────────────────────────────────
// Duplicate-name checks (errors)
// ──────────────────────────────────────────────────────────────────────────────

describe('validator > duplicate names', () => {
    it('flags duplicate entity names as error', async () => {
        const ds = await diagnose(`
            erdiagram M
            entity A { id: INT key }
            entity A { id: INT key }
        `);
        expect(findDiagnostic(ds, ERROR, /Multiple entities/)).toBeTruthy();
    });

    it('flags duplicate relationship names as error', async () => {
        const ds = await diagnose(`
            erdiagram M
            entity A { id: INT key }
            entity B { id: INT key }
            relationship R { A -> B }
            relationship R { A -> B }
        `);
        expect(findDiagnostic(ds, ERROR, /R/)).toBeTruthy();
    });

    it('flags duplicate attribute names within an entity as error', async () => {
        const ds = await diagnose(`
            erdiagram M
            entity A {
                id: INT key
                id: INT
            }
        `);
        expect(findDiagnostic(ds, ERROR, /Multiple attributes/)).toBeTruthy();
    });
});

// ──────────────────────────────────────────────────────────────────────────────
// Naming conventions (warnings)
// ──────────────────────────────────────────────────────────────────────────────

describe('validator > naming', () => {
    it('warns when entity name starts with a lowercase letter', async () => {
        const ds = await diagnose(`
            erdiagram M
            entity a { id: INT key }
        `);
        expect(findDiagnostic(ds, WARNING, /capital/i)).toBeTruthy();
    });
});

// ──────────────────────────────────────────────────────────────────────────────
// Reserved target-dialect keywords (warnings)
// ──────────────────────────────────────────────────────────────────────────────

describe('validator > reserved generator keywords', () => {
    it('warns on entity names and lists every affected SQL dialect', async () => {
        const ds = await diagnose(`
            erdiagram M
            entity select { id: INT key }
        `);

        expect(findDiagnostic(ds, WARNING, /"select" is a reserved keyword in SQL, PostgreSQL, and MySQL/)).toBeTruthy();
        expect(findDiagnostic(ds, ERROR, /reserved keyword/)).toBeFalsy();
    });

    it('warns on attribute and relationship names used by generators', async () => {
        const ds = await diagnose(`
            erdiagram M
            entity A {
                id: INT key
                from: INT
            }
            entity B { id: INT key }
            relationship where { A -> B }
        `);

        expect(findDiagnostic(ds, WARNING, /"from" is a reserved keyword in SQL, PostgreSQL, and MySQL/)).toBeTruthy();
        expect(findDiagnostic(ds, WARNING, /"where" is a reserved keyword in SQL, PostgreSQL, and MySQL/)).toBeTruthy();
    });

    it('warns on relationship roles because they prefix generated reference fields', async () => {
        const ds = await diagnose(`
            erdiagram M
            entity A { id: INT key }
            entity B { id: INT key }
            relationship R { A[1|"select"] -> B[N] }
        `);

        expect(findDiagnostic(ds, WARNING, /"select" is a reserved keyword in SQL, PostgreSQL, and MySQL/)).toBeTruthy();
    });

    it('warns on MongoDB-reserved generated field names', async () => {
        const ds = await diagnose(`
            erdiagram M
            entity A {
                id: INT key
                _id: VARCHAR
            }
        `);

        expect(findDiagnostic(ds, WARNING, /"_id" is a reserved keyword in MongoDB/)).toBeTruthy();
    });

    it('does not warn for ER syntax keywords or datatype names used in grammar positions', async () => {
        const ds = await diagnose(`
            erdiagram M
            notation = uml
            entity A {
                public id: INT key
                name: VARCHAR optional
                total: DECIMAL derived
            }
            entity B { id: INT key }
            relationship R { A[1] -> B[N] }
        `);

        expect(reservedKeywordDiagnostics(ds)).toEqual([]);
    });
});

// ──────────────────────────────────────────────────────────────────────────────
// Notation-specific rules (warnings)
// ──────────────────────────────────────────────────────────────────────────────

describe('validator > notation rules', () => {
    it('warns when aggregation is used outside UML notation', async () => {
        const ds = await diagnose(`
            erdiagram M
            notation = chen
            entity A { id: INT key }
            entity B { id: INT key }
            relationship R { A o- B }
        `);
        expect(findDiagnostic(ds, WARNING, /Aggregation.*UML/i)).toBeTruthy();
    });

    it('warns when composition is used outside UML notation', async () => {
        const ds = await diagnose(`
            erdiagram M
            notation = chen
            entity A { id: INT key }
            entity B { id: INT key }
            relationship R { A *- B }
        `);
        expect(findDiagnostic(ds, WARNING, /Composition.*UML/i)).toBeTruthy();
    });

    it('warns when visibility modifier is used outside UML notation', async () => {
        const ds = await diagnose(`
            erdiagram M
            notation = chen
            entity A { +id: INT key }
        `);
        expect(findDiagnostic(ds, WARNING, /[Vv]isibility.*UML/)).toBeTruthy();
    });

    it('warns when cardinality is invalid for chen notation', async () => {
        const ds = await diagnose(`
            erdiagram M
            notation = chen
            entity A { id: INT key }
            entity B { id: INT key }
            relationship R { A[none] -> B[none] }
        `);
        expect(findDiagnostic(ds, WARNING, /[Ii]nvalid cardinality/)).toBeTruthy();
    });
});

// ──────────────────────────────────────────────────────────────────────────────
// Key checks — exercises checkEntityKeys (was dead code before this commit).
// Includes precedence-bug regression tests for the UML inheritance branch.
// ──────────────────────────────────────────────────────────────────────────────

describe('validator > entity keys', () => {
    it('warns when a non-weak entity has no key', async () => {
        const ds = await diagnose(`
            erdiagram M
            entity A { name: VARCHAR }
        `);
        expect(findDiagnostic(ds, WARNING, /[Mm]issing primary key/)).toBeTruthy();
    });

    it('warns when a weak entity has no partial_key', async () => {
        const ds = await diagnose(`
            erdiagram M
            weak entity A { name: VARCHAR }
        `);
        expect(findDiagnostic(ds, WARNING, /[Mm]issing partial key/)).toBeTruthy();
    });

    it('does not warn when key is inherited from a parent', async () => {
        const ds = await diagnose(`
            erdiagram M
            entity A { id: INT key }
            entity B extends A { name: VARCHAR }
        `);
        expect(findDiagnostic(ds, WARNING, /[Mm]issing primary key/)).toBeFalsy();
    });

    it('does not warn under UML when the inherited key is public', async () => {
        // Regression for the precedence bug at validator.ts line 129:
        // `attr.type?.KEY != attr.visibility?.PRIVATE == undefined` evaluated
        // as `(KEY != PRIVATE) == undefined` (always false). Result: the
        // inheritance walk never found any inherited key under UML and the
        // warning always fired. Fixed by switching to `&&`.
        const ds = await diagnose(`
            erdiagram M
            notation = uml
            entity A { id: INT key }
            entity B extends A { name: VARCHAR }
        `);
        expect(findDiagnostic(ds, WARNING, /[Mm]issing primary key/)).toBeFalsy();
    });

    it('warns under UML when the only inherited key is private', async () => {
        // Private members are not visible to subclasses in UML, so a private
        // parent key does not satisfy the child's "needs a key" requirement.
        const ds = await diagnose(`
            erdiagram M
            notation = uml
            entity A { -id: INT key }
            entity B extends A { name: VARCHAR }
        `);
        expect(findDiagnostic(ds, WARNING, /[Mm]issing primary key/)).toBeTruthy();
    });
});
