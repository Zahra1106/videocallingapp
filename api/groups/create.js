import { connectDB, Group } from "../../lib/db.js";

export default async function handler(req, res) {
  if (req.method !== "POST")
    return res.status(405).json({ message: "Method not allowed" });

  await connectDB();
  const { name, creatorID, creatorName, members } = req.body;

  if (!name || !creatorID || !members?.length)
    return res.status(400).json({ message: "Sab fields bharo" });

  try {
    const group = await Group.create({
      name,
      createdBy:       creatorID,
      creatorName,
      members,
      lastMessage:     "",
      lastMessageTime: new Date(),
    });

    return res.status(201).json({
      message: "Group ban gaya ✅",
      groupID: group._id.toString(),
    });
  } catch (e) {
    return res.status(500).json({ message: "Server error", error: e.message });
  }
}