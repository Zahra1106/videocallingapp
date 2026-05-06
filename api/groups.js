// api/groups.js
import { Group } from "../lib/db.js";

export default async function groupsHandler(req, res) {

  const url = req.url.split("?")[0]; // query string hata do

  console.log("Method:", req.method, "| URL:", url); // debug ke liye

  // ── GET /api/groups ────────────────────────────────────────
  if (req.method === "GET" && url === "/api/groups") {
    const { userID } = req.query;

    if (!userID) {
      return res.status(400).json({ message: "userID chahiye" });
    }

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

  // ── POST /api/groups/create ────────────────────────────────
  if (req.method === "POST" && url === "/api/groups/create") {
    const { name, creatorID, creatorName, members } = req.body;

    if (!name || !creatorID || !members?.length) {
      return res.status(400).json({ message: "Sab fields bharo" });
    }

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
        message: "Group ban gaya",
        groupID: group._id.toString(),
      });
    } catch (e) {
      return res.status(500).json({ message: "Server error", error: e.message });
    }
  }

  // ── POST /api/groups/message ───────────────────────────────
  if (req.method === "POST" && url === "/api/groups/message") {
    const { groupID, senderID, senderName, text } = req.body;

    if (!groupID || !senderID || !text) {
      return res.status(400).json({ message: "groupID, senderID aur text chahiye" });
    }

    try {
      await Group.findByIdAndUpdate(groupID, {
        $push: {
          messages: {
            senderID,
            senderName,
            text,
            timestamp: new Date(),
          },
        },
        $set: {
          lastMessage:     text,
          lastMessageTime: new Date(),
        },
      });

      return res.json({ message: "Message chala gaya" });
    } catch (e) {
      return res.status(500).json({ message: "Server error", error: e.message });
    }
  }

  // ── GET /api/groups/messages ───────────────────────────────
  if (req.method === "GET" && url === "/api/groups/messages") {
    const { groupID } = req.query;

    if (!groupID) {
      return res.status(400).json({ message: "groupID chahiye" });
    }

    try {
      const group = await Group.findById(groupID);

      if (!group) {
        return res.status(404).json({ message: "Group nahi mila" });
      }

      return res.json({ messages: group.messages ?? [] });
    } catch (e) {
      return res.status(500).json({ message: "Server error", error: e.message });
    }
  }

  return res.status(404).json({ message: "Route nahi mila" });
}