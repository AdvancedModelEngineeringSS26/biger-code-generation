import { SQL_DIALECTS, type SqlDialect } from '@biger/common';
import fc from 'fast-check';
import { NodeFileSystem } from 'langium/node';
import { parseHelper } from 'langium/test';
import { describe, it } from 'vitest';
import { createEntityRelationshipServices } from '../../src/entity-relationship-module.js';
import type { Model } from '../../src/generated/ast.js';
import { DdlEmitter } from '../../src/export/sql/ddl-emitter.js';
import { DIALECTS } from '../../src/export/sql/dialects.js';
import { createDefaultExportService } from '../../src/export/export-service.js';

// ──────────────────────────────────────────────────────────────────────────────
// Fast-check arbitraries — produce syntactically valid `.er` text.
// ──────────────────────────────────────────────────────────────────────────────
//
// Two deliberate constraints:
//   - Identifier filters exclude grammar keywords (entity/relationship/key/…)
//     so generated input never collides with reserved tokens.
//   - Each entity is forced to declare at least one non-derived `key` attr.
//     Without that the exporter emits an empty PRIMARY KEY () which is not
//     a property-test concern (we have a fixture for that).

const GRAMMAR_RESERVED = new Set([
    'erdiagram', 'entity', 'relationship', 'extends', 'weak', 'notation',
    'key', 'partial_key', 'optional', 'derived', 'multivalued', 'none',
    'public', 'private', 'protected', 'package',
    'default', 'chen', 'bachman', 'crowfoot', 'uml',
    // Single-letter cardinality keyword (CardinalityType.MANY = 'N') — would
    // otherwise collide with one-letter entity names like `N`.
    'N',
]);

const idLower = fc.stringMatching(/^[a-z][a-z0-9]{0,5}$/).filter((s) => !GRAMMAR_RESERVED.has(s));
const idUpper = fc.stringMatching(/^[A-Z][a-zA-Z0-9]{0,5}$/).filter((s) => !GRAMMAR_RESERVED.has(s));

interface GenAttribute {
    name: string;
    datatype: { type: string; size?: number };
    modifier?: 'key' | 'derived';
}

// `size: 1` is excluded because the bigER grammar reserves `'1'` as a
// cardinality keyword (CardinalityType.ONE), so `VARCHAR(1)` fails to lex —
// `1` becomes the cardinality token instead of an INT terminal. That's a
// real grammar issue worth fixing, but it isn't a property-test concern;
// here we just want valid `.er` to drive the idempotence checks.
const arbDatatype: fc.Arbitrary<GenAttribute['datatype']> = fc.oneof(
    fc.constant({ type: 'INT' }),
    fc.constant({ type: 'BOOLEAN' }),
    fc.constant({ type: 'DOUBLE' }),
    fc.record({ type: fc.constant('VARCHAR'), size: fc.integer({ min: 2, max: 255 }) }),
);

const arbAttribute: fc.Arbitrary<GenAttribute> = fc.record({
    name: idLower,
    datatype: arbDatatype,
    // Bias the modifier so most attributes carry one — improves filter rate
    // for the "entity must have a key" constraint below.
    modifier: fc.oneof(
        { weight: 1, arbitrary: fc.constant(undefined) },
        { weight: 2, arbitrary: fc.constant('key' as const) },
        { weight: 1, arbitrary: fc.constant('derived' as const) },
    ),
});

interface GenEntity {
    name: string;
    attributes: GenAttribute[];
}

const arbEntity: fc.Arbitrary<GenEntity> = fc.record({
    name: idUpper,
    attributes: fc.uniqueArray(arbAttribute, { selector: (a) => a.name, minLength: 1, maxLength: 5 }),
}).filter((e) => e.attributes.some((a) => a.modifier === 'key'));

const arbModel = fc.uniqueArray(arbEntity, { selector: (e) => e.name, minLength: 1, maxLength: 3 });

function buildEr(entities: GenEntity[]): string {
    let s = 'erdiagram TestModel\n\n';
    for (const e of entities) {
        s += `entity ${e.name} {\n`;
        for (const a of e.attributes) {
            const sizeStr = a.datatype.size != null ? `(${a.datatype.size})` : '';
            const modifierStr = a.modifier ? ` ${a.modifier}` : '';
            s += `    ${a.name}: ${a.datatype.type}${sizeStr}${modifierStr}\n`;
        }
        s += '}\n\n';
    }
    return s;
}

// ──────────────────────────────────────────────────────────────────────────────
// Service / parser setup — shared across all property runs.
// ──────────────────────────────────────────────────────────────────────────────

const { EntityRelationship } = createEntityRelationshipServices({ ...NodeFileSystem });
const exportService = createDefaultExportService(EntityRelationship);
const parse = parseHelper<Model>(EntityRelationship);

// ──────────────────────────────────────────────────────────────────────────────
// Property suite
// ──────────────────────────────────────────────────────────────────────────────

const NUM_RUNS = 50;

describe('SqlExporter > 6. property-based', () => {
    for (const dialect of SQL_DIALECTS) {
        describe(dialect, () => {
            // Property 1 — Idempotence at the *full pipeline* level:
            //
            //   exportService.exportModel(x) === exportService.exportModel(x)
            //
            // Catches any nondeterminism that creeps in from parsing through
            // emission: Map iteration order, Date-based state, identifier
            // counter leaks across calls, etc.
            it(`exportModel is idempotent (${NUM_RUNS} random models)`, async () => {
                await fc.assert(
                    fc.asyncProperty(arbModel, async (entities: GenEntity[]) => {
                        const er = buildEr(entities);
                        const sourceUri = `file:///property/${dialect}.er`;
                        const out1 = await exportService.exportModel({
                            sourceUri,
                            erContent: er,
                            target: 'sql',
                            targetOptions: { dialect },
                        });
                        const out2 = await exportService.exportModel({
                            sourceUri,
                            erContent: er,
                            target: 'sql',
                            targetOptions: { dialect },
                        });
                        return out1.content === out2.content;
                    }),
                    { numRuns: NUM_RUNS },
                );
            });

            // Property 2 — Re-emit stability at the *emitter* level:
            //
            //   parse once → emit(model) === emit(model)
            //
            // Differentiates from property 1: if 1 fails but 2 passes, the
            // nondeterminism is in parse; if 2 fails the emitter itself is
            // mutating shared state. Use direct DdlEmitter to skip the parse.
            it(`emitter is stable on a single parsed model (${NUM_RUNS} random models)`, async () => {
                const emitter = new DdlEmitter(DIALECTS[dialect]);
                await fc.assert(
                    fc.asyncProperty(arbModel, async (entities: GenEntity[]) => {
                        const er = buildEr(entities);
                        const doc = await parse(er, { validation: false });
                        const model = doc.parseResult.value;
                        if (doc.parseResult.parserErrors.length > 0) return true; // skip ill-formed inputs
                        const a = emitter.emit(model);
                        const b = emitter.emit(model);
                        return a === b;
                    }),
                    { numRuns: NUM_RUNS },
                );
            });
        });
    }
});

