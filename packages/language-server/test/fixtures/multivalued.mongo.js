await db.createCollection("Person", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["_id", "name", "phoneNumber"],
      properties: {
        _id: {
          bsonType: "int"
        },
        name: {
          bsonType: "string"
        },
        phoneNumber: {
          bsonType: "array",
          items: {
            bsonType: "string"
          }
        }
      }
    }
  },
  validationLevel: "strict",
  validationAction: "error"
});
