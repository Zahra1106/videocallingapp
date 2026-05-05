import { connectDB } from "../lib/db.js";
import mongoose from "mongoose";

// ─── CALL LOG SCHEMA ───────────────────────────────────────────────
const callLogSchema = new mongoose.Schema({
  callID:     { type: String, required: true },
  callerID:   { type: String, required: true },
  callerName: { type: String, required: true },
  calleeID:   { type: String, required: true },
  calleeName: { type: String, required: true },
  type:       { type: String, enum: ["incoming", "outgoing", "missed"], required: true },
  duration:   { type: Number, default: 0 },        // seconds mein
  startedAt:  { type: Date,   default: Date.now },
  isGroupCall:{ type: Boolean, default: false },
});

const calllog =
  mongoose.models.calllogs || mongoose.model("CallLogs", callLogSchema);

// ─── HANDLER ───────────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin",  "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");

  if (req.method === "OPTIONS") return res.status(200).end();

  await connectDB();

  // ── CALL LOG SAVE KARO ──────────────────────────────────────────
  if (req.method === "POST") {
    try {
      const {
        callID,
        callerID,
        callerName,
        calleeID,
        calleeName,
        type,
        duration,
        isGroupCall,
      } = req.body;

      if (!callID || !callerID || !callerName || !calleeID || !calleeName || !type) {
        return res.status(400).json({ message: "Sab required fields bharo" });
      }

      const log = await CallLog.create({
        callID,
        callerID,
        callerName,
        calleeID,
        calleeName,
        type,
        duration:    duration    ?? 0,
        isGroupCall: isGroupCall ?? false,
      });

      return res.status(201).json({ message: "Call log save ho gaya ✅", log });

    } catch (error) {
      return res.status(500).json({ message: "Server error", error: error.message });
    }
  }

  // ── CALL LOGS LAO ───────────────────────────────────────────────
  if (req.method === "GET") {
    try {
      const { userID } = req.query;

      if (!userID) {
        return res.status(400).json({ message: "userID chahiye" });
      }

      // Jis call mein user caller ya callee tha wo sab lao
      const logs = await CallLog.find({
        $or: [{ callerID: userID }, { calleeID: userID }],
      }).sort({ startedAt: -1 }); // naya pehle

      const logList = logs.map((l) => ({
        id:          l._id,
        callID:      l.callID,
        callerID:    l.callerID,
        callerName:  l.callerName,
        calleeID:    l.calleeID,
        calleeName:  l.calleeName,
        type:        l.type,
        duration:    l.duration,
        startedAt:   l.startedAt,
        isGroupCall: l.isGroupCall,
      }));

      return res.status(200).json({ logs: logList });

    } catch (error) {
      return res.status(500).json({ message: "Server error", error: error.message });
    }
  }

  return res.status(405).json({ message: "Method not allowed" });
}