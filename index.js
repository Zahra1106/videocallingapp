// index.js
import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import { connectDB } from "./lib/db.js";
// ── Status import ─────────────────────────────────────────────
import statusHandler from "./api/status.js";  // ← add karo upar imports mein
import blockRoutesHandler from "./api/blockroutes.js";




// ── Routes import ─────────────────────────────────────────────
import signupHandler        from "./api/signup.js";
import loginHandler         from "./api/login.js";
import forgotHandler        from "./api/forgot-password.js";
import chatHandler          from "./api/chat.js";
import groupsHandler        from "./api/groups.js";
import usersHandler         from "./api/users.js";
import communicationHandler from "./api/communication.js";
import favouritesHandler    from "./api/favourites.js";

const app = express();
app.use(cors());
app.use(express.json());

// ── DB Connect ────────────────────────────────────────────────
connectDB()
  .then(() => console.log("MongoDB connected! ✅"))
  .catch(err => console.log("DB Error:", err));

// ── Auth ──────────────────────────────────────────────────────
app.all("/api/signup",          signupHandler);
app.all("/api/login",           loginHandler);
app.all("/api/forgot-password", forgotHandler);

// ── Users ─────────────────────────────────────────────────────
app.all("/api/users",           usersHandler);

// ── Chat ──────────────────────────────────────────────────────
app.all("/api/chat",            chatHandler);
app.all("/api/chat/typing",     chatHandler);
app.all("/api/chat/read",       chatHandler);   // ✅ naya: read receipts

// ── Groups ────────────────────────────────────────────────────
app.all("/api/groups",          groupsHandler);
app.all("/api/groups/create",   groupsHandler);
app.all("/api/groups/message",  groupsHandler);
app.all("/api/groups/messages", groupsHandler);
app.all("/api/groups/update",   groupsHandler);
app.all("/api/groups/poll",     groupsHandler);
app.all("/api/groups/vote",     groupsHandler);
app.all("/api/groups/document", groupsHandler);
// ✅ Yeh add karo
app.all("/api/groups/invite",   groupsHandler);
app.all("/api/groups/join",     groupsHandler);
app.all("/api/groups/pin",      groupsHandler);
app.all("/api/groups/pinned",   groupsHandler);
app.all("/api/groups/info",     groupsHandler);
// ── Communication (CallLogs + Schedule) ───────────────────────
// ── Communication (CallLogs + Schedule) ───────────────────────
app.all("/api/calllogs",               communicationHandler); // ← ADD KARO
app.all("/api/communication/calllogs",  communicationHandler);
app.all("/api/communication/create",    communicationHandler); // schedule banao
app.all("/api/communication/schedule",  communicationHandler); // schedule fetch + PATCH update
app.all("/api/communication/delete",    communicationHandler); // schedule delete
app.all("/api/communication/reminders", communicationHandler); // ✅ naya: upcoming reminders
app.all("/api/communication/notified",  communicationHandler); // ✅ naya: notified mark
// ── Companion Mode ────────────────────────────────────────────
app.all("/api/communication/companion-generate", communicationHandler);
app.all("/api/communication/companion-verify",   communicationHandler);
app.all("/api/communication/companion-devices",  communicationHandler);
app.all("/api/communication/companion-unlink",   communicationHandler);
app.all("/api/communication/companion-active",   communicationHandler);
// ── Call Notification (FCM) ───────────────────────────────────
app.all("/api/communication/notify-call", communicationHandler); // ✅ naya

// ── Favourites ────────────────────────────────────────────────
app.all("/api/favourites",        favouritesHandler);
app.all("/api/favourites/add",    favouritesHandler);
app.all("/api/favourites/remove", favouritesHandler);
// ── Status ────────────────────────────────────────────────────
app.all("/api/status",          statusHandler);
app.all("/api/status/reply",    statusHandler);
app.all("/api/status/react",    statusHandler);
app.all("/api/status/view",     statusHandler);
app.all("/api/status/privacy",  statusHandler);
app.all("/api/chat/savemeta",    chatHandler);
// Block + Agora Token
app.all("/api/agora-token", blockRoutesHandler);
app.all("/api/block",       blockRoutesHandler);
app.all("/api/blocklist",   blockRoutesHandler);
app.all("/api/blockcheck",  blockRoutesHandler);

// ── Health check ──────────────────────────────────────────────
app.get("/", (req, res) => {
  res.json({ message: "Server chal raha hai! ✅" });
});

export default app;