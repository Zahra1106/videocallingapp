import { connectDB, Group, User } from "../lib/db.js";
import mongoose from "mongoose";
import fetch from "node-fetch";

// naya: group message aane pe members ko push notification bhejne ka helper
async function sendGroupMessagePush({ expoPushToken, title, preview }) {
  try {
    await fetch("https://exp.host/--/api/v2/push/send", {
      method:  "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({
        to:    expoPushToken,
        sound: "default",
        title,
        body:  preview,
        data:  { type: "new_group_message" },
      }),
    });
  } catch (e) {
    console.error("Group message push error (ignored):", e.message);
  }
}

// ─── SCHEMAS ──────────────────────────────────────────────────

const locationSchema = new mongoose.Schema(
  {
    lat:     { type: Number, required: true },
    lng:     { type: Number, required: true },
    address: { type: String, default: "" },
    isLive:  { type: Boolean, default: false },
  },
  { _id: false }
);

const pollOptionSchema = new mongoose.Schema(
  {
    text:  { type: String, required: true },
    votes: { type: [String], default: [] },
  },
  { _id: false }
);

const replyToSchema = new mongoose.Schema(
  {
    _id:          { type: String },
    senderID:     { type: String },
    senderName:   { type: String },
    text:         { type: String, default: "" },
    imageUrl:     { type: String, default: "" },
    voiceUrl:     { type: String, default: "" },
    documentUrl:  { type: String, default: "" },
    documentName: { type: String, default: "" },
  },
  { _id: false }
);

const groupMessageSchema = new mongoose.Schema(
  {
    groupID:    { type: String, required: true, index: true },
    senderID:   { type: String, required: true },
    senderName: { type: String, default: "" },

    text:         { type: String, default: "" },
    imageUrl:     { type: String, default: "" },
    voiceUrl:     { type: String, default: "" },

    documentUrl:  { type: String, default: "" },
    documentName: { type: String, default: "" },
    documentSize: { type: Number, default: 0 },
    documentType: { type: String, default: "" },

    location: { type: locationSchema, default: null },

    isPoll: { type: Boolean, default: false },
    poll: {
      question: { type: String },
      options:  { type: [pollOptionSchema], default: [] },
    },

    replyTo:   { type: replyToSchema, default: null },
    reactions: { type: Map, of: String, default: {} },
    readBy:    { type: [String], default: [] },

    viewOnce: { type: Boolean, default: false },
    viewedBy: { type: [String], default: [] },

    disappearsAt: { type: Number, default: 0 },

    isEdited: { type: Boolean, default: false },
    editedAt: { type: Date,    default: null },

    deletedFor:           { type: [String], default: [] },
    isDeletedForEveryone: { type: Boolean,  default: false },
  },
  { timestamps: true }
);

// ✅ FIX 25: Compound index — group messages fast load hogi
groupMessageSchema.index({ groupID: 1, createdAt: 1 });
groupMessageSchema.index({ groupID: 1, isDeletedForEveryone: 1, createdAt: 1 });

const GroupMessage =
  mongoose.models.GroupMessage ||
  mongoose.model("GroupMessage", groupMessageSchema);

export default async function handler(req, res) {
  await connectDB();

  const fullUrl = req.url.split("?")[0];
  const path    = fullUrl.split("/").pop();

  res.setHeader("Access-Control-Allow-Origin",  "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();

  // ════════════════════════════════════════════════════════════
  //  GROUPS LIST  —  GET /api/groups
  // ════════════════════════════════════════════════════════════
  if (req.method === "GET" && path !== "messages" && path !== "info" && path !== "pinned") {
    const { userID } = req.query;
    if (!userID) return res.status(400).json({ message: "userID chahiye" });

    try {
      const groups = await Group.find({ members: userID }).sort({ lastMessageTime: -1 });
      return res.json({
        groups: groups.map(g => ({
          groupID:             g._id.toString(),
          name:                g.name,
          description:         g.description         ?? "",
          members:             g.members,
          lastMessage:         g.lastMessage          ?? "",
          lastMessageTime:     g.lastMessageTime,
          createdBy:           g.createdBy,
          onlyAdminCanMessage: g.onlyAdminCanMessage  ?? false,
          pinnedMessages:      g.pinnedMessages       ?? [],
        })),
      });
    } catch (e) {
      return res.status(500).json({ message: "Server error", error: e.message });
    }
  }

  // ════════════════════════════════════════════════════════════
  //  GROUP INFO  —  GET /api/groups/info?groupID=xxx
  // ════════════════════════════════════════════════════════════
  if (req.method === "GET" && path === "info") {
    const { groupID } = req.query;
    if (!groupID)
      return res.status(400).json({ message: "groupID chahiye" });

    try {
      const group = await Group.findById(groupID);
      if (!group) return res.status(404).json({ message: "Group nahi mila" });

      return res.json({
        groupID:             group._id.toString(),
        name:                group.name,
        description:         group.description         ?? "",
        inviteCode:          group.inviteCode           ?? "",
        members:             group.members,
        createdBy:           group.createdBy,
        onlyAdminCanMessage: group.onlyAdminCanMessage  ?? false,
        pinnedMessages:      group.pinnedMessages       ?? [],
      });
    } catch (e) {
      return res.status(500).json({ message: "Server error", error: e.message });
    }
  }

  // ════════════════════════════════════════════════════════════
  //  PINNED MESSAGES  —  GET /api/groups/pinned?groupID=xxx
  // ════════════════════════════════════════════════════════════
  if (req.method === "GET" && path === "pinned") {
    const { groupID, myID = "" } = req.query;
    if (!groupID)
      return res.status(400).json({ message: "groupID chahiye" });

    try {
      const group = await Group.findById(groupID);
      if (!group) return res.status(404).json({ message: "Group nahi mila" });

      const pinnedIDs = group.pinnedMessages ?? [];
      if (pinnedIDs.length === 0)
        return res.json({ pinned: [] });

      const msgs = await GroupMessage.find({
        _id:                  { $in: pinnedIDs },
        isDeletedForEveryone: { $ne: true },
      });

      const result = msgs
        .filter(m => !m.deletedFor.includes(myID))
        .map(m => ({
          ...m.toObject(),
          reactions: m.reactions ? Object.fromEntries(m.reactions) : {},
        }));

      return res.json({ pinned: result });
    } catch (e) {
      return res.status(500).json({ message: "Server error", error: e.message });
    }
  }

  // ════════════════════════════════════════════════════════════
  //  GROUP CREATE  —  POST /api/groups/create
  // ════════════════════════════════════════════════════════════
  if (req.method === "POST" && path === "create") {
    const { name, creatorID, creatorName, members } = req.body;
    if (!name || !creatorID || !members?.length)
      return res.status(400).json({ message: "Sab fields bharo" });

    try {
      const group = await Group.create({
        name,
        createdBy:           creatorID,
        creatorName,
        members:             [...new Set(members)],
        lastMessage:         "",
        lastMessageTime:     new Date(),
        onlyAdminCanMessage: false,
        description:         "",
        inviteCode:          "",
        pinnedMessages:      [],
      });
      return res.status(201).json({
        message: "Group ban gaya ✅",
        groupID: group._id.toString(),
        group,
      });
    } catch (e) {
      return res.status(500).json({ message: "Server error", error: e.message });
    }
  }

  // ════════════════════════════════════════════════════════════
  //  INVITE LINK — GENERATE  —  POST /api/groups/invite
  // ════════════════════════════════════════════════════════════
  if (req.method === "POST" && path === "invite") {
    const { groupID, userID } = req.body;
    if (!groupID || !userID)
      return res.status(400).json({ message: "groupID aur userID chahiye" });

    try {
      const group = await Group.findById(groupID);
      if (!group) return res.status(404).json({ message: "Group nahi mila" });
      if (group.createdBy !== userID)
        return res.status(403).json({ message: "Sirf admin invite link bana sakta hai" });

      let code = group.inviteCode;
      if (!code || code.length < 6) {
        code = Math.random().toString(36).substring(2, 10).toUpperCase();
        await Group.findByIdAndUpdate(groupID, { $set: { inviteCode: code } });
      }

      return res.json({
        message:    "Invite link ready hai ✅",
        inviteCode: code,
        inviteLink: `https://zuno.app/join/${code}`,
      });
    } catch (e) {
      return res.status(500).json({ message: "Server error", error: e.message });
    }
  }

  // ════════════════════════════════════════════════════════════
  //  INVITE LINK — JOIN  —  POST /api/groups/join
  // ════════════════════════════════════════════════════════════
  if (req.method === "POST" && path === "join") {
    const { inviteCode, userID } = req.body;
    if (!inviteCode || !userID)
      return res.status(400).json({ message: "inviteCode aur userID chahiye" });

    try {
      const group = await Group.findOne({ inviteCode: inviteCode.trim().toUpperCase() });
      if (!group) return res.status(404).json({ message: "Galat ya expired invite code" });

      if (group.members.includes(userID))
        return res.status(400).json({ message: "Aap pehle se is group mein hain" });

      await Group.findByIdAndUpdate(group._id, { $push: { members: userID } });

      return res.json({
        message: "Group join ho gaya ✅",
        groupID: group._id.toString(),
        name:    group.name,
      });
    } catch (e) {
      return res.status(500).json({ message: "Server error", error: e.message });
    }
  }

  // ════════════════════════════════════════════════════════════
  //  INVITE CODE RESET  —  DELETE /api/groups/invite
  // ════════════════════════════════════════════════════════════
  if (req.method === "DELETE" && path === "invite") {
    const { groupID, userID } = req.body;
    if (!groupID || !userID)
      return res.status(400).json({ message: "groupID aur userID chahiye" });

    try {
      const group = await Group.findById(groupID);
      if (!group) return res.status(404).json({ message: "Group nahi mila" });
      if (group.createdBy !== userID)
        return res.status(403).json({ message: "Sirf admin reset kar sakta hai" });

      const newCode = Math.random().toString(36).substring(2, 10).toUpperCase();
      await Group.findByIdAndUpdate(groupID, { $set: { inviteCode: newCode } });

      return res.json({
        message:    "Invite code reset ho gaya ✅",
        inviteCode: newCode,
      });
    } catch (e) {
      return res.status(500).json({ message: "Server error", error: e.message });
    }
  }

  // ════════════════════════════════════════════════════════════
  //  MESSAGES FETCH  —  GET /api/groups/messages
  //  ✅ FIX 26: Group messages loading completely rewritten
  // ════════════════════════════════════════════════════════════
  if (req.method === "GET" && path === "messages") {
    const { groupID, myID = "", since, before, limit = "60" } = req.query;
    if (!groupID) return res.status(400).json({ message: "groupID chahiye" });

    try {
      const now = Date.now();
      const pageLimit = Math.min(parseInt(limit) || 60, 100); // max 100 per page

      // Expired messages clean karo
      await GroupMessage.deleteMany({
        groupID,
        disappearsAt: { $gt: 0, $lte: now },
      });

      // ✅ FIX 27: Pagination support — `before` timestamp se purani messages load karo
      //    `since` se nayi messages fetch karo (polling)
      //    Yeh "group messages loading issue" fix karta hai
      let filter = {
        groupID,
        isDeletedForEveryone: { $ne: true },
      };

      if (since) {
        // Polling mode — sirf naye messages
        filter.createdAt = { $gt: new Date(parseInt(since)) };
      } else if (before) {
        // Older messages load karo (scroll up)
        filter.createdAt = { $lt: new Date(parseInt(before)) };
      }

      // ✅ FIX 28: Sort aur limit sahi karo
      //    Pehle saari messages ek baar mein aati thin — bahut slow tha
      const messages = await GroupMessage
        .find(filter)
        .sort({ createdAt: since ? 1 : -1 })  // polling: asc, initial/older: desc
        .limit(since ? 0 : pageLimit);         // polling mein limit nahi

      // Agar initial ya older load hai to reverse karo (UI ke liye asc order chahiye)
      const orderedMessages = since ? messages : messages.reverse();

      const result = orderedMessages
        .filter(m => myID === "" || !m.deletedFor.includes(myID))
        .map(m => ({
          ...m.toObject(),
          reactions:  m.reactions ? Object.fromEntries(m.reactions) : {},
          viewedByMe: m.viewOnce ? m.viewedBy.includes(myID) : false,
          readByMe:   m.readBy?.includes(myID) ?? false,
        }));

      // ✅ FIX 29: hasMore flag — Flutter ko pata chale aur pagination kare
      const total = await GroupMessage.countDocuments({ groupID, isDeletedForEveryone: { $ne: true } });
      const oldestLoaded = result.length > 0 ? result[0].createdAt : null;

      return res.json({
        messages: result,
        hasMore:  !since && result.length === pageLimit,
        total,
        oldestLoaded: oldestLoaded ? oldestLoaded.getTime() : null,
      });
    } catch (e) {
      return res.status(500).json({ message: "Server error", error: e.message });
    }
  }

  // ════════════════════════════════════════════════════════════
  //  MESSAGE SEND  —  POST /api/groups/message
  // ════════════════════════════════════════════════════════════
  if (req.method === "POST" && path === "message") {
    const {
      groupID,
      senderID,
      senderName     = "",
      text           = "",
      imageUrl       = "",
      voiceUrl       = "",
      documentUrl    = "",
      documentName   = "",
      documentSize   = 0,
      documentType   = "",
      location,
      viewOnce       = false,
      disappearAfter = 0,
      replyTo,
    } = req.body;

    if (!groupID || !senderID)
      return res.status(400).json({ message: "groupID aur senderID chahiye" });

    const hasContent =
      text?.trim() || imageUrl?.trim() || voiceUrl?.trim() ||
      documentUrl?.trim() || location;
    if (!hasContent)
      return res.status(400).json({ message: "Text, image, voice, document ya location chahiye" });

    try {
      const group = await Group.findById(groupID);
      if (!group) return res.status(404).json({ message: "Group nahi mila" });

      if (group.onlyAdminCanMessage && group.createdBy !== senderID)
        return res.status(403).json({ message: "Sirf admin message kar sakta hai" });

      const now           = Date.now();
      const disappearSecs = Number(disappearAfter) || 0;

      const msg = await GroupMessage.create({
        groupID,
        senderID,
        senderName,
        text,
        imageUrl,
        voiceUrl,
        documentUrl,
        documentName,
        documentSize,
        documentType,
        location:     location || null,
        viewOnce:     viewOnce === true,
        disappearsAt: disappearSecs > 0 ? now + disappearSecs * 1000 : 0,
        replyTo:      replyTo || null,
        reactions:    {},
        readBy:       [senderID],  // ✅ sender ne khud padh li
      });

      // ✅ FIX 30: Group lastMessage update karo
      const preview = text?.trim()
        ? (text.length > 50 ? text.slice(0, 50) + "..." : text)
        : imageUrl ? "📷 Photo"
        : voiceUrl ? "🎤 Voice"
        : documentUrl ? `📄 ${documentName || "Document"}`
        : location ? "📍 Location"
        : "Message";

      await Group.findByIdAndUpdate(groupID, {
        $set: {
          lastMessage:     preview,
          lastMessageTime: new Date(),
        },
      });

      // naya: sender ke ilawa baaki members ko (jo online nahi) push notification bhejo
      const otherMembers = (group.members || []).filter(m => m !== senderID);
      if (otherMembers.length > 0) {
        const recipients = await User.find(
          { _id: { $in: otherMembers }, isOnline: { $ne: true }, expoPushToken: { $exists: true, $ne: "" } },
          { expoPushToken: 1 }
        );
        for (const r of recipients) {
          sendGroupMessagePush({
            expoPushToken: r.expoPushToken,
            title:         `${senderName || "Someone"} • ${group.name}`,
            preview,
          });
        }
      }

      return res.status(201).json({
        message: "Message send ho gaya ✅",
        data:    { ...msg.toObject(), reactions: {} },
      });
    } catch (e) {
      return res.status(500).json({ message: "Server error", error: e.message });
    }
  }

  // ════════════════════════════════════════════════════════════
  //  UPDATE (name, desc, onlyAdmin, etc)  — PATCH /api/groups/update
  // ════════════════════════════════════════════════════════════
  if (req.method === "PATCH" && path === "update") {
    const { groupID, userID, name, description, onlyAdminCanMessage, addMembers, removeMembers } = req.body;
    if (!groupID || !userID)
      return res.status(400).json({ message: "groupID aur userID chahiye" });

    try {
      const group = await Group.findById(groupID);
      if (!group) return res.status(404).json({ message: "Group nahi mila" });
      if (group.createdBy !== userID)
        return res.status(403).json({ message: "Sirf admin update kar sakta hai" });

      const upd = {};
      if (name !== undefined)                upd.name                = name;
      if (description !== undefined)         upd.description         = description;
      if (onlyAdminCanMessage !== undefined)  upd.onlyAdminCanMessage = Boolean(onlyAdminCanMessage);

      const push = {}, pull = {};
      if (Array.isArray(addMembers)    && addMembers.length)    push.members = { $each: addMembers };
      if (Array.isArray(removeMembers) && removeMembers.length) pull.members = { $in:   removeMembers };

      await Group.findByIdAndUpdate(groupID, {
        ...(Object.keys(upd).length  ? { $set:  upd  } : {}),
        ...(Object.keys(push).length ? { $push: push } : {}),
        ...(Object.keys(pull).length ? { $pull: pull } : {}),
      });

      return res.json({ message: "Group update ho gaya ✅" });
    } catch (e) {
      return res.status(500).json({ message: "Server error", error: e.message });
    }
  }

  // ════════════════════════════════════════════════════════════
  //  POLL  — POST /api/groups/poll
  // ════════════════════════════════════════════════════════════
  if (req.method === "POST" && path === "poll") {
    const { groupID, senderID, senderName, question, options } = req.body;
    if (!groupID || !senderID || !question || !options?.length)
      return res.status(400).json({ message: "Required fields missing" });

    try {
      const group = await Group.findById(groupID);
      if (!group) return res.status(404).json({ message: "Group nahi mila" });

      const msg = await GroupMessage.create({
        groupID,
        senderID,
        senderName: senderName ?? "",
        text:       question,
        isPoll:     true,
        poll: {
          question,
          options: options.map(o => ({ text: o, votes: [] })),
        },
        reactions: {},
        readBy:    [senderID],
      });

      await Group.findByIdAndUpdate(groupID, {
        $set: { lastMessage: `📊 Poll: ${question}`, lastMessageTime: new Date() },
      });

      return res.status(201).json({ message: "Poll ban gaya ✅", data: msg });
    } catch (e) {
      return res.status(500).json({ message: "Server error", error: e.message });
    }
  }

  // ════════════════════════════════════════════════════════════
  //  VOTE  — POST /api/groups/vote
  // ════════════════════════════════════════════════════════════
  if (req.method === "POST" && path === "vote") {
    const { messageID, optionIndex, userID } = req.body;
    if (messageID === undefined || optionIndex === undefined || !userID)
      return res.status(400).json({ message: "messageID, optionIndex, userID chahiye" });

    try {
      const msg = await GroupMessage.findById(messageID);
      if (!msg || !msg.isPoll)
        return res.status(404).json({ message: "Poll nahi mila" });

      // Pehle sari options se vote hatao
      msg.poll.options.forEach(opt => {
        opt.votes = opt.votes.filter(v => v !== userID);
      });

      // Naya vote add karo
      if (msg.poll.options[optionIndex]) {
        msg.poll.options[optionIndex].votes.push(userID);
      }

      await msg.save();
      return res.json({ message: "Vote ho gaya ✅", poll: msg.poll });
    } catch (e) {
      return res.status(500).json({ message: "Server error", error: e.message });
    }
  }

  // ════════════════════════════════════════════════════════════
  //  PIN MESSAGE  —  POST /api/groups/pin
  // ════════════════════════════════════════════════════════════
  if (req.method === "POST" && path === "pin") {
    const { groupID, userID, messageID, unpin = false } = req.body;
    if (!groupID || !userID || !messageID)
      return res.status(400).json({ message: "groupID, userID, messageID chahiye" });

    try {
      const group = await Group.findById(groupID);
      if (!group) return res.status(404).json({ message: "Group nahi mila" });
      if (group.createdBy !== userID)
        return res.status(403).json({ message: "Sirf admin pin/unpin kar sakta hai" });

      if (unpin) {
        await Group.findByIdAndUpdate(groupID, { $pull: { pinnedMessages: messageID } });
        return res.json({ message: "Unpin ho gaya ✅" });
      } else {
        if (!group.pinnedMessages.includes(messageID)) {
          await Group.findByIdAndUpdate(groupID, { $push: { pinnedMessages: messageID } });
        }
        return res.json({ message: "Pin ho gaya ✅" });
      }
    } catch (e) {
      return res.status(500).json({ message: "Server error", error: e.message });
    }
  }

  // ════════════════════════════════════════════════════════════
  //  MESSAGE PATCH — reaction, edit, delete
  // ════════════════════════════════════════════════════════════
  if (req.method === "PATCH" && path === "message") {
    const { messageID, userID, emoji, newText, deleteForEveryone, deleteForMe } = req.body;
    if (!messageID || !userID)
      return res.status(400).json({ message: "messageID aur userID chahiye" });

    try {
      const msg = await GroupMessage.findById(messageID);
      if (!msg) return res.status(404).json({ message: "Message nahi mila" });

      if (emoji !== undefined) {
        const reactions = msg.reactions || new Map();
        if (reactions.get(userID) === emoji) {
          reactions.delete(userID);
        } else {
          reactions.set(userID, emoji);
        }
        msg.reactions = reactions;
        await msg.save();
        return res.json({
          message:   "Reaction update ho gaya ✅",
          reactions: Object.fromEntries(msg.reactions),
        });
      }

      if (newText !== undefined) {
        if (msg.senderID !== userID)
          return res.status(403).json({ message: "Sirf apna message edit karo" });
        msg.text     = newText;
        msg.isEdited = true;
        msg.editedAt = new Date();
        await msg.save();
        return res.json({ message: "Edit ho gaya ✅", data: msg });
      }

      if (deleteForEveryone) {
        if (msg.senderID !== userID)
          return res.status(403).json({ message: "Sirf apna message delete karo" });
        msg.text                 = "";
        msg.imageUrl             = "";
        msg.voiceUrl             = "";
        msg.documentUrl          = "";
        msg.isDeletedForEveryone = true;
        await msg.save();
        return res.json({ message: "Sabke liye delete ho gaya ✅" });
      }

      if (deleteForMe) {
        if (!msg.deletedFor.includes(userID)) {
          msg.deletedFor.push(userID);
          await msg.save();
        }
        return res.json({ message: "Aapke liye delete ho gaya ✅" });
      }

      return res.status(400).json({ message: "Koi action nahi mila" });
    } catch (e) {
      return res.status(500).json({ message: "Server error", error: e.message });
    }
  }

  return res.status(404).json({ message: "Route nahi mila", path });
}