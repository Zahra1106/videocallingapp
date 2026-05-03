import { connectDB } from "../lib/db.js";
import mongoose from "mongoose";

// Chat Schema
const chatSchema = new mongoose.Schema({
  chatID:  { type: String, required: true },
  sender:  { type: String, required: true },
  message: { type: String, required: true },
  time:    { type: Number, default: () => Date.now() },
});

const Chat = mongoose.models.Chat || mongoose.model("Chat", chatSchema);

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");

  if (req.method === "OPTIONS") return res.status(200).end();

  await connectDB();

  // MESSAGE BHEJO
  if (req.method === "POST") {
    try {
      const { myID, targetID, message } = req.body;

      if (!myID || !targetID || !message?.trim()) {
        return res.status(400).json({ message: "Sab fields bharo" });
      }

      const ids = [myID, targetID].sort();
      const chatID = ids.join("_");

      const newMsg = new Chat({ chatID, sender: myID, message, time: Date.now() });
      await newMsg.save();

      res.status(201).json({ message: "Message send ho gaya ✅", data: newMsg });

    } catch (error) {
      res.status(500).json({ message: "Server error", error: error.message });
    }
  }

  // MESSAGES LAO
  else if (req.method === "GET") {
    try {
      const { myID, targetID } = req.query;

      const ids = [myID, targetID].sort();
      const chatID = ids.join("_");

      const messages = await Chat.find({ chatID }).sort({ time: 1 });

      res.status(200).json({ messages });

    } catch (error) {
      res.status(500).json({ message: "Server error", error: error.message });
    }
  }

  else {
    res.status(405).json({ message: "Method not allowed" });
  }
}