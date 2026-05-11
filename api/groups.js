import { connectDB, Group } from "../lib/db.js";

export default async function handler(req, res) {
  await connectDB();

  const url = req.url.split("?")[0];

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();

  // GET /api/groups
  if (req.method === "GET" && !url.includes("/create") && !url.includes("/messages")) {
    const { userID } = req.query;
    if (!userID) return res.status(400).json({ message: "userID chahiye" });

    try {
      const groups = await Group.find({ members: userID }).sort({ lastMessageTime: -1 });
      return res.json({
        groups: groups.map(g => ({
          groupID:         g._id.toString(),
          name:            g.name,
          members:         g.members,
          lastMessage:     g.lastMessage ?? "",
          lastMessageTime: g.lastMessageTime,
          createdBy:       g.createdBy,
        })),
      });
    } catch (e) {
      return res.status(500).json({ message: "Server error", error: e.message });
    }
  }

  // POST /api/groups/create
  if (req.method === "POST" && url.includes("/create")) {
    const { name, creatorID, creatorName, members } = req.body;
    if (!name || !creatorID || !members?.length)
      return res.status(400).json({ message: "Sab fields bharo" });

    try {
      const group = await Group.create({
        name, createdBy: creatorID, creatorName,
        members, lastMessage: "", lastMessageTime: new Date(),
      });
      return res.status(201).json({ message: "Group ban gaya ✅", groupID: group._id.toString() });
    } catch (e) {
      return res.status(500).json({ message: "Server error", error: e.message });
    }
  }

  // POST /api/groups/message
  if (req.method === "POST" && url.includes("/message") && !url.includes("/messages")) {
    const { groupID, senderID, senderName, text } = req.body;
    if (!groupID || !senderID || !text)
      return res.status(400).json({ message: "Fields missing" });

    try {
      await Group.findByIdAndUpdate(groupID, {
        $push: { messages: { senderID, senderName, text, timestamp: new Date() } },
        $set:  { lastMessage: text, lastMessageTime: new Date() },
      });
      return res.json({ message: "Message chala gaya ✅" });
    } catch (e) {
      return res.status(500).json({ message: "Server error", error: e.message });
    }
  }

  // GET /api/groups/messages
  if (req.method === "GET" && url.includes("/messages")) {
    const { groupID } = req.query;
    if (!groupID) return res.status(400).json({ message: "groupID chahiye" });

    try {
      const group = await Group.findById(groupID);
      if (!group) return res.status(404).json({ message: "Group nahi mila" });
      return res.json({ messages: group.messages ?? [] });
    } catch (e) {
      return res.status(500).json({ message: "Server error", error: e.message });
    }
  }

  // POST /api/groups/poll
  if (req.method === "POST" && url.includes("/poll")) {
    const { groupID, senderID, senderName, question, options } = req.body;
    if (!groupID || !question || !options?.length)
      return res.status(400).json({ message: "groupID, question aur options chahiye" });

    try {
      const pollOptions = options.map(opt => ({ text: opt, votes: [] }));
      await Group.findByIdAndUpdate(groupID, {
        $push: {
          messages: {
            senderID, senderName,
            text:      `📊 Poll: ${question}`,
            timestamp: new Date(),
            isPoll:    true,
            poll: { question, options: pollOptions },
          },
        },
        $set: { lastMessage: `📊 Poll: ${question}`, lastMessageTime: new Date() },
      });
      return res.status(201).json({ message: "Poll ban gaya ✅" });
    } catch (e) {
      return res.status(500).json({ message: "Server error", error: e.message });
    }
  }

  // PATCH/POST /api/groups/vote
  if ((req.method === "PATCH" || req.method === "POST") && url.includes("/vote")) {
    const { groupID, messageID, optionIndex, userID } = req.body;
    if (!groupID || !messageID || optionIndex === undefined || !userID)
      return res.status(400).json({ message: "Fields missing" });

    try {
      const group = await Group.findById(groupID);
      if (!group) return res.status(404).json({ message: "Group nahi mila" });

      const msg = group.messages.id(messageID);
      if (!msg || !msg.isPoll) return res.status(404).json({ message: "Poll nahi mila" });

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

  // ✅ PATCH /api/groups/update — name update, leave, add member
  if (req.method === "PATCH" && url.includes("/update")) {
    const { groupID, userID, name, action, targetUserID } = req.body;
    if (!groupID || !userID)
      return res.status(400).json({ message: "groupID aur userID chahiye" });

    try {
      const group = await Group.findById(groupID);
      if (!group) return res.status(404).json({ message: "Group nahi mila" });

      // Leave group
      if (action === "leave") {
        await Group.findByIdAndUpdate(groupID, {
          $pull: { members: userID }
        });
        return res.json({ message: "Group leave ho gaya ✅" });
      }

      // Add member
      if (action === "addMember" && targetUserID) {
        if (group.members.includes(targetUserID))
          return res.status(400).json({ message: "Yeh member pehle se hai" });
        await Group.findByIdAndUpdate(groupID, {
          $push: { members: targetUserID }
        });
        return res.json({ message: "Member add ho gaya ✅" });
      }

      // Remove member
      if (action === "removeMember" && targetUserID) {
        await Group.findByIdAndUpdate(groupID, {
          $pull: { members: targetUserID }
        });
        return res.json({ message: "Member remove ho gaya ✅" });
      }

      // Update name
      if (name) {
        await Group.findByIdAndUpdate(groupID, { name });
        return res.json({ message: "Group name update ho gaya ✅" });
      }

      return res.status(400).json({ message: "Action ya name chahiye" });
    } catch (e) {
      return res.status(500).json({ message: "Server error", error: e.message });
    }
  }

  // ✅ DELETE /api/groups/message — message delete
  if (req.method === "DELETE" && url.includes("/message")) {
    const { groupID, messageID, userID } = req.body;
    if (!groupID || !messageID || !userID)
      return res.status(400).json({ message: "Fields missing" });

    try {
      const group = await Group.findById(groupID);
      if (!group) return res.status(404).json({ message: "Group nahi mila" });

      const msg = group.messages.id(messageID);
      if (!msg) return res.status(404).json({ message: "Message nahi mila" });

      // Sirf apna message ya creator delete kar sakta hai
      if (msg.senderID !== userID && group.createdBy !== userID)
        return res.status(403).json({ message: "Permission nahi hai" });

      msg.deleteOne();
      await group.save();

      return res.json({ message: "Message delete ho gaya ✅" });
    } catch (e) {
      return res.status(500).json({ message: "Server error", error: e.message });
    }
  }

  return res.status(404).json({ message: "Route nahi mila" });
}