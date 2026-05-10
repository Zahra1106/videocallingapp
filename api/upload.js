export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")
    return res.status(405).json({ message: "Method not allowed" });

  const { userID, imageBase64 } = req.body;

  if (!imageBase64)
    return res.status(400).json({ message: "image chahiye" });

  try {
    const isAudio = imageBase64.startsWith("data:audio");
    const resourceType = isAudio ? "video" : "image";

    const cloudRes = await fetch(
      `https://api.cloudinary.com/v1_1/dyacw4bca/${resourceType}/upload`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          file:          imageBase64,
          upload_preset: "zunocalling",
        }),
      }
    );

    const cloudData = await cloudRes.json();
    console.log("Cloudinary:", JSON.stringify(cloudData));

    if (!cloudData.secure_url)
      return res.status(500).json({
        message: "Cloudinary upload failed",
        detail:  cloudData.error?.message ?? "unknown",
      });

    if (userID && userID !== "voice" && userID.length === 24) {
      const { connectDB } = await import("../lib/db.js");
      const mongoose = (await import("mongoose")).default;
      await connectDB();
      const User = mongoose.models.User ||
        mongoose.model("User", new mongoose.Schema({}, { strict: false }));
      await User.findByIdAndUpdate(userID, { image: cloudData.secure_url });
    }

    return res.status(200).json({
      message:  "Upload ho gayi ✅",
      imageUrl: cloudData.secure_url,
    });

  } catch (e) {
    console.error("Upload error:", e);
    return res.status(500).json({ message: "Server error", error: e.message });
  }
}