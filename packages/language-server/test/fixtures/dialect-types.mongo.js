await db.createCollection("A", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["_id", "score", "photo", "bio", "is_active"],
      properties: {
        _id: {
          bsonType: "int"
        },
        score: {
          bsonType: "double"
        },
        photo: {
          bsonType: "binData"
        },
        bio: {
          bsonType: "string"
        },
        is_active: {
          bsonType: "bool"
        }
      }
    }
  },
  validationLevel: "strict",
  validationAction: "error"
});
