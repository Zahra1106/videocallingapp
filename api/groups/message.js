import { connectDB, Group } from "../../lib/db.js";

export default async function handler(req, res) {
  if (req.method !== "POST")
    return res.status(405).json({ message: "Method not allowed" });

  await connectDB();
  const { groupID, senderID, senderName, text } = req.body;

  if (!groupID || !senderID || !text)
    return res.status(400).json({ message: "groupID, senderID aur text chahiye" });

  try {
    await Group.findByIdAndUpdate(groupID, {
      $push: {
        messages: { senderID, senderName, text, timestamp: new Date() },
      },
      $set: {
        lastMessage:     text,
        lastMessageTime: new Date(),
      },
    });

    return res.json({ message: "Message chala gaya ✅" });
  } catch (e) {
    return res.status(500).json({ message: "Server error", error: e.message });
  }
}