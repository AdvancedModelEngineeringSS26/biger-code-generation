await db.createCollection("Author", {
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

await db.createCollection("Book", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["_id", "title"],
      properties: {
        _id: {
          bsonType: "string"
        },
        title: {
          bsonType: "string"
        }
      }
    }
  },
  validationLevel: "strict",
  validationAction: "error"
});

await db.createCollection("Chapter", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["_id", "heading"],
      properties: {
        _id: {
          bsonType: "int"
        },
        heading: {
          bsonType: "string"
        }
      }
    }
  },
  validationLevel: "strict",
  validationAction: "error"
});

await db.createCollection("Wrote", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["id", "isbn"],
      properties: {
        id: {
          bsonType: "int"
        },
        isbn: {
          bsonType: "string"
        }
      }
    }
  },
  validationLevel: "strict",
  validationAction: "error"
});

await db.getCollection("Wrote").createIndex({
  id: 1,
  isbn: 1
}, {
  name: "Wrote_id_isbn_unique",
  unique: true
});

await db.createCollection("Contains", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["isbn", "chapterNumber"],
      properties: {
        isbn: {
          bsonType: "string"
        },
        chapterNumber: {
          bsonType: "int"
        }
      }
    }
  },
  validationLevel: "strict",
  validationAction: "error"
});

await db.getCollection("Contains").createIndex({
  isbn: 1,
  chapterNumber: 1
}, {
  name: "Contains_isbn_chapterNumber_unique",
  unique: true
});
