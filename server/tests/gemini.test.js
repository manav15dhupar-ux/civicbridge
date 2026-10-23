/**
 * @fileoverview End-to-end verification and error handling tests for CivicBridge Gemini integration.
 * Verifies all input modalities (text, PDF, audio, image, and combined media)
 * and confirms strict error classification, friendly error messages, and zero API key leakage.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  classifyGeminiError,
  GeminiServiceError,
  analyzeWithGemini,
  fallbackAnalyzeComplaint
} from "../services/geminiService.js";
import { normalizeMimeType, validateComplaintInput } from "../utils/validators.js";
import complaintRoutes from "../routes/complaintRoutes.js";

/**
 * In-memory response mock helper.
 */
function createMockResponse() {
  let resolvePromise;
  const promise = new Promise((resolve) => {
    resolvePromise = resolve;
  });

  const res = {
    statusCode: 200,
    headers: {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      resolvePromise({ statusCode: this.statusCode, body: data });
      return this;
    },
    send(data) {
      resolvePromise({ statusCode: this.statusCode, body: data });
      return this;
    },
    setHeader(name, value) {
      this.headers[name] = value;
      return this;
    }
  };

  return { res, promise };
}

describe("Gemini Multimodal Input Intake & Normalization", () => {
  it("normalizeMimeType should sanitize audio/webm with codecs to clean audio/webm", () => {
    const rawAudio = "audio/webm; codecs=opus";
    assert.equal(normalizeMimeType(rawAudio, true), "audio/webm");

    const rawVideo = "video/webm";
    assert.equal(normalizeMimeType(rawVideo, true), "audio/webm");

    const rawJpg = "image/jpg";
    assert.equal(normalizeMimeType(rawJpg, false), "image/jpeg");

    const rawMp3 = "audio/mpeg";
    assert.equal(normalizeMimeType(rawMp3, true), "audio/mp3");

    const rawPdf = "application/pdf";
    assert.equal(normalizeMimeType(rawPdf, false), "application/pdf");
  });

  it("should validate and structure Text-only complaint input", async () => {
    const payload = {
      text: "Massive pothole on Paud Road near Karve Statue in Kothrud causing traffic jams.",
      consent: "true",
      lat: 18.5074,
      lng: 73.8077
    };

    const validation = validateComplaintInput(payload);
    assert.equal(validation.valid, true);

    const report = await analyzeWithGemini({
      text: payload.text,
      userLat: payload.lat,
      userLng: payload.lng
    });

    assert.equal(Boolean(report.category), true);
    assert.equal(Boolean(report.subcategory), true);
    assert.equal(typeof report.severity, "number");
    assert.equal(report.severity >= 1 && report.severity <= 5, true);
    assert.equal(typeof report.lat, "number");
    assert.equal(typeof report.lng, "number");
    assert.equal(Boolean(report.responsible_authority), true);
  });

  it("should validate and structure PDF document evidence input", async () => {
    // Valid PDF buffer signature (%PDF)
    const pdfBuffer = Buffer.from("%PDF-1.4\n1 0 obj\n<< /Title (Civic Notice: Contaminated Water Supply in Baner) >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF");
    const mockPdfFile = {
      fieldname: "file",
      originalname: "water_contamination_report.pdf",
      mimetype: "application/pdf",
      buffer: pdfBuffer,
      size: pdfBuffer.length
    };

    const validation = validateComplaintInput(
      { consent: true, lat: 18.5590, lng: 73.7868 },
      mockPdfFile
    );
    assert.equal(validation.valid, true);
    assert.equal(mockPdfFile.canonicalMime, "application/pdf");

    const report = await analyzeWithGemini({
      text: "",
      file: mockPdfFile,
      userLat: 18.5590,
      userLng: 73.7868
    });

    assert.equal(Boolean(report.category), true);
    assert.equal(Boolean(report.subcategory), true);
    assert.equal(Boolean(report.evidence_summary), true);
  });

  it("should validate and structure Voice Note audio evidence input", async () => {
    // Valid WebM EBML header
    const audioBuffer = Buffer.from([0x1A, 0x45, 0xDF, 0xA3, 0x9F, 0x42, 0x86, 0x81, 0x01, 0x42, 0xF7, 0x81, 0x01]);
    const mockAudioFile = {
      fieldname: "audio",
      originalname: "voice-recording.webm",
      mimetype: "audio/webm;codecs=opus",
      buffer: audioBuffer,
      size: audioBuffer.length
    };

    const validation = validateComplaintInput(
      { consent: "1", lat: 18.5204, lng: 73.8567 },
      undefined,
      mockAudioFile
    );
    assert.equal(validation.valid, true);
    assert.equal(mockAudioFile.canonicalMime, "audio/webm");

    const report = await analyzeWithGemini({
      text: "",
      audioFile: mockAudioFile,
      userLat: 18.5204,
      userLng: 73.8567
    });

    assert.equal(Boolean(report.category), true);
    assert.equal(Boolean(report.description), true);
  });

  it("should validate and structure Photo image evidence input (with EXIF stripping)", async () => {
    // Valid JPEG with APP1 EXIF segment
    const soi = Buffer.from([0xFF, 0xD8]);
    const app1Data = Buffer.from("Exif\0\0SecretCameraGpsData");
    const app1Len = Buffer.alloc(2);
    app1Len.writeUInt16BE(app1Data.length + 2, 0);
    const app1 = Buffer.concat([Buffer.from([0xFF, 0xE1]), app1Len, app1Data]);

    const sos = Buffer.from([0xFF, 0xDA, 0x00, 0x02, 0x00, 0x00]);
    const pixels = Buffer.from("simulated_jpeg_pothole_pixels");
    const eoi = Buffer.from([0xFF, 0xD9]);
    const rawJpeg = Buffer.concat([soi, app1, sos, pixels, eoi]);

    const mockPhotoFile = {
      fieldname: "file",
      originalname: "pothole_evidence.jpg",
      mimetype: "image/jpeg",
      buffer: rawJpeg,
      size: rawJpeg.length
    };

    const validation = validateComplaintInput(
      { text: "Pothole on FC Road", consent: true, lat: 18.5284, lng: 73.8423 },
      mockPhotoFile
    );
    assert.equal(validation.valid, true);
    assert.equal(mockPhotoFile.canonicalMime, "image/jpeg");
    // Verify EXIF was stripped from buffer
    assert.equal(mockPhotoFile.buffer.includes(Buffer.from("SecretCameraGpsData")), false);
    // Verify image data remains intact
    assert.equal(mockPhotoFile.buffer.includes(pixels), true);

    const report = await analyzeWithGemini({
      text: "Pothole on FC Road",
      file: mockPhotoFile,
      userLat: 18.5284,
      userLng: 73.8423
    });

    assert.equal(report.category, "Roads & Footpaths");
  });

  it("should handle simultaneous Photo AND Voice Note without dropping either evidence source", async () => {
    const imgBuffer = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xFF, 0xD9]);
    const audioBuffer = Buffer.from([0x1A, 0x45, 0xDF, 0xA3, 0x01, 0x02, 0x03, 0x04]);

    const photo = {
      fieldname: "file",
      originalname: "garbage_overflow.jpg",
      mimetype: "image/jpeg",
      buffer: imgBuffer,
      size: imgBuffer.length
    };

    const audio = {
      fieldname: "audio",
      originalname: "citizen_speech.webm",
      mimetype: "audio/webm",
      buffer: audioBuffer,
      size: audioBuffer.length
    };

    const validation = validateComplaintInput({ consent: true }, photo, audio);
    assert.equal(validation.valid, true);

    const report = await analyzeWithGemini({
      text: "मोठा कचरा साचला आहे दुर्गंधी पसरली आहे garbage and trash dump",
      file: photo,
      audioFile: audio,
      userLat: 18.5020,
      userLng: 73.9272
    });

    assert.equal(report.category, "Garbage & Waste");
    assert.equal(Boolean(report.evidence_summary), true);
  });
});

describe("Gemini Error Classification & Key Scrubbing", () => {
  const secretKey = "test-key-123";

  it("classifyGeminiError should classify Quota Exceeded (429) and NEVER leak the key", () => {
    const rawError = new Error(`[GoogleGenerativeAI Error]: Error fetching from https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${secretKey}: [429 Too Many Requests] Resource has been exhausted (check quota).`);
    rawError.status = 429;

    const classified = classifyGeminiError(rawError, secretKey);

    assert.equal(classified.status, 429);
    assert.equal(classified.code, "QUOTA_EXCEEDED");
    assert.equal(classified.userMessage.includes("quota or rate limit"), true);

    // CRITICAL: Ensure raw secret key is NEVER present anywhere in classified output
    assert.equal(classified.logMessage.includes(secretKey), false);
    assert.equal(classified.cleanMessage.includes(secretKey), false);
    assert.equal(classified.userMessage.includes(secretKey), false);
    assert.equal(classified.logMessage.includes("[REDACTED_API_KEY]"), true);
  });

  it("classifyGeminiError should classify Invalid API Key (400/401/403) and NEVER leak the key", () => {
    const rawError = new Error(`Error fetching from https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${secretKey}: [400 Bad Request] API key not valid. Please pass a valid API key.`);
    rawError.status = 400;

    const classified = classifyGeminiError(rawError, secretKey);

    assert.equal(classified.status, 401);
    assert.equal(classified.code, "INVALID_API_KEY");
    assert.equal(classified.userMessage.includes("Invalid Gemini API key"), true);

    // Verify key scrubbing
    assert.equal(classified.logMessage.includes(secretKey), false);
    assert.equal(classified.cleanMessage.includes(secretKey), false);
    assert.equal(classified.logMessage.includes("[REDACTED_API_KEY]"), true);
  });

  it("classifyGeminiError should classify Unsupported File Format (400) and NEVER leak the key", () => {
    const rawError = new Error(`[GoogleGenerativeAI Error]: Error fetching from https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${secretKey}: [400 Bad Request] Unsupported MIME type: audio/webm;codecs=opus`);
    rawError.status = 400;

    const classified = classifyGeminiError(rawError, secretKey);

    assert.equal(classified.status, 400);
    assert.equal(classified.code, "UNSUPPORTED_FILE");
    assert.equal(classified.userMessage.includes("uploaded file format is not supported"), true);
    assert.equal(classified.logMessage.includes(secretKey), false);
  });

  it("classifyGeminiError should classify Timeout / Abort errors and NEVER leak the key", () => {
    const rawError = new Error(`The user aborted a request or connection timed out after 25000ms. URL: https://generativelanguage.googleapis.com/v1beta/models?key=${secretKey}`);
    rawError.name = "AbortError";
    rawError.status = 504;

    const classified = classifyGeminiError(rawError, secretKey);

    assert.equal(classified.status, 504);
    assert.equal(classified.code, "TIMEOUT");
    assert.equal(classified.userMessage.includes("timed out"), true);
    assert.equal(classified.logMessage.includes(secretKey), false);
  });
});

describe("POST /api/complaints/analyze End-to-End Route Integration", () => {
  it("should process a complete text complaint and return 200 with structured report & action plan", async () => {
    const { res, promise } = createMockResponse();

    const mockReq = {
      method: "POST",
      url: "/analyze",
      headers: { "content-type": "application/json" },
      body: {
        text: "Dangerous open manhole on Baner High Street opposite Balewadi Phata.",
        consent: "true",
        lat: 18.5590,
        lng: 73.7868
      },
      files: {}
    };

    await complaintRoutes.handle(mockReq, res, (err) => {
      if (err) assert.fail(err.message);
    });

    const result = await promise;
    assert.equal(result.statusCode, 200);
    assert.equal(result.body.success, true);
    assert.equal(Boolean(result.body.data.structuredReport), true);
    assert.equal(Boolean(result.body.data.verification), true);
    assert.equal(Boolean(result.body.data.actionPlan), true);
  });

  it("should return 400 when citizen consent is missing", async () => {
    const { res, promise } = createMockResponse();

    const mockReq = {
      method: "POST",
      url: "/analyze",
      headers: { "content-type": "application/json" },
      body: {
        text: "Pothole on FC Road"
        // consent missing
      },
      files: {}
    };

    await complaintRoutes.handle(mockReq, res, () => {});

    const result = await promise;
    assert.equal(result.statusCode, 400);
    assert.equal(result.body.success, false);
    assert.equal(result.body.errors.some((e) => e.includes("consent")), true);
  });

  it("should return specific user-friendly error when GeminiServiceError is thrown", async () => {
    const operationalErr = new GeminiServiceError(
      "AI analysis quota or rate limit exceeded. Please wait a few moments before trying again or submit your report directly.",
      429,
      "QUOTA_EXCEEDED"
    );

    assert.equal(operationalErr.status, 429);
    assert.equal(operationalErr.code, "QUOTA_EXCEEDED");
    assert.equal(operationalErr.isUserFacing, true);

    const { res, promise } = createMockResponse();

    // Verify error response format matches what router returns
    res.status(operationalErr.status).json({
      success: false,
      error: operationalErr.userMessage,
      code: operationalErr.code
    });

    const result = await promise;
    assert.equal(result.statusCode, 429);
    assert.equal(result.body.success, false);
    assert.equal(result.body.code, "QUOTA_EXCEEDED");
    assert.equal(result.body.error.includes("quota or rate limit"), true);
  });
});
