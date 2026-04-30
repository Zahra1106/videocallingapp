import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const MONGODB_URI = "mongodb+srv://zahra:zahra111@cluster0.dwmo3jj.mongodb.net/project";
export const JWT_SECRET = "zahra_secret_key_123";

// MongoDB connect
export async function connectDB() {
  if (mongoose.connection.readyState >= 1) return; // pehle se connected hai
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