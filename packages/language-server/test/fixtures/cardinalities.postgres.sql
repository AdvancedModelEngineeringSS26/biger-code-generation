CREATE TABLE Author(
    authId INT,
    name VARCHAR(100) NOT NULL,
    PRIMARY KEY (authId)
);
CREATE TABLE Book(
    isbn VARCHAR(13),
    PRIMARY KEY (isbn)
);
CREATE TABLE Tag(
    tagName VARCHAR(50),
    PRIMARY KEY (tagName)
);
CREATE TABLE Wrote(
    authId INT,
    isbn VARCHAR(13),
    PRIMARY KEY (authId, isbn),
    UNIQUE (isbn),
    FOREIGN KEY (authId) REFERENCES Author(authId),
    FOREIGN KEY (isbn) REFERENCES Book(isbn)
);
CREATE TABLE Tagged(
    isbn VARCHAR(13),
    tagName VARCHAR(50),
    PRIMARY KEY (isbn, tagName),
    FOREIGN KEY (isbn) REFERENCES Book(isbn),
    FOREIGN KEY (tagName) REFERENCES Tag(tagName)
);
