import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import { connectDB } from "./lib/db.js";

// Routes import
import signupHandler      from "./api/signup.js";
import loginHandler       from "./api/login.js";
import forgotHandler      from "./api/forgot-password.js";
import chatHandler        from "./api/chat.js";
import groupsHandler      from "./api/groups.js";
import usersHandler       from "./api/users.js";

const app = express();

app.use(cors());
app.use(express.json());

// DB Connect
connectDB()
  .then(() => console.log("MongoDB connected! ✅"))
  .catch(err => console.log("DB Error:", err));

// Routes
app.all("/api/signup",          signupHandler);
app.all("/api/login",           loginHandler);
app.all("/api/forgot-password", forgotHandler);
app.all("/api/chat",            chatHandler);
app.all("/api/groups",          groupsHandler);
app.all("/api/users",           usersHandler);

// Test route
app.get("/", (req, res) => {
  res.json({ message: "Server chal raha hai! ✅" });
});

export default app;