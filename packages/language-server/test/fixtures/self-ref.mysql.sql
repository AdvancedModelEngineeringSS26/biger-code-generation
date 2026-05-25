CREATE TABLE Employee(
    id INT,
    name VARCHAR(100) NOT NULL,
    PRIMARY KEY (id)
);
CREATE TABLE Manages(
    manager_id INT,
    reports_id INT,
    PRIMARY KEY (manager_id, reports_id),
    UNIQUE (reports_id),
    FOREIGN KEY (manager_id) REFERENCES Employee(id),
    FOREIGN KEY (reports_id) REFERENCES Employee(id)
);
