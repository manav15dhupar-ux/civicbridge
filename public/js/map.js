/**
 * @fileoverview Leaflet Map Controller for CivicBridge.
 * Manages spatial visualization of Pune civic reports, high-accuracy user pin-drops,
 * accuracy radius circles, draggable pin confirmation, 200m duplicate detection zones,
 * severity-colored pins, and marker clustering when zoomed out.
 */

import { escapeHtml } from "./ui.js";
import { GPS_ACCURACY_WARNING_METERS } from "./constants.js";

const PUNE_DEFAULT_LAT = 18.5204;
const PUNE_DEFAULT_LNG = 73.8567;
const DEFAULT_ZOOM = 13;

let mapInstance = null;
let userMarker = null;
let verificationCircle = null; // 200m duplicate radius
let accuracyCircle = null; // Browser GPS accuracy radius
let reportMarkersLayer = null; // Leaflet.markerClusterGroup or layerGroup
let locationChangeCallback = null;

/**
 * Severity-based styling configuration.
 * Colors markers directly by severity rating (1-5).
 */
const SEVERITY_PIN_STYLES = {
  5: {
    color: "#E11D48",
    label: "Critical Hazard",
    pulse: true,
    border: "#881337"
  },
  4: {
    color: "#EA580C",
    label: "High Hazard",
    pulse: false,
    border: "#7C2D12"
  },
  3: {
    color: "#D97706",
    label: "Moderate Issue",
    pulse: false,
    border: "#78350F"
  },
  2: {
    color: "#2563EB",
    label: "Minor Defect",
    pulse: false,
    border: "#1E3A8A"
  },
  1: {
    color: "#64748B",
    label: "Low Priority",
    pulse: false,
    border: "#334155"
  }
};

/**
 * Creates a severity-colored SVG map pin marker.
 * @param {string} category - Report category.
 * @param {number} severity - Severity rating (1-5).
 * @returns {L.DivIcon} Leaflet DivIcon.
 */
function createSeverityPin(category, severity) {
  const sevLevel = Math.min(Math.max(parseInt(severity, 10) || 3, 1), 5);
  const style = SEVERITY_PIN_STYLES[sevLevel] || SEVERITY_PIN_STYLES[3];
  const size = 32 + sevLevel * 2;

  const pulseRing = style.pulse
    ? `<div style="position: absolute; inset: -5px; border-radius: 50%; background: ${style.color}; opacity: 0.45; animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>`
    : "";

  const html = `
    <div style="position: relative; width: ${size}px; height: ${size}px;">
      ${pulseRing}
      <div style="
        position: relative;
        background-color: ${style.color};
        width: ${size}px;
        height: ${size}px;
        border-radius: 50%;
        border: 2.5px solid white;
        box-shadow: 0 4px 10px rgba(0,0,0,0.3);
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-weight: 800;
        font-size: 13px;
        cursor: pointer;
        transition: transform 0.15s ease;
      ">
        ${sevLevel}
      </div>
    </div>
  `;

  return window.L.divIcon({
    className: "custom-severity-pin",
    html,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2]
  });
}

/**
 * Creates custom user pin HTML.
 * @param {boolean} isConfirmed - Whether user clicked "Confirm Pin".
 * @returns {L.DivIcon}
 */
function createUserPinIcon(isConfirmed = false) {
  const L = window.L;
  const pinColor = isConfirmed ? "#059669" : "#2563EB"; // Green when confirmed, Blue when provisional

  const html = `
    <div style="position: relative; display: flex; flex-direction: column; align-items: center;">
      <div style="
        position: absolute;
        bottom: 22px;
        white-space: nowrap;
        background: rgba(15, 23, 42, 0.9);
        color: white;
        font-size: 10px;
        font-weight: 700;
        padding: 2px 6px;
        border-radius: 6px;
        border: 1px solid rgba(255,255,255,0.2);
        box-shadow: 0 2px 6px rgba(0,0,0,0.3);
        pointer-events: none;
      ">
        ${isConfirmed ? "✓ Confirmed Pin" : "📍 Drag Me"}
      </div>
      <div style="
        width: 22px;
        height: 22px;
        background: ${pinColor};
        border: 3px solid white;
        border-radius: 50%;
        box-shadow: 0 3px 10px rgba(0,0,0,0.4);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: grab;
      ">
        <div style="width: 6px; height: 6px; background: white; border-radius: 50%;"></div>
      </div>
      <div style="
        width: 2px;
        height: 8px;
        background: ${pinColor};
      "></div>
      <div style="
        width: 6px;
        height: 3px;
        background: rgba(0,0,0,0.3);
        border-radius: 50%;
        margin-top: -2px;
      "></div>
    </div>
  `;

  return L.divIcon({
    className: "user-complaint-pin",
    html,
    iconSize: [30, 42],
    iconAnchor: [15, 38]
  });
}

/**
 * Initializes the Leaflet map container with clustering support.
 * @param {string} elementId - ID of map DOM container.
 * @param {Function} [onLocationSelect] - Callback when user drops or drags pin.
 */
export function initMap(elementId = "civicMap", onLocationSelect) {
  if (mapInstance) return mapInstance;

  const L = window.L;
  if (!L) {
    console.error("Leaflet library not loaded");
    return null;
  }

  locationChangeCallback = onLocationSelect;

  mapInstance = L.map(elementId, {
    zoomControl: false
  }).setView([PUNE_DEFAULT_LAT, PUNE_DEFAULT_LNG], DEFAULT_ZOOM);

  // Zoom control in bottom-right
  L.control.zoom({ position: "bottomright" }).addTo(mapInstance);

  // High-performance OpenStreetMap tile layer
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors | CivicBridge Pune'
  }).addTo(mapInstance);

  // Marker Clustering Layer (Uses Leaflet.markercluster if loaded, otherwise falls back to layerGroup)
  if (typeof L.markerClusterGroup === "function") {
    reportMarkersLayer = L.markerClusterGroup({
      showCoverageOnHover: false,
      maxClusterRadius: 40,
      spiderfyOnMaxZoom: true,
      zoomToBoundsOnClick: true,
      iconCreateFunction(cluster) {
        const count = cluster.getChildCount();
        return L.divIcon({
          html: `<div class="w-8 h-8 rounded-full bg-slate-900/90 text-white font-extrabold text-xs flex items-center justify-center border-2 border-white shadow-lg ring-2 ring-blue-500/40">${count}</div>`,
          className: "marker-cluster-civic",
          iconSize: [32, 32],
          iconAnchor: [16, 16]
        });
      }
    });
  } else {
    reportMarkersLayer = L.layerGroup();
  }
  reportMarkersLayer.addTo(mapInstance);

  // Map click listener to place/move the complaint pin
  mapInstance.on("click", (e) => {
    const { lat, lng } = e.latlng;
    setUserLocation(lat, lng, false, null, false);
    if (typeof locationChangeCallback === "function") {
      locationChangeCallback(lat, lng, null, false);
    }
  });

  return mapInstance;
}

/**
 * Sets or updates the active user location pin on the map.
 * @param {number} lat - Latitude.
 * @param {number} lng - Longitude.
 * @param {boolean} [pan=false] - Whether to pan map to pin.
 * @param {number|null} [accuracy=null] - Browser GPS accuracy in meters.
 * @param {boolean} [isConfirmed=false] - Whether citizen manually confirmed pin.
 */
export function setUserLocation(
  lat,
  lng,
  pan = false,
  accuracy = null,
  isConfirmed = false
) {
  const L = window.L;
  if (!mapInstance || !L) return;

  const pinIcon = createUserPinIcon(isConfirmed);

  if (userMarker) {
    userMarker.setLatLng([lat, lng]);
    userMarker.setIcon(pinIcon);
  } else {
    userMarker = L.marker([lat, lng], {
      icon: pinIcon,
      draggable: true,
      autoPan: true,
      zIndexOffset: 1000
    }).addTo(mapInstance);

    // Draggable Pin Event Listeners
    userMarker.on("drag", (e) => {
      const pos = e.target.getLatLng();
      if (verificationCircle) verificationCircle.setLatLng(pos);
      if (accuracyCircle) accuracyCircle.setLatLng(pos);
    });

    userMarker.on("dragend", (e) => {
      const pos = e.target.getLatLng();
      const roundedLat = Math.round(pos.lat * 100000) / 100000;
      const roundedLng = Math.round(pos.lng * 100000) / 100000;

      // When citizen drags pin manually, clear accuracy circle because user defined exact location
      if (accuracyCircle) {
        mapInstance.removeLayer(accuracyCircle);
        accuracyCircle = null;
      }

      if (verificationCircle) {
        verificationCircle.setLatLng([roundedLat, roundedLng]);
      }

      if (typeof locationChangeCallback === "function") {
        locationChangeCallback(roundedLat, roundedLng, null, true);
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
      dashArray: "5, 5"
    }).addTo(mapInstance);

    verificationCircle.bindTooltip("200m Duplicate Check Zone", {
      permanent: false,
      direction: "top",
      className: "circle-tooltip"
    });
  }

  // Draw or update the Browser Geolocation Accuracy Circle
  if (typeof accuracy === "number" && accuracy > 0) {
    const isWorseThan50 = accuracy > GPS_ACCURACY_WARNING_METERS;
    const circleOptions = {
      radius: Math.min(accuracy, 2000), // Clamp visual display at 2km max
      color: isWorseThan50 ? "#D97706" : "#0284C7",
      fillColor: isWorseThan50 ? "#FDE68A" : "#BAE6FD",
      fillOpacity: 0.22,
      weight: 1.5,
      dashArray: "3, 4"
    };

    if (accuracyCircle) {
      accuracyCircle.setLatLng([lat, lng]);
      accuracyCircle.setRadius(circleOptions.radius);
      accuracyCircle.setStyle(circleOptions);
    } else {
      accuracyCircle = L.circle([lat, lng], circleOptions).addTo(mapInstance);
    }
  } else if (accuracyCircle && accuracy === null) {
    mapInstance.removeLayer(accuracyCircle);
    accuracyCircle = null;
  }

  if (pan) {
    mapInstance.setView([lat, lng], Math.max(mapInstance.getZoom(), 15), {
      animate: true
    });
  }
}

/**
 * Confirms the current user marker pin and changes pin badge to confirmed state.
 */
export function confirmPin() {
  if (userMarker) {
    const pos = userMarker.getLatLng();
    userMarker.setIcon(createUserPinIcon(true));
    return { lat: pos.lat, lng: pos.lng };
  }
  return null;
}

/**
 * Gets currently active pin coordinates.
 * @returns {{ lat: number, lng: number }|null}
 */
export function getUserLocation() {
  if (userMarker) {
    const pos = userMarker.getLatLng();
    return { lat: pos.lat, lng: pos.lng };
  }
  return null;
}

/**
 * Loads and renders verified civic reports onto the map with severity color-coding and clustering.
 * @param {Array<object>} reports - List of report objects.
 * @param {string} [categoryFilter="all"] - Optional category filter.
 */
export function renderReportsOnMap(reports = [], categoryFilter = "all") {
  const L = window.L;
  if (!mapInstance || !L || !reportMarkersLayer) return;

  reportMarkersLayer.clearLayers();

  const filtered =
    categoryFilter === "all"
      ? reports
      : reports.filter((r) =>
          r.category.toLowerCase().includes(categoryFilter.toLowerCase())
        );

  for (const rep of filtered) {
    if (typeof rep.lat !== "number" || typeof rep.lng !== "number") continue;

    // Severity-colored marker pin
    const icon = createSeverityPin(rep.category, rep.severity);
    const marker = L.marker([rep.lat, rep.lng], { icon });

    const statusBadge =
      rep.status === "Resolved"
        ? `<span class="bg-emerald-100 text-emerald-800 text-[11px] px-2 py-0.5 rounded-full font-semibold">Resolved</span>`
        : rep.status === "In Progress" || rep.status === "Work In Progress"
          ? `<span class="bg-blue-100 text-blue-800 text-[11px] px-2 py-0.5 rounded-full font-semibold">In Progress</span>`
          : `<span class="bg-amber-100 text-amber-800 text-[11px] px-2 py-0.5 rounded-full font-semibold">${escapeHtml(rep.status)}</span>`;

    const sevStyle =
      SEVERITY_PIN_STYLES[rep.severity] || SEVERITY_PIN_STYLES[3];

    const popupHtml = `
      <div class="p-1 space-y-2 min-w-[230px] text-xs font-sans">
        <div class="flex items-center justify-between gap-2 border-b border-slate-100 pb-1.5">
          <span class="font-bold text-slate-500 uppercase tracking-wider text-[10px]">${escapeHtml(rep.category)}</span>
          ${statusBadge}
        </div>
        <div class="flex items-center gap-1.5">
          <span class="w-2 h-2 rounded-full" style="background: ${sevStyle.color}"></span>
          <span class="font-bold text-[11px]" style="color: ${sevStyle.color}">Severity ${rep.severity} (${sevStyle.label})</span>
        </div>
        <h4 class="font-bold text-slate-900 text-sm leading-tight">${escapeHtml(rep.subcategory || rep.category)}</h4>
        <p class="text-slate-600 line-clamp-3 leading-snug">${escapeHtml(rep.description)}</p>
        <div class="text-[11px] text-slate-500 flex items-center justify-between pt-1 border-t border-slate-100">
          <span>📍 ${escapeHtml(rep.location_text.split(",")[0])}</span>
          <span class="font-medium text-slate-700">👥 ${escapeHtml(rep.reporter_count || 1)} reported</span>
        </div>
        <div class="text-[10px] text-slate-400 font-mono">
          Ref: ${escapeHtml(rep.trackingId || rep.id)}
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
