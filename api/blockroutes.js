import { connectDB } from "../lib/db.js";
import mongoose from "mongoose";
import { RtcTokenBuilder, RtcRole } from "agora-token"; // ✅ Yahan add karo

const blockSchema = new mongoose.Schema({
  blockerID: { type: String, required: true },
  blockedID: { type: String, required: true },
  blockedAt: { type: Date,   default: Date.now },
});
blockSchema.index({ blockerID: 1, blockedID: 1 }, { unique: true });
const Block = mongoose.models.Block || mongoose.model("Block", blockSchema);

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin",  "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");

  if (req.method === "OPTIONS") return res.status(200).end();

  await connectDB();

  const fullUrl = req.url.split("?")[0].replace(/\/$/, "");
  const path    = fullUrl.split("/").filter(Boolean).pop();

  // AGORA TOKEN
 if (req.method === "POST" && path === "agora-token") {
  const { channelName, uid } = req.body;
  if (!channelName || uid === undefined)
    return res.status(400).json({ message: "channelName aur uid chahiye" });

  try {
    const appID   = process.env.AGORA_APP_ID;
    const appCert = process.env.AGORA_APP_CERTIFICATE;
    const expire  = Math.floor(Date.now() / 1000) + 86400;

    // Seedha require karo
    import { RtcTokenBuilder, RtcRole } from "agora-token";

    const token = RtcTokenBuilder.buildTokenWithUid(
      appID, appCert, channelName, Number(uid),
      RtcRole.PUBLISHER, expire, expire
    );

    return res.status(200).json({ token, appID });
  } catch (e) {
    return res.status(500).json({ message: "Token error", error: e.message });
  }
}

  // BLOCK
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

  // UNBLOCK
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

  // BLOCKLIST
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

  // BLOCKCHECK
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