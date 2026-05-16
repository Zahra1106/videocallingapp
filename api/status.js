import { connectDB, Status } from "./lib/db.js";
import mongoose from "mongoose";

// ── UserPrivacy Schema ──
const privacySchema = new mongoose.Schema({
  userID:  { type: String, unique: true },
  privacy: { type: String, default: "everyone" },
});
const UserPrivacy = mongoose.models.UserPrivacy ||
  mongoose.model("UserPrivacy", privacySchema);

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();

  await connectDB();

  const url = req.url || "";

  // ============================================================
  //  /api/status/view  — viewer track karo
  // ============================================================
  if (url.includes("/view")) {
    if (req.method !== "POST")
      return res.status(405).json({ message: "Method not allowed" });
    try {
      const { statusID, viewerID, viewerName } = req.body;
      if (!statusID || !viewerID)
        return res.status(400).json({ message: "statusID aur viewerID chahiye" });

      await Status.updateOne(
        { _id: statusID, "viewers.viewerID": { $ne: viewerID } },
        { $push: { viewers: { viewerID, viewerName, viewedAt: new Date() } } }
      );
      return res.status(200).json({ message: "View record ho gaya" });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ============================================================
  //  /api/status/react  — reaction add karo
  // ============================================================
  if (url.includes("/react")) {
    if (req.method !== "POST")
      return res.status(405).json({ message: "Method not allowed" });
    try {
      const { statusID, reactorID, reactorName, emoji } = req.body;
      if (!statusID || !reactorID || !emoji)
        return res.status(400).json({ message: "Fields missing hain" });

      // Purani reaction hatao pehle
      await Status.updateOne(
        { _id: statusID },
        { $pull: { reactions: { reactorID } } }
      );
      // Nai reaction add karo
      await Status.updateOne(
        { _id: statusID },
        { $push: { reactions: { reactorID, reactorName, emoji, reactedAt: new Date() } } }
      );
      return res.status(200).json({ message: "Reaction add ho gayi ✅" });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ============================================================
  //  /api/status/reply  — reply bhejo
  // ============================================================
  if (url.includes("/reply")) {
    if (req.method !== "POST")
      return res.status(405).json({ message: "Method not allowed" });
    try {
      const { statusID, statusOwnerID, replyerID, replyerName, message } = req.body;
      if (!statusID || !replyerID || !message)
        return res.status(400).json({ message: "Fields missing" });

      const status = await Status.findById(statusID).lean();

      // Reply ko Status ki replies array mein save karo
      await Status.updateOne(
        { _id: statusID },
        {
          $push: {
            replies: {
              replyerID,
              replyerName,
              message,
              repliedAt: new Date(),
            },
          },
        }
      );
      return res.status(200).json({ message: "Reply bhej di ✅" });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ============================================================
  //  /api/status/privacy  — privacy setting
  // ============================================================
  if (url.includes("/privacy")) {
    try {
      if (req.method === "POST") {
        const { userID, privacy } = req.body;
        if (!userID || !privacy)
          return res.status(400).json({ message: "Fields missing" });

        await UserPrivacy.findOneAndUpdate(
          { userID },
          { privacy },
          { upsert: true, new: true }
        );
        return res.status(200).json({ message: "Privacy update ho gayi ✅" });
      }

      if (req.method === "GET") {
        const { userID } = req.query;
        const doc = await UserPrivacy.findOne({ userID });
        return res.status(200).json({ privacy: doc?.privacy || "everyone" });
      }
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ============================================================
  //  /api/status  — Main CRUD (GET / POST / DELETE)
  // ============================================================

  // ── GET ──
  if (req.method === "GET") {
    try {
      const { viewerID } = req.query;
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const all   = await Status.find({ createdAt: { $gte: since } })
                               .sort({ createdAt: -1 });

      const grouped = {};
      for (const s of all) {
        if (viewerID && viewerID !== s.userID) {
          if (s.privacy === "nobody") continue;
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
          mediaUrl:    s.mediaUrl    || null,
          mediaType:   s.mediaType,
          caption:     s.caption,
          textContent: s.textContent || null,
          bgColor:     s.bgColor     || null,
          textColor:   s.textColor   || null,
          viewers:     s.viewers,
          reactions:   s.reactions,
          replies:     s.replies,
          createdAt:   s.createdAt,
        });
      }

      return res.status(200).json({ statuses: Object.values(grouped) });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ── POST ──
  if (req.method === "POST") {
    try {
      const {
        userID, userName,
        mediaUrl, mediaType,
        caption,
        textContent, bgColor, textColor,
        privacy,
      } = req.body;

      if (!userID)
        return res.status(400).json({ message: "userID chahiye" });
      if (mediaType !== "text" && !mediaUrl)
        return res.status(400).json({ message: "mediaUrl chahiye" });

      const status = await Status.create({
        userID,    userName,
        mediaUrl:    mediaUrl    || null,
        mediaType:   mediaType   || "image",
        caption:     caption     || "",
        textContent: textContent || null,
        bgColor:     bgColor     || null,
        textColor:   textColor   || null,
        privacy:     privacy     || "everyone",
        viewers:     [],
        reactions:   [],
        replies:     [],
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