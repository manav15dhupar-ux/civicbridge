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

// Load environment variables from .env
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

const app = express();
const PORT = process.env.PORT || 3000;

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
          "'unsafe-inline'",
          "https://cdn.tailwindcss.com",
          "https://unpkg.com",
          "https://cdnjs.cloudflare.com"
        ],
        styleSrc: [
          "'self'",
          "'unsafe-inline'",
          "https://cdn.tailwindcss.com",
          "https://unpkg.com",
          "https://cdnjs.cloudflare.com",
          "https://fonts.googleapis.com"
        ],
        fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
        imgSrc: [
          "'self'",
          "data:",
          "blob:",
          "https://*.tile.openstreetmap.org",
          "https://tile.openstreetmap.org",
          "https://unpkg.com",
          "https://images.unsplash.com"
        ],
        connectSrc: [
          "'self'",
          "https://api.mobbin.com",
          "https://*.tile.openstreetmap.org",
          "https://tile.openstreetmap.org"
        ],
        mediaSrc: ["'self'", "blob:", "data:"],
        objectSrc: ["'none'"]
      }
    },
    crossOriginEmbedderPolicy: false
  })
);

/**
 * CORS: only allow the configured origin (defaults to same-origin in production).
 * Set ALLOWED_ORIGIN env var to permit a specific front-end domain on Render.
 */
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "http://localhost:3000";
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (curl, mobile apps, same-origin)
    if (!origin || origin === ALLOWED_ORIGIN) {
      return callback(null, true);
    }
    callback(new Error("Not allowed by CORS"));
  },
  credentials: false
}));

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

  // Log the full error server-side for debugging (never sent to client)
  console.error(`[ERROR] ${req.method} ${req.path} →`, {
    message: err.message,
    code: err.code,
    status: statusCode
  });

  // In non-development environments, return a generic message to prevent info leakage
  const isDev = process.env.NODE_ENV === "development";
  const clientMessage = isDev
    ? (err.message || "An unexpected error occurred.")
    : "An error occurred while processing your request.";

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
