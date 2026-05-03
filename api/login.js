import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { connectDB, User, JWT_SECRET } from "../lib/db.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ message: "Method not allowed" });

  try {
    await connectDB();

    const { email, password } = req.body;

    if (!email || !password)
      return res.status(400).json({ message: "Email aur password dono chahiye" });

    const user = await User.findOne({ email });
    if (!user)
      return res.status(400).json({ message: "Email ya password galat hai" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch)
      return res.status(400).json({ message: "Email ya password galat hai" });

    const token = jwt.sign(
      { userId: user._id, email: user.email },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.status(200).json({
      message: "Login ho gaya! ✅",
      token,
      user: { 
        _id:   user._id.toString(),
        name:  user.name, 
        email: user.email 
      }
    });

  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
}