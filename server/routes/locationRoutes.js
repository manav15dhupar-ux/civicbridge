/**
 * @fileoverview Express router for location verification, Pune boundary checks,
 * and cached reverse geocoding with Nominatim rate limit compliance.
 */

import express from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { reverseGeocode } from "../services/locationService.js";
import { isWithinPune, PUNE_BOUNDS } from "../utils/geo.js";
import {
  API_RATE_LIMIT_WINDOW_MS,
  GEOCODE_RATE_LIMIT_MAX_REQUESTS
} from "../config/constants.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = express.Router();

/**
 * Dedicated rate limiter for reverse geocoding to prevent abuse.
 * 60 requests per 15 minutes per IP.
 */
const geocodeLimiter = rateLimit({
  windowMs: API_RATE_LIMIT_WINDOW_MS,
  max: GEOCODE_RATE_LIMIT_MAX_REQUESTS,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false, xForwardedForHeader: false },
  message: {
    success: false,
    error:
      "Too many location lookup requests from this IP. Please try again shortly."
  }
});

const ReverseGeocodeQuerySchema = z.object({
  lat: z.coerce
    .number()
    .min(-90, "Latitude must be >= -90")
    .max(90, "Latitude must be <= 90"),
  lng: z.coerce
    .number()
    .min(-180, "Longitude must be >= -180")
    .max(180, "Longitude must be <= 180")
});

/**
 * GET /api/location/reverse-geocode?lat=18.5204&lng=73.8567
 * Returns human-readable address with caching, Pune boundary validation,
 * and location confidence level.
 */
router.get(
  "/reverse-geocode",
  geocodeLimiter,
  asyncHandler(async (req, res) => {
    const parseResult = ReverseGeocodeQuerySchema.safeParse(req.query);
    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        errors: parseResult.error.issues.map(
          (i) => `${i.path.join(".")}: ${i.message}`
        )
      });
    }

    const { lat, lng } = parseResult.data;
    const inPune = isWithinPune(lat, lng);
    const geocode = await reverseGeocode(lat, lng);

    return res.json({
      success: true,
      data: {
        address: geocode.address,
        details: geocode.details,
        lat,
        lng,
        isWithinPune: inPune,
        puneBounds: PUNE_BOUNDS,
        confidenceBadge: inPune
          ? { label: "Inside Pune Boundary", level: "high", color: "emerald" }
          : {
              label: "Outside Pune Boundary",
              level: "warning",
              color: "amber"
            },
        source: geocode.source,
        cached: geocode.cached
      }
    });
  })
);

/**
 * GET /api/location/bounds
 * Returns official Pune municipal bounding box for client map constraints.
 */
router.get("/bounds", (req, res) => {
  res.json({
    success: true,
    data: PUNE_BOUNDS
  });
});

export default router;
