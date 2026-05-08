import { connectDB, Group } from "../lib/db.js";

export default async function handler(req, res) {
  if (req.method !== "GET")
    return res.status(405).json({ message: "Method not allowed" });

  await connectDB();
  const { userID } = req.query;

  if (!userID)
    return res.status(400).json({ message: "userID chahiye" });

  try {
    const groups = await Group.find({ members: userID })
      .sort({ lastMessageTime: -1 });

    const result = groups.map(g => ({
      groupID:         g._id.toString(),
      name:            g.name,
      members:         g.members,
      lastMessage:     g.lastMessage ?? "",
      lastMessageTime: g.lastMessageTime,
      createdBy:       g.createdBy,
    }));

    return res.json({ groups: result });
  } catch (e) {
    return res.status(500).json({ message: "Server error", error: e.message });
  }
}