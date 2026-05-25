CREATE TABLE Library(
    libId INT,
    name VARCHAR(100) NOT NULL,
    PRIMARY KEY (libId)
);
CREATE TABLE Book(
    isbn VARCHAR(13),
    PRIMARY KEY (isbn)
);
CREATE TABLE Member(
    memberId INT,
    PRIMARY KEY (memberId)
);
CREATE TABLE Owns(
    libId INT,
    isbn VARCHAR(13),
    PRIMARY KEY (libId, isbn),
    FOREIGN KEY (libId) REFERENCES Library(libId),
    FOREIGN KEY (isbn) REFERENCES Book(isbn)
);
CREATE TABLE HasMember(
    libId INT,
    memberId INT,
    PRIMARY KEY (libId, memberId),
    FOREIGN KEY (libId) REFERENCES Library(libId),
    FOREIGN KEY (memberId) REFERENCES Member(memberId)
);
