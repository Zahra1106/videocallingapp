import { connectDB } from "../lib/db.js";
import mongoose from "mongoose";

const chatSchema = new mongoose.Schema({
  chatID:          { type: String, required: true },
  sender:          { type: String, required: true },
  message:         { type: String, default: "" },
  voiceUrl:        { type: String, default: "" },
  imageUrl:        { type: String, default: "" },
  time:            { type: Number, default: () => Date.now() },
  isRead:          { type: Boolean, default: false },
  reactions:       { type: Map, of: String, default: {} },

  // ── VIEW ONCE ──────────────────────────────────────────────
  viewOnce:        { type: Boolean, default: false },
  viewedBy:        { type: [String], default: [] },   // jinhonn ne dekha

  // ── DISAPPEAR AFTER (seconds) — 0 = off ───────────────────
  disappearAfter:  { type: Number, default: 0 },
  disappearsAt:    { type: Number, default: 0 },      // timestamp jab delete ho
});

const Chat = mongoose.models.Chat || mongoose.model("Chat", chatSchema);

const typingUsers = {};

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");

  if (req.method === "OPTIONS") return res.status(200).end();

  await connectDB();

  const url = req.url.split("?")[0];

  // ── TYPING ──────────────────────────────────────────────────
  if (url.includes("/typing")) {
    if (req.method === "POST") {
      const { chatID, userID, isTyping } = req.body;
      if (!chatID || !userID)
        return res.status(400).json({ message: "chatID aur userID chahiye" });

      if (isTyping) {
        typingUsers[chatID] = userID;
        setTimeout(() => {
          if (typingUsers[chatID] === userID) delete typingUsers[chatID];
        }, 5000);
      } else {
        delete typingUsers[chatID];
      }
      return res.json({ message: "ok" });
    }

    if (req.method === "GET") {
      const { chatID, myID } = req.query;
      if (!chatID) return res.status(400).json({ message: "chatID chahiye" });
      const typingUserID = typingUsers[chatID];
      return res.json({ isTyping: !!(typingUserID && typingUserID !== myID) });
    }
  }

  // ── MESSAGE BHEJO ───────────────────────────────────────────
  if (req.method === "POST") {
    try {
      const {
        myID, targetID, message, voiceUrl, imageUrl,
        viewOnce, disappearAfter,
      } = req.body;

      if (!myID || !targetID)
        return res.status(400).json({ message: "myID aur targetID chahiye" });

      if (!message?.trim() && !voiceUrl?.trim() && !imageUrl?.trim())
        return res.status(400).json({ message: "Message, voice ya image chahiye" });

      const ids = [myID, targetID].sort();
      const chatID = ids.join("_");

      const now = Date.now();
      const disappearSecs = Number(disappearAfter) || 0;

      const newMsg = new Chat({
        chatID,
        sender:         myID,
        message:        message  ?? "",
        voiceUrl:       voiceUrl ?? "",
        imageUrl:       imageUrl ?? "",
        time:           now,
        isRead:         false,
        reactions:      {},
        viewOnce:       viewOnce === true,
        viewedBy:       [],
        disappearAfter: disappearSecs,
        disappearsAt:   disappearSecs > 0
                          ? now + disappearSecs * 1000
                          : 0,
      });

      await newMsg.save();

      // ── Agar timer hai to background mein delete schedule karo ──
      if (disappearSecs > 0) {
        setTimeout(async () => {
          try { await Chat.findByIdAndDelete(newMsg._id); } catch (_) {}
        }, disappearSecs * 1000);
      }

      return res.status(201).json({ message: "Message send ho gaya ✅", data: newMsg });
    } catch (error) {
      return res.status(500).json({ message: "Server error", error: error.message });
    }
  }

  // ── MESSAGES LAO ────────────────────────────────────────────
  else if (req.method === "GET") {
    try {
      const { myID, targetID, unreadCount, chatID } = req.query;

      if (unreadCount === "true" && chatID) {
        const count = await Chat.countDocuments({
          chatID,
          sender: { $ne: myID },
          isRead: false,
        });
        return res.status(200).json({ count });
      }

      if (!myID || !targetID)
        return res.status(400).json({ message: "myID aur targetID chahiye" });

      const ids = [myID, targetID].sort();
      const cID = ids.join("_");

      await Chat.updateMany(
        { chatID: cID, sender: targetID, isRead: false },
        { $set: { isRead: true } }
      );

      const now = Date.now();

      // ── Expired messages delete karo ────────────────────────
      await Chat.deleteMany({
        chatID: cID,
        disappearsAt: { $gt: 0, $lte: now },
      });

      // ── viewOnce: dono ne dekh liya to delete ───────────────
      const participants = [myID, targetID];
      await Chat.deleteMany({
        chatID:   cID,
        viewOnce: true,
        viewedBy: { $all: participants },
      });

      const messages = await Chat.find({ chatID: cID }).sort({ time: 1 });

      const result = messages.map(m => ({
        ...m.toObject(),
        reactions:    m.reactions ? Object.fromEntries(m.reactions) : {},
        // ── Flutter ko batao: is myID ne dekha ya nahi ─────────
        viewedByMe:   m.viewedBy?.includes(myID) ?? false,
      }));

      return res.status(200).json({ messages: result });
    } catch (error) {
      return res.status(500).json({ message: "Server error", error: error.message });
    }
  }

  // ── PATCH: reaction YA viewOnce mark ────────────────────────
  else if (req.method === "PATCH") {
    try {
      const { messageID, userID, emoji, markViewed } = req.body;

      if (!messageID || !userID)
        return res.status(400).json({ message: "messageID aur userID chahiye" });

      const msg = await Chat.findById(messageID);
      if (!msg)
        return res.status(404).json({ message: "Message nahi mila" });

      // ── View Once: viewed mark karo ─────────────────────────
      if (markViewed === true) {
        if (!msg.viewedBy.includes(userID)) {
          msg.viewedBy.push(userID);
          await msg.save();
        }
        return res.status(200).json({ message: "Viewed mark ho gaya" });
      }

      // ── Reaction ─────────────────────────────────────────────
      const reactions = msg.reactions || new Map();
      if (reactions.get(userID) === emoji) {
        reactions.delete(userID);
      } else {
        reactions.set(userID, emoji);
      }
      msg.reactions = reactions;
      await msg.save();

      return res.status(200).json({
        message:   "Reaction update ho gaya",
        reactions: Object.fromEntries(reactions),
      });
    } catch (error) {
      return res.status(500).json({ message: "Server error", error: error.message });
    }
  }

  // ── DELETE ──────────────────────────────────────────────────
  else if (req.method === "DELETE") {
    try {
      const { messageID, userID } = req.body;

      if (!messageID || !userID)
        return res.status(400).json({ message: "messageID aur userID chahiye" });

      const msg = await Chat.findById(messageID);
      if (!msg)
        return res.status(404).json({ message: "Message nahi mila" });

      if (msg.sender !== userID)
        return res.status(403).json({ message: "Sirf apna message delete kar sakte ho" });

      await Chat.findByIdAndDelete(messageID);
      return res.status(200).json({ message: "Message delete ho gaya ✅" });
    } catch (error) {
      return res.status(500).json({ message: "Server error", error: error.message });
    }
  }

  else {
    return res.status(405).json({ message: "Method not allowed" });
  }
}