await db.createCollection("Doctor", {
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

await db.createCollection("Patient", {
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

await db.createCollection("Hospital", {
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

await db.createCollection("Treats", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["docId", "patId", "hospId"],
      properties: {
        docId: {
          bsonType: "int"
        },
        patId: {
          bsonType: "int"
        },
        hospId: {
          bsonType: "int"
        }
      }
    }
  },
  validationLevel: "strict",
  validationAction: "error"
});

await db.getCollection("Treats").createIndex({
  docId: 1,
  patId: 1,
  hospId: 1
}, {
  name: "Treats_docId_patId_hospId_unique",
  unique: true
});
