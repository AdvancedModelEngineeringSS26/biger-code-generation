CREATE TABLE A(
    id1 int,
    PRIMARY KEY (id1)
);
CREATE TABLE B(
    id2 int,
    PRIMARY KEY (id2)
);
CREATE TABLE Rel(
    id1 int,
    id2 int,
    attr VARCHAR(255) NOT NULL,
    PRIMARY KEY (id1, id2),
    FOREIGN KEY (id1) REFERENCES A(id1),
    FOREIGN KEY (id2) REFERENCES B(id2)
);
