CREATE TABLE Person(
    id INT,
    name VARCHAR(100) NOT NULL,
    PRIMARY KEY (id)
);
CREATE TABLE Employee(
    id INT,
    salary DECIMAL(10, 2) NOT NULL,
    PRIMARY KEY (id),
    FOREIGN KEY (id) REFERENCES Person(id)
);
