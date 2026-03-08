require("dotenv").config();
const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const app = express();

app.use(cors());
app.use(express.json());

app.use(express.static(path.join(__dirname, "../Frontend")));
app.use("/image", express.static(path.join(__dirname, "image")));

function sanitizeInput(str) {
    if (!str) return "";
    return str.replace(/[&<>'"]/g, (tag) => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"})[tag]);
}

const readJSON = (filePath) => {
    if (!fs.existsSync(filePath)) return [];
    try { return JSON.parse(fs.readFileSync(filePath, "utf-8")); } catch (e) { return []; }
};
const writeJSON = (filePath, data) => fs.writeFileSync(filePath, JSON.stringify(data, null, 2));

const ALL_LANGS = ["en", "th", "cn", "kh"];

function detectLanguage(text) {
    if (/[\u1780-\u17FF]/.test(text)) return 'kh'; 
    if (/[\u0E00-\u0E7F]/.test(text)) return 'th'; 
    if (/[\u4E00-\u9FFF]/.test(text)) return 'cn'; 
    return 'en'; 
}

// Ensure your access checking function also has these terms.
// Find this function in your server.js and replace it.
function checkAccessRole(accessText) {
    if (!accessText) return "all";
    const text = accessText.toLowerCase();
    
    // Add exact terms you want to trigger Staff color
    const staffTerms = ["staff only", "เฉพาะบุคลากร", "仅限员工", "សម្រាប់តែបុគ្គលិក"];
    // Add exact terms you want to trigger Student color
    const studentTerms = ["students only", "student only", "เฉพาะนักศึกษา", "仅限学生", "សម្រាប់តែសិស្ស"];
    
    // Check staff first
    if (staffTerms.some(term => text.includes(term.toLowerCase()))) return "staff";
    
    // Check student second
    if (studentTerms.some(term => text.includes(term.toLowerCase()))) return "student";
    
    // Default to All
    return "all";
}

app.get("/api/config", (req, res) => { res.json({ mapsApiKey: process.env.GOOGLE_API_KEY }); });

// NEW: Combines approved places with pending places for the public map
app.get("/wc", (req, res) => {
    const lang = req.query.lang || "en"; 
    const safeLang = ALL_LANGS.includes(lang) ? lang : "en";
    
    // Load approved
    const dataPath = path.join(__dirname, "Database", `place_data_${safeLang}.json`);
    const approvedPlaces = readJSON(dataPath);

    // Load pending
    const pendingPath = path.join(__dirname, "Database", "pending_places.json");
    const pendingData = readJSON(pendingPath);
    
    // Format pending data to match the language currently requested
    const formattedPending = pendingData.map(p => ({
        ...p,
        building: p.names ? (p.names[safeLang] || p.names.en) : p.building
    }));

    // Send both
    res.json(approvedPlaces.concat(formattedPending));
});

app.post("/api/submit-place", (req, res) => {
    const rawTitle = sanitizeInput(req.body.title);
    const openTime = sanitizeInput(req.body.openTime);
    const access = sanitizeInput(req.body.access) || "ALL (Staff & Students)";
    const note = sanitizeInput(req.body.note) || "";
    const { lat, lng } = req.body;

    const detectedLang = detectLanguage(rawTitle);
    const names = { en: rawTitle, th: rawTitle, cn: rawTitle, kh: rawTitle };

    const pendingPath = path.join(__dirname, "Database", "pending_places.json");
    let pendingPlaces = readJSON(pendingPath);
    
    const enPlaces = readJSON(path.join(__dirname, "Database", "place_data_en.json"));
    const nextId = enPlaces.length ? Math.max(...enPlaces.map((p) => p.id || 0)) + 1 : 1;

    pendingPlaces.push({
        id: nextId,
        names: names, 
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

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

app.post("/api/admin-login", (req, res) => {
    if (req.body.password === ADMIN_PASSWORD) res.json({ success: true });
    else res.status(401).json({ success: false, error: "Incorrect password" });
});

app.get("/api/pending", (req, res) => { res.json(readJSON(path.join(__dirname, "Database", "pending_places.json"))); });

app.get("/api/all-places", (req, res) => {
    const enPlaces = readJSON(path.join(__dirname, "Database", "place_data_en.json"));
    const thPlaces = readJSON(path.join(__dirname, "Database", "place_data_th.json"));
    const cnPlaces = readJSON(path.join(__dirname, "Database", "place_data_cn.json"));
    const khPlaces = readJSON(path.join(__dirname, "Database", "place_data_kh.json"));

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
    
    const pendingPath = path.join(__dirname, "Database", "pending_places.json");
    let pending = readJSON(pendingPath);
    const placeToApprove = pending.find(p => p.id === id);
    
    if (placeToApprove) {
        ALL_LANGS.forEach(lang => {
            const filePath = path.join(__dirname, "Database", `place_data_${lang}.json`);
            let places = readJSON(filePath);
            places.push({
                id: placeToApprove.id,
                building: placeToApprove.names[lang],
                operatingHours: placeToApprove.operatingHours,
                access: placeToApprove.access,
                notes: placeToApprove.note, 
                lat: placeToApprove.lat,
                lng: placeToApprove.lng
            });
            writeJSON(filePath, places);
        });

        pending = pending.filter(p => p.id !== id);
        writeJSON(pendingPath, pending);
        res.status(200).json({ message: "Approved to all files!" });
    } else {
        res.status(404).json({ error: "Pending place not found." });
    }
});

app.post("/api/reject", (req, res) => {
    if (req.body.password !== ADMIN_PASSWORD) return res.status(401).json({ error: "Unauthorized" });
    const { id } = req.body;
    
    const pendingPath = path.join(__dirname, "Database", "pending_places.json");
    let pending = readJSON(pendingPath);
    pending = pending.filter(p => p.id !== id);
    writeJSON(pendingPath, pending);

    ALL_LANGS.forEach(lang => {
        const filePath = path.join(__dirname, "Database", `place_data_${lang}.json`);
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
    const finalNames = {
        en: safeEn,
        th: sanitizeInput(names.th) || safeEn,
        cn: sanitizeInput(names.cn) || safeEn,
        kh: sanitizeInput(names.kh) || safeEn
    };

    ALL_LANGS.forEach(lang => {
        const filePath = path.join(__dirname, "Database", `place_data_${lang}.json`);
        let places = readJSON(filePath);
        const index = places.findIndex(p => p.id === id);
        if (index !== -1) {
            places[index].building = finalNames[lang];
            places[index].operatingHours = sanitizeInput(operatingHours);
            places[index].access = sanitizeInput(access);
            places[index].notes = sanitizeInput(note);
            if (lat !== undefined) places[index].lat = parseFloat(lat);
            if (lng !== undefined) places[index].lng = parseFloat(lng);
            writeJSON(filePath, places);
        }
    });

    const pendingPath = path.join(__dirname, "Database", "pending_places.json");
    let pending = readJSON(pendingPath);
    const pIndex = pending.findIndex(p => p.id === id);
    if(pIndex !== -1) {
        pending[pIndex].names = finalNames;
        pending[pIndex].operatingHours = sanitizeInput(operatingHours);
        pending[pIndex].access = sanitizeInput(access);
        pending[pIndex].note = sanitizeInput(note);
        if (lat !== undefined) pending[pIndex].lat = parseFloat(lat);
        if (lng !== undefined) pending[pIndex].lng = parseFloat(lng);
        writeJSON(pendingPath, pending);
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

    const enPlaces = readJSON(path.join(__dirname, "Database", "place_data_en.json"));
    const nextId = enPlaces.length ? Math.max(...enPlaces.map(p => p.id || 0)) + 1 : 1;

    ALL_LANGS.forEach(lang => {
        const filePath = path.join(__dirname, "Database", `place_data_${lang}.json`);
        let places = readJSON(filePath);
        places.push({
            id: nextId,
            building: finalNames[lang],
            operatingHours: sanitizeInput(operatingHours),
            access: sanitizeInput(access) || "ALL (Staff & Students)",
            notes: sanitizeInput(note) || "",
            lat: parseFloat(lat),
            lng: parseFloat(lng)
        });
        writeJSON(filePath, places);
    });

    res.status(200).json({ message: "Place added to all languages!" });
});

app.listen(3000, () => { console.log("Server is running on port 3000"); });