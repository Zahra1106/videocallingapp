// api/favourites.js
import { User } from "../lib/db.js";
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
  const url = req.url.split("?")[0];

  // ── GET /api/favourites?userID=xxx ─────────────────────────
  if (req.method === "GET") {
    const { userID } = req.query;
    try {
      const favs = await Favourite.find({ userID });
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