import { connectDB, User } from "../lib/db.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ message: "Method not allowed" });

  try {
    await connectDB();

    const { currentUserID } = req.query;

    const users = await User.find(
      { _id: { $ne: currentUserID } },
      { name: 1, email: 1, image: 1 }
    );

    const userList = users.map(u => ({
      uid  : u._id,
      name : u.name,
      email: u.email,
      image: u.image ?? "",
    }));

    res.status(200).json({ users: userList });

  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
}