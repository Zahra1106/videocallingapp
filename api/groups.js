import { connectDB, Group } from "../lib/db.js";

export default async function handler(req, res) {
  await connectDB();

  // ✅ FIX: Vercel pe req.url "/api/groups/update" ya "/update" dono ho sakta hai
  // isliye sirf last segment check karo
  const fullUrl = req.url.split("?")[0];
  const path = fullUrl.split("/").pop(); // "update", "create", "messages", etc.

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();

  // ── GET /api/groups ─────────────────────────────────────────
  if (req.method === "GET" && path !== "messages") {
    const { userID } = req.query;
    if (!userID) return res.status(400).json({ message: "userID chahiye" });

    try {
      const groups = await Group.find({ members: userID }).sort({ lastMessageTime: -1 });
      return res.json({
        groups: groups.map(g => ({
          groupID:             g._id.toString(),
          name:                g.name,
          members:             g.members,
          lastMessage:         g.lastMessage ?? "",
          lastMessageTime:     g.lastMessageTime,
          createdBy:           g.createdBy,
          onlyAdminCanMessage: g.onlyAdminCanMessage ?? false, // ✅ yeh bhi bhejo
        })),
      });
    } catch (e) {
      return res.status(500).json({ message: "Server error", error: e.message });
    }
  }

  // ── POST /api/groups/create ─────────────────────────────────
  if (req.method === "POST" && path === "create") {
    const { name, creatorID, creatorName, members } = req.body;
    if (!name || !creatorID || !members?.length)
      return res.status(400).json({ message: "Sab fields bharo" });

    try {
      const group = await Group.create({
        name,
        createdBy: creatorID,
        creatorName,
        members,
        lastMessage: "",
        lastMessageTime: new Date(),
        onlyAdminCanMessage: false,
      });
      return res.status(201).json({
        message: "Group ban gaya ✅",
        groupID: group._id.toString(),
      });
    } catch (e) {
      return res.status(500).json({ message: "Server error", error: e.message });
    }
  }

  // ── POST /api/groups/message (send message) ─────────────────
  if (req.method === "POST" && path === "message") {
    const { groupID, senderID, senderName, text, viewOnce, disappearAfter } = req.body;
    if (!groupID || !senderID || !text)
      return res.status(400).json({ message: "Fields missing" });

    try {
      const group = await Group.findById(groupID);
      if (!group) return res.status(404).json({ message: "Group nahi mila" });

      if (group.onlyAdminCanMessage && group.createdBy !== senderID)
        return res.status(403).json({ message: "Sirf admin message kar sakta hai" });

      const now           = Date.now();
      const disappearSecs = Number(disappearAfter) || 0;

      const newMsg = {
        senderID,
        senderName,
        text,
        timestamp:      new Date(),
        viewOnce:       viewOnce === true,
        viewedBy:       [],
        disappearAfter: disappearSecs,
        disappearsAt:   disappearSecs > 0 ? now + disappearSecs * 1000 : 0,
      };

      await Group.findByIdAndUpdate(groupID, {
        $push: { messages: newMsg },
        $set:  { lastMessage: text, lastMessageTime: new Date() },
      });

      return res.json({ message: "Message chala gaya ✅" });
    } catch (e) {
      return res.status(500).json({ message: "Server error", error: e.message });
    }
  }

  // ── PATCH /api/groups/message — viewOnce mark ───────────────
  if (req.method === "PATCH" && path === "message") {
    const { groupID, messageID, userID, markViewed } = req.body;
    if (!groupID || !messageID || !userID)
      return res.status(400).json({ message: "Fields missing" });

    try {
      const group = await Group.findById(groupID);
      if (!group) return res.status(404).json({ message: "Group nahi mila" });

      const msg = group.messages.id(messageID);
      if (!msg) return res.status(404).json({ message: "Message nahi mila" });

      if (markViewed && !msg.viewedBy.includes(userID)) {
        msg.viewedBy.push(userID);
        await group.save();
      }

      return res.json({ message: "Viewed mark ho gaya" });
    } catch (e) {
      return res.status(500).json({ message: "Server error", error: e.message });
    }
  }

  // ── GET /api/groups/messages ────────────────────────────────
  if (req.method === "GET" && path === "messages") {
    const { groupID, myID } = req.query;
    if (!groupID) return res.status(400).json({ message: "groupID chahiye" });

    try {
      const group = await Group.findById(groupID);
      if (!group) return res.status(404).json({ message: "Group nahi mila" });

      const now = Date.now();

      // ── Expired messages filter karo ────────────────────────
      const filtered = (group.messages ?? []).filter(m => {
        if (m.disappearsAt && m.disappearsAt > 0 && m.disappearsAt <= now)
          return false;
        return true;
      });

      const result = filtered.map(m => ({
        ...m.toObject(),
        viewedByMe: myID ? (m.viewedBy ?? []).includes(myID) : false,
      }));

      return res.json({ messages: result });
    } catch (e) {
      return res.status(500).json({ message: "Server error", error: e.message });
    }
  }

  // ── POST /api/groups/poll (create poll) ─────────────────────
  if (req.method === "POST" && path === "poll") {
    const { groupID, senderID, senderName, question, options } = req.body;
    if (!groupID || !question || !options?.length)
      return res.status(400).json({ message: "groupID, question aur options chahiye" });

    try {
      const pollOptions = options.map(opt => ({ text: opt, votes: [] }));
      await Group.findByIdAndUpdate(groupID, {
        $push: {
          messages: {
            senderID,
            senderName,
            text:      `📊 Poll: ${question}`,
            timestamp: new Date(),
            isPoll:    true,
            poll:      { question, options: pollOptions },
          },
        },
        $set: {
          lastMessage:     `📊 Poll: ${question}`,
          lastMessageTime: new Date(),
        },
      });
      return res.status(201).json({ message: "Poll ban gaya ✅" });
    } catch (e) {
      return res.status(500).json({ message: "Server error", error: e.message });
    }
  }

  // ── PATCH/POST /api/groups/vote ─────────────────────────────
  if ((req.method === "PATCH" || req.method === "POST") && path === "vote") {
    const { groupID, messageID, optionIndex, userID } = req.body;
    if (!groupID || !messageID || optionIndex === undefined || !userID)
      return res.status(400).json({ message: "Fields missing" });

    try {
      const group = await Group.findById(groupID);
      if (!group) return res.status(404).json({ message: "Group nahi mila" });

      const msg = group.messages.id(messageID);
      if (!msg || !msg.isPoll)
        return res.status(404).json({ message: "Poll nahi mila" });

      // Pehle is user ka vote sab options se hatao (toggle support)
      msg.poll.options.forEach(opt => {
        opt.votes = opt.votes.filter(v => v !== userID);
      });
      msg.poll.options[optionIndex].votes.push(userID);
      await group.save();

      return res.json({ message: "Vote ho gaya ✅", poll: msg.poll });
    } catch (e) {
      return res.status(500).json({ message: "Server error", error: e.message });
    }
  }

  // ── PATCH /api/groups/update ────────────────────────────────
  if (req.method === "PATCH" && path === "update") {
    const { groupID, userID, name, action, targetUserID, onlyAdminCanMessage } = req.body;

    // ✅ Basic validation
    if (!groupID || !userID)
      return res.status(400).json({ message: "groupID aur userID chahiye" });

    // ✅ Action ya name — kuch toh hona chahiye
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

      // ── Baaki sab actions admin hi kar sakta hai ────────────
      if (group.createdBy !== userID)
        return res.status(403).json({ message: "Sirf admin yeh kar sakta hai" });

      // ── Add member ──────────────────────────────────────────
      if (action === "addMember") {
        if (!targetUserID)
          return res.status(400).json({ message: "targetUserID chahiye" });
        if (group.members.includes(targetUserID))
          return res.status(400).json({ message: "Yeh member pehle se hai" });

        await Group.findByIdAndUpdate(groupID, { $push: { members: targetUserID } });
        return res.json({ message: "Member add ho gaya ✅" });
      }

      // ── Remove member ───────────────────────────────────────
      if (action === "removeMember") {
        if (!targetUserID)
          return res.status(400).json({ message: "targetUserID chahiye" });

        await Group.findByIdAndUpdate(groupID, { $pull: { members: targetUserID } });
        return res.json({ message: "Member remove ho gaya ✅" });
      }

      // ── Privacy toggle ──────────────────────────────────────
      if (action === "privacy") {
        if (onlyAdminCanMessage === undefined)
          return res.status(400).json({ message: "onlyAdminCanMessage chahiye" });

        await Group.findByIdAndUpdate(groupID, {
          $set: { onlyAdminCanMessage: Boolean(onlyAdminCanMessage) },
        });
        return res.json({ message: "Privacy update ho gayi ✅" });
      }

      // ── Update name ─────────────────────────────────────────
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

  // ── DELETE /api/groups/message ──────────────────────────────
  if (req.method === "DELETE" && path === "message") {
    const { groupID, messageID, userID } = req.body;
    if (!groupID || !messageID || !userID)
      return res.status(400).json({ message: "Fields missing" });

    try {
      const group = await Group.findById(groupID);
      if (!group) return res.status(404).json({ message: "Group nahi mila" });

      const msg = group.messages.id(messageID);
      if (!msg) return res.status(404).json({ message: "Message nahi mila" });

      if (msg.senderID !== userID && group.createdBy !== userID)
        return res.status(403).json({ message: "Permission nahi hai" });

      msg.deleteOne();
      await group.save();

      return res.json({ message: "Message delete ho gaya ✅" });
    } catch (e) {
      return res.status(500).json({ message: "Server error", error: e.message });
    }
  }

  // ── 404 ─────────────────────────────────────────────────────
  return res.status(404).json({
    message: "Route nahi mila",
    method:  req.method,
    url:     fullUrl,   // ✅ debug ke liye
    path,
  });
}