// index.js
import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import { connectDB } from "./lib/db.js";

// Routes import
import signupHandler        from "./api/signup.js";
import loginHandler         from "./api/login.js";
import forgotHandler        from "./api/forgot-password.js";
import chatHandler          from "./api/chat.js";
import groupsHandler        from "./api/groups.js";
import usersHandler         from "./api/users.js";
import communicationHandler from "./api/communication.js";  // ✅ calllogs + schedule
import favouritesHandler    from "./api/favourites.js";

const app = express();

app.use(cors());
app.use(express.json());

// DB Connect
connectDB()
  .then(() => console.log("MongoDB connected! ✅"))
  .catch(err => console.log("DB Error:", err));

// ── Auth Routes ───────────────────────────────────────────
app.all("/api/signup",          signupHandler);
app.all("/api/login",           loginHandler);
app.all("/api/forgot-password", forgotHandler);

// ── Chat Routes ───────────────────────────────────────────
app.all("/api/chat",            chatHandler);
app.all("/api/chat/typing",     chatHandler);

// ── Users ─────────────────────────────────────────────────
app.all("/api/users",           usersHandler);

// ── Groups ────────────────────────────────────────────────
app.all("/api/groups",          groupsHandler);
app.all("/api/groups/create",   groupsHandler);
app.all("/api/groups/message",  groupsHandler);
app.all("/api/groups/messages", groupsHandler);
app.all("/api/groups/update",   groupsHandler);
app.all("/api/groups/poll",     groupsHandler);
app.all("/api/groups/vote",     groupsHandler);

// ── Communication (CallLogs + Schedule) ───────────────────
app.all("/api/communication/calllogs",  communicationHandler);  // ✅
app.all("/api/communication/create",    communicationHandler);  // ✅
app.all("/api/communication/schedule",  communicationHandler);  // ✅
app.all("/api/communication/delete",    communicationHandler);  // ✅

// ── Favourites ────────────────────────────────────────────
app.all("/api/favourites",        favouritesHandler);
app.all("/api/favourites/add",    favouritesHandler);
app.all("/api/favourites/remove", favouritesHandler);

// ── Test ──────────────────────────────────────────────────
app.get("/", (req, res) => {
  res.json({ message: "Server chal raha hai! ✅" });
});

export default app;