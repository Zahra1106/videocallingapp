import { connectDB, User } from "../lib/db.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");

  if (req.method === "OPTIONS") return res.status(200).end();

  await connectDB();

  const url = req.url.split("?")[0];

  // ── UPLOAD ──────────────────────────────────────────────────
  if (url.includes("/upload")) {
    if (req.method !== "POST")
      return res.status(405).json({ message: "Method not allowed" });

    const { userID, imageBase64 } = req.body;
    if (!imageBase64)
      return res.status(400).json({ message: "image chahiye" });

    try {
      const formData = new URLSearchParams();
      formData.append("file", imageBase64);
      formData.append("upload_preset", process.env.CLOUDINARY_UPLOAD_PRESET);

      const cloudRes = await fetch(
        `https://api.cloudinary.com/v1_1/${process.env.CLOUDINARY_CLOUD_NAME}/image/upload`,
        { method: "POST", body: formData }
      );

      const cloudData = await cloudRes.json();

      if (!cloudData.secure_url)
        return res.status(500).json({
          message: "Upload failed",
          detail:  cloudData.error?.message,
        });

      if (userID && userID.length === 24) {
        await User.findByIdAndUpdate(userID, { image: cloudData.secure_url });
      }

      return res.status(200).json({
        message:  "Upload ho gayi ✅",
        imageUrl: cloudData.secure_url,
      });
    } catch (e) {
      return res.status(500).json({ message: "Server error", error: e.message });
    }
  }

  // ── GET — profile lao ───────────────────────────────────────
  if (req.method === "GET") {
    try {
      const { userID } = req.query;
      if (!userID)
        return res.status(400).json({ message: "userID chahiye" });

      const user = await User.findById(userID, { password: 0 });
      if (!user)
        return res.status(404).json({ message: "User nahi mila" });

      return res.status(200).json({
        name:  user.name,
        email: user.email,
        image: user.image ?? "",
        bio:   user.bio   ?? "Hey there! I am using ZunO",
      });
    } catch (e) {
      return res.status(500).json({ message: "Server error", error: e.message });
    }
  }

  // ── POST — bio update ───────────────────────────────────────
  if (req.method === "POST") {
    try {
      const { userID, bio } = req.body;
      if (!userID)
        return res.status(400).json({ message: "userID chahiye" });

      await User.findByIdAndUpdate(userID, { bio });

      return res.status(200).json({ message: "Bio update ho gayi ✅" });
    } catch (e) {
      return res.status(500).json({ message: "Server error", error: e.message });
    }
  }

  return res.status(405).json({ message: "Method not allowed" });
}