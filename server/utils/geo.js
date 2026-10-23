/**
 * @fileoverview Geographic utility functions for distance calculations and Pune coordinate validations.
 */

import { EARTH_RADIUS_METERS, PUNE_BOUNDS } from "../config/constants.js";

export { PUNE_BOUNDS } from "../config/constants.js";

/**
 * Earth radius in meters.
 * @constant {number}
 */
/**
 * Converts degrees to radians.
 * @param {number} degrees - Angle in degrees.
 * @returns {number} Angle in radians.
 */
function toRadians(degrees) {
  return (degrees * Math.PI) / 180;
}

/**
 * Calculates the Haversine great-circle distance between two geographic coordinates in meters.
 * @param {number} lat1 - Latitude of the first point.
 * @param {number} lon1 - Longitude of the first point.
 * @param {number} lat2 - Latitude of the second point.
 * @param {number} lon2 - Longitude of the second point.
 * @returns {number} Distance in meters rounded to two decimal places.
 */
export function calculateHaversineDistance(lat1, lon1, lat2, lon2) {
  if (
    typeof lat1 !== "number" ||
    typeof lon1 !== "number" ||
    typeof lat2 !== "number" ||
    typeof lon2 !== "number" ||
    Number.isNaN(lat1) ||
    Number.isNaN(lon1) ||
    Number.isNaN(lat2) ||
    Number.isNaN(lon2)
  ) {
    return Infinity;
  }

  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const radLat1 = toRadians(lat1);
  const radLat2 = toRadians(lat2);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLon / 2) *
      Math.sin(dLon / 2) *
      Math.cos(radLat1) *
      Math.cos(radLat2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(EARTH_RADIUS_METERS * c * 100) / 100;
}

/**
 * Checks if a given coordinate lies within the Pune metropolitan region.
 * @param {number} lat - Latitude.
 * @param {number} lng - Longitude.
 * @returns {boolean} True if coordinate is within Pune bounds.
 */
export function isWithinPune(lat, lng) {
  if (typeof lat !== "number" || typeof lng !== "number") {
    return false;
  }
  return (
    lat >= PUNE_BOUNDS.minLat &&
    lat <= PUNE_BOUNDS.maxLat &&
    lng >= PUNE_BOUNDS.minLng &&
    lng <= PUNE_BOUNDS.maxLng
  );
}
