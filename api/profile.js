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
            detail: cloudData.error?.message,
          });

        imageUrl = cloudData.secure_url;
      }

      if (userID && userID.length === 24) {
        await User.findByIdAndUpdate(userID, { image: imageUrl });
      }

      return res.status(200).json({
        message: "Upload ho gayi ✅",
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
        name:  user.name,
        email: user.email,
        // ✅ FIX: Phone number profile GET mein bhi return karo
        phone: user.phone ?? "",
        image: user.image ?? "",
        bio:   user.bio   ?? "Hey there! I am using ZunO",

        picPrivacy:      user.picPrivacy      ?? "everyone",
        picExceptList:   user.picExceptList   ?? [],
        lastSeenPrivacy: user.lastSeenPrivacy ?? "everyone",
        lastSeenTime:    user.lastSeenTime    ?? null,
        hideOnline:      user.hideOnline      ?? false,
        aboutPrivacy:    user.aboutPrivacy    ?? "everyone",
        readReceipts:    user.readReceipts    ?? true,
        silenceUnknown:  user.silenceUnknown  ?? false,
      });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ── POST — profile / privacy update ─────────────────────────
  if (req.method === "POST") {
    try {
      const {
        userID,
        name,
        bio,
        phone,           // ✅ FIX: Phone update support
        picPrivacy,
        picExceptList,
        lastSeen,
        hideOnline,
        aboutPrivacy,
        readReceipts,
        silenceUnknown,
      } = req.body;

      if (!userID)
        return res.status(400).json({ message: "userID chahiye" });

      const updateFields = {};

      if (name !== undefined && name.trim() !== "") {
        updateFields.name = name.trim();
      }

      if (bio !== undefined) {
        updateFields.bio = bio;
      }

      // ✅ FIX: Phone number update karo (with format cleanup)
      if (phone !== undefined && phone.trim() !== "") {
        let cleanPhone = phone.replace(/\s+/g, "");
        if (cleanPhone.startsWith("0")) {
          cleanPhone = "+92" + cleanPhone.slice(1);
        }
        // Check duplicate — apne alawa koi aur same number na rakhe
        const existing = await User.findOne({ phone: cleanPhone, _id: { $ne: userID } });
        if (existing)
          return res.status(400).json({ message: "Yeh number pehle se registered hai" });
        updateFields.phone = cleanPhone;
      }

      if (picPrivacy !== undefined) {
        const allowed = ["everyone", "contacts_except", "nobody"];
        if (!allowed.includes(picPrivacy))
          return res.status(400).json({ message: "Invalid picPrivacy option" });
        updateFields.picPrivacy = picPrivacy;
      }

      if (picExceptList !== undefined) {
        if (!Array.isArray(picExceptList))
          return res.status(400).json({ message: "picExceptList array hona chahiye" });
        updateFields.picExceptList = picExceptList;
      }

      if (lastSeen !== undefined) {
        const allowed = ["everyone", "contacts", "nobody"];
        if (!allowed.includes(lastSeen))
          return res.status(400).json({ message: "Invalid lastSeen option" });
        updateFields.lastSeenPrivacy = lastSeen;
      }

      if (hideOnline !== undefined) {
        updateFields.hideOnline = Boolean(hideOnline);
      }

      if (aboutPrivacy !== undefined) {
        const allowed = ["everyone", "contacts", "nobody"];
        if (!allowed.includes(aboutPrivacy))
          return res.status(400).json({ message: "Invalid aboutPrivacy option" });
        updateFields.aboutPrivacy = aboutPrivacy;
      }

      if (readReceipts !== undefined) {
        updateFields.readReceipts = Boolean(readReceipts);
      }

      if (silenceUnknown !== undefined) {
        updateFields.silenceUnknown = Boolean(silenceUnknown);
      }

      await User.findByIdAndUpdate(userID, { $set: updateFields });

      return res.status(200).json({ message: "Profile update ho gayi ✅" });
    } catch (e) {
      return res.status(500).json({ message: "Server error", error: e.message });
    }
  }

  return res.status(405).json({ message: "Method not allowed" });
}