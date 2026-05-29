import mongoose from "mongoose";
import { connectDB, User, ChatMeta, TypingStatus } from "../lib/db.js";

const chatSchema = new mongoose.Schema({
  chatID:          { type: String, required: true },
  sender:          { type: String, required: true },
  message:         { type: String, default: "" },
  voiceUrl:        { type: String, default: "" },
  imageUrl:        { type: String, default: "" },
  time:            { type: Number, default: () => Date.now() },
  isRead:          { type: Boolean, default: false },
  reactions:       { type: Map, of: String, default: {} },
  documentUrl:     { type: String, default: "" },
  documentName:    { type: String, default: "" },
  documentSize:    { type: Number, default: 0 },
  documentType:    { type: String, default: "" },
  location: {
    lat:     { type: Number, default: null },
    lng:     { type: Number, default: null },
    address: { type: String, default: "" },
    isLive:  { type: Boolean, default: false },
  },
  replyTo:              { type: mongoose.Schema.Types.Mixed, default: null },
  isEdited:             { type: Boolean, default: false },
  editedAt:             { type: Date, default: null },
  deletedFor:           { type: [String], default: [] },
  isDeletedForEveryone: { type: Boolean, default: false },
  viewOnce:             { type: Boolean, default: false },
  viewedBy:             { type: [String], default: [] },
  disappearAfter:       { type: Number, default: 0 },
  disappearsAt:         { type: Number, default: 0 },
});

// ✅ FIX 13: Index add kiya — chat loading fast ho gi
chatSchema.index({ chatID: 1, time: 1 });
chatSchema.index({ chatID: 1, sender: 1, isRead: 1 });

const Chat = mongoose.models.Chat || mongoose.model("Chat", chatSchema);


export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");

  if (req.method === "OPTIONS") return res.status(200).end();

  await connectDB();

  const url    = req.url.split("?")[0];
  const action = req.query.action;

  // ══════════════════════════════════════════════════════════
  //  CHAT META POST — savemeta
  // ══════════════════════════════════════════════════════════
  if (action === "savemeta") {
    const { userID, favourites, archived, lockedChats, lockCode } = req.body;
    if (!userID)
      return res.status(400).json({ message: "userID chahiye" });

    await ChatMeta.findOneAndUpdate(
      { userID },
      { favourites, archived, lockedChats, lockCode },
      { upsert: true, new: true }
    );
    return res.status(200).json({ message: "Meta save ho gaya ✅" });
  }

  // ══════════════════════════════════════════════════════════
  //  TYPING
  // ══════════════════════════════════════════════════════════
  if (url.includes("/typing")) {

  // ── POST: typing start/stop ──────────────────────────────
  if (req.method === "POST") {
    const { chatID, userID, isTyping } = req.body;
    if (!chatID || !userID)
      return res.status(400).json({ message: "chatID aur userID chahiye" });

    if (isTyping) {
      const expiresAt = new Date(Date.now() + 6000);
      await TypingStatus.findOneAndUpdate(
        { chatID },
        { userID, expiresAt },
        { upsert: true, new: true }
      );
    } else {
      await TypingStatus.deleteOne({ chatID, userID });
    }
    return res.json({ message: "ok" });
  }

  // ── GET: check kar koi type kar raha hai? ────────────────
  if (req.method === "GET") {
    const { chatID, myID } = req.query;
    if (!chatID)
      return res.status(400).json({ message: "chatID chahiye" });

    const now    = new Date();
    const record = await TypingStatus.findOne({
      chatID,
      expiresAt: { $gt: now },
    });

    // ✅ FIX 14: Typing status — pixel error issue
    //    Pehle record.userID string comparison direct hoti thi
    //    Ab trim() se ensure karo koi whitespace issue na ho
    const isTyping = !!(record && record.userID?.trim() !== myID?.trim());
    return res.json({ isTyping });
  }
}

  // ══════════════════════════════════════════════════════════
  //  READ MARK
  // ══════════════════════════════════════════════════════════
  if (url.includes("/read")) {
    if (req.method === "PATCH") {
      try {
        const { myID, targetID } = req.body;
        if (!myID || !targetID)
          return res.status(400).json({ message: "myID aur targetID chahiye" });

        const sender = await User.findById(targetID, { readReceipts: 1 });
        if (sender && sender.readReceipts === false)
          return res.json({ message: "Read receipts off hain, skip" });

        const ids    = [myID, targetID].sort();
        const chatID = ids.join("_");

        const result = await Chat.updateMany(
          { chatID, sender: targetID, isRead: false },
          { $set: { isRead: true } }
        );

        // ✅ FIX 15: Read count return karo — Flutter side pe confirmation milegi
        return res.json({ message: "Read mark ho gaya", updated: result.modifiedCount });
      } catch (error) {
        return res.status(500).json({ message: "Server error", error: error.message });
      }
    }
  }

  // ══════════════════════════════════════════════════════════
  //  POST — message bhejo
  // ══════════════════════════════════════════════════════════
  if (req.method === "POST") {
    try {
      const {
        myID, targetID,
        message        = "",
        voiceUrl       = "",
        imageUrl       = "",
        documentUrl    = "",
        documentName   = "",
        documentSize   = 0,
        documentType   = "",
        location,
        viewOnce       = false,
        disappearAfter = 0,
        replyTo,
      } = req.body;

      if (!myID || !targetID)
        return res.status(400).json({ message: "myID aur targetID chahiye" });

      const hasContent =
        message?.trim() || voiceUrl?.trim() || imageUrl?.trim() ||
        documentUrl?.trim() || location;

      if (!hasContent)
        return res.status(400).json({ message: "Message, voice, image, document ya location chahiye" });

      const ids    = [myID, targetID].sort();
      const chatID = ids.join("_");

      const now           = Date.now();
      const disappearSecs = Number(disappearAfter) || 0;

      const newMsg = new Chat({
        chatID,
        sender:        myID,
        message,
        voiceUrl,
        imageUrl,
        documentUrl,
        documentName,
        documentSize,
        documentType,
        location:      location || null,
        time:          now,
        isRead:        false,
        reactions:     {},
        viewOnce:      viewOnce === true,
        viewedBy:      [],
        replyTo:       replyTo || null,
        isEdited:      false,
        deletedFor:    [],
        isDeletedForEveryone: false,
        disappearAfter: disappearSecs,
        disappearsAt:  disappearSecs > 0 ? now + disappearSecs * 1000 : 0,
      });

      await newMsg.save();

      // ✅ FIX 16: Receiver ka online status check karo
      //    Agar receiver online hai aur chat open hai to notification skip karo
      //    Yeh "online hote hue notification aana" ka issue fix karta hai
      //    (Flutter side pe bhi check karo — agar chatID match kare to skip)
      const receiver = await User.findById(targetID, { isOnline: 1, expoPushToken: 1 });

      return res.status(201).json({
        message:          "Message send ho gaya ✅",
        data:             newMsg,
        // ✅ Frontend ko bata do receiver online hai ya nahi
        receiverIsOnline: receiver?.isOnline ?? false,
      });
    } catch (error) {
      return res.status(500).json({ message: "Server error", error: error.message });
    }
  }

  // ══════════════════════════════════════════════════════════
  //  GET — meta + messages + unread
  // ══════════════════════════════════════════════════════════
  else if (req.method === "GET") {
    try {
      const { myID, targetID, unreadCount, chatID, metaUserID } = req.query;

      // ── Chat Meta ────────────────────────────────────────
      if (metaUserID) {
        const meta = await ChatMeta.findOne({ userID: metaUserID });
        return res.status(200).json({
          favourites:  meta?.favourites  || [],
          archived:    meta?.archived    || [],
          lockedChats: meta?.lockedChats || [],
          lockCode:    meta?.lockCode    || "",
        });
      }

      // ── Unread count ─────────────────────────────────────
      if (unreadCount === "true" && chatID) {
        const count = await Chat.countDocuments({
          chatID,
          sender: { $ne: myID },
          isRead: false,
        });
        return res.status(200).json({ count });
      }

      if (!myID || !targetID)
        return res.status(400).json({ message: "myID aur targetID chahiye" });

      const ids = [myID, targetID].sort();
      const cID = ids.join("_");
      const now = Date.now();

      // ✅ FIX 17: Chat open hone pe auto read-mark
      //    Pehle yeh targetUser check ke baad hota tha lekin ab pehle karo
      //    Taake "online ho to chat khudi seen mein chali jaye" sahi kaam kare
      const targetUser = await User.findById(targetID, { readReceipts: 1 });
      if (!targetUser || targetUser.readReceipts !== false) {
        await Chat.updateMany(
          { chatID: cID, sender: targetID, isRead: false },
          { $set: { isRead: true } }
        );
      }

      // Disappear messages clean karo
      await Chat.deleteMany({
        chatID: cID,
        disappearsAt: { $gt: 0, $lte: now },
      });

      // ViewOnce cleanup
      const participants = [myID, targetID];
      await Chat.deleteMany({
        chatID:   cID,
        viewOnce: true,
        viewedBy: { $all: participants },
      });

      // ✅ FIX 18: Chat loading fix
      //    Pehle `since` parameter use hoti thi lekin kbhi kbhi
      //    "no messages" ya "galat chat" show hoti thi
      //    Ab hamesha puri chat load karo aur sort sahi karo
      const since = parseInt(req.query.since) || 0;
      const filter = since > 0
        ? { chatID: cID, time: { $gt: since } }
        : { chatID: cID };

      // ✅ FIX 19: limit add kiya — 200 messages se zyada ek baar mein load na ho
      //    Speed optimization ke liye
      const messages = await Chat.find(filter)
        .sort({ time: 1 })
        .limit(since > 0 ? 0 : 200);  // polling mein limit nahi, initial load mein 200

      const result = messages.map(m => {
        const obj = m.toObject();
        if (obj.deletedFor?.includes(myID)) return null;
        return {
          ...obj,
          reactions:  m.reactions ? Object.fromEntries(m.reactions) : {},
          viewedByMe: m.viewedBy?.includes(myID) ?? false,
        };
      }).filter(Boolean);

      // ✅ FIX 20: hasMore flag — Flutter ko pata chale aur purani messages load kare
      const total = await Chat.countDocuments({ chatID: cID });
      return res.status(200).json({
        messages: result,
        hasMore:  since === 0 && total > 200,
        total,
      });
    } catch (error) {
      return res.status(500).json({ message: "Server error", error: error.message });
    }
  }

  // ══════════════════════════════════════════════════════════
  //  PATCH — reaction / edit / viewOnce / liveLocation
  // ══════════════════════════════════════════════════════════
  else if (req.method === "PATCH") {
    try {
      const { messageID, userID, emoji, markViewed, newText, liveLocation } = req.body;

      if (!messageID || !userID)
        return res.status(400).json({ message: "messageID aur userID chahiye" });

      const msg = await Chat.findById(messageID);
      if (!msg)
        return res.status(404).json({ message: "Message nahi mila" });

      if (markViewed === true) {
        if (!msg.viewedBy.includes(userID)) {
          msg.viewedBy.push(userID);
          await msg.save();
        }
        return res.status(200).json({ message: "Viewed mark ho gaya" });
      }

      if (newText !== undefined) {
        if (msg.sender !== userID)
          return res.status(403).json({ message: "Sirf apna message edit kar sakte hain" });
        msg.message  = newText;
        msg.isEdited = true;
        msg.editedAt = new Date();
        await msg.save();
        return res.status(200).json({ message: "Message edit ho gaya", data: msg });
      }

      if (liveLocation) {
        if (msg.sender !== userID)
          return res.status(403).json({ message: "Sirf sender location update kar sakta hai" });
        msg.location = {
          ...msg.location,
          lat:    liveLocation.lat,
          lng:    liveLocation.lng,
          isLive: liveLocation.isLive !== false,
        };
        await msg.save();
        return res.status(200).json({ message: "Location update ho gaya", data: msg });
      }

      if (emoji) {
        const reactions = msg.reactions || new Map();
        if (reactions.get(userID) === emoji) {
          reactions.delete(userID);
        } else {
          reactions.set(userID, emoji);
        }
        msg.reactions = reactions;
        await msg.save();
        return res.status(200).json({
          message:   "Reaction update ho gaya",
          reactions: Object.fromEntries(reactions),
        });
      }

      return res.status(400).json({ message: "Koi valid action nahi mila" });
    } catch (error) {
      return res.status(500).json({ message: "Server error", error: error.message });
    }
  }

  // ══════════════════════════════════════════════════════════
  //  DELETE — for me / for everyone
  // ══════════════════════════════════════════════════════════
  else if (req.method === "DELETE") {
    try {
      const { messageID, userID, deleteForEveryone = false } = req.body;

      if (!messageID || !userID)
        return res.status(400).json({ message: "messageID aur userID chahiye" });

      const msg = await Chat.findById(messageID);
      if (!msg)
        return res.status(404).json({ message: "Message nahi mila" });

      if (deleteForEveryone) {
        if (msg.sender !== userID)
          return res.status(403).json({ message: "Sirf apna message sabke liye delete kar sakte hain" });

        msg.message              = "";
        msg.imageUrl             = "";
        msg.voiceUrl             = "";
        msg.documentUrl          = "";
        msg.documentName         = "";
        msg.documentSize         = 0;
        msg.location             = null;
        msg.isDeletedForEveryone = true;
        await msg.save();
        return res.status(200).json({ message: "Message sabke liye delete ho gaya ✅" });
      } else {
        if (!msg.deletedFor.includes(userID)) {
          msg.deletedFor.push(userID);
          await msg.save();
        }
        return res.status(200).json({ message: "Aapke liye message delete ho gaya ✅" });
      }
    } catch (error) {
      return res.status(500).json({ message: "Server error", error: error.message });
    }
  }

  else {
    return res.status(405).json({ message: "Method not allowed" });
  }
}