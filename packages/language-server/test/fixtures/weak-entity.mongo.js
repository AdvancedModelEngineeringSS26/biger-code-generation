await db.createCollection("Invoice", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["_id"],
      properties: {
        _id: {
          bsonType: "int"
        },
        InvoiceLine: {
          bsonType: "array",
          items: {
            bsonType: "object",
            required: ["lineNumber", "description"],
            properties: {
              lineNumber: {
                bsonType: "int"
              },
              description: {
                bsonType: "string"
              }
            }
          }
        }
      }
    }
  },
  validationLevel: "strict",
  validationAction: "error"
});
