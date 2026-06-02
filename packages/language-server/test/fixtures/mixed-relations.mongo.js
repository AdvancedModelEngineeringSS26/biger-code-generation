await db.createCollection("Library", {
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
        }
      }
    }
  },
  validationLevel: "strict",
  validationAction: "error"
});

await db.createCollection("Page", {
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

await db.createCollection("Owns", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["libId", "isbn"],
      properties: {
        libId: {
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

await db.getCollection("Owns").createIndex({
  libId: 1,
  isbn: 1
}, {
  name: "Owns_libId_isbn_unique",
  unique: true
});

await db.createCollection("HasPage", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["isbn", "pageNumber"],
      properties: {
        isbn: {
          bsonType: "string"
        },
        pageNumber: {
          bsonType: "int"
        }
      }
    }
  },
  validationLevel: "strict",
  validationAction: "error"
});

await db.getCollection("HasPage").createIndex({
  isbn: 1,
  pageNumber: 1
}, {
  name: "HasPage_isbn_pageNumber_unique",
  unique: true
});

await db.createCollection("Stocks", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["libId", "pageNumber"],
      properties: {
        libId: {
          bsonType: "int"
        },
        pageNumber: {
          bsonType: "int"
        }
      }
    }
  },
  validationLevel: "strict",
  validationAction: "error"
});

await db.getCollection("Stocks").createIndex({
  libId: 1,
  pageNumber: 1
}, {
  name: "Stocks_libId_pageNumber_unique",
  unique: true
});
