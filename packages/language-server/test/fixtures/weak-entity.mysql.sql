CREATE TABLE Invoice(
    invoiceId INT,
    PRIMARY KEY (invoiceId)
);
CREATE TABLE InvoiceLine(
    invoiceId INT,
    lineNumber INT,
    description VARCHAR(200) NOT NULL,
    PRIMARY KEY (invoiceId, lineNumber),
    FOREIGN KEY (invoiceId) REFERENCES Invoice(invoiceId) ON DELETE CASCADE
);
