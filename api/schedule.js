// api/schedule.js
import { connectDB } from "../lib/db.js";
import mongoose from "mongoose";

const scheduleSchema = new mongoose.Schema({
  callerID:    { type: String, required: true },
  callerName:  { type: String, required: true },
  calleeID:    { type: String, required: true },
  calleeName:  { type: String, required: true },
  scheduledAt: { type: Date, required: true },
  endTime:     { type: Date },
  callType:    { type: String, default: "video" },
  reminder:    { type: Number, default: 15 },
  notified:    { type: Boolean, default: false },
  createdAt:   { type: Date, default: Date.now },
});

export const Schedule = mongoose.models.Schedule ||
  mongoose.model("Schedule", scheduleSchema);

export default async function scheduleHandler(req, res) {
  await connectDB();

  const url = req.url.split("?")[0];

  // ── POST /api/schedule/create ──────────────────────────────
  if (req.method === "POST" && url === "/api/schedule/create") {
    const {
      callerID, callerName,
      calleeID, calleeName,
      scheduledAt, endTime,
      callType, reminder,
    } = req.body;

    if (!callerID || !calleeID || !scheduledAt) {
      return res.status(400).json({ message: "Fields missing" });
    }

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
        message: "Schedule ho gaya!",
        scheduleID: doc._id.toString(),
      });
    } catch (e) {
      return res.status(500).json({ message: e.message });
    }
  }

  // ── GET /api/schedule?userID=xxx ───────────────────────────
  if (req.method === "GET" && url === "/api/schedule") {
    const { userID } = req.query;
    if (!userID) return res.status(400).json({ message: "userID chahiye" });

    try {
      const schedules = await Schedule.find({
        $or: [{ callerID: userID }, { calleeID: userID }],
        scheduledAt: { $gte: new Date() },
      }).sort({ scheduledAt: 1 });

      return res.json({ schedules });
    } catch (e) {
      return res.status(500).json({ message: e.message });
    }
  }

  // ── DELETE /api/schedule/delete ────────────────────────────
  if (req.method === "DELETE" && url === "/api/schedule/delete") {
    const { scheduleID } = req.body;
    try {
      await Schedule.findByIdAndDelete(scheduleID);
      return res.json({ message: "Delete ho gaya" });
    } catch (e) {
      return res.status(500).json({ message: e.message });
    }
  }

  return res.status(404).json({ message: "Route nahi mila" });
}