// api/communication.js
import { connectDB } from "../lib/db.js";
import mongoose from "mongoose";

// ─── SCHEMAS ──────────────────────────────────────────────────────

const callLogSchema = new mongoose.Schema({
  callID:       { type: String,   required: true },
  callerID:     { type: String,   required: true },
  callerName:   { type: String,   required: true },
  calleeID:     { type: String,   required: true },
  calleeName:   { type: String,   required: true },
  type:         { type: String,   enum: ["incoming", "outgoing", "missed"], required: true },
  callType:     { type: String,   enum: ["audio", "video"], default: "audio" },
  duration:     { type: Number,   default: 0 },
  startedAt:    { type: Date,     default: Date.now },
  endedAt:      { type: Date,     default: null },
  isGroupCall:  { type: Boolean,  default: false },
  participants: { type: [String], default: [] },   // group call members
  recordingUrl: { type: String,   default: "" },   // call recording (optional)
});

const scheduleSchema = new mongoose.Schema({
  callerID:    { type: String, required: true },
  callerName:  { type: String, required: true },
  calleeID:    { type: String, required: true },
  calleeName:  { type: String, required: true },
  scheduledAt: { type: Date,   required: true },
  endTime:     { type: Date,   default: null },
  callType:    { type: String, enum: ["audio", "video"], default: "video" },
  reminder:    { type: Number, default: 15 },    // minutes pehle notify
  notified:    { type: Boolean, default: false },
  status:      {                                  // ← naya field
    type:    String,
    enum:    ["pending", "confirmed", "cancelled"],
    default: "pending",
  },
  note:        { type: String, default: "" },    // ← optional note/agenda
  createdAt:   { type: Date,   default: Date.now },
});

const CallLog  = mongoose.models.CallLogs || mongoose.model("CallLogs", callLogSchema);
const Schedule = mongoose.models.Schedule || mongoose.model("Schedule", scheduleSchema);

// ─── HANDLER ──────────────────────────────────────────────────────

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin",  "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");

  if (req.method === "OPTIONS") return res.status(200).end();

  await connectDB();

  const fullUrl = req.url.split("?")[0];
  const path    = fullUrl.split("/").pop();

  // ════════════════════════════════════════════════════════════
  //  CALL LOGS
  // ════════════════════════════════════════════════════════════

  // ── POST /api/communication/calllogs — naya log save karo ───
  if (req.method === "POST" && path === "calllogs") {
    const {
      callID, callerID, callerName,
      calleeID, calleeName, type, callType,
      duration, endedAt, isGroupCall,
      participants, recordingUrl,
    } = req.body;

    if (!callID || !callerID || !callerName || !calleeID || !calleeName || !type)
      return res.status(400).json({ message: "Sab required fields bharo" });

    try {
      const log = await CallLog.create({
        callID, callerID, callerName,
        calleeID, calleeName,
        type,
        callType:     callType     ?? "audio",
        duration:     duration     ?? 0,
        endedAt:      endedAt      ? new Date(endedAt) : null,
        isGroupCall:  isGroupCall  ?? false,
        participants: participants ?? [],
        recordingUrl: recordingUrl ?? "",
      });
      return res.status(201).json({ message: "Call log save ho gaya ✅", log });
    } catch (e) {
      return res.status(500).json({ message: "Server error", error: e.message });
    }
  }

  // ── GET /api/communication/calllogs?userID=xxx ──────────────
  if (req.method === "GET" && path === "calllogs") {
    const { userID, type, callType, limit = 50 } = req.query;
    if (!userID)
      return res.status(400).json({ message: "userID chahiye" });

    try {
      const filter = {
        $or: [{ callerID: userID }, { calleeID: userID }],
      };
      if (type)     filter.type     = type;      // incoming/outgoing/missed
      if (callType) filter.callType = callType;  // audio/video

      const logs = await CallLog
        .find(filter)
        .sort({ startedAt: -1 })
        .limit(Number(limit));

      return res.status(200).json({
        logs: logs.map(l => ({
          id:           l._id,
          callID:       l.callID,
          callerID:     l.callerID,
          callerName:   l.callerName,
          calleeID:     l.calleeID,
          calleeName:   l.calleeName,
          type:         l.type,
          callType:     l.callType,
          duration:     l.duration,
          startedAt:    l.startedAt,
          endedAt:      l.endedAt,
          isGroupCall:  l.isGroupCall,
          participants: l.participants,
          recordingUrl: l.recordingUrl,
        })),
      });
    } catch (e) {
      return res.status(500).json({ message: "Server error", error: e.message });
    }
  }

  // ── DELETE /api/communication/calllogs — log delete karo ────
  if (req.method === "DELETE" && path === "calllogs") {
    const { callLogID, userID } = req.body;

    if (!callLogID || !userID)
      return res.status(400).json({ message: "callLogID aur userID chahiye" });

    try {
      const log = await CallLog.findById(callLogID);
      if (!log)
        return res.status(404).json({ message: "Call log nahi mila" });

      // Sirf caller ya callee delete kar sakta hai
      if (log.callerID !== userID && log.calleeID !== userID)
        return res.status(403).json({ message: "Aap is log ko delete nahi kar sakte" });

      await CallLog.findByIdAndDelete(callLogID);
      return res.json({ message: "Call log delete ho gaya ✅" });
    } catch (e) {
      return res.status(500).json({ message: "Server error", error: e.message });
    }
  }

  // ════════════════════════════════════════════════════════════
  //  SCHEDULE
  // ════════════════════════════════════════════════════════════

  // ── POST /api/communication/create — naya schedule banao ────
  if (req.method === "POST" && path === "create") {
    const {
      callerID, callerName,
      calleeID, calleeName,
      scheduledAt, endTime,
      callType, reminder, note,
    } = req.body;

    if (!callerID || !calleeID || !scheduledAt)
      return res.status(400).json({ message: "callerID, calleeID, scheduledAt chahiye" });

    try {
      const doc = await Schedule.create({
        callerID, callerName: callerName ?? "",
        calleeID, calleeName: calleeName ?? "",
        scheduledAt: new Date(scheduledAt),
        endTime:     endTime ? new Date(endTime) : null,
        callType:    callType ?? "video",
        reminder:    reminder ?? 15,
        note:        note     ?? "",
        status:      "pending",
      });
      return res.status(201).json({
        message:    "Schedule ho gaya ✅",
        scheduleID: doc._id.toString(),
        data:       doc,
      });
    } catch (e) {
      return res.status(500).json({ message: "Server error", error: e.message });
    }
  }

  // ── GET /api/communication/schedule?userID=xxx ──────────────
  if (req.method === "GET" && path === "schedule") {
    const { userID, status, includePast } = req.query;
    if (!userID)
      return res.status(400).json({ message: "userID chahiye" });

    try {
      const filter = {
        $or: [{ callerID: userID }, { calleeID: userID }],
      };

      // Default: sirf future schedules; includePast=true to sab dikhao
      if (includePast !== "true") {
        filter.scheduledAt = { $gte: new Date() };
      }

      if (status) filter.status = status; // pending/confirmed/cancelled

      const schedules = await Schedule
        .find(filter)
        .sort({ scheduledAt: 1 });

      return res.json({ schedules });
    } catch (e) {
      return res.status(500).json({ message: "Server error", error: e.message });
    }
  }

  // ── PATCH /api/communication/schedule — update karo ─────────
  if (req.method === "PATCH" && path === "schedule") {
    const {
      scheduleID, userID,
      scheduledAt, endTime,
      callType, reminder, note, status,
    } = req.body;

    if (!scheduleID || !userID)
      return res.status(400).json({ message: "scheduleID aur userID chahiye" });

    try {
      const doc = await Schedule.findById(scheduleID);
      if (!doc)
        return res.status(404).json({ message: "Schedule nahi mila" });

      // Sirf caller ya callee update kar sakta hai
      if (doc.callerID !== userID && doc.calleeID !== userID)
        return res.status(403).json({ message: "Aap is schedule ko update nahi kar sakte" });

      if (scheduledAt) doc.scheduledAt = new Date(scheduledAt);
      if (endTime)     doc.endTime     = new Date(endTime);
      if (callType)    doc.callType    = callType;
      if (reminder !== undefined) doc.reminder = reminder;
      if (note     !== undefined) doc.note     = note;
      if (status)  {
        const allowed = ["pending", "confirmed", "cancelled"];
        if (!allowed.includes(status))
          return res.status(400).json({ message: "Status galat hai (pending/confirmed/cancelled)" });
        doc.status = status;
      }

      // Agar reschedule hua to notified reset karo
      if (scheduledAt) doc.notified = false;

      await doc.save();
      return res.json({ message: "Schedule update ho gaya ✅", data: doc });
    } catch (e) {
      return res.status(500).json({ message: "Server error", error: e.message });
    }
  }

  // ── DELETE /api/communication/delete — schedule hatao ───────
  if (req.method === "DELETE" && path === "delete") {
    const { scheduleID, userID } = req.body;

    if (!scheduleID)
      return res.status(400).json({ message: "scheduleID chahiye" });

    try {
      const doc = await Schedule.findById(scheduleID);
      if (!doc)
        return res.status(404).json({ message: "Schedule nahi mila" });

      if (userID && doc.callerID !== userID && doc.calleeID !== userID)
        return res.status(403).json({ message: "Aap is schedule ko delete nahi kar sakte" });

      await Schedule.findByIdAndDelete(scheduleID);
      return res.json({ message: "Schedule delete ho gaya ✅" });
    } catch (e) {
      return res.status(500).json({ message: "Server error", error: e.message });
    }
  }

  // ── GET /api/communication/reminders?userID=xxx ─────────────
  // Upcoming reminders: jo schedules reminder window mein aa gaye hain
  if (req.method === "GET" && path === "reminders") {
    const { userID } = req.query;
    if (!userID)
      return res.status(400).json({ message: "userID chahiye" });

    try {
      const now = new Date();

      // Woh schedules jinka reminder time aa gaya ho lekin notified nahi
      const upcoming = await Schedule.find({
        $or:        [{ callerID: userID }, { calleeID: userID }],
        status:     { $ne: "cancelled" },
        notified:   false,
        scheduledAt: {
          $gte: now,
          // reminder field minutes mein hai
          $lte: new Date(now.getTime() + 60 * 60 * 1000), // agle 1 ghante ke
        },
      }).sort({ scheduledAt: 1 });

      return res.json({ reminders: upcoming });
    } catch (e) {
      return res.status(500).json({ message: "Server error", error: e.message });
    }
  }

  // ── PATCH /api/communication/notified — remind mark karo ────
  if (req.method === "PATCH" && path === "notified") {
    const { scheduleID } = req.body;
    if (!scheduleID)
      return res.status(400).json({ message: "scheduleID chahiye" });

    try {
      await Schedule.findByIdAndUpdate(scheduleID, { notified: true });
      return res.json({ message: "Notified mark ho gaya ✅" });
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