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

const allowedOrigins = new Set([
  "http://localhost:3000",
  ...(process.env.RENDER_EXTERNAL_URL ? [process.env.RENDER_EXTERNAL_URL] : []),
  ...(process.env.ALLOWED_ORIGINS || "").split(",").map((origin) => origin.trim()).filter(Boolean)
].map(normalizeOrigin));

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
  res.setHeader("Permissions-Policy", "camera=(self), geolocation=(self), microphone=(self)");
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
    const isSameHost = requestHost && new URL(normalizedOrigin).host.toLowerCase() === requestHost.toLowerCase();
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

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

/**
 * General API rate limiter — 120 requests per 15 minutes per IP.
 */
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
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
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false, xForwardedForHeader: false, default: false },
  message: {
    success: false,
    error: "Complaint analysis rate limit reached. Please wait 15 minutes before submitting again."
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
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== "your_gemini_api_key_here")
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

/**
 * Centralized Express Error Handling Middleware.
 * Catches unhandled synchronous and asynchronous pipeline errors.
 * Never exposes internal stack traces or raw error messages in production.
 */
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const statusCode = err.status || err.statusCode || 500;

  // Scrub any API keys from err.message before logging
  const apiKey = process.env.GEMINI_API_KEY;
  let cleanMessage = err.message || "An unexpected error occurred.";
  if (apiKey && typeof apiKey === "string" && apiKey.trim().length > 0) {
    cleanMessage = cleanMessage.replaceAll(apiKey, "[REDACTED_API_KEY]");
  }
  cleanMessage = cleanMessage.replace(/([?&]key=)[^&\s"`']+/gi, "$1[REDACTED_API_KEY]");
  cleanMessage = cleanMessage.replace(/AIza[0-9A-Za-z-_]{35}/g, "[REDACTED_API_KEY]");

  // Log the full error server-side for debugging (never sent to client)
  console.error(`[ERROR] ${req.method} ${req.path} →`, {
    message: cleanMessage,
    code: err.code,
    status: statusCode
  });

  // If error has a userFacing flag, return its friendly message
  const clientMessage = (err.isUserFacing && err.userMessage)
    ? err.userMessage
    : (process.env.NODE_ENV === "development"
      ? cleanMessage
      : "An error occurred while processing your request.");

  res.status(statusCode).json({
    success: false,
    error: clientMessage,
    code: err.code || "INTERNAL_SERVER_ERROR"
  });
});

/**
 * Starts the HTTP server if not being imported for automated tests.
 */
if (process.env.NODE_ENV !== "test") {
  app.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(` CivicBridge Server Running`);
    console.log(` Local URL: http://localhost:${PORT}`);
    console.log(` Health:    http://localhost:${PORT}/health`);
    console.log(` Target:    Pune Municipal Corporation (PMC) Region`);
    console.log(`====================================================`);
  });
}

export default app;
