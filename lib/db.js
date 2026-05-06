import mongoose from "mongoose";

export const JWT_SECRET = process.env.JWT_SECRET;

export async function connectDB() {
  if (mongoose.connection.readyState >= 1) return;

  const uri = process.env.MONGODB_URI;

  if (!uri) {
    throw new Error("MONGODB_URI nahi mili! .env file check karo.");
  }

  await mongoose.connect(uri);
}

const userSchema = new mongoose.Schema({
  name:      { type: String, required: true },
  email:     { type: String, required: true, unique: true },
  password:  { type: String, required: true },
  image:     { type: String, default: "" },
  createdAt: { type: Date, default: Date.now }
});

export const User = mongoose.models.User || mongoose.model("User", userSchema);

const groupSchema = new mongoose.Schema({
  name:            { type: String, required: true },
  createdBy:       { type: String, required: true },
  creatorName:     { type: String, default: "" },
  members:         [{ type: String }],
  lastMessage:     { type: String, default: "" },
  lastMessageTime: { type: Date, default: Date.now },
  createdAt:       { type: Date, default: Date.now },

  // Messages embedded ─────────────────────────────────────────
  messages: [{
    senderID:   { type: String },
    senderName: { type: String },
    text:       { type: String },
    timestamp:  { type: Date, default: Date.now },
  }],
});

export const Group = mongoose.models.Group || mongoose.model("Group", groupSchema);