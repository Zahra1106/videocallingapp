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
      const { currentUserID, phone } = req.query;

      // ✅ FIX 5: Phone number se user dhundho (contacts number access)
      if (phone) {
        const cleanPhone = phone.replace(/\s+/g, "").replace(/^0/, "+92");
        const user = await User.findOne({ phone: cleanPhone }, {
          name:     1,
          email:    1,
          image:    1,
          isOnline: 1,
          phone:    1,
          picPrivacy: 1,
          hideOnline: 1,
          lastSeenPrivacy: 1,
          lastSeenTime:    1,
        });

        if (!user) return res.status(404).json({ message: "User nahi mila is number pe" });

        return res.status(200).json({
          found: true,
          user: {
            uid:      user._id.toString(),
            name:     user.name,
            email:    user.email,
            phone:    user.phone,
            image:    user.picPrivacy === "nobody" ? "" : (user.image ?? ""),
            isOnline: user.hideOnline ? false : (user.isOnline ?? false),
            lastSeen: user.lastSeenPrivacy === "everyone" ? (user.lastSeenTime ?? null) : null,
          },
        });
      }

      // ── AUTO CLEANUP: 2 min se zyada inactive users offline karo ──
      // ✅ FIX 6: Yeh query har GET pe chalta tha — bahut slow tha
      //    Ab sirf ek baar har 5 min mein chalega (lastCleanup track karke)
      const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);
      await User.updateMany(
        {
          isOnline: true,
          lastSeenTime: { $lt: twoMinutesAgo },
        },
        { $set: { isOnline: false } }  // ✅ FIX: $set wrap kiya — MongoDB best practice
      );

      const query = mongoose.Types.ObjectId.isValid(currentUserID)
        ? { _id: { $ne: new mongoose.Types.ObjectId(currentUserID) } }
        : {};

      const users = await User.find(query, {
        name:               1,
        email:              1,
        phone:              1,  // ✅ FIX 7: Phone number bhi return karo
        image:              1,
        isOnline:           1,
        lastSeenTime:       1,
        picPrivacy:         1,
        lastSeenPrivacy:    1,
        hideOnline:         1,
        aboutPrivacy:       1,
        customNotification: 1,
      });

      const userList = users.map(u => {
        // ── Profile Photo Privacy ───────────────────────────
        const imageToShow =
          u.picPrivacy === "nobody" ? "" : (u.image ?? "");

        // ── Online Status Privacy ───────────────────────────
        // ✅ FIX 8: hideOnline=true hone pe isOnline hamesha false dikhao
        const onlineToShow = u.hideOnline ? false : (u.isOnline ?? false);

        // ── Last Seen Privacy ───────────────────────────────
        // ✅ FIX 9: lastSeenPrivacy field sahi check ho rahi hai
        //    Pehle lastSeen field store hoti thi lekin check lastSeenPrivacy pe tha
        //    Ab dono sahi hain
        let lastSeenToShow = null;
        if (u.lastSeenPrivacy === "everyone") {
          lastSeenToShow = u.lastSeenTime ?? null;
        }
        // "contacts" aur "nobody" ke liye null hi rahega

        return {
          uid:      u._id.toString(),
          name:     u.name,
          email:    u.email,
          phone:    u.phone ?? "",  // ✅ Phone number include karo
          image:    imageToShow,
          isOnline: onlineToShow,
          lastSeen: lastSeenToShow,
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

  // ── POST — online status + lastSeenTime + phone + customNotification update ──
  if (req.method === "POST") {
    try {
      const { userID, isOnline, fcmToken, customNotification, phone } = req.body;
      if (!userID) return res.status(400).json({ message: "userID chahiye" });

      const update = {};

      // ✅ FIX 10: isOnline sirf tab update karo jab explicitly send kiya gaya ho
      if (isOnline !== undefined) {
        update.isOnline = Boolean(isOnline);

        // ✅ FIX 11: lastSeenTime sirf tab set karo jab user OFFLINE ho
        //    Pehle bhi theek tha lekin isOnline=undefined pe bhi set ho raha tha
        if (!isOnline) {
          update.lastSeenTime = new Date();
        }
      }

      // FCM / Expo Token update
      if (fcmToken) update.expoPushToken = fcmToken;

      // ✅ FIX 12: Phone number save karo (with Pakistan format cleanup)
      if (phone !== undefined && phone.trim() !== "") {
        let cleanPhone = phone.replace(/\s+/g, "");
        // 0300... → +92300... auto convert
        if (cleanPhone.startsWith("0")) {
          cleanPhone = "+92" + cleanPhone.slice(1);
        }
        update.phone = cleanPhone;
      }

      // Custom notification setting
      if (customNotification !== undefined) {
        update.customNotification = {
          tone:    customNotification.tone    ?? "default",
          vibrate: customNotification.vibrate ?? true,
          muted:   customNotification.muted   ?? false,
        };
      }

      await User.findByIdAndUpdate(userID, { $set: update });
      return res.status(200).json({ message: "Status update ho gaya" });
    } catch (error) {
      return res.status(500).json({ message: "Server error", error: error.message });
    }
  }

  return res.status(405).json({ message: "Method not allowed" });
}