await db.createCollection("Product", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["_id", "price", "weight"],
      properties: {
        _id: {
          bsonType: "string"
        },
        price: {
          bsonType: "decimal"
        },
        weight: {
          bsonType: "decimal"
        }
      }
    }
  },
  validationLevel: "strict",
  validationAction: "error"
});
