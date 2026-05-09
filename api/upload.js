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
    // ✅ FormData use karo JSON ki jagah
    const formData = new URLSearchParams();
    formData.append("file", imageBase64);
    formData.append("upload_preset", process.env.CLOUDINARY_UPLOAD_PRESET);

    const cloudRes = await fetch(
      `https://api.cloudinary.com/v1_1/${process.env.CLOUDINARY_CLOUD_NAME}/image/upload`,
      {
        method: "POST",
        body: formData,
      }
    );

    const cloudData = await cloudRes.json();
    console.log("Cloudinary:", JSON.stringify(cloudData));

    if (!cloudData.secure_url)
      return res.status(500).json({
        message: "Cloudinary upload failed",
        detail:  cloudData.error?.message ?? "unknown"
      });

    // DB update sirf real userID pe
    if (userID && userID.length === 24) {
      const { connectDB, User } = await import("../lib/db.js");
      await connectDB();
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