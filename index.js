import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import { connectDB } from "./lib/db.js";

const app = express();

app.use(cors());
app.use(express.json());

connectDB()
  .then(() => console.log("MongoDB connected! ✅"))
  .catch(err => console.log("DB Error:", err));

app.get("/", (req, res) => {
  res.json({ message: "Server chal raha hai! ✅" });
});

export default app;