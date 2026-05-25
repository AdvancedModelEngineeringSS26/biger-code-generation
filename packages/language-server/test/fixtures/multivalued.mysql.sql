CREATE TABLE Person(
    id INT,
    name VARCHAR(100) NOT NULL,
    PRIMARY KEY (id)
);
CREATE TABLE Person_phoneNumber(
    id INT,
    phoneNumber VARCHAR(20),
    PRIMARY KEY (id, phoneNumber),
    FOREIGN KEY (id) REFERENCES Person(id) ON DELETE CASCADE
);
