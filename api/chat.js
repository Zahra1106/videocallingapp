import { connectDB, User } from "../lib/db.js";
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

  // ── DOCUMENT ───────────────────────────────────────────────
  documentUrl:     { type: String, default: "" },
  documentName:    { type: String, default: "" },
  documentSize:    { type: Number, default: 0 },
  documentType:    { type: String, default: "" },

  // ── LOCATION ───────────────────────────────────────────────
  location: {
    lat:     { type: Number, default: null },
    lng:     { type: Number, default: null },
    address: { type: String, default: "" },
    isLive:  { type: Boolean, default: false },
  },

  // ── REPLY TO ───────────────────────────────────────────────
  replyTo:         { type: mongoose.Schema.Types.Mixed, default: null },

  // ── EDIT ───────────────────────────────────────────────────
  isEdited:        { type: Boolean, default: false },
  editedAt:        { type: Date, default: null },

  // ── DELETE ─────────────────────────────────────────────────
  deletedFor:           { type: [String], default: [] },
  isDeletedForEveryone: { type: Boolean, default: false },

  // ── VIEW ONCE ──────────────────────────────────────────────
  viewOnce:        { type: Boolean, default: false },
  viewedBy:        { type: [String], default: [] },

  // ── DISAPPEAR AFTER (seconds) — 0 = off ───────────────────
  disappearAfter:  { type: Number, default: 0 },
  disappearsAt:    { type: Number, default: 0 },
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

  // ── READ MARK ───────────────────────────────────────────────
  if (url.includes("/read")) {
    if (req.method === "PATCH") {
      try {
        const { myID, targetID } = req.body;
        if (!myID || !targetID)
          return res.status(400).json({ message: "myID aur targetID chahiye" });

        // ✅ READ RECEIPTS CHECK — agar sender ne off kiya hua hai toh mark mat karo
        const sender = await User.findById(targetID, { readReceipts: 1 });
        if (sender && sender.readReceipts === false) {
          return res.json({ message: "Read receipts off hain, skip" });
        }

        const ids    = [myID, targetID].sort();
        const chatID = ids.join("_");

        await Chat.updateMany(
          { chatID, sender: targetID, isRead: false },
          { $set: { isRead: true } }
        );
        return res.json({ message: "Read mark ho gaya" });
      } catch (error) {
        return res.status(500).json({ message: "Server error", error: error.message });
      }
    }
  }

  // ── MESSAGE BHEJO ───────────────────────────────────────────
  if (req.method === "POST") {
    try {
      const {
        myID, targetID,
        message       = "",
        voiceUrl      = "",
        imageUrl      = "",
        documentUrl   = "",
        documentName  = "",
        documentSize  = 0,
        documentType  = "",
        location,
        viewOnce      = false,
        disappearAfter = 0,
        replyTo,
      } = req.body;

      if (!myID || !targetID)
        return res.status(400).json({ message: "myID aur targetID chahiye" });

      const hasContent =
        message?.trim() || voiceUrl?.trim() || imageUrl?.trim() ||
        documentUrl?.trim() || location;

      if (!hasContent)
        return res.status(400).json({ message: "Message, voice, image, document ya location chahiye" });

      // ✅ SILENCE UNKNOWN CALLERS — yeh chat ke liye nahi, call ke liye hai
      // (communication.js mein handle hoga)

      const ids    = [myID, targetID].sort();
      const chatID = ids.join("_");

      const now          = Date.now();
      const disappearSecs = Number(disappearAfter) || 0;

      const newMsg = new Chat({
        chatID,
        sender:        myID,
        message,
        voiceUrl,
        imageUrl,
        documentUrl,
        documentName,
        documentSize,
        documentType,
        location:      location || null,
        time:          now,
        isRead:        false,
        reactions:     {},
        viewOnce:      viewOnce === true,
        viewedBy:      [],
        replyTo:       replyTo || null,
        isEdited:      false,
        deletedFor:    [],
        isDeletedForEveryone: false,
        disappearAfter: disappearSecs,
        disappearsAt:  disappearSecs > 0 ? now + disappearSecs * 1000 : 0,
      });

      await newMsg.save();

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

      const ids  = [myID, targetID].sort();
      const cID  = ids.join("_");
      const now  = Date.now();

      // ✅ READ RECEIPTS CHECK — agar targetID ne off kiya hai toh auto-read mat karo
      const targetUser = await User.findById(targetID, { readReceipts: 1 });
      if (!targetUser || targetUser.readReceipts !== false) {
        await Chat.updateMany(
          { chatID: cID, sender: targetID, isRead: false },
          { $set: { isRead: true } }
        );
      }

      // Expired messages delete karo
      await Chat.deleteMany({
        chatID: cID,
        disappearsAt: { $gt: 0, $lte: now },
      });

      // viewOnce: dono ne dekh liya to delete
      const participants = [myID, targetID];
      await Chat.deleteMany({
        chatID:   cID,
        viewOnce: true,
        viewedBy: { $all: participants },
      });

      const messages = await Chat.find({ chatID: cID }).sort({ time: 1 });

      const result = messages.map(m => {
        const obj = m.toObject();

        if (obj.deletedFor?.includes(myID)) {
          return null;
        }

        return {
          ...obj,
          reactions:  m.reactions ? Object.fromEntries(m.reactions) : {},
          viewedByMe: m.viewedBy?.includes(myID) ?? false,
        };
      }).filter(Boolean);

      return res.status(200).json({ messages: result });
    } catch (error) {
      return res.status(500).json({ message: "Server error", error: error.message });
    }
  }

  // ── PATCH: reaction / viewOnce / edit / liveLocation ────────
  else if (req.method === "PATCH") {
    try {
      const {
        messageID, userID, emoji, markViewed,
        newText, liveLocation,
      } = req.body;

      if (!messageID || !userID)
        return res.status(400).json({ message: "messageID aur userID chahiye" });

      const msg = await Chat.findById(messageID);
      if (!msg)
        return res.status(404).json({ message: "Message nahi mila" });

      // ── View Once mark ──────────────────────────────────────
      if (markViewed === true) {
        if (!msg.viewedBy.includes(userID)) {
          msg.viewedBy.push(userID);
          await msg.save();
        }
        return res.status(200).json({ message: "Viewed mark ho gaya" });
      }

      // ── Edit Message ────────────────────────────────────────
      if (newText !== undefined) {
        if (msg.sender !== userID)
          return res.status(403).json({ message: "Sirf apna message edit kar sakte hain" });

        msg.message  = newText;
        msg.isEdited = true;
        msg.editedAt = new Date();
        await msg.save();
        return res.status(200).json({ message: "Message edit ho gaya", data: msg });
      }

      // ── Live Location Update ─────────────────────────────────
      if (liveLocation) {
        if (msg.sender !== userID)
          return res.status(403).json({ message: "Sirf sender location update kar sakta hai" });

        msg.location = {
          ...msg.location,
          lat:    liveLocation.lat,
          lng:    liveLocation.lng,
          isLive: liveLocation.isLive !== false,
        };
        await msg.save();
        return res.status(200).json({ message: "Location update ho gaya", data: msg });
      }

      // ── Reaction ─────────────────────────────────────────────
      if (emoji) {
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
      }

      return res.status(400).json({ message: "Koi valid action nahi mila" });
    } catch (error) {
      return res.status(500).json({ message: "Server error", error: error.message });
    }
  }

  // ── DELETE: for me / for everyone ───────────────────────────
  else if (req.method === "DELETE") {
    try {
      const { messageID, userID, deleteForEveryone = false } = req.body;

      if (!messageID || !userID)
        return res.status(400).json({ message: "messageID aur userID chahiye" });

      const msg = await Chat.findById(messageID);
      if (!msg)
        return res.status(404).json({ message: "Message nahi mila" });

      if (deleteForEveryone) {
        if (msg.sender !== userID)
          return res.status(403).json({ message: "Sirf apna message sabke liye delete kar sakte hain" });

        msg.message              = "";
        msg.imageUrl             = "";
        msg.voiceUrl             = "";
        msg.documentUrl          = "";
        msg.documentName         = "";
        msg.documentSize         = 0;
        msg.location             = null;
        msg.isDeletedForEveryone = true;
        await msg.save();
        return res.status(200).json({ message: "Message sabke liye delete ho gaya ✅" });
      } else {
        if (!msg.deletedFor.includes(userID)) {
          msg.deletedFor.push(userID);
          await msg.save();
        }
        return res.status(200).json({ message: "Aapke liye message delete ho gaya ✅" });
      }
    } catch (error) {
      return res.status(500).json({ message: "Server error", error: error.message });
    }
  }

  else {
    return res.status(405).json({ message: "Method not allowed" });
  }
}