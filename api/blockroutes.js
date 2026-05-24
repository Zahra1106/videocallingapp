import { connectDB } from "../lib/db.js";
import mongoose from "mongoose";
import crypto from "crypto";

const blockSchema = new mongoose.Schema({
  blockerID: { type: String, required: true },
  blockedID: { type: String, required: true },
  blockedAt: { type: Date,   default: Date.now },
});
blockSchema.index({ blockerID: 1, blockedID: 1 }, { unique: true });
const Block = mongoose.models.Block || mongoose.model("Block", blockSchema);

// ── Agora Token Builder (no package needed) ──────────────────
function buildAgoraToken(appId, appCert, channelName, uid, expireTime) {
  const version = "006";
  const expireHex = expireTime.toString(16).padStart(8, "0");
  const uidHex    = uid.toString(16).padStart(8, "0");
  const channelHex = Buffer.from(channelName).toString("hex");
  const msg = appId + uidHex + channelName + expireTime.toString();
  const signature = crypto.createHmac("sha256", appCert).update(msg).digest("hex");
  const raw = `${appId}${expireHex}${uidHex}${channelHex}${signature}`;
  return version + Buffer.from(raw).toString("base64");
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin",  "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");

  if (req.method === "OPTIONS") return res.status(200).end();

  await connectDB();

  const fullUrl = req.url.split("?")[0].replace(/\/$/, "");
  const path    = fullUrl.split("/").filter(Boolean).pop();

  // ── AGORA TOKEN ──────────────────────────────────────────────
  if (req.method === "POST" && path === "agora-token") {
    const { channelName, uid } = req.body;
    if (!channelName || uid === undefined)
      return res.status(400).json({ message: "channelName aur uid chahiye" });

    try {
      const appID   = process.env.AGORA_APP_ID;
      const appCert = process.env.AGORA_APP_CERTIFICATE;
      const expire  = Math.floor(Date.now() / 1000) + 86400;

      if (!appID) {
        return res.status(500).json({ message: "AGORA_APP_ID env variable nahi mila" });
      }

      // Certificate nahi hai to blank token (Agora testing mode)
      if (!appCert) {
        return res.status(200).json({ token: "", appID });
      }

      const token = buildAgoraToken(appID, appCert, channelName, Number(uid), expire);
      return res.status(200).json({ token, appID });
    } catch (e) {
      return res.status(500).json({ message: "Token error", error: e.message });
    }
  }

  // ── BLOCK ────────────────────────────────────────────────────
  if (req.method === "POST" && path === "block") {
    const { blockerID, blockedID } = req.body;
    if (!blockerID || !blockedID)
      return res.status(400).json({ error: "IDs required" });
    try {
      const exists = await Block.findOne({ blockerID, blockedID });
      if (exists) return res.json({ message: "Already blocked" });
      await Block.create({ blockerID, blockedID });
      return res.json({ message: "Blocked successfully ✅" });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ── UNBLOCK ──────────────────────────────────────────────────
  if (req.method === "DELETE" && path === "block") {
    const { blockerID, blockedID } = req.body;
    if (!blockerID || !blockedID)
      return res.status(400).json({ error: "IDs required" });
    try {
      await Block.deleteOne({ blockerID, blockedID });
      return res.json({ message: "Unblocked successfully ✅" });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ── BLOCKLIST ────────────────────────────────────────────────
  if (req.method === "GET" && path === "blocklist") {
    const { myID } = req.query;
    if (!myID) return res.status(400).json({ error: "myID chahiye" });
    try {
      const blocks = await Block.find({ blockerID: myID });
      return res.json({ blockedUsers: blocks.map(b => b.blockedID) });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ── BLOCKCHECK ───────────────────────────────────────────────
  if (req.method === "GET" && path === "blockcheck") {
    const { blockerID, blockedID } = req.query;
    if (!blockerID || !blockedID)
      return res.status(400).json({ error: "IDs chahiye" });
    try {
      const exists = await Block.findOne({ blockerID, blockedID });
      return res.json({ isBlocked: !!exists });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(404).json({ message: "Route nahi mila", path });
}