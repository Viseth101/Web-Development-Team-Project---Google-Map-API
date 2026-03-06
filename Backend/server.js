require("dotenv").config();
const express = require("express");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 5000;

app.use(express.static(path.join(__dirname, "../frontend")));

// ENDPOINT 1: Send the API Key to the frontend safely
app.get("/api/config", (req, res) => {
  res.json({
    mapsApiKey: process.env.GOOGLE_API_KEY, // Ensure this matches your .env key name
  });
});

// ENDPOINT 2: Send the location data from places_data.json
app.get("/api/data", (req, res) => {
  // 1. Define exactly where the JSON file is located
  const dataPath = path.join(__dirname, "places_data.json");

  // 2. Read the file
  fs.readFile(dataPath, "utf8", (err, data) => {
    if (err) {
      console.error("Error reading places_data.json:", err);
      return res.status(500).json({ error: "Failed to load map data" });
    }
    res.json(JSON.parse(data));
  });
});

// ENDPOINT 3: Send the location details
app.get("/api/details", (req, res) => {
  const detailPath = path.join(__dirname, "place_detail.json");

  fs.readFile(detailPath, "utf8", (err, data) => {
    if (err) {
      console.error("Error reading place_detail.json:", err);
      return res.status(500).json({ error: "Failed to load details" });
    }
    res.json(JSON.parse(data));
  });
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
