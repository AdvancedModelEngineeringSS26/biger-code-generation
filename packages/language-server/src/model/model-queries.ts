import type { CardinalityType, Entity, Model } from '../generated/ast.js';

export function findWeakOwner(weakEntity: Entity, model: Model): Entity | undefined {
    for (const rel of model.relationships) {
        if (!rel.weak) continue;
        const participants: Entity[] = [];
        const src = rel.source.entity.ref;
        if (src) participants.push(src);
        for (const t of rel.targets) {
            const e = t.relationEntity.entity.ref;
            if (e) participants.push(e);
        }
        if (!participants.includes(weakEntity)) continue;
        const owner = participants.find((e) => e !== weakEntity && !e.weak);
        if (owner) return owner;
    }
    return undefined;
}

export function isAtMostOne(card: CardinalityType | undefined): boolean {
    return !!(card?.ONE || card?.ZERO_OR_ONE);
}

/** Direct subclasses of `entity` (those that `extends entity`). */
export function childrenOf(entity: Entity, model: Model): Entity[] {
    return model.entities.filter((e) => e.extends?.ref === entity);
}

/** True when `entity` is extended by at least one other entity. */
export function hasChildren(entity: Entity, model: Model): boolean {
    return model.entities.some((e) => e.extends?.ref === entity);
}

/** The top-most ancestor of `entity` (itself if it has no parent). */
export function rootOf(entity: Entity): Entity {
    let current = entity;
    while (current.extends?.ref) current = current.extends.ref;
    return current;
}

/** All ancestors of `entity`, nearest parent first up to the root. */
export function ancestorsOf(entity: Entity): Entity[] {
    const out: Entity[] = [];
    let current = entity.extends?.ref;
    while (current) {
        out.push(current);
        current = current.extends?.ref;
    }
    return out;
}

/** All transitive subclasses of `entity`, breadth-first in declaration order. */
export function descendantsOf(entity: Entity, model: Model): Entity[] {
    const out: Entity[] = [];
    const queue = [...childrenOf(entity, model)];
    while (queue.length > 0) {
        const next = queue.shift()!;
        out.push(next);
        queue.push(...childrenOf(next, model));
    }
    return out;
}
