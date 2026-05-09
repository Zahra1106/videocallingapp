import { connectDB, User } from "../lib/db.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")
    return res.status(405).json({ message: "Method not allowed" });

  await connectDB();

  const { userID, imageBase64 } = req.body;

  if (!imageBase64)
    return res.status(400).json({ message: "image chahiye" });

  try {
    const cloudRes = await fetch(
      `https://api.cloudinary.com/v1_1/${process.env.CLOUDINARY_CLOUD_NAME}/image/upload`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          file:          imageBase64,
          upload_preset: process.env.CLOUDINARY_UPLOAD_PRESET,
        }),
      }
    );

    const cloudData = await cloudRes.json();

    if (!cloudData.secure_url)
      return res.status(500).json({
        message: "Image upload failed",
        detail:  cloudData
      });

    // ✅ Sirf tab DB update karo jab real userID ho
    if (userID && userID !== "voice" && userID.length === 24) {
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