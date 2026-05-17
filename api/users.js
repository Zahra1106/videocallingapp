import { connectDB, User } from "../lib/db.js";
import mongoose from "mongoose";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");

  if (req.method === "OPTIONS") return res.status(200).end();

  await connectDB();

  // ── GET — users list ─────────────────────────────────────────
  if (req.method === "GET") {
    try {
      const { currentUserID } = req.query;

      const query = mongoose.Types.ObjectId.isValid(currentUserID)
        ? { _id: { $ne: new mongoose.Types.ObjectId(currentUserID) } }
        : {};

      // ✅ Privacy fields + customNotification bhi fetch karo
      const users = await User.find(query, {
        name:               1,
        email:              1,
        image:              1,
        isOnline:           1,
        lastSeenTime:       1,
        picPrivacy:         1,
        lastSeenPrivacy:    1,
        hideOnline:         1,
        aboutPrivacy:       1,
        customNotification: 1,  // ✅ Custom notification field
      });

      const userList = users.map(u => {
        // ── Profile Photo Privacy ───────────────────────────
        const imageToShow =
          u.picPrivacy === "nobody" ? "" : (u.image ?? "");

        // ── Online Status Privacy ───────────────────────────
        const onlineToShow = u.hideOnline ? false : (u.isOnline ?? false);

        // ── Last Seen Privacy ───────────────────────────────
        let lastSeenToShow = null;
        if (u.lastSeenPrivacy === "everyone") {
          lastSeenToShow = u.lastSeenTime ?? null;
        }

        return {
          uid:      u._id.toString(),
          name:     u.name,
          email:    u.email,
          image:    imageToShow,
          isOnline: onlineToShow,
          lastSeen: lastSeenToShow,
          // ✅ Custom notification setting return karo
          customNotification: u.customNotification ?? {
            tone:    "default",
            vibrate: true,
            muted:   false,
          },
        };
      });

      return res.status(200).json({ users: userList });
    } catch (error) {
      return res.status(500).json({ message: "Server error", error: error.message });
    }
  }

  // ── POST — online status + lastSeenTime + customNotification update ──
  if (req.method === "POST") {
    try {
      const { userID, isOnline, fcmToken, customNotification } = req.body;
      if (!userID) return res.status(400).json({ message: "userID chahiye" });

      const update = { isOnline };

      // ✅ FCM Token update
      if (fcmToken) update.fcmToken = fcmToken;

      // ✅ Last seen time
      if (!isOnline) update.lastSeenTime = new Date();

      // ✅ Custom notification setting save karo
      // Format: { tone: "default", vibrate: true, muted: false }
      if (customNotification !== undefined) {
        update.customNotification = {
          tone:    customNotification.tone    ?? "default",
          vibrate: customNotification.vibrate ?? true,
          muted:   customNotification.muted   ?? false,
        };
      }

      await User.findByIdAndUpdate(userID, update);
      return res.status(200).json({ message: "Status update ho gaya" });
    } catch (error) {
      return res.status(500).json({ message: "Server error", error: error.message });
    }
  }

  return res.status(405).json({ message: "Method not allowed" });
}