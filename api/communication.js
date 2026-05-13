// api/communication.js
import { connectDB } from "../lib/db.js";
import mongoose from "mongoose";

// ─── SCHEMAS ──────────────────────────────────────────────────────

const callLogSchema = new mongoose.Schema({
  callID:      { type: String,  required: true },
  callerID:    { type: String,  required: true },
  callerName:  { type: String,  required: true },
  calleeID:    { type: String,  required: true },
  calleeName:  { type: String,  required: true },
  type:        { type: String,  enum: ["incoming", "outgoing", "missed"], required: true },
  duration:    { type: Number,  default: 0 },
  startedAt:   { type: Date,    default: Date.now },
  isGroupCall: { type: Boolean, default: false },
});

const scheduleSchema = new mongoose.Schema({
  callerID:    { type: String, required: true },
  callerName:  { type: String, required: true },
  calleeID:    { type: String, required: true },
  calleeName:  { type: String, required: true },
  scheduledAt: { type: Date,   required: true },
  endTime:     { type: Date },
  callType:    { type: String,  default: "video" },
  reminder:    { type: Number,  default: 15 },
  notified:    { type: Boolean, default: false },
  createdAt:   { type: Date,    default: Date.now },
});

const CallLog  = mongoose.models.CallLogs || mongoose.model("CallLogs", callLogSchema);
const Schedule = mongoose.models.Schedule || mongoose.model("Schedule", scheduleSchema);

// ─── HANDLER ──────────────────────────────────────────────────────

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin",  "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");

  if (req.method === "OPTIONS") return res.status(200).end();

  await connectDB();

  const fullUrl = req.url.split("?")[0];
  const path    = fullUrl.split("/").pop(); // "calllogs", "schedule", "create", "delete"

  // ════════════════════════════════════════════════════════════
  //  CALL LOGS
  // ════════════════════════════════════════════════════════════

  // ── POST /api/communication/calllogs ────────────────────────
  if (req.method === "POST" && path === "calllogs") {
    const {
      callID, callerID, callerName,
      calleeID, calleeName, type,
      duration, isGroupCall,
    } = req.body;

    if (!callID || !callerID || !callerName || !calleeID || !calleeName || !type)
      return res.status(400).json({ message: "Sab required fields bharo" });

    try {
      const log = await CallLog.create({
        callID, callerID, callerName,
        calleeID, calleeName, type,
        duration:    duration    ?? 0,
        isGroupCall: isGroupCall ?? false,
      });
      return res.status(201).json({ message: "Call log save ho gaya ✅", log });
    } catch (e) {
      return res.status(500).json({ message: "Server error", error: e.message });
    }
  }

  // ── GET /api/communication/calllogs?userID=xxx ──────────────
  if (req.method === "GET" && path === "calllogs") {
    const { userID } = req.query;
    if (!userID)
      return res.status(400).json({ message: "userID chahiye" });

    try {
      const logs = await CallLog.find({
        $or: [{ callerID: userID }, { calleeID: userID }],
      }).sort({ startedAt: -1 });

      return res.status(200).json({
        logs: logs.map(l => ({
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
        })),
      });
    } catch (e) {
      return res.status(500).json({ message: "Server error", error: e.message });
    }
  }

  // ════════════════════════════════════════════════════════════
  //  SCHEDULE
  // ════════════════════════════════════════════════════════════

  // ── POST /api/communication/create ──────────────────────────
  if (req.method === "POST" && path === "create") {
    const {
      callerID, callerName,
      calleeID, calleeName,
      scheduledAt, endTime,
      callType, reminder,
    } = req.body;

    if (!callerID || !calleeID || !scheduledAt)
      return res.status(400).json({ message: "Fields missing" });

    try {
      const doc = await Schedule.create({
        callerID, callerName,
        calleeID, calleeName,
        scheduledAt: new Date(scheduledAt),
        endTime:     endTime ? new Date(endTime) : null,
        callType:    callType ?? "video",
        reminder:    reminder ?? 15,
      });
      return res.status(201).json({
        message:    "Schedule ho gaya ✅",
        scheduleID: doc._id.toString(),
      });
    } catch (e) {
      return res.status(500).json({ message: "Server error", error: e.message });
    }
  }

  // ── GET /api/communication/schedule?userID=xxx ──────────────
  if (req.method === "GET" && path === "schedule") {
    const { userID } = req.query;
    if (!userID)
      return res.status(400).json({ message: "userID chahiye" });

    try {
      const schedules = await Schedule.find({
        $or: [{ callerID: userID }, { calleeID: userID }],
        scheduledAt: { $gte: new Date() },
      }).sort({ scheduledAt: 1 });

      return res.json({ schedules });
    } catch (e) {
      return res.status(500).json({ message: "Server error", error: e.message });
    }
  }

  // ── DELETE /api/communication/delete ────────────────────────
  if (req.method === "DELETE" && path === "delete") {
    const { scheduleID } = req.body;
    if (!scheduleID)
      return res.status(400).json({ message: "scheduleID chahiye" });

    try {
      await Schedule.findByIdAndDelete(scheduleID);
      return res.json({ message: "Schedule delete ho gaya ✅" });
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