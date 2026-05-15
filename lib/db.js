// lib/db.js
import mongoose from "mongoose";

export const JWT_SECRET = process.env.JWT_SECRET;

export async function connectDB() {
  if (mongoose.connection.readyState >= 1) return;
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI nahi mili! .env file check karo.");
  await mongoose.connect(uri);
}

// ─── USER ─────────────────────────────────────────────────────
const userSchema = new mongoose.Schema({
  name:       { type: String,  required: true },
  email:      { type: String,  required: true, unique: true },
  password:   { type: String,  required: true },
  image:      { type: String,  default: "" },
  isOnline:   { type: Boolean, default: false },
  lastSeen:   { type: Date,    default: null },
  fcmToken:   { type: String,  default: "" },
  createdAt:  { type: Date,    default: Date.now },
  bio:        { type: String,  default: "Hey there! I am using ZunO" },
  picPrivacy: { type: String,  default: "everyone" },
});

export const User =
  mongoose.models.User || mongoose.model("User", userSchema);

// ─── STATUS ───────────────────────────────────────────────────
const statusSchema = new mongoose.Schema({
  userID:    { type: String, required: true },
  userName:  { type: String, required: true },
  mediaUrl:  { type: String, required: true },
  mediaType: { type: String, enum: ["image", "video"], default: "image" },
  caption:   { type: String, default: "" },
  createdAt: { type: Date,   default: Date.now, expires: 86400 },
});

export const Status =
  mongoose.models.Status || mongoose.model("Status", statusSchema);

// ─── GROUP ────────────────────────────────────────────────────
const groupSchema = new mongoose.Schema({
  name:                { type: String,  required: true },
  createdBy:           { type: String,  required: true },
  creatorName:         { type: String,  default: "" },
  members:             [{ type: String }],
  onlyAdminCanMessage: { type: Boolean, default: false },
  lastMessage:         { type: String,  default: "" },
  lastMessageTime:     { type: Date,    default: Date.now },
  createdAt:           { type: Date,    default: Date.now },

  messages: [{
    senderID:    { type: String },
    senderName:  { type: String },
    text:        { type: String,  default: "" },
    timestamp:   { type: Date,    default: Date.now },

    // ── Media ────────────────────────────────────────────
    imageUrl:    { type: String,  default: "" },
    voiceUrl:    { type: String,  default: "" },

    // ── Document ─────────────────────────────────────────
    documentUrl:  { type: String, default: "" },
    documentName: { type: String, default: "" },
    documentSize: { type: Number, default: 0 },
    documentType: { type: String, default: "" },

    // ── Location ─────────────────────────────────────────
    location: {
      lat:     { type: Number, default: null },
      lng:     { type: Number, default: null },
      address: { type: String, default: "" },
      isLive:  { type: Boolean, default: false },
    },

    // ── Reply To ─────────────────────────────────────────
    replyTo: {
      _id:          { type: String, default: "" },
      senderID:     { type: String, default: "" },
      senderName:   { type: String, default: "" },
      text:         { type: String, default: "" },
      imageUrl:     { type: String, default: "" },
      voiceUrl:     { type: String, default: "" },
      documentUrl:  { type: String, default: "" },
      documentName: { type: String, default: "" },
    },

    // ── Poll ─────────────────────────────────────────────
    isPoll:  { type: Boolean, default: false },
    poll: {
      question: { type: String },
      options:  [{ text: String, votes: [String] }],
    },

    // ── Reactions ────────────────────────────────────────
    reactions: { type: Map, of: String, default: {} },

    // ── Read receipts ────────────────────────────────────
    readBy: { type: [String], default: [] },

    // ── View Once ────────────────────────────────────────
    viewOnce:  { type: Boolean,  default: false },
    viewedBy:  { type: [String], default: [] },

    // ── Disappear After ──────────────────────────────────
    disappearAfter: { type: Number, default: 0 },
    disappearsAt:   { type: Number, default: 0 },

    // ── Edit ─────────────────────────────────────────────
    isEdited: { type: Boolean, default: false },
    editedAt: { type: Date,    default: null },

    // ── Delete ───────────────────────────────────────────
    deletedFor:           { type: [String], default: [] },
    isDeletedForEveryone: { type: Boolean,  default: false },
  }],
});

export const Group =
  mongoose.models.Group || mongoose.model("Group", groupSchema);