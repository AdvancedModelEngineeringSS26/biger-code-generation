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

await db.createCollection("Member", {
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

await db.createCollection("HasMember", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["libId", "memberId"],
      properties: {
        libId: {
          bsonType: "int"
        },
        memberId: {
          bsonType: "int"
        }
      }
    }
  },
  validationLevel: "strict",
  validationAction: "error"
});

await db.getCollection("HasMember").createIndex({
  libId: 1,
  memberId: 1
}, {
  name: "HasMember_libId_memberId_unique",
  unique: true
});
