await db.createCollection("A", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["_id", "name", "birthday"],
      properties: {
        _id: {
          bsonType: "int"
        },
        name: {
          bsonType: "string"
        },
        birthday: {
          bsonType: "date"
        }
      }
    }
  },
  validationLevel: "strict",
  validationAction: "error"
});
