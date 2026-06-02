await db.createCollection("Booking", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["flightId", "seatNumber", "passengerName"],
      properties: {
        flightId: {
          bsonType: "int"
        },
        seatNumber: {
          bsonType: "string"
        },
        passengerName: {
          bsonType: "string"
        }
      }
    }
  },
  validationLevel: "strict",
  validationAction: "error"
});

await db.getCollection("Booking").createIndex({
  flightId: 1,
  seatNumber: 1
}, {
  name: "Booking_flightId_seatNumber_unique",
  unique: true
});
