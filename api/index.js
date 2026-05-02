import dotenv from "dotenv";
dotenv.config();

import express from "express";
import { connectDB } from "../lib/db.js";

const app = express();
app.use(express.json());

connectDB()
  .then(() => console.log("MongoDB connected! ✅"))
  .catch(err => console.log("DB Error:", err));

app.get("/", (req, res) => {
  res.json({ message: "Server chal raha hai! ✅" });
});

app.listen(3000, () => {
  console.log("Server port 3000 pe chal raha hai!");
});