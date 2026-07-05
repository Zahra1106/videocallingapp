// api/favourites.js
import { connectDB } from "../lib/db.js";
import mongoose from "mongoose";

const favSchema = new mongoose.Schema({
  userID:    { type: String, required: true },
  contactID: { type: String, required: true },
  name:      { type: String },
  email:     { type: String },
  addedAt:   { type: Date, default: Date.now },
});

export const Favourite = mongoose.models.Favourite ||
  mongoose.model("Favourite", favSchema);

export default async function favouritesHandler(req, res) {
  res.setHeader("Access-Control-Allow-Origin",  "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");

  if (req.method === "OPTIONS") return res.status(200).end();

  // ✅ FIX: connectDB pehle call nahi ho raha tha — isliye Favourite
  // model queries crash karte the. Ab yahan connect karo.
  await connectDB();

  const url = req.url.split("?")[0];

  // ── GET /api/favourites?userID=xxx ─────────────────────────
  if (req.method === "GET") {
    const { userID } = req.query;
    if (!userID) return res.status(400).json({ message: "userID chahiye" });
    try {
      const favs = await Favourite.find({ userID }).sort({ addedAt: -1 });
      return res.json({ favourites: favs });
    } catch (e) {
      return res.status(500).json({ message: e.message });
    }
  }

  // ── POST /api/favourites/add ───────────────────────────────
  if (req.method === "POST" && url === "/api/favourites/add") {
    const { userID, contactID, name, email } = req.body;
    try {
      const exists = await Favourite.findOne({ userID, contactID });
      if (exists) {
        return res.json({ message: "Pehle se favourite hai" });
      }
      await Favourite.create({ userID, contactID, name, email });
      return res.status(201).json({ message: "Favourite mein add ho gaya" });
    } catch (e) {
      return res.status(500).json({ message: e.message });
    }
  }

  // ── DELETE /api/favourites/remove ─────────────────────────
  if (req.method === "DELETE" && url === "/api/favourites/remove") {
    const { userID, contactID } = req.body;
    try {
      await Favourite.findOneAndDelete({ userID, contactID });
      return res.json({ message: "Remove ho gaya" });
    } catch (e) {
      return res.status(500).json({ message: e.message });
    }
  }

  return res.status(404).json({ message: "Route nahi mila" });
}