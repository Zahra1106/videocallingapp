// api/typing.js
const typingUsers = {}; // Memory mein store karein

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");

  if (req.method === "OPTIONS") return res.status(200).end();

  // POST — typing status set karo
  if (req.method === "POST") {
    const { chatID, userID, isTyping } = req.body;
    if (!chatID || !userID)
      return res.status(400).json({ message: "chatID aur userID chahiye" });

    if (isTyping) {
      typingUsers[chatID] = userID;
      // 5 second baad auto clear
      setTimeout(() => {
        if (typingUsers[chatID] === userID) delete typingUsers[chatID];
      }, 5000);
    } else {
      delete typingUsers[chatID];
    }

    return res.json({ message: "ok" });
  }

  // GET — koi typing kar raha hai?
  if (req.method === "GET") {
    const { chatID, myID } = req.query;
    if (!chatID) return res.status(400).json({ message: "chatID chahiye" });

    const typingUserID = typingUsers[chatID];
    const isTyping = typingUserID && typingUserID !== myID;

    return res.json({ isTyping: !!isTyping });
  }

  return res.status(405).json({ message: "Method not allowed" });
}