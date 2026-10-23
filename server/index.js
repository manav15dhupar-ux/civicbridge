/**
 * @fileoverview CivicBridge Express Application Entry Point.
 * Configured for production deployment on Render, containerized runtimes, and local development.
 */

import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";

import complaintRoutes from "./routes/complaintRoutes.js";
import authorityRoutes from "./routes/authorityRoutes.js";
import locationRoutes from "./routes/locationRoutes.js";
import {
  ANALYZE_RATE_LIMIT_MAX_REQUESTS,
  API_RATE_LIMIT_MAX_REQUESTS,
  API_RATE_LIMIT_WINDOW_MS,
  REQUEST_BODY_LIMIT
} from "./config/constants.js";
import { errorHandler } from "./middleware/errorHandler.js";

// Load environment variables from .env
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

const app = express();
const PORT = process.env.PORT || 3000;

function normalizeOrigin(value) {
  const parsed = new URL(value);
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error(`Invalid allowed origin: ${value}`);
  }
  return parsed.origin;
}

const allowedOrigins = new Set(
  [
    "http://localhost:3000",
    ...(process.env.RENDER_EXTERNAL_URL
      ? [process.env.RENDER_EXTERNAL_URL]
      : []),
    ...(process.env.ALLOWED_ORIGINS || "")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean)
  ].map(normalizeOrigin)
);

/**
 * Configure Helmet with Content Security Policy and Referrer Policy permitting Tailwind CDN,
 * Leaflet maps, and OpenStreetMap tiles.
 */
app.use(
  helmet({
    referrerPolicy: {
      policy: "strict-origin-when-cross-origin"
    },
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "https://cdn.tailwindcss.com",
          "https://unpkg.com"
        ],
        styleSrc: [
          "'self'",
          "'unsafe-inline'",
          "https://cdn.tailwindcss.com",
          "https://unpkg.com",
          "https://fonts.googleapis.com"
        ],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: [
          "'self'",
          "data:",
          "blob:",
          "https://*.tile.openstreetmap.org"
        ],
        connectSrc: ["'self'", "blob:"],
        mediaSrc: ["'self'", "blob:"],
        objectSrc: ["'none'"]
      }
    },
    crossOriginEmbedderPolicy: false
  })
);
app.use((req, res, next) => {
  res.setHeader(
    "Permissions-Policy",
    "camera=(self), geolocation=(self), microphone=(self)"
  );
  next();
});

/**
 * CORS is limited to API routes. The request's own host is always accepted, as are
 * the configured local, Render, and additional frontend origins.
 */
app.use("/api", (req, res, next) => {
  const origin = req.get("Origin");
  if (origin) {
    let normalizedOrigin;
    try {
      normalizedOrigin = normalizeOrigin(origin);
    } catch {
      return res.status(403).json({
        success: false,
        error: "Origin is not allowed.",
        code: "CORS_ORIGIN_FORBIDDEN"
      });
    }

    const requestHost = req.get("host");
    const isSameHost =
      requestHost &&
      new URL(normalizedOrigin).host.toLowerCase() ===
        requestHost.toLowerCase();
    if (!isSameHost && !allowedOrigins.has(normalizedOrigin)) {
      return res.status(403).json({
        success: false,
        error: "Origin is not allowed.",
        code: "CORS_ORIGIN_FORBIDDEN"
      });
    }
  }

  cors({ origin: origin || false, credentials: false })(req, res, next);
});

app.use(express.json({ limit: REQUEST_BODY_LIMIT }));
app.use(express.urlencoded({ extended: true, limit: REQUEST_BODY_LIMIT }));

/**
 * General API rate limiter — 120 requests per 15 minutes per IP.
 */
const apiLimiter = rateLimit({
  windowMs: API_RATE_LIMIT_WINDOW_MS,
  max: API_RATE_LIMIT_MAX_REQUESTS,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false, xForwardedForHeader: false, default: false },
  message: {
    success: false,
    error: "Too many requests from this IP. Please try again after 15 minutes."
  }
});

/**
 * Stricter rate limiter for the AI analysis endpoint to prevent cost abuse — 20 per 15 minutes.
 */
const analyzeLimiter = rateLimit({
  windowMs: API_RATE_LIMIT_WINDOW_MS,
  max: ANALYZE_RATE_LIMIT_MAX_REQUESTS,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false, xForwardedForHeader: false, default: false },
  message: {
    success: false,
    error:
      "Complaint analysis rate limit reached. Please wait 15 minutes before submitting again."
  }
});

// Apply general limiter to all /api routes
app.use("/api", apiLimiter);
// Apply stricter limiter to the expensive AI route
app.use("/api/complaints/analyze", analyzeLimiter);

/**
 * Health check endpoint for Render, load balancers, and container monitoring.
 */
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    service: "CivicBridge",
    environment: process.env.NODE_ENV || "development",
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    geminiConfigured: Boolean(
      process.env.GEMINI_API_KEY &&
      process.env.GEMINI_API_KEY !== "your_gemini_api_key_here"
    )
  });
});

// Mount modular API routers
app.use("/api/complaints", complaintRoutes);
app.use("/api/authorities", authorityRoutes);
app.use("/api/location", locationRoutes);

/**
 * Serve static frontend files from public/ directory.
 */
app.use(express.static(path.join(projectRoot, "public")));

// Fallback to index.html for client-side routing
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/")) {
    return next();
  }
  res.sendFile(path.join(projectRoot, "public", "index.html"));
});

app.use(errorHandler);

/**
 * Starts the HTTP server if not being imported for automated tests.
 */
if (process.env.NODE_ENV !== "test") {
  app.listen(PORT);
}

export default app;
