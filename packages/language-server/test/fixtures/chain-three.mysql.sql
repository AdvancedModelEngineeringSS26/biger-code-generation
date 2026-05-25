CREATE TABLE Author(
    id INT,
    name VARCHAR(100) NOT NULL,
    PRIMARY KEY (id)
);
CREATE TABLE Book(
    isbn VARCHAR(13),
    title VARCHAR(200) NOT NULL,
    PRIMARY KEY (isbn)
);
CREATE TABLE Chapter(
    chapterNumber INT,
    heading VARCHAR(200) NOT NULL,
    PRIMARY KEY (chapterNumber)
);
CREATE TABLE Wrote(
    id INT,
    isbn VARCHAR(13),
    PRIMARY KEY (id, isbn),
    FOREIGN KEY (id) REFERENCES Author(id),
    FOREIGN KEY (isbn) REFERENCES Book(isbn)
);
CREATE TABLE Contains(
    isbn VARCHAR(13),
    chapterNumber INT,
    PRIMARY KEY (isbn, chapterNumber),
    FOREIGN KEY (isbn) REFERENCES Book(isbn),
    FOREIGN KEY (chapterNumber) REFERENCES Chapter(chapterNumber)
);
