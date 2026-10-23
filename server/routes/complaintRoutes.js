/**
 * @fileoverview Express router for complaint processing, AI structuring,
 * duplicate verification, letter generation, and mock authority submissions.
 */

import express from "express";
import multer from "multer";
import {
  validateComplaintInput,
  MAX_FILE_SIZE_BYTES,
  DraftLetterRequestSchema,
  FileComplaintRequestSchema
} from "../utils/validators.js";
import { redactSensitiveData, scrubRawMediaBuffer } from "../services/redactService.js";
import { analyzeWithGemini, draftComplaintLetter } from "../services/geminiService.js";
import { verifyComplaint, getExistingReports, appendReport } from "../services/verificationService.js";
import {
  generateActionPlan,
  matchAuthority,
  generateCopyReadyComplaint,
  buildShareLinks,
  buildStatusTimeline
} from "../services/actionPlanService.js";

const router = express.Router();

/**
 * Configure Multer for in-memory storage (Zero Raw Files Stored on Disk Policy).
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES
  }
});

/**
 * Upload fields middleware: accepts one primary evidence file and one optional voice recording.
 */
const complaintUploadMiddleware = upload.fields([
  { name: "file", maxCount: 1 },
  { name: "audio", maxCount: 1 }
]);

/**
 * POST /api/complaints/analyze
 * Ingests raw complaint inputs, enforces privacy redaction, structures with Gemini,
 * verifies against local reports, and builds a civic action plan.
 */
router.post("/analyze", complaintUploadMiddleware, async (req, res, next) => {
  try {
    const rawText = req.body.text || "";
    const userLat = req.body.lat ? parseFloat(req.body.lat) : undefined;
    const userLng = req.body.lng ? parseFloat(req.body.lng) : undefined;
    const consent = req.body.consent;

    const file = req.files && req.files.file ? req.files.file[0] : undefined;
    const audioFile = req.files && req.files.audio ? req.files.audio[0] : undefined;

    // 1. Input Validation
    const validation = validateComplaintInput({ text: rawText, consent, lat: userLat, lng: userLng }, file, audioFile);
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        errors: validation.errors
      });
    }

    // 2. Privacy Shield: Redact PII (Aadhaar, Phone, Email, Vehicle Plates, Names)
    const { cleanedText, redactionCounts, redactionLog } = redactSensitiveData(rawText);

    // 3. AI Structuring with Gemini (strict JSON schema)
    const structuredReport = await analyzeWithGemini({
      text: cleanedText,
      file,
      audioFile,
      userLat,
      userLng
    });

    // 4. Verification against existing reports in Pune (<200m Haversine + Similarity)
    const verification = await verifyComplaint(structuredReport);

    // 5. Action Plan Generation
    const actionPlan = await generateActionPlan(structuredReport);

    // 6. Zero-retention policy: wipe memory buffers
    scrubRawMediaBuffer(file);
    scrubRawMediaBuffer(audioFile);

    return res.json({
      success: true,
      data: {
        structuredReport,
        verification,
        actionPlan,
        privacyShield: {
          redactionLog,
          itemsRedactedCount: redactionCounts.total,
          redactionCounts,
          rawFilesRetained: false,
          consentVerified: true
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/complaints/draft-letter
 * Generates formal civic grievance letters in English, Marathi, or Hindi.
 */
router.post("/draft-letter", async (req, res, next) => {
  try {
    const parsed = DraftLetterRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        errors: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`)
      });
    }
    const { report, language } = parsed.data;

    const draft = await draftComplaintLetter({ report, language });
    return res.json({
      success: true,
      data: draft
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/complaints/file
 * Handles the "File this complaint" workflow:
 * - Generates official tracking ID (PMC-2026-XXXXX)
 * - Persists strictly redacted report to data/reports.json
 * - Constructs 4-stage status timeline: Submitted -> Verified -> Forwarded -> Resolved
 * - Returns online filing route, offline route with "what to say", and pre-filled WhatsApp/email links.
 */
router.post("/file", async (req, res, next) => {
  try {
    const parsed = FileComplaintRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        errors: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`)
      });
    }
    const { report, actionPlan, citizenNote } = parsed.data;

    // Safety: ensure any additional user notes are strictly redacted
    const { cleanedText: redactedNote } = redactSensitiveData(citizenNote);

    const timestamp = new Date().toISOString();
    const trackingToken = `PMC-2026-${Math.floor(10000 + Math.random() * 90000)}`;
    const newReportId = `PUN-REP-${Math.floor(1020 + Math.random() * 8900)}`;

    const authority =
      actionPlan?.authority ||
      (await matchAuthority(report.category, report.subcategory));

    const persistedRecord = {
      id: newReportId,
      trackingId: trackingToken,
      category: report.category,
      subcategory: report.subcategory,
      severity: report.severity,
      description: report.description,
      location_text: report.location_text,
      lat: report.lat,
      lng: report.lng,
      evidence_summary: report.evidence_summary,
      urgency_reason: report.urgency_reason,
      responsible_authority: authority.name,
      authorityId: authority.id || "pmc_road",
      confidence: report.confidence || 0.95,
      status: "Forwarded to Ward Squad",
      reporter_count: 1,
      createdAt: timestamp,
      citizenNote: redactedNote || undefined,
      ward: report.location_text.includes("Kothrud")
        ? "Kothrud-Bavdhan Ward 12"
        : report.location_text.includes("Baner")
        ? "Aundh-Baner Ward 09"
        : report.location_text.includes("Viman")
        ? "Wadgaon Sheri - Viman Nagar Ward 03"
        : "PMC Central Ward Redressal"
    };

    await appendReport(persistedRecord);

    const copyReadyText = generateCopyReadyComplaint(report, authority, trackingToken);
    const shareLinks = buildShareLinks(authority, copyReadyText, trackingToken);
    const statusTimeline = buildStatusTimeline(trackingToken, authority);

    return res.status(201).json({
      success: true,
      data: {
        trackingId: trackingToken,
        reportId: newReportId,
        authority: {
          id: authority.id,
          name: authority.name,
          authorityName: authority.authorityName || "Pune Municipal Corporation",
          department: authority.department || "Municipal Redressal Cell",
          portalUrl: authority.portalUrl || "https://complaint.punecorporation.org/",
          portalName: authority.portalName || "PMC Care Portal",
          helpline: authority.helpline || "1800 1030 222",
          email: authority.email || "pmccare@punecorporation.org",
          officeAddress: authority.officeAddress || "PMC Main Building, Shivajinagar, Pune"
        },
        statusTimeline,
        onlineRoute: {
          portalUrl: authority.portalUrl || "https://complaint.punecorporation.org/",
          portalName: authority.portalName || "PMC Care Portal",
          copyReadyText,
          instructions: authority.onlineFilingSteps || [
            "Visit the official municipal portal",
            "Select the matching category",
            "Paste the copy-ready grievance text and submit"
          ]
        },
        offlineRoute: authority.offlineGuide || {
          officeName: authority.name,
          officeAddress: authority.officeAddress || "PMC Main Building, Shivajinagar, Pune",
          documentsToCarry: [
            "2 printed color photographs showing defect",
            "Printed formal grievance application letter",
            "Government photo ID for visitor register"
          ],
          bestTimeToVisit: "10:30 AM - 1:00 PM (Monday to Friday)",
          whatToSay: `I am here to register an urgent ${report.category} grievance under the PMC Citizen's Charter ${authority.slaHours || 48}-hour SLA.`
        },
        shareRoutes: {
          whatsappUrl: shareLinks.whatsappUrl,
          emailUrl: shareLinks.emailUrl
        },
        savedReport: persistedRecord
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/complaints/submit-mock
 * Simulates official grievance filing with the responsible Pune authority
 * and logs the new incident to data/reports.json.
 */
router.post("/submit-mock", async (req, res, next) => {
  try {
    const { report, actionPlan } = req.body;
    if (!report || !report.category) {
      return res.status(400).json({
        success: false,
        error: "Invalid report data for submission."
      });
    }

    const timestamp = new Date().toISOString();
    const trackingToken = `PMC-2026-${Math.floor(10000 + Math.random() * 90000)}`;
    const newReportId = `PUN-REP-${Math.floor(1020 + Math.random() * 8900)}`;

    const persistedRecord = {
      id: newReportId,
      trackingId: trackingToken,
      category: report.category,
      subcategory: report.subcategory,
      severity: report.severity,
      description: report.description,
      location_text: report.location_text,
      lat: report.lat,
      lng: report.lng,
      evidence_summary: report.evidence_summary,
      urgency_reason: report.urgency_reason,
      responsible_authority: report.responsible_authority,
      authorityId: (actionPlan && actionPlan.authority && actionPlan.authority.id) || "pmc_road",
      confidence: report.confidence || 0.95,
      status: "Dispatched to Ward",
      reporter_count: 1,
      createdAt: timestamp,
      ward: report.location_text.includes("Kothrud")
        ? "Kothrud-Bavdhan Ward 12"
        : report.location_text.includes("Baner")
        ? "Aundh-Baner Ward 09"
        : report.location_text.includes("Viman")
        ? "Wadgaon Sheri - Viman Nagar Ward 03"
        : "PMC Central Ward Redressal"
    };

    await appendReport(persistedRecord);

    return res.status(201).json({
      success: true,
      data: {
        trackingId: trackingToken,
        status: "Officially Registered with PMC Grievance Cell",
        authority: report.responsible_authority,
        portalUrl: actionPlan?.authority?.portalUrl || "https://complaint.punecorporation.org/",
        helpline: actionPlan?.authority?.helpline || "1800 1030 222",
        slaHours: actionPlan?.expectedTimeline?.slaHours || 48,
        targetResolutionDate: actionPlan?.expectedTimeline?.targetResolutionDate,
        createdAt: timestamp,
        savedReport: persistedRecord
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/complaints
 * Returns stored reports for the Leaflet interactive map feed.
 */
router.get("/", async (req, res, next) => {
  try {
    const reports = await getExistingReports();
    return res.json({
      success: true,
      count: reports.length,
      data: reports
    });
  } catch (error) {
    next(error);
  }
});

export default router;
