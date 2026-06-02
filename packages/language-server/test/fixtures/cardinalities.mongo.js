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
      required: ["_id"],
      properties: {
        _id: {
          bsonType: "string"
        },
        Author_authId: {
          bsonType: "int"
        }
      }
    }
  },
  validationLevel: "strict",
  validationAction: "error"
});

await db.getCollection("Book").createIndex({
  Author_authId: 1
}, {
  name: "Book_Author_authId_idx"
});

await db.createCollection("Tag", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["_id"],
      properties: {
        _id: {
          bsonType: "string"
        }
      }
    }
  },
  validationLevel: "strict",
  validationAction: "error"
});

await db.createCollection("Tagged", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["isbn", "tagName"],
      properties: {
        isbn: {
          bsonType: "string"
        },
        tagName: {
          bsonType: "string"
        }
      }
    }
  },
  validationLevel: "strict",
  validationAction: "error"
});

await db.getCollection("Tagged").createIndex({
  isbn: 1,
  tagName: 1
}, {
  name: "Tagged_isbn_tagName_unique",
  unique: true
});
