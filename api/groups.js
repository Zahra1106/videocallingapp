import { connectDB } from "../lib/db.js";
import mongoose from "mongoose";

// GROUP SCHEMA
const groupSchema = new mongoose.Schema({
  name:      { type: String, required: true },
  createdBy: { type: String, required: true },
  members:   [{ type: String }],
  createdAt: { type: Date, default: Date.now }
});

const Group = mongoose.models.Group || mongoose.model("Group", groupSchema);

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");

  if (req.method === "OPTIONS") return res.status(200).end();

  await connectDB();

  // GROUP BANAO
  if (req.method === "POST") {
    try {
      const { name, createdBy, members } = req.body;

      if (!name || !createdBy || !members || members.length < 2) {
        return res.status(400).json({ message: "Name, createdBy aur kam az kam 2 members chahiye" });
      }

      const group = await Group.create({ name, createdBy, members });

      return res.status(201).json({
        message: "Group ban gaya ✅",
        group: {
          id:      group._id,
          name:    group.name,
          members: group.members,
        }
      });

    } catch (error) {
      return res.status(500).json({ message: "Server error", error: error.message });
    }
  }

  // GROUPS LAO
  if (req.method === "GET") {
    try {
      const { userID } = req.query;

      if (!userID) {
        return res.status(400).json({ message: "userID chahiye" });
      }

      const groups = await Group.find({ members: userID });

      const groupList = groups.map(g => ({
        id:        g._id,
        name:      g.name,
        members:   g.members,
        createdBy: g.createdBy,
      }));

      return res.status(200).json({ groups: groupList });

    } catch (error) {
      return res.status(500).json({ message: "Server error", error: error.message });
    }
  }

  return res.status(405).json({ message: "Method not allowed" });
}