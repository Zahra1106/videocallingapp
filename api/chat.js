import { connectDB, User, ChatMeta } from "../lib/db.js";
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
  documentUrl:     { type: String, default: "" },
  documentName:    { type: String, default: "" },
  documentSize:    { type: Number, default: 0 },
  documentType:    { type: String, default: "" },
  location: {
    lat:     { type: Number, default: null },
    lng:     { type: Number, default: null },
    address: { type: String, default: "" },
    isLive:  { type: Boolean, default: false },
  },
  replyTo:              { type: mongoose.Schema.Types.Mixed, default: null },
  isEdited:             { type: Boolean, default: false },
  editedAt:             { type: Date, default: null },
  deletedFor:           { type: [String], default: [] },
  isDeletedForEveryone: { type: Boolean, default: false },
  viewOnce:             { type: Boolean, default: false },
  viewedBy:             { type: [String], default: [] },
  disappearAfter:       { type: Number, default: 0 },
  disappearsAt:         { type: Number, default: 0 },
});

const Chat = mongoose.models.Chat || mongoose.model("Chat", chatSchema);

const typingUsers = {};

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");

  if (req.method === "OPTIONS") return res.status(200).end();

  await connectDB();

  const url    = req.url.split("?")[0];
  const action = req.query.action;

  // ══════════════════════════════════════════════════════════
  //  CHAT META POST — savemeta
  // ══════════════════════════════════════════════════════════
  if (action === "savemeta") {
    const { userID, favourites, archived, lockedChats, lockCode } = req.body;
    if (!userID)
      return res.status(400).json({ message: "userID chahiye" });

    await ChatMeta.findOneAndUpdate(
      { userID },
      { favourites, archived, lockedChats, lockCode },
      { upsert: true, new: true }
    );
    return res.status(200).json({ message: "Meta save ho gaya ✅" });
  }

  // ══════════════════════════════════════════════════════════
  //  TYPING
  // ══════════════════════════════════════════════════════════
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
      if (!chatID)
        return res.status(400).json({ message: "chatID chahiye" });
      const typingUserID = typingUsers[chatID];
      return res.json({ isTyping: !!(typingUserID && typingUserID !== myID) });
    }
  }

  // ══════════════════════════════════════════════════════════
  //  READ MARK
  // ══════════════════════════════════════════════════════════
  if (url.includes("/read")) {
    if (req.method === "PATCH") {
      try {
        const { myID, targetID } = req.body;
        if (!myID || !targetID)
          return res.status(400).json({ message: "myID aur targetID chahiye" });

        const sender = await User.findById(targetID, { readReceipts: 1 });
        if (sender && sender.readReceipts === false)
          return res.json({ message: "Read receipts off hain, skip" });

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

  // ══════════════════════════════════════════════════════════
  //  POST — message bhejo
  // ══════════════════════════════════════════════════════════
  if (req.method === "POST") {
    try {
      const {
        myID, targetID,
        message        = "",
        voiceUrl       = "",
        imageUrl       = "",
        documentUrl    = "",
        documentName   = "",
        documentSize   = 0,
        documentType   = "",
        location,
        viewOnce       = false,
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

      const ids    = [myID, targetID].sort();
      const chatID = ids.join("_");

      const now           = Date.now();
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

  // ══════════════════════════════════════════════════════════
  //  GET — meta + messages + unread
  // ══════════════════════════════════════════════════════════
  else if (req.method === "GET") {
    try {
      const { myID, targetID, unreadCount, chatID, metaUserID } = req.query;

      // ── Chat Meta ────────────────────────────────────────
      if (metaUserID) {
        const meta = await ChatMeta.findOne({ userID: metaUserID });
        return res.status(200).json({
          favourites:  meta?.favourites  || [],
          archived:    meta?.archived    || [],
          lockedChats: meta?.lockedChats || [],
          lockCode:    meta?.lockCode    || "",
        });
      }

      // ── Unread count ─────────────────────────────────────
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
      const now = Date.now();

      const targetUser = await User.findById(targetID, { readReceipts: 1 });
      if (!targetUser || targetUser.readReceipts !== false) {
        await Chat.updateMany(
          { chatID: cID, sender: targetID, isRead: false },
          { $set: { isRead: true } }
        );
      }

      await Chat.deleteMany({
        chatID: cID,
        disappearsAt: { $gt: 0, $lte: now },
      });

      const participants = [myID, targetID];
      await Chat.deleteMany({
        chatID:   cID,
        viewOnce: true,
        viewedBy: { $all: participants },
      });

      const since = parseInt(req.query.since) || 0;
      const filter = since > 0
        ? { chatID: cID, time: { $gt: since } }
        : { chatID: cID };
      const messages = await Chat.find(filter).sort({ time: 1 });

      const result = messages.map(m => {
        const obj = m.toObject();
        if (obj.deletedFor?.includes(myID)) return null;
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

  // ══════════════════════════════════════════════════════════
  //  PATCH — reaction / edit / viewOnce / liveLocation
  // ══════════════════════════════════════════════════════════
  else if (req.method === "PATCH") {
    try {
      const { messageID, userID, emoji, markViewed, newText, liveLocation } = req.body;

      if (!messageID || !userID)
        return res.status(400).json({ message: "messageID aur userID chahiye" });

      const msg = await Chat.findById(messageID);
      if (!msg)
        return res.status(404).json({ message: "Message nahi mila" });

      if (markViewed === true) {
        if (!msg.viewedBy.includes(userID)) {
          msg.viewedBy.push(userID);
          await msg.save();
        }
        return res.status(200).json({ message: "Viewed mark ho gaya" });
      }

      if (newText !== undefined) {
        if (msg.sender !== userID)
          return res.status(403).json({ message: "Sirf apna message edit kar sakte hain" });
        msg.message  = newText;
        msg.isEdited = true;
        msg.editedAt = new Date();
        await msg.save();
        return res.status(200).json({ message: "Message edit ho gaya", data: msg });
      }

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

  // ══════════════════════════════════════════════════════════
  //  DELETE — for me / for everyone
  // ══════════════════════════════════════════════════════════
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