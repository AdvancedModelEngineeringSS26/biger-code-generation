await db.createCollection("Person", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["_id", "name"],
      properties: {
        _id: {
          bsonType: "int"
        },
        name: {
          bsonType: "string"
        }
      }
    }
  },
  validationLevel: "strict",
  validationAction: "error"
});

await db.createCollection("Employee", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["_id", "salary"],
      properties: {
        _id: {
          bsonType: "int"
        },
        salary: {
          bsonType: "decimal"
        }
      }
    }
  },
  validationLevel: "strict",
  validationAction: "error"
});
