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
  name:            { type: String,  required: true },
  email:           { type: String,  required: true, unique: true },
  password:        { type: String,  required: true },
  // ✅ FIX 1: Phone number field add kiya — contacts ko number se access dene ke liye
  phone:           { type: String,  default: "" },
  image:           { type: String,  default: "" },
  isOnline:        { type: Boolean, default: false },
  lastSeenTime:    { type: Date,    default: null },
  expoPushToken:   { type: String,  default: "" },
  createdAt:       { type: Date,    default: Date.now },
  bio:             { type: String,  default: "Hey there! I am using ZunO" },
  lastSeenPrivacy: { type: String,  default: "everyone" },
  hideOnline:      { type: Boolean, default: false },
  aboutPrivacy:    { type: String,  default: "everyone" },
  readReceipts:    { type: Boolean, default: true },
  silenceUnknown:  { type: Boolean, default: false },
  picPrivacy:      { type: String,  default: "everyone" },
  picExceptList:   { type: [String], default: [] },

  // ✅ Custom Notifications per Contact
  customNotification: {
    tone:    { type: String,  default: "default" },
    vibrate: { type: Boolean, default: true },
    muted:   { type: Boolean, default: false },
  },
});

// ✅ FIX 2: Phone number pe index — fast lookup ke liye
userSchema.index({ phone: 1 }, { sparse: true });

export const User =
  mongoose.models.User || mongoose.model("User", userSchema);

// ─── STATUS ───────────────────────────────────────────────────
const statusSchema = new mongoose.Schema(
  {
    userID:      { type: String, required: true },
    userName:    { type: String, default: "" },
    mediaUrl:    { type: String, default: null },
    mediaType:   {
      type: String,
      enum: ["image", "video", "audio", "text"],
      default: "image",
    },
    textContent: { type: String, default: null },
    bgColor:     { type: String, default: "#1a1a2e" },
    textColor:   { type: String, default: "#ffffff" },
    caption:     { type: String, default: "" },
    privacy:     { type: String, default: "everyone" },
    // ✅ FIX 3: exceptList aur allowedList Status schema mein add kiye
    //    Pehle yeh fields sirf GET filter mein check ho rahi thin lekin
    //    schema mein exist nahi karti thin, isliye contacts_except kaam nahi karta tha
    exceptList:  { type: [String], default: [] },
    allowedList: { type: [String], default: [] },
    viewers: [{
      viewerID:   String,
      viewerName: String,
      viewedAt:   { type: Date, default: Date.now },
    }],
    reactions: [{
      reactorID:   String,
      reactorName: String,
      emoji:       String,
      reactedAt:   { type: Date, default: Date.now },
    }],
    replies: [{
      replyerID:   String,
      replyerName: String,
      message:     String,
      repliedAt:   { type: Date, default: Date.now },
    }],
  },
  { timestamps: true }
);
statusSchema.index({ createdAt: 1 }, { expireAfterSeconds: 86400 });
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
  exceptList:          { type: [String], default: [] },
  allowedList:         { type: [String], default: [] },
  description:         { type: String,   default: "" },
  inviteCode:          { type: String,   default: "" },
  pinnedMessages:      { type: [String], default: [] },
  // ✅ FIX 4: Group schema se embedded messages REMOVE kiye
  //    Group messages ab alag GroupMessage collection mein hain (groups.js mein hai)
  //    Yahan rakhnay se double data aur loading issues hote the
});
export const Group =
  mongoose.models.Group || mongoose.model("Group", groupSchema);

// ─── CHAT META ────────────────────────────────────────────────
const chatMetaSchema = new mongoose.Schema({
  userID:      { type: String, required: true, unique: true },
  favourites:  { type: [String], default: [] },
  archived:    { type: [String], default: [] },
  lockedChats: { type: [String], default: [] },
  lockCode:    { type: String,   default: "" },
});
export const ChatMeta =
  mongoose.models.ChatMeta || mongoose.model("ChatMeta", chatMetaSchema);

// ─── CHAT SETTINGS ────────────────────────────────────────────
const chatSettingsSchema = new mongoose.Schema({
  userID:     { type: String,  required: true },
  chatID:     { type: String,  required: true },
  isArchived: { type: Boolean, default: false },
  isLocked:   { type: Boolean, default: false },
  lockCode:   { type: String,  default: "" },
  clearedAt:  { type: Date,    default: null },
});
chatSettingsSchema.index({ userID: 1, chatID: 1 }, { unique: true });
export const ChatSettings =
  mongoose.models.ChatSettings ||
  mongoose.model("ChatSettings", chatSettingsSchema);

// ─── TYPING STATUS ────────────────────────────────────────────
const typingSchema = new mongoose.Schema({
  chatID:    { type: String, required: true, unique: true },
  userID:    { type: String, required: true },
  expiresAt: { type: Date,   required: true, index: { expires: 0 } },
});
export const TypingStatus =
  mongoose.models.TypingStatus || mongoose.model("TypingStatus", typingSchema);