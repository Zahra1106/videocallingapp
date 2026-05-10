import { connectDB, Status } from "../lib/db.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");

  if (req.method === "OPTIONS") return res.status(200).end();

  await connectDB();

  // GET — sab statuses lao
  if (req.method === "GET") {
    try {
      const statuses = await Status.find()
        .sort({ createdAt: -1 });

      // Group by userID
      const grouped = {};
      for (const s of statuses) {
        if (!grouped[s.userID]) {
          grouped[s.userID] = {
            userID:   s.userID,
            userName: s.userName,
            statuses: [],
          };
        }
        grouped[s.userID].statuses.push({
          id:        s._id.toString(),
          mediaUrl:  s.mediaUrl,
          mediaType: s.mediaType,
          caption:   s.caption,
          createdAt: s.createdAt,
        });
      }

      return res.status(200).json({ statuses: Object.values(grouped) });
    } catch (e) {
      return res.status(500).json({ message: "Server error", error: e.message });
    }
  }

  // POST — status add karo
  if (req.method === "POST") {
    try {
      const { userID, userName, mediaUrl, mediaType, caption } = req.body;

      if (!userID || !mediaUrl)
        return res.status(400).json({ message: "userID aur mediaUrl chahiye" });

      const status = await Status.create({
        userID, userName,
        mediaUrl, mediaType: mediaType ?? "image",
        caption: caption ?? "",
      });

      return res.status(201).json({ message: "Status add ho gaya ✅", status });
    } catch (e) {
      return res.status(500).json({ message: "Server error", error: e.message });
    }
  }

  // DELETE — status delete karo
  if (req.method === "DELETE") {
    try {
      const { statusID, userID } = req.body;

      const status = await Status.findById(statusID);
      if (!status) return res.status(404).json({ message: "Status nahi mila" });
      if (status.userID !== userID)
        return res.status(403).json({ message: "Sirf apna status delete karo" });

      await Status.findByIdAndDelete(statusID);
      return res.status(200).json({ message: "Status delete ho gaya ✅" });
    } catch (e) {
      return res.status(500).json({ message: "Server error", error: e.message });
    }
  }

  return res.status(405).json({ message: "Method not allowed" });
}