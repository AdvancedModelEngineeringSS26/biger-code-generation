CREATE TABLE A(
    id1 int,
    PRIMARY KEY (id1)
);
CREATE TABLE B(
    id2 int,
    PRIMARY KEY (id2)
);
CREATE TABLE Rel(
    id1 int references A(id1),
    id2 int references B(id2),
    attr string,
    PRIMARY KEY (id1, id2)
);
