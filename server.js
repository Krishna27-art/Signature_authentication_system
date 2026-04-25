
const express = require("express");
const fs      = require("fs");
const path    = require("path");
const cors    = require("cors");

const app      = express();
const PORT     = 3000;
const DATA_FILE = path.join(__dirname, "signature_data.json");

app.use(cors());
app.use(express.json({ limit: "10mb" }));

app.use(express.static(__dirname));

app.post("/api/save", (req, res) => {
  try {
    const data = req.body;

    data._savedAt = new Date().toISOString();

    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf8");

    console.log(`[Server] Data saved → signature_data.json (${new Date().toLocaleTimeString()})`);
    res.json({ ok: true, savedAt: data._savedAt });
  } catch (err) {
    console.error("[Server] Save failed:", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get("/api/load", (req, res) => {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      return res.json({ ok: true, data: null });
    }
    const raw  = fs.readFileSync(DATA_FILE, "utf8");
    const data = JSON.parse(raw);
    console.log(`[Server] Data loaded from signature_data.json`);
    res.json({ ok: true, data });
  } catch (err) {
    console.error("[Server] Load failed:", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.delete("/api/reset", (req, res) => {
  try {
    if (fs.existsSync(DATA_FILE)) fs.unlinkSync(DATA_FILE);
    console.log("[Server] signature_data.json deleted (reset).");
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get("/api/ping", (req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log("─────────────────────────────────────────");
  console.log(` Signature Auth Server running`);
  console.log(` Open → http://localhost:${PORT}`);
  console.log(` Data → ${DATA_FILE}`);
  console.log("─────────────────────────────────────────");
});
