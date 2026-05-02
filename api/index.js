import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// ESM mein __dirname nahi hota, ye karo:
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Root folder ki .env load karo explicitly
dotenv.config({ path: path.resolve(__dirname, "../.env") });

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