require("dotenv").config();
const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "../Frontend")));

function sanitizeInput(str) {
    if (!str) return "";
    return str.replace(
        /[&<>'"]/g,
        (tag) =>
        ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            "'": "&#39;",
            '"': "&quot;",
        })[tag],
    );
}

app.get("/api/config", (req, res) => {
    res.json({ mapsApiKey: process.env.GOOGLE_API_KEY });
});

app.get("/wc", (req, res) => {
    const dataPath = path.join(__dirname, "wcList.json");
    fs.readFile(dataPath, "utf-8", (err, data) => {
        if (err) return res.status(500).json({ error: "Failed to load data" });
        res.json(JSON.parse(data));
    });
});

app.post("/api/submit-place", (req, res) => {
    const title = sanitizeInput(req.body.title);
    const openTime = sanitizeInput(req.body.openTime);
    const access = sanitizeInput(req.body.access);
    const note = sanitizeInput(req.body.note);
    const { lat, lng } = req.body;
    const wcPath = path.join(__dirname, "wcList.json");
    const pendingPath = path.join(__dirname, "pending_places.json");

    fs.readFile(wcPath, "utf8", (err, wcData) => {
        if (err) return res.status(500).json({ error: "Failed to read main data" });

        let places = [];
        try { places = JSON.parse(wcData); } catch (e) { }

        const newPlace = {
            id: places.length ? Math.max(...places.map((p) => p.id || 0)) + 1 : 1,
            building: title,
            operatingHours: openTime,
            access: access || "ALL (Staff & Students)",
            note: note || "", 
            isPending: true,
            lat: lat,
            lng: lng,
        };

        places.push(newPlace);

        fs.writeFile(wcPath, JSON.stringify(places, null, 2), (err) => {
            if (err) return res.status(500).json({ error: "Failed to save to main list" });

            fs.readFile(pendingPath, "utf8", (err, pendingData) => {
                let pendingPlaces = [];
                if (!err && pendingData) {
                    try { pendingPlaces = JSON.parse(pendingData); } catch (e) { }
                }

                pendingPlaces.push(newPlace);

                fs.writeFile(
                    pendingPath,
                    JSON.stringify(pendingPlaces, null, 2),
                    (err) => {
                        if (err) console.error("Failed to update pending list");
                        res.status(200).json({ message: "Place saved and marked as pending!" });
                    }
                );
            });
        });
    });
});

// ==========================================
// ADMIN APPROVAL ROUTES
// ==========================================
const readJSON = (filePath) => {
    if (!fs.existsSync(filePath)) return [];
    try { return JSON.parse(fs.readFileSync(filePath, "utf-8")); } catch (e) { return []; }
};
const writeJSON = (filePath, data) => fs.writeFileSync(filePath, JSON.stringify(data, null, 2));

app.get("/api/pending", (req, res) => {
    const pendingPath = path.join(__dirname, "pending_places.json");
    res.json(readJSON(pendingPath));
});

app.post("/api/approve", (req, res) => {
    const { id } = req.body;
    const wcPath = path.join(__dirname, "wcList.json");
    const pendingPath = path.join(__dirname, "pending_places.json");

    try {
        let places = readJSON(wcPath);
        const placeIndex = places.findIndex(p => p.id === id);
        if (placeIndex !== -1) {
            delete places[placeIndex].isPending;
            writeJSON(wcPath, places);
        }

        let pending = readJSON(pendingPath);
        pending = pending.filter(p => p.id !== id);
        writeJSON(pendingPath, pending);

        res.status(200).json({ message: "Place approved!" });
    } catch (err) {
        res.status(500).json({ error: "Failed to approve place." });
    }
});

app.post("/api/reject", (req, res) => {
    const { id } = req.body;
    const wcPath = path.join(__dirname, "wcList.json");
    const pendingPath = path.join(__dirname, "pending_places.json");

    try {
        let places = readJSON(wcPath);
        places = places.filter(p => p.id !== id);
        writeJSON(wcPath, places);

        let pending = readJSON(pendingPath);
        pending = pending.filter(p => p.id !== id);
        writeJSON(pendingPath, pending);

        res.status(200).json({ message: "Place rejected." });
    } catch (err) {
        res.status(500).json({ error: "Failed to reject place." });
    }
});

app.listen(3000, () => {
    console.log("Server is running on port 3000");
});