import { connectDB, User } from "../lib/db.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");

  if (req.method === "OPTIONS") return res.status(200).end();

  await connectDB();

  // GET — profile lao
  if (req.method === "GET") {
    try {
      const { userID } = req.query;
      if (!userID) return res.status(400).json({ message: "userID chahiye" });

      const user = await User.findById(userID, { password: 0 });
      if (!user) return res.status(404).json({ message: "User nahi mila" });

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

  // POST — bio update karo
  if (req.method === "POST") {
    try {
      const { userID, bio } = req.body;
      if (!userID) return res.status(400).json({ message: "userID chahiye" });

      await User.findByIdAndUpdate(userID, { bio });

      return res.status(200).json({ message: "Bio update ho gayi ✅" });
    } catch (e) {
      return res.status(500).json({ message: "Server error", error: e.message });
    }
  }

  return res.status(405).json({ message: "Method not allowed" });
}