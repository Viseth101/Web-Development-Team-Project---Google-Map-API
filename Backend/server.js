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
    return str.replace(/[&<>'"]/g, (tag) => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"})[tag]);
}

// ==========================================
// 4-LANGUAGE DATABASE HELPERS
// ==========================================
const readJSON = (filePath) => {
    if (!fs.existsSync(filePath)) return [];
    try { return JSON.parse(fs.readFileSync(filePath, "utf-8")); } catch (e) { return []; }
};
const writeJSON = (filePath, data) => fs.writeFileSync(filePath, JSON.stringify(data, null, 2));

const ALL_LANGS = ["en", "th", "cn", "kh"];

// Auto-detect language based on Unicode characters
function detectLanguage(text) {
    if (/[\u1780-\u17FF]/.test(text)) return 'kh'; // Khmer
    if (/[\u0E00-\u0E7F]/.test(text)) return 'th'; // Thai
    if (/[\u4E00-\u9FFF]/.test(text)) return 'cn'; // Chinese
    return 'en'; // Default to English
}

// ==========================================
// CLIENT ROUTES
// ==========================================
app.get("/api/config", (req, res) => { res.json({ mapsApiKey: process.env.GOOGLE_API_KEY }); });

// Fetch map markers for a specific language
app.get("/wc", (req, res) => {
    const lang = req.query.lang || "en"; 
    const safeLang = ALL_LANGS.includes(lang) ? lang : "en";
    const dataPath = path.join(__dirname, `place_data_${safeLang}.json`);
    res.json(readJSON(dataPath));
});

// Client submits a place
app.post("/api/submit-place", (req, res) => {
    const rawTitle = sanitizeInput(req.body.title);
    const openTime = sanitizeInput(req.body.openTime);
    const access = sanitizeInput(req.body.access) || "ALL (Staff & Students)";
    const note = sanitizeInput(req.body.note) || "";
    const { lat, lng } = req.body;

    const detectedLang = detectLanguage(rawTitle);
    
    // Create the fallback name object mapping the input to all languages
    const names = {
        en: rawTitle, th: rawTitle, cn: rawTitle, kh: rawTitle
    };

    const pendingPath = path.join(__dirname, "pending_places.json");
    let pendingPlaces = readJSON(pendingPath);
    
    // Find next ID based on English file
    const enPlaces = readJSON(path.join(__dirname, "place_data_en.json"));
    const nextId = enPlaces.length ? Math.max(...enPlaces.map((p) => p.id || 0)) + 1 : 1;

    pendingPlaces.push({
        id: nextId,
        names: names, // Store the full names object in pending
        operatingHours: openTime,
        access: access,
        note: note, 
        isPending: true,
        lat: lat,
        lng: lng,
        detectedLang: detectedLang
    });

    writeJSON(pendingPath, pendingPlaces);
    res.status(200).json({ message: "Place saved and marked as pending!" });
});

// ==========================================
// ADMIN ROUTES
// ==========================================
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

app.post("/api/admin-login", (req, res) => {
    if (req.body.password === ADMIN_PASSWORD) res.json({ success: true });
    else res.status(401).json({ success: false, error: "Incorrect password" });
});

app.get("/api/pending", (req, res) => { res.json(readJSON(path.join(__dirname, "pending_places.json"))); });

// Admin Dashboard fetches ALL data from ALL files merged together
app.get("/api/all-places", (req, res) => {
    const enPlaces = readJSON(path.join(__dirname, "place_data_en.json"));
    const thPlaces = readJSON(path.join(__dirname, "place_data_th.json"));
    const cnPlaces = readJSON(path.join(__dirname, "place_data_cn.json"));
    const khPlaces = readJSON(path.join(__dirname, "place_data_kh.json"));

    const merged = enPlaces.map(enPlace => {
        const thP = thPlaces.find(p => p.id === enPlace.id) || {};
        const cnP = cnPlaces.find(p => p.id === enPlace.id) || {};
        const khP = khPlaces.find(p => p.id === enPlace.id) || {};
        
        return {
            ...enPlace,
            names: {
                en: enPlace.building,
                th: thP.building || enPlace.building,
                cn: cnP.building || enPlace.building,
                kh: khP.building || enPlace.building
            }
        };
    });
    res.json(merged);
});

app.post("/api/approve", (req, res) => {
    if (req.body.password !== ADMIN_PASSWORD) return res.status(401).json({ error: "Unauthorized" });
    const { id } = req.body;
    
    let pending = readJSON(path.join(__dirname, "pending_places.json"));
    const placeToApprove = pending.find(p => p.id === id);
    
    if (placeToApprove) {
        // Write to all 4 files
        ALL_LANGS.forEach(lang => {
            const filePath = path.join(__dirname, `place_data_${lang}.json`);
            let places = readJSON(filePath);
            places.push({
                id: placeToApprove.id,
                building: placeToApprove.names[lang],
                operatingHours: placeToApprove.operatingHours,
                access: placeToApprove.access,
                note: placeToApprove.note,
                lat: placeToApprove.lat,
                lng: placeToApprove.lng
            });
            writeJSON(filePath, places);
        });

        // Remove from pending
        pending = pending.filter(p => p.id !== id);
        writeJSON(path.join(__dirname, "pending_places.json"), pending);
        res.status(200).json({ message: "Approved to all files!" });
    } else {
        res.status(404).json({ error: "Pending place not found." });
    }
});

app.post("/api/reject", (req, res) => {
    if (req.body.password !== ADMIN_PASSWORD) return res.status(401).json({ error: "Unauthorized" });
    const { id } = req.body;
    
    // Delete from pending
    let pending = readJSON(path.join(__dirname, "pending_places.json"));
    pending = pending.filter(p => p.id !== id);
    writeJSON(path.join(__dirname, "pending_places.json"), pending);

    // Delete from all 4 master files
    ALL_LANGS.forEach(lang => {
        const filePath = path.join(__dirname, `place_data_${lang}.json`);
        let places = readJSON(filePath);
        places = places.filter(p => p.id !== id);
        writeJSON(filePath, places);
    });

    res.status(200).json({ message: "Deleted everywhere." });
});

app.post("/api/edit-place", (req, res) => {
    if (req.body.password !== ADMIN_PASSWORD) return res.status(401).json({ error: "Unauthorized" });
    const { id, names, operatingHours, access, note, lat, lng } = req.body;

    const safeEn = sanitizeInput(names.en);
    // FALLBACK: If a language is blank, use English.
    const finalNames = {
        en: safeEn,
        th: sanitizeInput(names.th) || safeEn,
        cn: sanitizeInput(names.cn) || safeEn,
        kh: sanitizeInput(names.kh) || safeEn
    };

    ALL_LANGS.forEach(lang => {
        const filePath = path.join(__dirname, `place_data_${lang}.json`);
        let places = readJSON(filePath);
        const index = places.findIndex(p => p.id === id);
        if (index !== -1) {
            places[index].building = finalNames[lang];
            places[index].operatingHours = sanitizeInput(operatingHours);
            places[index].access = sanitizeInput(access);
            places[index].note = sanitizeInput(note);
            if (lat !== undefined) places[index].lat = parseFloat(lat);
            if (lng !== undefined) places[index].lng = parseFloat(lng);
            writeJSON(filePath, places);
        }
    });

    // Also update pending if it's a pending place
    let pending = readJSON(path.join(__dirname, "pending_places.json"));
    const pIndex = pending.findIndex(p => p.id === id);
    if(pIndex !== -1) {
        pending[pIndex].names = finalNames;
        pending[pIndex].operatingHours = sanitizeInput(operatingHours);
        pending[pIndex].access = sanitizeInput(access);
        pending[pIndex].note = sanitizeInput(note);
        if (lat !== undefined) pending[pIndex].lat = parseFloat(lat);
        if (lng !== undefined) pending[pIndex].lng = parseFloat(lng);
        writeJSON(path.join(__dirname, "pending_places.json"), pending);
    }

    res.status(200).json({ message: "Place updated in all languages." });
});

app.post("/api/admin-add-place", (req, res) => {
    if (req.body.password !== ADMIN_PASSWORD) return res.status(401).json({ error: "Unauthorized" });
    const { names, operatingHours, access, note, lat, lng } = req.body;

    const safeEn = sanitizeInput(names.en);
    const finalNames = {
        en: safeEn,
        th: sanitizeInput(names.th) || safeEn,
        cn: sanitizeInput(names.cn) || safeEn,
        kh: sanitizeInput(names.kh) || safeEn
    };

    const enPlaces = readJSON(path.join(__dirname, "place_data_en.json"));
    const nextId = enPlaces.length ? Math.max(...enPlaces.map(p => p.id || 0)) + 1 : 1;

    ALL_LANGS.forEach(lang => {
        const filePath = path.join(__dirname, `place_data_${lang}.json`);
        let places = readJSON(filePath);
        places.push({
            id: nextId,
            building: finalNames[lang],
            operatingHours: sanitizeInput(operatingHours),
            access: sanitizeInput(access) || "ALL (Staff & Students)",
            note: sanitizeInput(note) || "",
            lat: parseFloat(lat),
            lng: parseFloat(lng)
        });
        writeJSON(filePath, places);
    });

    res.status(200).json({ message: "Place added to all languages!" });
});

app.listen(3000, () => { console.log("Server is running on port 3000"); });