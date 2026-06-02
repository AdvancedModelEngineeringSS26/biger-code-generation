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

await db.createCollection("B", {
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

await db.createCollection("Rel", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["id1", "id2", "attr"],
      properties: {
        id1: {
          bsonType: "int"
        },
        id2: {
          bsonType: "int"
        },
        attr: {
          bsonType: "string"
        }
      }
    }
  },
  validationLevel: "strict",
  validationAction: "error"
});

await db.getCollection("Rel").createIndex({
  id1: 1,
  id2: 1
}, {
  name: "Rel_id1_id2_unique",
  unique: true
});
