CREATE TABLE Library(
    libId INT,
    name VARCHAR(100) NOT NULL,
    PRIMARY KEY (libId)
);
CREATE TABLE Book(
    isbn VARCHAR(13),
    PRIMARY KEY (isbn)
);
CREATE TABLE Page(
    pageNumber INT,
    PRIMARY KEY (pageNumber)
);
CREATE TABLE Owns(
    libId INT,
    isbn VARCHAR(13),
    PRIMARY KEY (libId, isbn),
    FOREIGN KEY (libId) REFERENCES Library(libId),
    FOREIGN KEY (isbn) REFERENCES Book(isbn)
);
CREATE TABLE HasPage(
    isbn VARCHAR(13),
    pageNumber INT,
    PRIMARY KEY (isbn, pageNumber),
    FOREIGN KEY (isbn) REFERENCES Book(isbn),
    FOREIGN KEY (pageNumber) REFERENCES Page(pageNumber)
);
CREATE TABLE Stocks(
    libId INT,
    pageNumber INT,
    PRIMARY KEY (libId, pageNumber),
    FOREIGN KEY (libId) REFERENCES Library(libId) ON DELETE CASCADE,
    FOREIGN KEY (pageNumber) REFERENCES Page(pageNumber)
);
