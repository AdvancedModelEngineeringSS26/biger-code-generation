CREATE TABLE Doctor(
    docId INT,
    PRIMARY KEY (docId)
);
CREATE TABLE Patient(
    patId INT,
    PRIMARY KEY (patId)
);
CREATE TABLE Hospital(
    hospId INT,
    PRIMARY KEY (hospId)
);
CREATE TABLE Treats(
    docId INT,
    patId INT,
    hospId INT,
    PRIMARY KEY (docId, patId, hospId),
    FOREIGN KEY (docId) REFERENCES Doctor(docId),
    FOREIGN KEY (patId) REFERENCES Patient(patId),
    FOREIGN KEY (hospId) REFERENCES Hospital(hospId)
);
