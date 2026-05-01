import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const MONGODB_URI = "mongodb+srv://zahra:zahra111@cluster0.dwmo3jj.mongodb.net/project";
export const JWT_SECRET = "zahra_secret_key_123";

// MongoDB connect
export async function connectDB() {
  if (mongoose.connection.readyState >= 1) return;
  await mongoose.connect(MONGODB_URI);
}

// User Schema
const userSchema = new mongoose.Schema({
  name:      { type: String, required: true },
  email:     { type: String, required: true, unique: true },
  password:  { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

export const User = mongoose.models.User || mongoose.model("User", userSchema);

// ✅ Group Schema — NAYA ADD KARO
const groupSchema = new mongoose.Schema({
  name:      { type: String, required: true },
  createdBy: { type: String, required: true },
  members:   [{ type: String }],
  createdAt: { type: Date, default: Date.now }
});

export const Group = mongoose.models.Group || mongoose.model("Group", groupSchema);