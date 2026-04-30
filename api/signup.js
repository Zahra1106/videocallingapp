import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { connectDB, User, JWT_SECRET } from "../lib/db.js";

export default async function handler(req, res) {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ message: "Method not allowed" });

  try {
    await connectDB();

    const { name, email, password } = req.body;

    if (!name || !email || !password)
      return res.status(400).json({ message: "Sab fields bharo" });

    const existingUser = await User.findOne({ email });
    if (existingUser)
      return res.status(400).json({ message: "Email pehle se registered hai" });

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({ name, email, password: hashedPassword });
    await newUser.save();

    const token = jwt.sign(
      { userId: newUser._id, email: newUser.email },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.status(201).json({
      message: "Account ban gaya! ✅",
      token,
      user: { name: newUser.name, email: newUser.email }
    });

  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
}