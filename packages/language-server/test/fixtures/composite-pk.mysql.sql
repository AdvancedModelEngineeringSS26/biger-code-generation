CREATE TABLE Booking(
    flightId INT,
    seatNumber VARCHAR(4),
    passengerName VARCHAR(100) NOT NULL,
    PRIMARY KEY (flightId, seatNumber)
);
