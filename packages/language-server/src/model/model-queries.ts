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
