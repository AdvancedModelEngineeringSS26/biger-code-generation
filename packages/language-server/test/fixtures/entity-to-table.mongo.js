await db.createCollection("A", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["_id"],
      properties: {
        _id: {
          bsonType: "int"
        }
      }
    }
  },
  validationLevel: "strict",
  validationAction: "error"
});
