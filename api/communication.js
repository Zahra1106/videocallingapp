import { connectDB, User } from "../lib/db.js";
import mongoose from "mongoose";
import fetch from "node-fetch"; // npm install node-fetch

// ─── SCHEMAS ─────────────────────────────────────────────────

const callLogSchema = new mongoose.Schema({
  callID:       { type: String,   required: true },
  callerID:     { type: String,   required: true },
  callerName:   { type: String,   required: true },
  calleeID:     { type: String,   required: true },
  calleeName:   { type: String,   required: true },
  type:         { type: String,   enum: ["incoming", "outgoing", "missed"], required: true },
  callType:     { type: String,   enum: ["audio", "video"], default: "audio" },
  // ✅ NEW: Call ka current status track karne ke liye
  status:       { type: String,   enum: ["ringing", "accepted", "declined", "missed", "ended"], default: "ringing" },
  duration:     { type: Number,   default: 0 },
  startedAt:    { type: Date,     default: Date.now },
  endedAt:      { type: Date,     default: null },
  isGroupCall:  { type: Boolean,  default: false },
  participants: { type: [String], default: [] },
  recordingUrl: { type: String,   default: "" },
});

const scheduleSchema = new mongoose.Schema({
  callerID:    { type: String, required: true },
  callerName:  { type: String, required: true },
  calleeID:    { type: String, required: true },
  calleeName:  { type: String, required: true },
  scheduledAt: { type: Date,   required: true },
  endTime:     { type: Date,   default: null },
  callType:    { type: String, enum: ["audio", "video"], default: "video" },
  reminder:    { type: Number, default: 15 },
  notified:    { type: Boolean, default: false },
  status:      { type: String, enum: ["pending", "confirmed", "cancelled"], default: "pending" },
  note:        { type: String, default: "" },
  createdAt:   { type: Date,   default: Date.now },
});

const companionSessionSchema = new mongoose.Schema({
  token:       { type: String,  required: true, unique: true },
  userID:      { type: String,  required: true },
  status:      { type: String,  enum: ["pending", "approved", "revoked"], default: "pending" },
  deviceInfo:  { type: Object,  default: {} },
  expiresAt:   { type: Date,    required: true },
  linkedAt:    { type: Date,    default: null },
  lastActive:  { type: Date,    default: null },
  createdAt:   { type: Date,    default: Date.now },
});

const CallLog          = mongoose.models.CallLogs          || mongoose.model("CallLogs",          callLogSchema);
const Schedule         = mongoose.models.Schedule          || mongoose.model("Schedule",          scheduleSchema);
const CompanionSession = mongoose.models.CompanionSession  || mongoose.model("CompanionSession",  companionSessionSchema);

// ─── HELPER: Silence Unknown Callers ─────────────────────────
async function isSilenced(callerID, receiverID) {
  try {
    const receiver = await User.findById(receiverID, { silenceUnknown: 1 });
    if (!receiver || !receiver.silenceUnknown) return false;
    const prevContact = await CallLog.findOne({
      $or: [
        { callerID: receiverID, calleeID: callerID },
        { callerID: callerID,   calleeID: receiverID },
      ],
    });
    if (prevContact) return false;
    return true;
  } catch (_) {
    return false;
  }
}

// ─── HELPER: Random token ─────────────────────────────────────
function generateToken() {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

// ─── HELPER: Expo Push Notification ──────────────────────────
async function sendExpoPushNotification({ expoPushToken, title, body, data }) {
  const message = {
    to:    expoPushToken,
    sound: "default",
    title,
    body,
    data:  data ?? {},
  };

  await fetch("https://exp.host/--/api/v2/push/send", {
    method:  "POST",
    headers: {
      "Content-Type":  "application/json",
      "Accept":        "application/json",
    },
    body: JSON.stringify(message),
  });
}

// ─── HELPER: FCM Push Notification ───────────────────────────
// NOTE: Legacy FCM API (fcm.googleapis.com/fcm/send) Google ne
// permanently band kar di hai (June 2024). Jab Firebase service
// account JSON mil jaye, yahan FCM v1 (firebase-admin) add karenge.
// Abhi ke liye Expo push hi call-notify ka reliable rasta hai.
async function sendFCMNotification() {
  return; // disabled — legacy FCM endpoint dead hai
}
// ─── MAIN HANDLER ─────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin",  "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");

  if (req.method === "OPTIONS") return res.status(200).end();

  await connectDB();
  const fullUrl = req.url.split("?")[0].replace(/\/$/, "");
  const path    = fullUrl.split("/").filter(Boolean).pop();

  // ── CALL LOGS ─────────────────────────────────────────────

 if (req.method === "POST" && path === "notify-call") {
  const { callerID, callerName, calleeID, calleeName, callID, callType } = req.body;

  if (!callerID || !calleeID || !callID)
    return res.status(400).json({ message: "callerID, calleeID, callID chahiye" });

  try {
    // naya: agar calleeID ne "silence unknown callers" on kar rakha hai
    // aur callerID unka jaana-pehchana contact nahi hai to call silence karo
    const silenced = await isSilenced(callerID, calleeID);
    if (silenced)
      return res.status(403).json({ message: "Receiver unknown calls silence karta hai 🔕", silenced: true });

    // naya: agar calleeID ne callerID ko block kar rakha hai to call na jaye
    const BlockModel = mongoose.models.Block;
    if (BlockModel) {
      const blocked = await BlockModel.findOne({ blockerID: calleeID, blockedID: callerID });
      if (blocked)
        return res.status(403).json({ message: "Yeh user ne aapko block kiya hai", blocked: true });
    }

    const receiver = await User.findById(calleeID, { expoPushToken: 1, name: 1 });

    // ✅ FIX 1: Pehle CallLog save karo — token ho ya na ho
    await CallLog.findOneAndUpdate(
      { callID },
      {
        $setOnInsert: {
          callID,
          callerID,
          callerName:  callerName ?? "Unknown",
          calleeID,
          calleeName:  calleeName ?? receiver?.name ?? "Unknown",
          type:        "incoming",
          callType:    callType   ?? "audio",
          status:      "ringing",
          startedAt:   new Date(),
        },
      },
      { upsert: true, new: true }
    );

    // ✅ FIX: Push notification mein POORA call data bhejo
    //    Pehle sirf callerName + callID + receiverID tha — callerID
    //    aur callType missing the, isliye Flutter IncomingCallScreen
    //    ko callerID nahi milta tha aur accept/decline fail hoti thi.
    if (receiver?.expoPushToken && receiver.expoPushToken.startsWith("ExponentPushToken")) {
      try {
        await sendExpoPushNotification({
          expoPushToken: receiver.expoPushToken,
          title: `📞 ${callerName ?? "Someone"} ka call aa raha hai`,
          body:  "Tap karo receive karne ke liye",
          data:  {
            type:       "incoming_call",
            callerID,
            callerName: callerName ?? "Unknown",
            calleeID,
            calleeName: calleeName ?? receiver?.name ?? "Unknown",
            callID,
            receiverID: calleeID,
            callType:   callType ?? "audio",
            isGroupCall: false,
          },
        });
      } catch (pushErr) {
        console.error("Push notification error (ignored):", pushErr.message);
      }
    }
    // FCM v1 (firebase-admin) — legacy HTTP fcm.googleapis.com band hai.
    // sendFCMNotification() abhi no-op hai. Jab service account JSON mile
    // tab firebase-admin add karke yahan enable karenge.
    // (receiver.fcmToken field ab use nahi hoti — Expo push hi primary hai.)


    // ✅ Hamesha 200 return karo — polling kaam karegi
    return res.status(200).json({ message: "Call initiated ✅" });

  } catch (e) {
    return res.status(500).json({ message: "Server error", error: e.message });
  }
}

  if (req.method === "GET" && path === "calllogs") {
    const { userID, type, callType, limit = 50 } = req.query;
    if (!userID) return res.status(400).json({ message: "userID chahiye" });

    try {
      const filter = { $or: [{ callerID: userID }, { calleeID: userID }] };
      if (type)     filter.type     = type;
      if (callType) filter.callType = callType;

      const logs = await CallLog.find(filter).sort({ startedAt: -1 }).limit(Number(limit));
      return res.status(200).json({
        logs: logs.map(l => {
          // naya: type ab har viewing user ke apne perspective se nikalo
          // (pehle ek hi shared 'type' value dono users ko dikhti thi,
          // isliye receiver ko bhi "outgoing" dikhta tha aur "missed" kabhi nahi)
          const missedLike = ["missed", "declined"].includes(l.status);
          const viewerType = userID === l.callerID
            ? "outgoing"
            : missedLike ? "missed" : "incoming";

          return {
            id: l._id, callID: l.callID,
            callerID: l.callerID, callerName: l.callerName,
            calleeID: l.calleeID, calleeName: l.calleeName,
            type: viewerType, callType: l.callType,
            status: l.status,
            duration: l.duration, startedAt: l.startedAt,
            endedAt: l.endedAt, isGroupCall: l.isGroupCall,
            participants: l.participants, recordingUrl: l.recordingUrl,
          };
        }),
      });
    } catch (e) {
      return res.status(500).json({ message: "Server error", error: e.message });
    }
  }

  if (req.method === "DELETE" && path === "calllogs") {
    const { callLogID, userID } = req.body;
    if (!callLogID || !userID)
      return res.status(400).json({ message: "callLogID aur userID chahiye" });

    try {
      const log = await CallLog.findById(callLogID);
      if (!log) return res.status(404).json({ message: "Call log nahi mila" });
      if (log.callerID !== userID && log.calleeID !== userID)
        return res.status(403).json({ message: "Aap is log ko delete nahi kar sakte" });

      await CallLog.findByIdAndDelete(callLogID);
      return res.json({ message: "Call log delete ho gaya ✅" });
    } catch (e) {
      return res.status(500).json({ message: "Server error", error: e.message });
    }
  }

  // ── CALL LOGS — POST (Flutter CallController.saveCallLog hit karta hai) ──
  // ✅ FIX: pehle POST handler missing tha — sirf GET aur DELETE the.
  //    Flutter call end hone pe POST bhejta tha but yahan catch nahi
  //    hoti thi, isliye log save nahi hota tha (sirf notify-call pe
  //    upsert hoti thi). Ab explicit POST handler.
  if (req.method === "POST" && path === "calllogs") {
    const {
      callID, callerID, callerName,
      calleeID, calleeName, type,
      callType = "audio", isGroupCall = false,
      duration = 0, status, participants = [],
    } = req.body;

    if (!callID || !callerID || !calleeID)
      return res.status(400).json({ message: "callID, callerID, calleeID chahiye" });

    try {
      const validTypes   = ["incoming", "outgoing", "missed"];
      const validStatus  = ["ringing", "accepted", "declined", "missed", "ended"];
      const finalType    = validTypes.includes(type) ? type : "incoming";
      const finalStatus  = validStatus.includes(status) ? status
                          : (type === "missed" ? "missed" : "ended");

      const log = await CallLog.findOneAndUpdate(
        { callID },
        {
          $set: {
            callID,
            callerID,   callerName: callerName ?? "Unknown",
            calleeID,   calleeName: calleeName ?? "Unknown",
            type:       finalType,
            callType,
            status:     finalStatus,
            isGroupCall: Boolean(isGroupCall),
            duration:   Number(duration) || 0,
            endedAt:    ["ended", "declined", "missed"].includes(finalStatus) ? new Date() : null,
            ...(Array.isArray(participants) && participants.length ? { participants } : {}),
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      return res.status(201).json({ message: "Call log save ho gaya ✅", log });
    } catch (e) {
      return res.status(500).json({ message: "Server error", error: e.message });
    }
  }

  // ── NOTIFY CALL (Expo Push) ───────────────────────────────
  // ✅ UPDATED: Ab CallLog bhi save hoga status: 'ringing' ke saath

  

  // ── PENDING CALL (Flutter polling) ───────────────────────
  // ✅ NEW: Flutter har 5 sec mein yeh hit karta hai

  if (req.method === "GET" && path === "pending-call") {
    const { userID } = req.query;
    if (!userID) return res.status(400).json({ message: "userID chahiye" });

    try {
      // Sirf last 30 sec ki ringing calls check karo
      const thirtySecondsAgo = new Date(Date.now() - 30 * 1000);
      const pendingCall = await CallLog.findOne({
        calleeID:  userID,
        status:    "ringing",
        startedAt: { $gte: thirtySecondsAgo },
      }).sort({ startedAt: -1 });

      if (!pendingCall)
        return res.status(200).json({ hasPendingCall: false });

      // status yahan change NAHI karna — abhi sirf "ring dikhayi" hai,
      // receiver ne accept/decline nahi kiya. Real status update
      // Accept/Decline button dabane pe CallController/IncomingCallScreen
      // khud karte hain. Duplicate popup client-side already guard hai.

      return res.status(200).json({
        hasPendingCall: true,
        call: {
          callID:     pendingCall.callID,
          callerID:   pendingCall.callerID,
          callerName: pendingCall.callerName,
          calleeID:   pendingCall.calleeID,
          calleeName: pendingCall.calleeName,
          callType:   pendingCall.callType,
          startedAt:  pendingCall.startedAt,
        },
      });
    } catch (e) {
      console.error("[pending-call] Error:", e);
      return res.status(500).json({ message: "Server error", error: e.message });
    }
  }

  // ── SCHEDULE ──────────────────────────────────────────────

  if (req.method === "POST" && path === "create") {
    const { callerID, callerName, calleeID, calleeName, scheduledAt, endTime, callType, reminder, note } = req.body;
    if (!callerID || !calleeID || !scheduledAt)
      return res.status(400).json({ message: "callerID, calleeID, scheduledAt chahiye" });

    try {
      const silenced = await isSilenced(callerID, calleeID);
      if (silenced)
        return res.status(403).json({ message: "Receiver unknown calls silence karta hai 🔕", silenced: true });

      const doc = await Schedule.create({
        callerID, callerName: callerName ?? "",
        calleeID, calleeName: calleeName ?? "",
        scheduledAt: new Date(scheduledAt),
        endTime:  endTime ? new Date(endTime) : null,
        callType: callType ?? "video",
        reminder: reminder ?? 15,
        note:     note     ?? "",
        status:   "pending",
      });
      return res.status(201).json({ message: "Schedule ho gaya ✅", scheduleID: doc._id.toString(), data: doc });
    } catch (e) {
      return res.status(500).json({ message: "Server error", error: e.message });
    }
  }

  if (req.method === "GET" && path === "schedule") {
    const { userID, status, includePast } = req.query;
    if (!userID) return res.status(400).json({ message: "userID chahiye" });

    try {
      const filter = { $or: [{ callerID: userID }, { calleeID: userID }] };
      if (includePast !== "true") filter.scheduledAt = { $gte: new Date() };
      if (status) filter.status = status;

      const schedules = await Schedule.find(filter).sort({ scheduledAt: 1 });
      return res.json({ schedules });
    } catch (e) {
      return res.status(500).json({ message: "Server error", error: e.message });
    }
  }

  if (req.method === "PATCH" && path === "schedule") {
    const { scheduleID, userID, scheduledAt, endTime, callType, reminder, note, status } = req.body;
    if (!scheduleID || !userID)
      return res.status(400).json({ message: "scheduleID aur userID chahiye" });

    try {
      const doc = await Schedule.findById(scheduleID);
      if (!doc) return res.status(404).json({ message: "Schedule nahi mila" });
      if (doc.callerID !== userID && doc.calleeID !== userID)
        return res.status(403).json({ message: "Aap is schedule ko update nahi kar sakte" });

      if (scheduledAt) doc.scheduledAt = new Date(scheduledAt);
      if (endTime)     doc.endTime     = new Date(endTime);
      if (callType)    doc.callType    = callType;
      if (reminder !== undefined) doc.reminder = reminder;
      if (note     !== undefined) doc.note     = note;
      if (status) {
        if (!["pending", "confirmed", "cancelled"].includes(status))
          return res.status(400).json({ message: "Status galat hai" });
        doc.status = status;
      }
      if (scheduledAt) doc.notified = false;

      await doc.save();
      return res.json({ message: "Schedule update ho gaya ✅", data: doc });
    } catch (e) {
      return res.status(500).json({ message: "Server error", error: e.message });
    }
  }

  if (req.method === "DELETE" && path === "delete") {
    const { scheduleID, userID } = req.body;
    if (!scheduleID || !userID)
      return res.status(400).json({ message: "scheduleID aur userID chahiye" });

    try {
      const doc = await Schedule.findById(scheduleID);
      if (!doc) return res.status(404).json({ message: "Schedule nahi mila" });
      if (doc.callerID !== userID && doc.calleeID !== userID)
        return res.status(403).json({ message: "Aap is schedule ko delete nahi kar sakte" });

      await Schedule.findByIdAndDelete(scheduleID);
      return res.json({ message: "Schedule delete ho gaya ✅" });
    } catch (e) {
      return res.status(500).json({ message: "Server error", error: e.message });
    }
  }

  if (req.method === "GET" && path === "reminders") {
    const { userID } = req.query;
    if (!userID) return res.status(400).json({ message: "userID chahiye" });

    try {
      const now = new Date();
      const upcoming = await Schedule.find({
        $or:      [{ callerID: userID }, { calleeID: userID }],
        status:   { $ne: "cancelled" },
        notified: false,
        scheduledAt: { $gte: now, $lte: new Date(now.getTime() + 60 * 60 * 1000) },
      }).sort({ scheduledAt: 1 });

      return res.json({ reminders: upcoming });
    } catch (e) {
      return res.status(500).json({ message: "Server error", error: e.message });
    }
  }

  if (req.method === "PATCH" && path === "notified") {
    const { scheduleID } = req.body;
    if (!scheduleID) return res.status(400).json({ message: "scheduleID chahiye" });

    try {
      await Schedule.findByIdAndUpdate(scheduleID, { notified: true });
      return res.json({ message: "Notified mark ho gaya ✅" });
    } catch (e) {
      return res.status(500).json({ message: "Server error", error: e.message });
    }
  }

  // ── COMPANION MODE ────────────────────────────────────────

  if (req.method === "POST" && path === "companion-generate") {
    const { userID } = req.body;
    if (!userID) return res.status(400).json({ message: "userID chahiye" });

    try {
      await CompanionSession.deleteMany({ userID, status: "pending", expiresAt: { $lt: new Date() } });
      const token     = generateToken();
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
      await CompanionSession.create({ token, userID, expiresAt });
      return res.status(201).json({ message: "Session token ban gaya ✅", token, expiresAt });
    } catch (e) {
      return res.status(500).json({ message: "Server error", error: e.message });
    }
  }

  if (req.method === "POST" && path === "companion-verify") {
    const { token, deviceInfo } = req.body;
    if (!token) return res.status(400).json({ message: "token chahiye" });

    try {
      const session = await CompanionSession.findOne({ token });
      if (!session)                     return res.status(404).json({ message: "Session nahi mili" });
      if (session.status === "revoked")  return res.status(410).json({ message: "Yeh session revoke ho chuka hai" });
      if (session.status === "approved") return res.status(409).json({ message: "Yeh session pehle se approved hai" });
      if (new Date() > session.expiresAt) return res.status(410).json({ message: "Session expire ho gayi, dobara QR scan karo" });

      session.status     = "approved";
      session.deviceInfo = deviceInfo ?? {};
      session.linkedAt   = new Date();
      session.lastActive = new Date();
      await session.save();

      const user = await User.findById(session.userID, { name: 1, email: 1, image: 1 });
      return res.status(200).json({
        message: "Device link ho gaya ✅",
        token, userID: session.userID,
        userName: user?.name  ?? "",
        email:    user?.email ?? "",
        image:    user?.image ?? "",
      });
    } catch (e) {
      return res.status(500).json({ message: "Server error", error: e.message });
    }
  }

  if (req.method === "GET" && path === "companion-devices") {
    const { userID } = req.query;
    if (!userID) return res.status(400).json({ message: "userID chahiye" });

    try {
      const devices = await CompanionSession.find({ userID, status: "approved" }).sort({ linkedAt: -1 });
      return res.status(200).json({
        devices: devices.map(d => ({
          token: d.token, deviceInfo: d.deviceInfo,
          linkedAt: d.linkedAt, lastActive: d.lastActive,
        })),
      });
    } catch (e) {
      return res.status(500).json({ message: "Server error", error: e.message });
    }
  }

  if (req.method === "DELETE" && path === "companion-unlink") {
    const { token, userID } = req.body;
    if (!token || !userID)
      return res.status(400).json({ message: "token aur userID chahiye" });

    try {
      const session = await CompanionSession.findOne({ token });
      if (!session) return res.status(404).json({ message: "Session nahi mili" });
      if (session.userID !== userID) return res.status(403).json({ message: "Aap is device ko unlink nahi kar sakte" });

      session.status = "revoked";
      await session.save();
      return res.status(200).json({ message: "Device unlink ho gaya ✅" });
    } catch (e) {
      return res.status(500).json({ message: "Server error", error: e.message });
    }
  }

  if (req.method === "PATCH" && path === "companion-active") {
    const { token } = req.body;
    if (!token) return res.status(400).json({ message: "token chahiye" });

    try {
      await CompanionSession.findOneAndUpdate({ token, status: "approved" }, { lastActive: new Date() });
      return res.status(200).json({ message: "Active update ho gaya ✅" });
    } catch (e) {
      return res.status(500).json({ message: "Server error", error: e.message });
    }
  }
  // ── CALL STATUS UPDATE ────────────────────────────────────
if (req.method === "PATCH" && path === "call-status") {
  const { callID, status, duration } = req.body;
  if (!callID || !status)
    return res.status(400).json({ message: "callID aur status chahiye" });

  try {
    const validStatuses = ["ringing", "accepted", "declined", "missed", "ended"];
    if (!validStatuses.includes(status))
      return res.status(400).json({ message: "Invalid status" });

    const update = {
      status,
      endedAt: ["ended", "declined", "missed"].includes(status) ? new Date() : null,
    };
    // naya: duration bhi save karo (agar bheji gayi ho)
    if (typeof duration === "number" && duration >= 0) update.duration = duration;

    const log = await CallLog.findOneAndUpdate(
      { callID },
      { $set: update },
      { new: true }
    );

    if (!log)
      return res.status(404).json({ message: "Call log nahi mila" });

    return res.status(200).json({ message: "Status update ho gaya ✅", status });
  } catch (e) {
    return res.status(500).json({ message: "Server error", error: e.message });
  }
}

  // ── CALL STATUS CHECK (caller polling ke liye) ────────────
  if (req.method === "GET" && path === "call-status-check") {
    const { callID } = req.query;
    if (!callID) return res.status(400).json({ message: "callID chahiye" });

    try {
      const log = await CallLog.findOne({ callID }, { status: 1 });
      if (!log) return res.status(404).json({ message: "Call nahi mili" });
      return res.status(200).json({ status: log.status });
    } catch (e) {
      return res.status(500).json({ message: "Server error", error: e.message });
    }
  }

  return res.status(404).json({ message: "Route nahi mila", method: req.method, url: fullUrl, path });
}