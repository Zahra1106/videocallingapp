// ─────────────────────────────────────────────────────────────
//  blockRoutes.js  —  Express routes for Block Feature
//  
//  Setup:
//    app.use('/api/block', require('./blockRoutes'));
// ─────────────────────────────────────────────────────────────

const express = require('express');
const router  = express.Router();
const Block   = require('./BlockModel'); // neeche model bhi hai

// ── BLOCK KARO ────────────────────────────────────────────────
// POST /api/block
// Body: { blockerID, blockedID }
router.post('/', async (req, res) => {
  try {
    const { blockerID, blockedID } = req.body;
    if (!blockerID || !blockedID)
      return res.status(400).json({ error: "IDs required" });

    // Already blocked? duplicate nahi banao
    const exists = await Block.findOne({ blockerID, blockedID });
    if (exists) return res.json({ message: "Already blocked" });

    await Block.create({ blockerID, blockedID });
    res.json({ message: "Blocked successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── UNBLOCK KARO ──────────────────────────────────────────────
// DELETE /api/block
// Body: { blockerID, blockedID }
router.delete('/', async (req, res) => {
  try {
    const { blockerID, blockedID } = req.body;
    await Block.deleteOne({ blockerID, blockedID });
    res.json({ message: "Unblocked successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── BLOCKED LIST ──────────────────────────────────────────────
// GET /api/block/list/:myID
router.get('/list/:myID', async (req, res) => {
  try {
    const { myID } = req.params;
    const blocks = await Block.find({ blockerID: myID });
    const blockedUsers = blocks.map(b => b.blockedID);
    res.json({ blockedUsers });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── CHECK: kya X ne Y ko block kiya? ─────────────────────────
// GET /api/block/check?blockerID=X&blockedID=Y
router.get('/check', async (req, res) => {
  try {
    const { blockerID, blockedID } = req.query;
    const exists = await Block.findOne({ blockerID, blockedID });
    res.json({ isBlocked: !!exists });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;


// ─────────────────────────────────────────────────────────────
//  BlockModel.js  —  Mongoose Schema
//  (Is code ko alag BlockModel.js file mein daalo)
// ─────────────────────────────────────────────────────────────

/*
const mongoose = require('mongoose');

const blockSchema = new mongoose.Schema({
  blockerID: { type: String, required: true },   // jisne block kiya
  blockedID: { type: String, required: true },   // jise block kiya
  blockedAt: { type: Date,   default: Date.now },
});

// Duplicate index — ek pair ek baar hi ho sakta
blockSchema.index({ blockerID: 1, blockedID: 1 }, { unique: true });

module.exports = mongoose.model('Block', blockSchema);
*/


// ─────────────────────────────────────────────────────────────
//  Message bhejne se pehle block check karo (sendMessage mein)
//  
//  Apne existing sendMessage route mein yeh add karo:
// ─────────────────────────────────────────────────────────────

/*
  // Sender blocked hai kya?
  const isBlocked = await Block.findOne({
    blockerID: targetID,   // receiver ne block kiya ho
    blockedID: senderID,   // sender ko
  });
  
  if (isBlocked) {
    return res.status(403).json({ error: "Aap block hain, message nahi ja sakta" });
  }
*/