import { connectDB, User } from "../lib/db.js";
import mongoose from "mongoose";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");

  if (req.method === "OPTIONS") return res.status(200).end();

  await connectDB();

  // ── GET
  if (req.method === "GET") {
    try {
      const { currentUserID } = req.query;

      const query = mongoose.Types.ObjectId.isValid(currentUserID)
        ? { _id: { $ne: new mongoose.Types.ObjectId(currentUserID) } }
        : {};

      const users = await User.find(query, {
        name: 1, email: 1, image: 1, isOnline: 1, lastSeen: 1
      });

      const userList = users.map(u => ({
        uid:      u._id.toString(),
        name:     u.name,
        email:    u.email,
        image:    u.image ?? "",
        isOnline: u.isOnline ?? false,
        lastSeen: u.lastSeen ?? null,
      }));

      return res.status(200).json({ users: userList });
    } catch (error) {
      return res.status(500).json({ message: "Server error", error: error.message });
    }
  }

  // ── POST — ✅ sirf ek POST block
  if (req.method === "POST") {
    try {
      const { userID, isOnline, fcmToken } = req.body;
      if (!userID) return res.status(400).json({ message: "userID chahiye" });

      const update = { isOnline };
      if (fcmToken) update.fcmToken = fcmToken;
      if (!isOnline) update.lastSeen = new Date();

      await User.findByIdAndUpdate(userID, update);
      return res.status(200).json({ message: "Status update ho gaya" });
    } catch (error) {
      return res.status(500).json({ message: "Server error", error: error.message });
    }
  }

  return res.status(405).json({ message: "Method not allowed" });
}