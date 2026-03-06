// ==========================================
// 1. GLOBAL STATE & VARIABLES
// ==========================================
let currentLang = "en";
let translations = {};
let map;
let allMarkers = [];
let infoWindow;
let placeDetails = {};
let activeMarker = null; // <-- NEW: Tracks which popup is currently open

const silpakornCoords = { lat: 13.8188, lng: 100.0402 };
const campusBounds = {
  north: 13.825,
  south: 13.812,
  west: 100.034,
  east: 100.047,
};

// ==========================================
// 2. INITIALIZATION (APP BOOTSTRAP)
// ==========================================
window.onload = startApp;

async function startApp() {
  await loadTranslations();
  try {
    const response = await fetch("/api/config");
    const config = await response.json();
    if (!config.mapsApiKey) throw new Error("API Key not found.");

    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${config.mapsApiKey}&callback=initMap`;
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);
  } catch (error) {
    console.error("Map loading failed:", error);
  }
}

// ==========================================
// 3. CORE MAP LOGIC
// ==========================================
function initMap() {
  map = new google.maps.Map(document.getElementById("map"), {
    zoom: 16.1,
    center: silpakornCoords,
    disableDefaultUI: true,
    zoomControl: true,
    minZoom: 15.5,
    maxZoom: 20,
    restriction: { latLngBounds: campusBounds, strictBounds: false },
  });

  infoWindow = new google.maps.InfoWindow();

  // Close popup and clear state if clicking empty map
  map.addListener("click", () => {
    if (infoWindow) {
      infoWindow.close();
      activeMarker = null; // <-- NEW: Reset the active marker state
    }
  });

  fetchMarkerData();
  drawCampusPolygon();
}

async function fetchMarkerData() {
  try {
    const detailsResponse = await fetch("/api/details");
    placeDetails = await detailsResponse.json();

    const dataResponse = await fetch("/api/data");
    const locationsData = await dataResponse.json();

    locationsData.forEach((place) => {
      const marker = new google.maps.Marker({
        position: { lat: place.lat, lng: place.lng },
        map: map,
        title: place.title,
      });

      marker.addListener("click", () => {
        // --- NEW: Prevent animation replay ---
        // If the clicked marker is already the active one, do nothing!
        if (activeMarker === marker) {
          return;
        }

        const details = placeDetails[place.title];
        const openTime = details ? details.openTime : "No info available";
        const openWord = translations[currentLang]
          ? translations[currentLang]["open"]
          : "Open:";

        const contentString = `
                    <div class="animated-popup" style="color: #1f2937;">
                        <h3 style="margin: 0 0 8px 0; font-size: 16px; font-weight: bold;">${place.title}</h3>
                        <p style="margin: 0; font-size: 14px; color: #4b5563;">
                           🕒 <strong>${openWord}</strong> ${openTime}
                        </p>
                    </div>
                `;

        infoWindow.setContent(contentString);
        infoWindow.open({ anchor: marker, map: map, shouldFocus: false });

        // Update the state so the app knows this marker is currently open
        activeMarker = marker;
      });

      allMarkers.push({
        markerObject: marker,
        title: place.title.toLowerCase(),
      });
    });
  } catch (error) {
    console.error("Error loading marker data:", error);
  }
}

function drawCampusPolygon() {
  const campusBoundary = [
    { lat: 13.814112534127576, lng: 100.03736453950187 },
    { lat: 13.817149088820887, lng: 100.03759385445753 },
    { lat: 13.821481081361016, lng: 100.03645451998987 },
    { lat: 13.823242322499835, lng: 100.03636389242274 },
    { lat: 13.823485238823954, lng: 100.0417840640988 },
    { lat: 13.819671046566414, lng: 100.04221048702905 },
    { lat: 13.818849542175005, lng: 100.04303487294773 },
    { lat: 13.818525647257585, lng: 100.04522378843339 },
    { lat: 13.817105949183121, lng: 100.04496149515515 },
    { lat: 13.815421019042226, lng: 100.04518446561096 },
  ];

  const campusPolygon = new google.maps.Polygon({
    paths: campusBoundary,
    strokeColor: "#1b3899",
    strokeOpacity: 0.8,
    strokeWeight: 2,
    fillColor: "#448bef",
    fillOpacity: 0.05,
    map: map,
  });

  campusPolygon.addListener("mouseover", () => {
    campusPolygon.setOptions({
      strokeColor: "#1b3899",
      strokeWeight: 3,
      fillOpacity: 0.1,
    });
  });

  campusPolygon.addListener("mouseout", () => {
    campusPolygon.setOptions({
      strokeColor: "#448bef",
      strokeWeight: 2,
      fillOpacity: 0.05,
    });
  });

  campusPolygon.addListener("click", () => {
    if (infoWindow) {
      infoWindow.close();
      activeMarker = null; // <-- NEW: Reset state
    }
  });
}

// ==========================================
// 4. UI INTERACTIONS & TOGGLES
// ==========================================
function toggleSatelliteMode() {
  const isSatellite = document.getElementById("satelliteToggle").checked;
  map.setMapTypeId(isSatellite ? "satellite" : "roadmap");
}

function searchMarkers() {
  const query = document.getElementById("searchInput").value.toLowerCase();
  allMarkers.forEach((item) => {
    item.markerObject.setMap(item.title.includes(query) ? map : null);
  });
}

// ==========================================
// 5. LANGUAGE & TRANSLATION LOGIC
// ==========================================
async function loadTranslations() {
  try {
    const response = await fetch("languages.json");
    translations = await response.json();
    updatePageText();
  } catch (error) {
    console.error("Error loading translations:", error);
  }
}

function updatePageText() {
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    if (translations[currentLang]?.[key])
      el.innerText = translations[currentLang][key];
  });

  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    const key = el.getAttribute("data-i18n-placeholder");
    if (translations[currentLang]?.[key])
      el.placeholder = translations[currentLang][key];
  });
}

function changeLanguage(langCode) {
  currentLang = langCode;
  updatePageText();
}

// ==========================================
// 6. DARK MODE LOGIC & STYLES
// ==========================================
const darkModeMapStyles = [
  { elementType: "geometry", stylers: [{ color: "#242f3e" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#242f3e" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#746855" }] },
  {
    featureType: "road",
    elementType: "geometry",
    stylers: [{ color: "#38414e" }],
  },
  {
    featureType: "road",
    elementType: "geometry.stroke",
    stylers: [{ color: "#212a37" }],
  },
  { featureType: "transit.line", stylers: [{ visibility: "off" }] },
  {
    featureType: "administrative.land_parcel",
    stylers: [{ visibility: "off" }],
  },
  {
    featureType: "water",
    elementType: "geometry",
    stylers: [{ color: "#17263c" }],
  },
];

function toggleDarkMode() {
  const isDark = document.getElementById("darkModeToggle").checked;
  const navbar = document.getElementById("navbar");
  const langSelect = document.getElementById("lang-select");
  const searchInput = document.getElementById("searchInput");

  if (isDark) {
    map.setOptions({ styles: darkModeMapStyles });
    navbar.style.backgroundColor = "rgba(30, 30, 30, 0.95)";
    navbar.style.color = "white";
    const darkStyles =
      "background-color: #374151; color: white; border-color: #4B5563;";
    langSelect.style.cssText = darkStyles;
    searchInput.style.cssText = darkStyles;
  } else {
    map.setOptions({ styles: [] });
    navbar.style.backgroundColor = "rgba(255, 255, 255, 0.95)";
    navbar.style.color = "#1f2937";
    const lightStyles =
      "background-color: white; color: #1f2937; border-color: #d1d5db;";
    langSelect.style.cssText = lightStyles;
    searchInput.style.cssText = lightStyles;
  }
}
