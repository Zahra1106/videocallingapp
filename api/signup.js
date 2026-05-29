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

    const { name, email, password, phone } = req.body;

    if (!name || !email || !password)
      return res.status(400).json({ message: "Sab fields bharo" });

    const existingUser = await User.findOne({ email });
    if (existingUser)
      return res.status(400).json({ message: "Email pehle se registered hai" });

    // ✅ FIX: Phone number save karo signup pe
    let cleanPhone = "";
    if (phone && phone.trim() !== "") {
      cleanPhone = phone.replace(/\s+/g, "");
      if (cleanPhone.startsWith("0")) {
        cleanPhone = "+92" + cleanPhone.slice(1);
      }
      // Check karo yeh number kisi aur ka to nahi
      const existingPhone = await User.findOne({ phone: cleanPhone });
      if (existingPhone)
        return res.status(400).json({ message: "Yeh number pehle se registered hai" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({
      name,
      email,
      password: hashedPassword,
      phone: cleanPhone,
    });
    await newUser.save();

    const token = jwt.sign(
      { userId: newUser._id, email: newUser.email },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.status(201).json({
      message: "Account ban gaya! ✅",
      token,
      user: {
        _id:   newUser._id.toString(),
        name:  newUser.name,
        email: newUser.email,
        phone: newUser.phone,
      }
    });

  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
}