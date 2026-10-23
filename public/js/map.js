/**
 * @fileoverview Leaflet Map Controller for CivicBridge.
 * Manages spatial visualization of Pune civic reports, user pin-drops,
 * and duplicate verification radius rings (<200m).
 */

const PUNE_DEFAULT_LAT = 18.5204;
const PUNE_DEFAULT_LNG = 73.8567;
const DEFAULT_ZOOM = 13;

let mapInstance = null;
let userMarker = null;
let verificationCircle = null;
let reportMarkersLayer = null;
let allReports = [];

/**
 * Category color definitions for visual marker distinction.
 */
const CATEGORY_STYLES = {
  "Drainage & Sewage": { color: "#0284C7", icon: "fa-water" },
  "Roads & Footpaths": { color: "#EA580C", icon: "fa-road" },
  "Garbage & Waste": { color: "#059669", icon: "fa-trash" },
  "Street Lighting & Electricity": { color: "#D97706", icon: "fa-lightbulb" },
  "Water Supply": { color: "#0D9488", icon: "fa-faucet" },
  "Traffic & Obstructions": { color: "#E11D48", icon: "fa-traffic-light" }
};

/**
 * Creates a custom SVG map pin marker.
 * @param {string} category - Report category.
 * @param {number} severity - Severity rating (1-5).
 * @returns {L.DivIcon} Leaflet DivIcon.
 */
function createCustomPin(category, severity) {
  const style = CATEGORY_STYLES[category] || { color: "#64748B", icon: "fa-circle-exclamation" };
  const size = 32 + (severity || 3) * 2;

  const html = `
    <div style="
      background-color: ${style.color};
      width: ${size}px;
      height: ${size}px;
      border-radius: 50%;
      border: 3px solid white;
      box-shadow: 0 4px 10px rgba(0,0,0,0.25);
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-weight: bold;
      font-size: 13px;
      cursor: pointer;
      transition: transform 0.2s ease;
    ">
      ${severity || "!"}
    </div>
  `;

  return window.L.divIcon({
    className: "custom-civic-pin",
    html,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2]
  });
}

/**
 * Initializes the Leaflet map container.
 * @param {string} elementId - ID of map DOM container.
 * @param {Function} [onLocationSelect] - Callback when user drops or moves pin.
 */
export function initMap(elementId = "civicMap", onLocationSelect) {
  if (mapInstance) return mapInstance;

  const L = window.L;
  if (!L) {
    console.error("Leaflet library not loaded");
    return null;
  }

  mapInstance = L.map(elementId, {
    zoomControl: false
  }).setView([PUNE_DEFAULT_LAT, PUNE_DEFAULT_LNG], DEFAULT_ZOOM);

  // Add zoom control at bottom-right
  L.control.zoom({ position: "bottomright" }).addTo(mapInstance);

  // High-performance OpenStreetMap tile layer
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors | CivicBridge Pune'
  }).addTo(mapInstance);

  reportMarkersLayer = L.layerGroup().addTo(mapInstance);

  // Map click listener to drop/move user's complaint pin
  mapInstance.on("click", (e) => {
    const { lat, lng } = e.latlng;
    setUserLocation(lat, lng);
    if (typeof onLocationSelect === "function") {
      onLocationSelect(lat, lng);
    }
  });

  return mapInstance;
}

/**
 * Sets or updates the active user location pin on the map.
 * @param {number} lat - Latitude.
 * @param {number} lng - Longitude.
 * @param {boolean} [pan=false] - Whether to pan map to pin.
 */
export function setUserLocation(lat, lng, pan = false) {
  const L = window.L;
  if (!mapInstance || !L) return;

  if (userMarker) {
    userMarker.setLatLng([lat, lng]);
  } else {
    const userPinHtml = `
      <div style="position: relative;">
        <div class="cluster-pulse-ring" style="position: absolute; top: -6px; left: -6px;"></div>
        <div style="
          width: 16px;
          height: 16px;
          background: #2563EB;
          border: 3px solid white;
          border-radius: 50%;
          box-shadow: 0 2px 8px rgba(0,0,0,0.4);
        "></div>
      </div>
    `;

    const icon = L.divIcon({
      className: "user-loc-pin",
      html: userPinHtml,
      iconSize: [16, 16],
      iconAnchor: [8, 8]
    });

    userMarker = L.marker([lat, lng], { icon, draggable: true }).addTo(mapInstance);

    userMarker.on("dragend", (e) => {
      const pos = e.target.getLatLng();
      if (verificationCircle) {
        verificationCircle.setLatLng(pos);
      }
    });
  }

  // Draw or reposition the 200m duplicate verification radius circle
  if (verificationCircle) {
    verificationCircle.setLatLng([lat, lng]);
  } else {
    verificationCircle = L.circle([lat, lng], {
      color: "#2563EB",
      fillColor: "#3B82F6",
      fillOpacity: 0.12,
      radius: 200,
      weight: 1.5,
      dashArray: "4, 6"
    }).addTo(mapInstance);
  }

  if (pan) {
    mapInstance.setView([lat, lng], 15);
  }
}

/**
 * Loads and renders verified civic reports onto the map.
 * @param {Array<object>} reports - List of report objects.
 * @param {string} [categoryFilter="all"] - Optional category filter.
 */
export function renderReportsOnMap(reports = [], categoryFilter = "all") {
  const L = window.L;
  if (!mapInstance || !L || !reportMarkersLayer) return;

  allReports = reports;
  reportMarkersLayer.clearLayers();

  const filtered = categoryFilter === "all"
    ? reports
    : reports.filter((r) => r.category.toLowerCase().includes(categoryFilter.toLowerCase()));

  for (const rep of filtered) {
    if (typeof rep.lat !== "number" || typeof rep.lng !== "number") continue;

    const icon = createCustomPin(rep.category, rep.severity);
    const marker = L.marker([rep.lat, rep.lng], { icon });

    const statusBadge = rep.status === "Resolved"
      ? `<span class="bg-emerald-100 text-emerald-800 text-xs px-2 py-0.5 rounded-full font-semibold">Resolved</span>`
      : rep.status === "In Progress" || rep.status === "Work In Progress"
      ? `<span class="bg-blue-100 text-blue-800 text-xs px-2 py-0.5 rounded-full font-semibold">In Progress</span>`
      : `<span class="bg-amber-100 text-amber-800 text-xs px-2 py-0.5 rounded-full font-semibold">${rep.status}</span>`;

    const popupHtml = `
      <div class="p-1 space-y-2 min-w-[220px]">
        <div class="flex items-center justify-between gap-2 border-b border-slate-100 pb-1">
          <span class="text-xs font-bold text-slate-500 uppercase tracking-wider">${rep.category}</span>
          ${statusBadge}
        </div>
        <h4 class="font-bold text-slate-900 text-sm leading-tight">${rep.subcategory || rep.category}</h4>
        <p class="text-xs text-slate-600 line-clamp-3">${rep.description}</p>
        <div class="text-[11px] text-slate-500 flex items-center justify-between pt-1 border-t border-slate-100">
          <span>📍 ${rep.location_text.split(",")[0]}</span>
          <span class="font-medium text-slate-700">👥 ${rep.reporter_count || 1} reported</span>
        </div>
        <div class="text-[10px] text-slate-400 font-mono">
          Ref: ${rep.trackingId || rep.id}
        </div>
      </div>
    `;

    marker.bindPopup(popupHtml);
    reportMarkersLayer.addLayer(marker);
  }
}

/**
 * Centers the map on a specific coordinate with high zoom.
 * @param {number} lat - Latitude.
 * @param {number} lng - Longitude.
 * @param {number} [zoom=16] - Zoom level.
 */
export function focusCoordinate(lat, lng, zoom = 16) {
  if (mapInstance && typeof lat === "number" && typeof lng === "number") {
    mapInstance.setView([lat, lng], zoom, { animate: true });
  }
}
