/**
 * @fileoverview Location, Reverse Geocoding, and Pune Spatial Intelligence Service.
 * Implements cached, throttled reverse geocoding via OpenStreetMap Nominatim
 * with strict compliance to Nominatim's usage policy (max 1 req/sec and descriptive User-Agent).
 * Includes offline Pune landmark fallback resolution when network is restricted.
 */

import { isWithinPune, PUNE_BOUNDS, calculateHaversineDistance } from "../utils/geo.js";

/**
 * In-memory LRU-style cache for reverse geocoded coordinates.
 * Keys are rounded to 4 decimal places (~11 meters) to optimize cache hit rate.
 * @type {Map<string, { address: string, details: object, timestamp: number }>}
 */
const geocodeCache = new Map();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const MAX_CACHE_ENTRIES = 2000;

/**
 * Throttle queue timestamp to enforce OSM Nominatim 1-req-per-second rate limit policy.
 * @type {number}
 */
let lastNominatimRequestTime = 0;
const MIN_NOMINATIM_INTERVAL_MS = 1100; // 1.1s minimum delay between consecutive calls

/**
 * Prominent Pune reference landmarks and ward headquarters for instant offline fallback.
 */
const PUNE_LANDMARKS = [
  { name: "PMC Main Building, Shivajinagar", lat: 18.5204, lng: 73.8567, ward: "Shivajinagar-Ghole Road", pincode: "411005" },
  { name: "FC Road, Shivajinagar", lat: 18.5284, lng: 73.8423, ward: "Shivajinagar-Ghole Road", pincode: "411004" },
  { name: "JM Road, Deccan Gymkhana", lat: 18.5186, lng: 73.8436, ward: "Shivajinagar-Ghole Road", pincode: "411004" },
  { name: "Karve Road, Kothrud", lat: 18.5074, lng: 73.8077, ward: "Kothrud-Bavdhan Ward 12", pincode: "411038" },
  { name: "Baner High Street, Baner", lat: 18.5590, lng: 73.7868, ward: "Aundh-Baner Ward 09", pincode: "411045" },
  { name: "Parihar Chowk, Aundh", lat: 18.5626, lng: 73.8087, ward: "Aundh-Baner Ward 09", pincode: "411007" },
  { name: "Phoenix Marketcity, Viman Nagar", lat: 18.5621, lng: 73.9168, ward: "Wadgaon Sheri - Viman Nagar Ward 03", pincode: "411014" },
  { name: "Magarpatta City, Hadapsar", lat: 18.5126, lng: 73.9284, ward: "Hadapsar-Mundhwa Ward 05", pincode: "411028" },
  { name: "Swargate Bus Station, Swargate", lat: 18.5018, lng: 73.8586, ward: "Kasba-Vishrambaug Wada Ward", pincode: "411042" },
  { name: "Kalyani Nagar Joggers Park", lat: 18.5463, lng: 73.9034, ward: "Nagar Road - Vadgaon Sheri", pincode: "411006" },
  { name: "Rajiv Gandhi Infotech Park, Hinjewadi", lat: 18.5913, lng: 73.7389, ward: "PCMC-Hinjewadi Zone", pincode: "411057" },
  { name: "Katraj Snake Park, Katraj", lat: 18.4575, lng: 73.8677, ward: "Dhankawadi-Sahakarnagar Ward", pincode: "411046" },
  { name: "Pune Railway Station, Agarkar Nagar", lat: 18.5284, lng: 73.8744, ward: "Dhole Patil Road Ward", pincode: "411001" },
  { name: "Bavdhan Chandani Chowk", lat: 18.5071, lng: 73.7806, ward: "Kothrud-Bavdhan Ward 12", pincode: "411021" },
  { name: "Yerawada Central Jail Chowk", lat: 18.5529, lng: 73.8828, ward: "Yerawada-Kalas-Dhanori Ward", pincode: "411006" }
];

/**
 * Resolves the closest known Pune landmark when network geocoding is unavailable.
 * @param {number} lat - Latitude.
 * @param {number} lng - Longitude.
 * @returns {{ address: string, details: object, landmark: string, distanceMeters: number }}
 */
export function resolveNearestPuneLandmark(lat, lng) {
  let closest = PUNE_LANDMARKS[0];
  let minDistance = Infinity;

  for (const lm of PUNE_LANDMARKS) {
    const dist = calculateHaversineDistance(lat, lng, lm.lat, lm.lng);
    if (dist < minDistance) {
      minDistance = dist;
      closest = lm;
    }
  }

  const distanceText = minDistance < 100
    ? "at"
    : minDistance < 1000
    ? `~${Math.round(minDistance)}m from`
    : `~${(minDistance / 1000).toFixed(1)}km from`;

  return {
    address: `${distanceText} ${closest.name}, Pune, Maharashtra ${closest.pincode}`,
    details: {
      road: closest.name.split(",")[0],
      suburb: closest.name.split(",")[1]?.trim() || "Pune",
      city: "Pune",
      state: "Maharashtra",
      postcode: closest.pincode,
      ward: closest.ward
    },
    landmark: closest.name,
    distanceMeters: Math.round(minDistance)
  };
}

/**
 * Enforces OSM Nominatim rate limits by delaying until interval passes.
 * @returns {Promise<void>}
 */
async function throttleNominatimRequest() {
  const now = Date.now();
  const elapsed = now - lastNominatimRequestTime;
  if (elapsed < MIN_NOMINATIM_INTERVAL_MS) {
    const waitTime = MIN_NOMINATIM_INTERVAL_MS - elapsed;
    await new Promise((resolve) => setTimeout(resolve, waitTime));
  }
  lastNominatimRequestTime = Date.now();
}

/**
 * Reverse geocodes coordinates to a human-readable address with caching,
 * rate limiting, and fallback to local Pune landmark resolution.
 *
 * @param {number} lat - Latitude.
 * @param {number} lng - Longitude.
 * @returns {Promise<{
 *   address: string,
 *   details: object,
 *   isWithinPune: boolean,
 *   confidence: "high" | "moderate" | "approximate",
 *   cached: boolean,
 *   source: "nominatim" | "cache" | "fallback"
 * }>}
 */
export async function reverseGeocode(lat, lng) {
  const inPune = isWithinPune(lat, lng);
  const cacheKey = `${lat.toFixed(4)}_${lng.toFixed(4)}`;

  // 1. Check in-memory cache
  if (geocodeCache.has(cacheKey)) {
    const entry = geocodeCache.get(cacheKey);
    if (Date.now() - entry.timestamp < CACHE_TTL_MS) {
      return {
        address: entry.address,
        details: entry.details,
        isWithinPune: inPune,
        confidence: inPune ? "high" : "approximate",
        cached: true,
        source: "cache"
      };
    }
    geocodeCache.delete(cacheKey);
  }

  // 2. Attempt OSM Nominatim reverse geocode if network permits
  try {
    await throttleNominatimRequest();

    const url = new URL("https://nominatim.openstreetmap.org/reverse");
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("lat", lat.toString());
    url.searchParams.set("lon", lng.toString());
    url.searchParams.set("zoom", "18");
    url.searchParams.set("addressdetails", "1");

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    const response = await fetch(url.toString(), {
      signal: controller.signal,
      headers: {
        "User-Agent": "CivicBridge-Pune/1.0 (contact: grievances@civicbridge.pune.internal; municipal civic redressal)",
        "Accept": "application/json",
        "Accept-Language": "en"
      }
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      const addr = data.address || {};
      const road = addr.road || addr.pedestrian || addr.street || addr.neighbourhood || "";
      const suburb = addr.suburb || addr.residential || addr.city_district || "";
      const city = addr.city || addr.town || addr.municipality || "Pune";
      const postcode = addr.postcode || "";

      const parts = [road, suburb, city, "Maharashtra", postcode].filter(Boolean);
      const formattedAddress = parts.length > 0 ? parts.join(", ") : data.display_name || "Pune, Maharashtra";

      const result = {
        address: formattedAddress,
        details: {
          road,
          suburb,
          city,
          state: "Maharashtra",
          postcode
        },
        isWithinPune: inPune,
        confidence: inPune ? "high" : "approximate",
        cached: false,
        source: "nominatim"
      };

      // Store in LRU cache
      if (geocodeCache.size >= MAX_CACHE_ENTRIES) {
        const oldestKey = geocodeCache.keys().next().value;
        geocodeCache.delete(oldestKey);
      }
      geocodeCache.set(cacheKey, {
        address: result.address,
        details: result.details,
        timestamp: Date.now()
      });

      return result;
    }
  } catch {
    // Network restricted or Nominatim timeout — fall through to local Pune resolver
  }

  // 3. Robust local Pune spatial landmark fallback
  const fallback = resolveNearestPuneLandmark(lat, lng);
  const fallbackResult = {
    address: fallback.address,
    details: fallback.details,
    isWithinPune: inPune,
    confidence: inPune ? "high" : "approximate",
    cached: false,
    source: "fallback"
  };

  // Cache fallback result too so repeated requests remain fast
  geocodeCache.set(cacheKey, {
    address: fallbackResult.address,
    details: fallbackResult.details,
    timestamp: Date.now()
  });

  return fallbackResult;
}
