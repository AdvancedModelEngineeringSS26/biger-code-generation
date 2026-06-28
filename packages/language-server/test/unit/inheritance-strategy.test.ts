import { pathToFileURL } from 'node:url';
import { NodeFileSystem } from 'langium/node';
import { describe, expect, it } from 'vitest';
import type { SqlInheritanceStrategy } from '@biger/common';
import { createEntityRelationshipServices } from '../../src/entity-relationship-module.js';
import { createDefaultExportService } from '../../src/export/export-service.js';

// inheritanceStrategy is an export option (like generateDrop) that doesn't flow
// through the fixture-driven golden pipeline. We test the three JPA-style
// strategies directly. Default ('joined') must reproduce existing behaviour.

const { EntityRelationship } = createEntityRelationshipServices({ ...NodeFileSystem });
const exporter = createDefaultExportService(EntityRelationship);

const HIERARCHY = `
erdiagram H
entity Person {
    id: INT key
    name: VARCHAR(100)
}
entity Employee extends Person {
    salary: DECIMAL(10,2)
}
entity Student extends Person {
    gpa: DOUBLE
}
`;

const WITH_RELATIONSHIP = `
erdiagram R
entity Person {
    id: INT key
    name: VARCHAR(100)
}
entity Employee extends Person {
    salary: DECIMAL(10,2)
}
entity Project {
    pid: INT key
}
relationship WorksOn {
    Employee[N] -> Project[N]
}
`;

async function exportSql(er: string, inheritanceStrategy?: SqlInheritanceStrategy): Promise<string> {
    const result = await exporter.exportModel({
        sourceUri: pathToFileURL('/virtual/model.er').toString(),
        erContent: er,
        target: 'sql',
        targetOptions: inheritanceStrategy ? { dialect: 'postgres', inheritanceStrategy } : { dialect: 'postgres' },
    });
    return result.content;
}

function tableNames(sql: string): string[] {
    return [...sql.matchAll(/^CREATE TABLE (\w+)\(/gm)].map((m) => m[1]);
}

function tableBlock(sql: string, name: string): string {
    const m = sql.match(new RegExp(`CREATE TABLE ${name}\\(([\\s\\S]*?)\\n\\);`));
    return m ? m[1] : '';
}

describe('inheritanceStrategy option', () => {
    it("defaults to 'joined': a table per entity with subclass -> parent FKs", async () => {
        const sql = await exportSql(HIERARCHY);
        expect(tableNames(sql)).toEqual(['Person', 'Employee', 'Student']);
        expect(tableBlock(sql, 'Employee')).toContain('FOREIGN KEY (id) REFERENCES Person(id)');
        expect(tableBlock(sql, 'Student')).toContain('FOREIGN KEY (id) REFERENCES Person(id)');
        // Subclass tables only carry their own columns (normalized).
        expect(tableBlock(sql, 'Employee')).not.toContain('name');
    });

    it("explicit 'joined' equals the default", async () => {
        expect(await exportSql(HIERARCHY, 'joined')).toBe(await exportSql(HIERARCHY));
    });

    it("'tablePerClass': a table only for leaf subclasses, inherited columns flattened in, no FKs", async () => {
        const sql = await exportSql(HIERARCHY, 'tablePerClass');
        expect(tableNames(sql)).toEqual(['Employee', 'Student']); // no Person table
        const employee = tableBlock(sql, 'Employee');
        expect(employee).toContain('id INT');
        expect(employee).toContain('name VARCHAR(100)'); // inherited
        expect(employee).toContain('salary DECIMAL(10, 2)'); // own
        expect(employee).toContain('PRIMARY KEY (id)');
        expect(sql).not.toContain('FOREIGN KEY'); // no parent linkage
        expect(tableBlock(sql, 'Student')).toContain('gpa DOUBLE PRECISION');
    });

    it("'singleTable': one table for the hierarchy with nullable subclass columns", async () => {
        const sql = await exportSql(HIERARCHY, 'singleTable');
        expect(tableNames(sql)).toEqual(['Person']); // children collapsed
        const person = tableBlock(sql, 'Person');
        expect(person).toContain('name VARCHAR(100) NOT NULL'); // root attr keeps its nullability
        expect(person).toContain('salary DECIMAL(10, 2),'); // subclass attr -> nullable (no NOT NULL)
        expect(person).toContain('gpa DOUBLE PRECISION'); // subclass attr present
        expect(person).not.toContain('salary DECIMAL(10, 2) NOT NULL');
        expect(person).toContain('PRIMARY KEY (id)');
    });

    it("'singleTable': a relationship FK to a subclass retargets to the root table", async () => {
        const sql = await exportSql(WITH_RELATIONSHIP, 'singleTable');
        expect(sql).not.toContain('CREATE TABLE Employee(');
        // FK from the bridge table points at the collapsed root (Person), not Employee.
        expect(tableBlock(sql, 'WorksOn')).toContain('FOREIGN KEY (id) REFERENCES Person(id)');
    });

    it("'joined' still links a relationship FK to the subclass table", async () => {
        const sql = await exportSql(WITH_RELATIONSHIP, 'joined');
        expect(sql).toContain('CREATE TABLE Employee(');
        expect(tableBlock(sql, 'WorksOn')).toContain('FOREIGN KEY (id) REFERENCES Employee(id)');
    });
});
