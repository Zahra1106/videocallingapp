import { connectDB, Group } from "../../lib/db.js";

export default async function handler(req, res) {
  if (req.method !== "GET")
    return res.status(405).json({ message: "Method not allowed" });

  await connectDB();
  const { groupID } = req.query;

  if (!groupID)
    return res.status(400).json({ message: "groupID chahiye" });

  try {
    const group = await Group.findById(groupID);

    if (!group)
      return res.status(404).json({ message: "Group nahi mila" });

    return res.json({ messages: group.messages ?? [] });
  } catch (e) {
    return res.status(500).json({ message: "Server error", error: e.message });
  }
}