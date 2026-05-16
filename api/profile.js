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
      let imageUrl = imageBase64;

      if (!imageBase64.startsWith("http")) {
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

        imageUrl = cloudData.secure_url;
      }

      if (userID && userID.length === 24) {
        await User.findByIdAndUpdate(userID, { image: imageUrl });
      }

      return res.status(200).json({
        message:  "Upload ho gayi ✅",
        imageUrl: imageUrl,
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
        name:       user.name,
        email:      user.email,
        image:      user.image          ?? "",
        bio:        user.bio            ?? "Hey there! I am using ZunO",

        // ── Privacy fields ──────────────────────────────────
        picPrivacy:     user.picPrivacy     ?? "everyone",
        // lastSeen field ka naam update karo
        lastSeenPrivacy: user.lastSeenPrivacy ?? "everyone",  // privacy setting
        lastSeenTime:    user.lastSeenTime ?? null,            // actual time
        hideOnline:     user.hideOnline     ?? false,
        aboutPrivacy:   user.aboutPrivacy   ?? "everyone",
        readReceipts:   user.readReceipts   ?? true,
        silenceUnknown: user.silenceUnknown ?? false,
      });
    } catch (e) {
      return res.status(500).json({ message: "Server error", error: e.message });
    }
  }

  // ── POST — profile / privacy update ─────────────────────────
  if (req.method === "POST") {
    try {
      const {
        userID,
        bio,
        picPrivacy,
        lastSeen,
        hideOnline,
        aboutPrivacy,
        readReceipts,
        silenceUnknown,
      } = req.body;

      if (!userID)
        return res.status(400).json({ message: "userID chahiye" });

      const updateFields = {};

      // Bio
      if (bio !== undefined) {
        updateFields.bio = bio;
      }

      // Profile photo privacy
      if (picPrivacy !== undefined) {
        const allowed = ["everyone", "nobody"];
        if (!allowed.includes(picPrivacy))
          return res.status(400).json({ message: "Invalid picPrivacy option" });
        updateFields.picPrivacy = picPrivacy;
      }

      // Last Seen
      if (lastSeen !== undefined) {
        const allowed = ["everyone", "contacts", "nobody"];
        if (!allowed.includes(lastSeen))
          return res.status(400).json({ message: "Invalid lastSeen option" });
        updateFields.lastSeen = lastSeen;
      }

      // Online Status hide
      if (hideOnline !== undefined) {
        updateFields.hideOnline = Boolean(hideOnline);
      }

      // About Privacy
      if (aboutPrivacy !== undefined) {
        const allowed = ["everyone", "contacts", "nobody"];
        if (!allowed.includes(aboutPrivacy))
          return res.status(400).json({ message: "Invalid aboutPrivacy option" });
        updateFields.aboutPrivacy = aboutPrivacy;
      }

      // Read Receipts (Blue ticks)
      if (readReceipts !== undefined) {
        updateFields.readReceipts = Boolean(readReceipts);
      }

      // Silence Unknown Callers
      if (silenceUnknown !== undefined) {
        updateFields.silenceUnknown = Boolean(silenceUnknown);
      }

      await User.findByIdAndUpdate(userID, updateFields);

      return res.status(200).json({ message: "Profile update ho gayi ✅" });
    } catch (e) {
      return res.status(500).json({ message: "Server error", error: e.message });
    }
  }

  return res.status(405).json({ message: "Method not allowed" });
}