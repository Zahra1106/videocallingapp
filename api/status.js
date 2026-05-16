// ============================================================
//  /api/status/index.js  — Main CRUD
// ============================================================
import { connectDB, Status } from "../lib/db.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();

  await connectDB();

  // ── GET — statuses load karo (privacy filter ke saath) ──
  if (req.method === "GET") {
    try {
      const { viewerID } = req.query;

      // Fetch all statuses, last 24h only
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const all   = await Status.find({ createdAt: { $gte: since } })
                               .sort({ createdAt: -1 });

      // Group by userID + apply privacy filter
      const grouped = {};
      for (const s of all) {
        // Privacy filter
        if (viewerID && viewerID !== s.userID) {
          if (s.privacy === "nobody")   continue; // hidden for all
          // "contacts" check: add your own contacts logic here if needed
        }

        if (!grouped[s.userID]) {
          grouped[s.userID] = {
            userID:   s.userID,
            userName: s.userName,
            statuses: [],
          };
        }

        grouped[s.userID].statuses.push({
          id:          s._id.toString(),
          mediaUrl:    s.mediaUrl  || null,
          mediaType:   s.mediaType,
          caption:     s.caption,
          textContent: s.textContent || null,
          bgColor:     s.bgColor    || null,
          textColor:   s.textColor  || null,
          viewers:     s.viewers,
          reactions:   s.reactions,
          createdAt:   s.createdAt,
        });
      }

      return res.status(200).json({ statuses: Object.values(grouped) });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ── POST — naya status banao ──
  if (req.method === "POST") {
    try {
      const {
        userID, userName,
        mediaUrl, mediaType,
        caption,
        textContent, bgColor, textColor,
        privacy,
      } = req.body;

      if (!userID) return res.status(400).json({ message: "userID chahiye" });
      if (mediaType !== "text" && !mediaUrl)
        return res.status(400).json({ message: "mediaUrl chahiye" });

      const status = await Status.create({
        userID, userName,
        mediaUrl:    mediaUrl    || null,
        mediaType:   mediaType   || "image",
        caption:     caption     || "",
        textContent: textContent || null,
        bgColor:     bgColor     || null,
        textColor:   textColor   || null,
        privacy:     privacy     || "everyone",
        viewers:     [],
        reactions:   [],
      });

      return res.status(201).json({ message: "Status add ho gaya ✅", status });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ── DELETE ──
  if (req.method === "DELETE") {
    try {
      const { statusID, userID } = req.body;
      const status = await Status.findById(statusID);
      if (!status) return res.status(404).json({ message: "Nahi mila" });
      if (status.userID !== userID)
        return res.status(403).json({ message: "Sirf apna delete karo" });

      await Status.findByIdAndDelete(statusID);
      return res.status(200).json({ message: "Delete ho gaya ✅" });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).json({ message: "Method not allowed" });
}


// ============================================================
//  /api/status/view.js  — Viewer track karo
// ============================================================
/*
import { connectDB, Status } from "../../lib/db.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();

  await connectDB();

  if (req.method === "POST") {
    try {
      const { statusID, viewerID, viewerName } = req.body;
      if (!statusID || !viewerID)
        return res.status(400).json({ message: "statusID aur viewerID chahiye" });

      // Duplicate view avoid karo
      await Status.updateOne(
        { _id: statusID, "viewers.viewerID": { $ne: viewerID } },
        {
          $push: {
            viewers: { viewerID, viewerName, viewedAt: new Date() },
          },
        }
      );

      return res.status(200).json({ message: "View record ho gaya" });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).json({ message: "Method not allowed" });
}
*/


// ============================================================
//  /api/status/react.js  — Reaction add karo
// ============================================================
/*
import { connectDB, Status } from "../../lib/db.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();

  await connectDB();

  if (req.method === "POST") {
    try {
      const { statusID, reactorID, reactorName, emoji } = req.body;
      if (!statusID || !reactorID || !emoji)
        return res.status(400).json({ message: "Fields missing hain" });

      // Ek user ki purani reaction replace karo
      await Status.updateOne(
        { _id: statusID },
        { $pull: { reactions: { reactorID } } }
      );
      await Status.updateOne(
        { _id: statusID },
        {
          $push: {
            reactions: { reactorID, reactorName, emoji, reactedAt: new Date() },
          },
        }
      );

      return res.status(200).json({ message: "Reaction add ho gayi ✅" });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).json({ message: "Method not allowed" });
}
*/


// ============================================================
//  /api/status/reply.js  — Reply bhejo (chat mein save)
// ============================================================
/*
  Strategy: Status reply ek direct message hai owner ko.
  Apni existing chat/message collection mein save karo.

import { connectDB, Message } from "../../lib/db.js";   // apna Message model use karo
import { Status } from "../../lib/db.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();

  await connectDB();

  if (req.method === "POST") {
    try {
      const { statusID, statusOwnerID, replyerID, replyerName, message } = req.body;
      if (!statusID || !replyerID || !message)
        return res.status(400).json({ message: "Fields missing" });

      // Status ka preview fetch karo (optional)
      const status = await Status.findById(statusID).lean();

      // Message collection mein save karo
      await Message.create({
        senderID:   replyerID,
        senderName: replyerName,
        receiverID: statusOwnerID,
        text:       message,
        statusReply: {             // alag field for UI differentiation
          statusID,
          mediaType: status?.mediaType || "image",
          mediaUrl:  status?.mediaUrl  || null,
          caption:   status?.caption   || "",
        },
        createdAt: new Date(),
      });

      return res.status(200).json({ message: "Reply bhej di ✅" });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).json({ message: "Method not allowed" });
}
*/


// ============================================================
//  /api/status/privacy.js  — Privacy setting save karo
// ============================================================
/*
import { connectDB } from "../../lib/db.js";
import mongoose from "mongoose";

// Simple UserPrivacy collection (ya User model mein field add karo)
const privacySchema = new mongoose.Schema({
  userID:  { type: String, unique: true },
  privacy: { type: String, default: "everyone" }, // everyone | contacts | nobody
});
const UserPrivacy = mongoose.models.UserPrivacy ||
  mongoose.model("UserPrivacy", privacySchema);

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();

  await connectDB();

  if (req.method === "POST") {
    try {
      const { userID, privacy } = req.body;
      if (!userID || !privacy)
        return res.status(400).json({ message: "Fields missing" });

      await UserPrivacy.findOneAndUpdate(
        { userID },
        { privacy },
        { upsert: true, new: true }
      );
      return res.status(200).json({ message: "Privacy update ho gayi ✅" });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  if (req.method === "GET") {
    try {
      const { userID } = req.query;
      const doc = await UserPrivacy.findOne({ userID });
      return res.status(200).json({ privacy: doc?.privacy || "everyone" });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).json({ message: "Method not allowed" });
}
*/


// ============================================================
//  Updated Mongoose Schema  (lib/db.js mein update karo)
// ============================================================
/*
import mongoose from "mongoose";

const statusSchema = new mongoose.Schema(
  {
    userID:      { type: String, required: true },
    userName:    { type: String, default: "" },

    // Media
    mediaUrl:    { type: String, default: null },   // null for text status
    mediaType:   {
      type: String,
      enum: ["image", "video", "audio", "text"],
      default: "image",
    },

    // Text status fields
    textContent: { type: String, default: null },
    bgColor:     { type: String, default: "#1a1a2e" },
    textColor:   { type: String, default: "#ffffff" },

    caption:     { type: String, default: "" },

    // Privacy: "everyone" | "contacts" | "nobody"
    privacy:     { type: String, default: "everyone" },

    // Viewers list: [{ viewerID, viewerName, viewedAt }]
    viewers: [
      {
        viewerID:   String,
        viewerName: String,
        viewedAt:   { type: Date, default: Date.now },
      },
    ],

    // Reactions: [{ reactorID, reactorName, emoji, reactedAt }]
    reactions: [
      {
        reactorID:   String,
        reactorName: String,
        emoji:       String,
        reactedAt:   { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

// Auto-expire after 24 hours
statusSchema.index({ createdAt: 1 }, { expireAfterSeconds: 86400 });

export const Status =
  mongoose.models.Status || mongoose.model("Status", statusSchema);
*/