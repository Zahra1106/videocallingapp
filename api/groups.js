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

  // POST /api/groups/poll — poll banao
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

  // ✅ PATCH /api/groups/vote — vote karo
  // Vercel pe PATCH problem hoti hai isliye POST bhi accept karo
  if ((req.method === "PATCH" || req.method === "POST") && url.includes("/vote")) {
    const { groupID, messageID, optionIndex, userID } = req.body;
    if (!groupID || !messageID || optionIndex === undefined || !userID)
      return res.status(400).json({ message: "Fields missing" });

    try {
      const group = await Group.findById(groupID);
      if (!group) return res.status(404).json({ message: "Group nahi mila" });

      const msg = group.messages.id(messageID);
      if (!msg || !msg.isPoll) return res.status(404).json({ message: "Poll nahi mila" });

      // Pehle sab options se vote hatao
      msg.poll.options.forEach(opt => {
        opt.votes = opt.votes.filter(v => v !== userID);
      });

      // Naye option mein vote add karo
      msg.poll.options[optionIndex].votes.push(userID);
      await group.save();

      return res.json({ message: "Vote ho gaya ✅", poll: msg.poll });
    } catch (e) {
      return res.status(500).json({ message: "Server error", error: e.message });
    }
  }

  return res.status(404).json({ message: "Route nahi mila" });
}