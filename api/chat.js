import { connectDB } from "../lib/db.js";
import mongoose from "mongoose";

const chatSchema = new mongoose.Schema({
  chatID:    { type: String, required: true },
  sender:    { type: String, required: true },
  message:   { type: String, default: "" },
  voiceUrl:  { type: String, default: "" },
  imageUrl:  { type: String, default: "" },
  time:      { type: Number, default: () => Date.now() },
  isRead:    { type: Boolean, default: false },
  reactions: { type: Map, of: String, default: {} },
});

const Chat = mongoose.models.Chat || mongoose.model("Chat", chatSchema);

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");

  if (req.method === "OPTIONS") return res.status(200).end();

  await connectDB();

  // MESSAGE BHEJO
  if (req.method === "POST") {
    try {
      const { myID, targetID, message, voiceUrl, imageUrl } = req.body;

      if (!myID || !targetID)
        return res.status(400).json({ message: "myID aur targetID chahiye" });

      if (!message?.trim() && !voiceUrl?.trim() && !imageUrl?.trim())
        return res.status(400).json({ message: "Message, voice ya image chahiye" });

      const ids = [myID, targetID].sort();
      const chatID = ids.join("_");

      const newMsg = new Chat({
        chatID,
        sender:    myID,
        message:   message  ?? "",
        voiceUrl:  voiceUrl ?? "",
        imageUrl:  imageUrl ?? "",
        time:      Date.now(),
        isRead:    false,
        reactions: {},
      });
      await newMsg.save();

      res.status(201).json({ message: "Message send ho gaya ✅", data: newMsg });
    } catch (error) {
      res.status(500).json({ message: "Server error", error: error.message });
    }
  }

  // MESSAGES LAO + UNREAD COUNT
  else if (req.method === "GET") {
    try {
      const { myID, targetID, unreadCount, chatID } = req.query;

      // ✅ Unread count
      if (unreadCount === "true" && chatID) {
        const count = await Chat.countDocuments({
          chatID,
          sender: { $ne: myID },
          isRead: false,
        });
        return res.status(200).json({ count });
      }

      // Normal messages
      if (!myID || !targetID)
        return res.status(400).json({ message: "myID aur targetID chahiye" });

      const ids = [myID, targetID].sort();
      const cID = ids.join("_");

      await Chat.updateMany(
        { chatID: cID, sender: targetID, isRead: false },
        { $set: { isRead: true } }
      );

      const messages = await Chat.find({ chatID: cID }).sort({ time: 1 });

      const result = messages.map(m => ({
        ...m.toObject(),
        reactions: m.reactions ? Object.fromEntries(m.reactions) : {},
      }));

      return res.status(200).json({ messages: result });
    } catch (error) {
      res.status(500).json({ message: "Server error", error: error.message });
    }
  }

  // REACTION ADD/REMOVE
  else if (req.method === "PATCH") {
    try {
      const { messageID, userID, emoji } = req.body;

      if (!messageID || !userID)
        return res.status(400).json({ message: "messageID aur userID chahiye" });

      const msg = await Chat.findById(messageID);
      if (!msg)
        return res.status(404).json({ message: "Message nahi mila" });

      const reactions = msg.reactions || new Map();

      if (reactions.get(userID) === emoji) {
        reactions.delete(userID);
      } else {
        reactions.set(userID, emoji);
      }

      msg.reactions = reactions;
      await msg.save();

      res.status(200).json({
        message:   "Reaction update ho gaya",
        reactions: Object.fromEntries(reactions),
      });
    } catch (error) {
      res.status(500).json({ message: "Server error", error: error.message });
    }
  }

  // MESSAGE DELETE
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
      res.status(500).json({ message: "Server error", error: error.message });
    }
  }

  else {
    res.status(405).json({ message: "Method not allowed" });
  }
}