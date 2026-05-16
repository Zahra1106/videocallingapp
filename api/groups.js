import { connectDB, Group } from "../lib/db.js";
import mongoose from "mongoose";

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

groupMessageSchema.index({ groupID: 1, createdAt: 1 });

const GroupMessage =
  mongoose.models.GroupMessage ||
  mongoose.model("GroupMessage", groupMessageSchema);

// ─────────────────────────────────────────────────────────────
//  ⚠️  db.js mein Group Schema mein yeh fields hone chahiye:
//
//  description:    { type: String, default: "" },
//  inviteCode:     { type: String, default: "" },
//  pinnedMessages: { type: [String], default: [] },
// ─────────────────────────────────────────────────────────────

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
  //  FIX: description field add kiya response mein
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
          description:         g.description         ?? "",   // ✅ FIX: yeh missing tha
          members:             g.members,
          lastMessage:         g.lastMessage          ?? "",
          lastMessageTime:     g.lastMessageTime,
          createdBy:           g.createdBy,
          onlyAdminCanMessage: g.onlyAdminCanMessage  ?? false,
          pinnedMessages:      g.pinnedMessages       ?? [],  // ✅ FIX: yeh bhi add kiya
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
        inviteLink: `https://zuno.app/join/${newCode}`,
      });
    } catch (e) {
      return res.status(500).json({ message: "Server error", error: e.message });
    }
  }

  // ════════════════════════════════════════════════════════════
  //  PIN / UNPIN MESSAGE  —  PATCH /api/groups/pin
  // ════════════════════════════════════════════════════════════
  if (req.method === "PATCH" && path === "pin") {
    const { groupID, messageID, userID, unpin = false } = req.body;
    if (!groupID || !messageID || !userID)
      return res.status(400).json({ message: "groupID, messageID, userID chahiye" });

    try {
      const group = await Group.findById(groupID);
      if (!group) return res.status(404).json({ message: "Group nahi mila" });
      if (group.createdBy !== userID)
        return res.status(403).json({ message: "Sirf admin message pin kar sakta hai" });

      if (unpin) {
        await Group.findByIdAndUpdate(groupID, {
          $pull: { pinnedMessages: messageID },
        });
        return res.json({ message: "Message unpin ho gaya ✅" });
      }

      if ((group.pinnedMessages ?? []).length >= 3)
        return res.status(400).json({ message: "Max 3 messages pin ho sakte hain" });

      if (!(group.pinnedMessages ?? []).includes(messageID)) {
        await Group.findByIdAndUpdate(groupID, {
          $push: { pinnedMessages: messageID },
        });
      }
      return res.json({ message: "Message pin ho gaya ✅" });
    } catch (e) {
      return res.status(500).json({ message: "Server error", error: e.message });
    }
  }

  // ════════════════════════════════════════════════════════════
  //  MESSAGES FETCH  —  GET /api/groups/messages
  // ════════════════════════════════════════════════════════════
  if (req.method === "GET" && path === "messages") {
    const { groupID, myID = "" } = req.query;
    if (!groupID) return res.status(400).json({ message: "groupID chahiye" });

    try {
      const now = Date.now();

      await GroupMessage.deleteMany({
        groupID,
        disappearsAt: { $gt: 0, $lte: now },
      });

      const messages = await GroupMessage.find({
        groupID,
        isDeletedForEveryone: { $ne: true },
      }).sort({ createdAt: 1 });

      const result = messages
        .filter(m => myID === "" || !m.deletedFor.includes(myID))
        .map(m => ({
          ...m.toObject(),
          reactions:  m.reactions ? Object.fromEntries(m.reactions) : {},
          viewedByMe: m.viewOnce ? m.viewedBy.includes(myID) : false,
          readByMe:   m.readBy?.includes(myID) ?? false,
        }));

      return res.json({ messages: result });
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
        viewedBy:     [],
        replyTo:      replyTo || null,
        deletedFor:   [],
        disappearsAt: disappearSecs > 0 ? now + disappearSecs * 1000 : 0,
      });

      const preview = text?.trim()
        || (imageUrl    ? "📷 Image"    : "")
        || (voiceUrl    ? "🎤 Voice"    : "")
        || (documentUrl ? "📄 Document" : "")
        || (location    ? "📍 Location" : "");

      await Group.findByIdAndUpdate(groupID, {
        $set: { lastMessage: preview, lastMessageTime: new Date() },
      });

      if (disappearSecs > 0) {
        setTimeout(async () => {
          try { await GroupMessage.findByIdAndDelete(msg._id); } catch (_) {}
        }, disappearSecs * 1000);
      }

      return res.status(201).json({ message: "Message bhej diya ✅", data: msg });
    } catch (e) {
      return res.status(500).json({ message: "Server error", error: e.message });
    }
  }

  // ════════════════════════════════════════════════════════════
  //  MESSAGE PATCH  —  PATCH /api/groups/message
  //  FIX: groupID properly extract kiya req.body se
  // ════════════════════════════════════════════════════════════
  if (req.method === "PATCH" && path === "message") {
    const {
      groupID,       // ✅ FIX: pehle yeh extract nahi tha
      messageID,
      userID,
      markViewed,
      markRead,
      newText,
      emoji,
      liveLocation,
    } = req.body;

    if (!messageID || !userID)
      return res.status(400).json({ message: "messageID aur userID chahiye" });

    try {
      const msg = await GroupMessage.findById(messageID);
      if (!msg) return res.status(404).json({ message: "Message nahi mila" });

      // ── View Once mark ──────────────────────────────────────
      if (markViewed) {
        if (!msg.viewedBy.includes(userID)) msg.viewedBy.push(userID);
        await msg.save();
        return res.json({ message: "Viewed mark ho gaya" });
      }

      // ── Read receipt ────────────────────────────────────────
      if (markRead) {
        if (!msg.readBy.includes(userID)) msg.readBy.push(userID);
        await msg.save();
        return res.json({ message: "Read mark ho gaya" });
      }

      // ── Edit Message ─────────────────────────────────────────
      if (newText !== undefined) {
        if (msg.senderID !== userID)
          return res.status(403).json({ message: "Sirf apna message edit kar sakte hain" });

        msg.text     = newText;
        msg.isEdited = true;
        msg.editedAt = new Date();
        await msg.save();
        return res.json({ message: "Message edit ho gaya", data: msg });
      }

      // ── Live Location Update ─────────────────────────────────
      if (liveLocation) {
        if (msg.senderID !== userID)
          return res.status(403).json({ message: "Sirf sender location update kar sakta hai" });

        msg.location = {
          lat:     liveLocation.lat,
          lng:     liveLocation.lng,
          address: liveLocation.address || msg.location?.address || "",
          isLive:  liveLocation.isLive !== false,
        };
        await msg.save();
        return res.json({ message: "Location update ho gaya", data: msg });
      }

      // ── Reaction ─────────────────────────────────────────────
      if (emoji) {
        const reactions = msg.reactions || new Map();
        if (reactions.get(userID) === emoji) {
          reactions.delete(userID);
        } else {
          reactions.set(userID, emoji);
        }
        msg.reactions = reactions;
        await msg.save();
        return res.json({
          message:   "Reaction ho gaya",
          reactions: Object.fromEntries(reactions),
        });
      }

      return res.status(400).json({ message: "Koi valid action nahi" });
    } catch (e) {
      return res.status(500).json({ message: "Server error", error: e.message });
    }
  }

  // ════════════════════════════════════════════════════════════
  //  MESSAGE DELETE  —  DELETE /api/groups/message
  //  FIX: groupID properly use ho raha hai admin check ke liye
  // ════════════════════════════════════════════════════════════
  if (req.method === "DELETE" && path === "message") {
    const { groupID, messageID, userID, deleteForEveryone = false } = req.body;

    if (!messageID || !userID)
      return res.status(400).json({ message: "messageID aur userID chahiye" });

    try {
      const msg = await GroupMessage.findById(messageID);
      if (!msg) return res.status(404).json({ message: "Message nahi mila" });

      if (deleteForEveryone) {
        // ✅ FIX: groupID use ho raha hai — pehle yeh undefined tha
        const group   = groupID ? await Group.findById(groupID) : null;
        const isAdmin = group && group.createdBy === userID;

        if (msg.senderID !== userID && !isAdmin)
          return res.status(403).json({ message: "Sirf apna message sabke liye delete kar sakte hain" });

        msg.text                 = "";
        msg.imageUrl             = "";
        msg.voiceUrl             = "";
        msg.documentUrl          = "";
        msg.documentName         = "";
        msg.documentSize         = 0;
        msg.location             = null;
        msg.isDeletedForEveryone = true;
        await msg.save();
        return res.json({ message: "Sabke liye delete ho gaya ✅" });
      } else {
        if (!msg.deletedFor.includes(userID)) {
          msg.deletedFor.push(userID);
          await msg.save();
        }
        return res.json({ message: "Aapke liye delete ho gaya ✅" });
      }
    } catch (e) {
      return res.status(500).json({ message: "Server error", error: e.message });
    }
  }

  // ════════════════════════════════════════════════════════════
  //  POLL CREATE  —  POST /api/groups/poll
  // ════════════════════════════════════════════════════════════
  if (req.method === "POST" && path === "poll") {
    const { groupID, senderID, senderName, question, options } = req.body;
    if (!groupID || !senderID || !question || !options?.length)
      return res.status(400).json({ message: "groupID, senderID, question aur options chahiye" });

    try {
      const group = await Group.findById(groupID);
      if (!group) return res.status(404).json({ message: "Group nahi mila" });

      if (group.onlyAdminCanMessage && group.createdBy !== senderID)
        return res.status(403).json({ message: "Sirf admin message kar sakta hai" });

      const pollOptions = options.map(opt => ({ text: opt, votes: [] }));

      const msg = await GroupMessage.create({
        groupID,
        senderID,
        senderName: senderName || "",
        text:       `📊 Poll: ${question}`,
        isPoll:     true,
        poll:       { question, options: pollOptions },
        deletedFor: [],
      });

      await Group.findByIdAndUpdate(groupID, {
        $set: {
          lastMessage:     `📊 Poll: ${question}`,
          lastMessageTime: new Date(),
        },
      });

      return res.status(201).json({ message: "Poll ban gaya ✅", data: msg });
    } catch (e) {
      return res.status(500).json({ message: "Server error", error: e.message });
    }
  }

  // ════════════════════════════════════════════════════════════
  //  POLL VOTE  —  POST /api/groups/vote
  // ════════════════════════════════════════════════════════════
  if ((req.method === "PATCH" || req.method === "POST") && path === "vote") {
    const { messageID, optionIndex, userID } = req.body;
    if (!messageID || optionIndex === undefined || !userID)
      return res.status(400).json({ message: "messageID, optionIndex, userID chahiye" });

    try {
      const msg = await GroupMessage.findById(messageID);
      if (!msg || !msg.isPoll)
        return res.status(404).json({ message: "Poll nahi mila" });

      msg.poll.options.forEach(opt => {
        opt.votes = opt.votes.filter(v => v !== userID);
      });
      if (optionIndex >= 0 && optionIndex < msg.poll.options.length) {
        msg.poll.options[optionIndex].votes.push(userID);
      }

      msg.markModified("poll");
      await msg.save();
      return res.json({ message: "Vote ho gaya ✅", poll: msg.poll });
    } catch (e) {
      return res.status(500).json({ message: "Server error", error: e.message });
    }
  }

  // ════════════════════════════════════════════════════════════
  //  GROUP UPDATE  —  PATCH /api/groups/update
  // ════════════════════════════════════════════════════════════
  if (req.method === "PATCH" && path === "update") {
    const { groupID, userID, name, action, targetUserID, onlyAdminCanMessage, description } = req.body;

    if (!groupID || !userID)
      return res.status(400).json({ message: "groupID aur userID chahiye" });

    if (!action && !name)
      return res.status(400).json({ message: "action ya name chahiye" });

    try {
      const group = await Group.findById(groupID);
      if (!group) return res.status(404).json({ message: "Group nahi mila" });

      // ── Leave ───────────────────────────────────────────────
      if (action === "leave") {
        await Group.findByIdAndUpdate(groupID, { $pull: { members: userID } });
        return res.json({ message: "Group leave ho gaya ✅" });
      }

      // ── Baaki sab admin hi kar sakta hai ────────────────────
      if (group.createdBy !== userID)
        return res.status(403).json({ message: "Sirf admin yeh kar sakta hai" });

      // ── Add Member ──────────────────────────────────────────
      if (action === "addMember") {
        if (!targetUserID)
          return res.status(400).json({ message: "targetUserID chahiye" });
        if (group.members.includes(targetUserID))
          return res.status(400).json({ message: "Yeh member pehle se hai" });

        await Group.findByIdAndUpdate(groupID, { $push: { members: targetUserID } });
        return res.json({ message: "Member add ho gaya ✅" });
      }

      // ── Remove Member ───────────────────────────────────────
      if (action === "removeMember") {
        if (!targetUserID)
          return res.status(400).json({ message: "targetUserID chahiye" });

        await Group.findByIdAndUpdate(groupID, { $pull: { members: targetUserID } });
        return res.json({ message: "Member remove ho gaya ✅" });
      }

      // ── Privacy Toggle ──────────────────────────────────────
      if (action === "privacy") {
        if (onlyAdminCanMessage === undefined)
          return res.status(400).json({ message: "onlyAdminCanMessage chahiye" });

        await Group.findByIdAndUpdate(groupID, {
          $set: { onlyAdminCanMessage: Boolean(onlyAdminCanMessage) },
        });
        return res.json({ message: "Privacy update ho gayi ✅" });
      }

      // ── Update Description ──────────────────────────────────
      if (action === "updateDesc") {
        const desc = (description ?? "").trim();
        await Group.findByIdAndUpdate(groupID, { $set: { description: desc } });
        return res.json({ message: "Description update ho gayi ✅" });
      }

      // ── Update Name ─────────────────────────────────────────
      if (action === "updateName" || name) {
        const newName = name?.trim();
        if (!newName)
          return res.status(400).json({ message: "Naam khali nahi ho sakta" });

        await Group.findByIdAndUpdate(groupID, { $set: { name: newName } });
        return res.json({ message: "Group name update ho gaya ✅" });
      }

      return res.status(400).json({ message: "Valid action nahi mili" });
    } catch (e) {
      return res.status(500).json({ message: "Server error", error: e.message });
    }
  }

  // ── 404 ─────────────────────────────────────────────────────
  return res.status(404).json({
    message: "Route nahi mila",
    method:  req.method,
    url:     fullUrl,
    path,
  });
}