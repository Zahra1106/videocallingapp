import { connectDB } from "../lib/db.js";
import mongoose from "mongoose";

const userSchema = new mongoose.Schema({}, { strict: false });
const User = mongoose.models.User || mongoose.model("User", userSchema);

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
    // ✅ Proper FormData — Cloudinary base64 aise accept karta hai
    const { FormData, Blob } = await import("node-fetch");

    // base64 string se buffer banao
    const base64Data = imageBase64.replace(/^data:\w+\/\w+;base64,/, "");
    const buffer = Buffer.from(base64Data, "base64");

    // content type detect karo
    const isAudio = imageBase64.startsWith("data:audio");
    const mimeType = isAudio ? "audio/m4a" : "image/jpeg";
    const resourceType = isAudio ? "video" : "image"; // Cloudinary audio ko "video" mein upload karta hai

    const blob = new Blob([buffer], { type: mimeType });

    const formData = new FormData();
    formData.append("file", blob, isAudio ? "voice.m4a" : "image.jpg");
    formData.append("upload_preset", process.env.CLOUDINARY_UPLOAD_PRESET);

    const cloudRes = await fetch(
      `https://api.cloudinary.com/v1_1/${process.env.CLOUDINARY_CLOUD_NAME}/${resourceType}/upload`,
      {
        method: "POST",
        body: formData,
      }
    );

    const cloudData = await cloudRes.json();
    console.log("Cloudinary response:", JSON.stringify(cloudData));

    if (!cloudData.secure_url)
      return res.status(500).json({
        message: "Cloudinary upload failed",
        detail: cloudData.error?.message ?? "unknown",
      });

    // ✅ DB update sirf real userID pe (image only)
    if (userID && userID !== "voice" && userID.length === 24) {
      await connectDB();
      await User.findByIdAndUpdate(userID, { image: cloudData.secure_url });
    }

    return res.status(200).json({
      message: "Upload ho gayi ✅",
      imageUrl: cloudData.secure_url,
    });

  } catch (e) {
    console.error("Upload error:", e);
    return res.status(500).json({ message: "Server error", error: e.message });
  }
}