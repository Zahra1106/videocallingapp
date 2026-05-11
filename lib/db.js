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
  isOnline:  { type: Boolean, default: false }, // ✅ add
  lastSeen:  { type: Date, default: null },      // ✅ add
  fcmToken:  { type: String, default: "" }, // ✅ add
  createdAt: { type: Date, default: Date.now },
  bio:       { type: String, default: "Hey there! I am using ZunO" }, // ✅ add
  picPrivacy: { type: String, default: "everyone" },
});

export const User = mongoose.models.User || mongoose.model("User", userSchema);

const statusSchema = new mongoose.Schema({
  userID:    { type: String, required: true },
  userName:  { type: String, required: true },
  mediaUrl:  { type: String, required: true },
  mediaType: { type: String, enum: ["image", "video"], default: "image" },
  caption:   { type: String, default: "" },
  createdAt: { type: Date, default: Date.now, expires: 86400 }, // 24 hour auto delete
});

export const Status = mongoose.models.Status || mongoose.model("Status", statusSchema);

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
  isPoll:     { type: Boolean, default: false },  // ✅
  poll: {                                          // ✅
    question: { type: String },
    options:  [{ text: String, votes: [String] }],
  },
}],
});

export const Group = mongoose.models.Group || mongoose.model("Group", groupSchema);