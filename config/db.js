const { MongoClient } = require("mongodb");

const client = new MongoClient("mongodb://127.0.0.1:27017");

let db;

const connectDB = async () => {
  try {
    await client.connect();
    db = client.db("filtering-system");
    console.log("MongoDB connected");
    return db;
  } catch (error) {
    console.error("MongoDB connection failed:", error.message);
    process.exit(1);
  }
};

const getDB = () => db;

module.exports = {
  connectDB,
  getDB,
};
