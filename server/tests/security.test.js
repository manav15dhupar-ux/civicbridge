/**
 * @fileoverview Security Hardening Unit & Integration Tests for CivicBridge.
 * Tests strict schema validation (unknown field rejection), file magic bytes,
 * EXIF stripping, PII redaction without raw storage, and rate limiting policies.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  detectMimeTypeFromMagicBytes,
  stripExifMetadata,
  validateUploadedFile,
  AnalyzePayloadSchema,
  StructuredReportSchema,
  DraftLetterRequestSchema,
  FileComplaintRequestSchema,
  MAX_FILE_SIZE_BYTES
} from "../utils/validators.js";
import { redactSensitiveData } from "../services/redactService.js";

describe("Security Hardening - Strict Input Validation", () => {
  it("AnalyzePayloadSchema should reject unknown fields", () => {
    const invalidPayload = {
      text: "Broken streetlight near FC Road",
      consent: true,
      unexpectedField: "injection_payload",
      adminOverride: true
    };

    const result = AnalyzePayloadSchema.safeParse(invalidPayload);
    assert.equal(result.success, false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      assert.ok(
        messages.some(
          (m) => m.includes("unrecognized") || m.includes("Unrecognized")
        )
      );
    }
  });

  it("AnalyzePayloadSchema should enforce coordinate boundaries", () => {
    const outOfBoundsLat = {
      text: "Test report",
      consent: true,
      lat: 120.5, // Invalid (> 90)
      lng: 73.8567
    };
    assert.equal(AnalyzePayloadSchema.safeParse(outOfBoundsLat).success, false);

    const validPayload = {
      text: "Test report",
      consent: true,
      lat: 18.5204,
      lng: 73.8567
    };
    const validResult = AnalyzePayloadSchema.safeParse(validPayload);
    assert.equal(validResult.success, true);
    assert.equal(validResult.data.lat, 18.5204);
  });

  it("StructuredReportSchema should reject invalid categories and unknown fields", () => {
    const invalidReport = {
      category: "Alien Invasion", // Disallowed
      subcategory: "UFO",
      severity: 3,
      description: "Strange lights over Pune",
      location_text: "Shivajinagar",
      lat: 18.52,
      lng: 73.85,
      responsible_authority: "ISRO"
    };
    assert.equal(
      StructuredReportSchema.safeParse(invalidReport).success,
      false
    );

    const reportWithExtraField = {
      category: "Roads & Footpaths",
      subcategory: "Pothole",
      severity: 4,
      description: "Massive pothole causing traffic jam",
      location_text: "JM Road, Shivajinagar",
      lat: 18.52,
      lng: 73.85,
      responsible_authority: "PMC Road Department",
      hackedField: "drop database"
    };
    assert.equal(
      StructuredReportSchema.safeParse(reportWithExtraField).success,
      false
    );
  });

  it("DraftLetterRequestSchema and FileComplaintRequestSchema should reject unknown fields", () => {
    const validReport = {
      category: "Drainage & Sewage",
      subcategory: "Choked Drain",
      severity: 3,
      description: "Drain overflowing onto walkway",
      location_text: "Kothrud, Pune",
      lat: 18.5,
      lng: 73.81,
      responsible_authority: "PMC Drainage Department"
    };

    const draftWithExtra = {
      report: validReport,
      language: "en",
      maliciousParameter: "bypass"
    };
    assert.equal(
      DraftLetterRequestSchema.safeParse(draftWithExtra).success,
      false
    );

    const fileWithExtra = {
      report: validReport,
      citizenNote: "Please expedite",
      unknownPayload: 12345
    };
    assert.equal(
      FileComplaintRequestSchema.safeParse(fileWithExtra).success,
      false
    );
  });
});

describe("Security Hardening - File Magic Bytes & EXIF Sanitization", () => {
  it("detectMimeTypeFromMagicBytes should detect real JPEG, PNG, and PDF signatures", () => {
    // Valid JPEG header
    const jpegBuffer = Buffer.from([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46
    ]);
    assert.equal(detectMimeTypeFromMagicBytes(jpegBuffer), "image/jpeg");

    // Valid PNG header
    const pngBuffer = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00
    ]);
    assert.equal(detectMimeTypeFromMagicBytes(pngBuffer), "image/png");

    // Valid PDF header
    const pdfBuffer = Buffer.from("%PDF-1.7 header content here", "utf-8");
    assert.equal(detectMimeTypeFromMagicBytes(pdfBuffer), "application/pdf");
  });

  it("detectMimeTypeFromMagicBytes should reject disguised executable or text files", () => {
    // A bash script disguised with a fake mime
    const fakeScript = Buffer.from("#!/bin/bash\nrm -rf /", "utf-8");
    assert.equal(detectMimeTypeFromMagicBytes(fakeScript), null);

    // Windows PE executable header
    const exeBuffer = Buffer.from([
      0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00
    ]);
    assert.equal(detectMimeTypeFromMagicBytes(exeBuffer), null);
  });

  it("validateUploadedFile should reject files exceeding 20MB", () => {
    const oversizedFile = {
      size: MAX_FILE_SIZE_BYTES + 1024,
      buffer: Buffer.alloc(100),
      mimetype: "image/jpeg"
    };
    const res = validateUploadedFile(oversizedFile);
    assert.equal(res.valid, false);
    assert.ok(res.error.includes("20MB limit"));
  });

  it("stripExifMetadata should remove APP1 EXIF segment from JPEG", () => {
    // Construct minimal JPEG with APP1 (0xFFE1) EXIF segment
    const soi = Buffer.from([0xff, 0xd8]);
    const app1Marker = Buffer.from([0xff, 0xe1]);
    const app1Data = Buffer.from("Exif\0\0SecretCameraGpsData");
    const app1Length = Buffer.alloc(2);
    app1Length.writeUInt16BE(app1Data.length + 2, 0);

    const sos = Buffer.from([0xff, 0xda, 0x00, 0x02, 0x00, 0x00]);
    const eoi = Buffer.from([0xff, 0xd9]);

    const jpegWithExif = Buffer.concat([
      soi,
      app1Marker,
      app1Length,
      app1Data,
      sos,
      eoi
    ]);
    const cleaned = stripExifMetadata(jpegWithExif, "image/jpeg");

    // Cleaned buffer should NOT contain the EXIF marker
    assert.equal(cleaned.includes(Buffer.from("SecretCameraGpsData")), false);
    // SOI and EOI must remain intact
    assert.equal(cleaned[0], 0xff);
    assert.equal(cleaned[1], 0xd8);
    assert.equal(cleaned[cleaned.length - 2], 0xff);
    assert.equal(cleaned[cleaned.length - 1], 0xd9);
  });
});

describe("Security Hardening - PII Redaction Integrity", () => {
  it("should redact email addresses properly", () => {
    const input =
      "Contact the ward engineer at sachin.deshmukh@pmc.gov.in or citizen@gmail.com";
    const result = redactSensitiveData(input);

    assert.equal(
      result.cleanedText.includes("sachin.deshmukh@pmc.gov.in"),
      false
    );
    assert.equal(result.cleanedText.includes("citizen@gmail.com"), false);
    assert.equal(result.redactionCounts.email, 2);
    assert.ok(result.cleanedText.includes("@pmc.gov.in"));
    assert.ok(result.cleanedText.includes("@gmail.com"));
  });

  it("redactionLog must NEVER store raw PII (zero PII storage guarantee)", () => {
    const sensitiveInput =
      "My Aadhaar is 9988 7766 5544 and phone is 9876543210 and email is secret@civic.in";
    const result = redactSensitiveData(sensitiveInput);

    // Verify raw values do not appear in any redaction log entry
    for (const log of result.redactionLog) {
      assert.equal(
        Object.prototype.hasOwnProperty.call(log, "original"),
        false
      );
      assert.equal(log.masked.includes("9988 7766 5544"), false);
      assert.equal(log.masked.includes("9876543210"), false);
      assert.equal(log.masked.includes("secret@civic.in"), false);
    }

    assert.equal(result.redactionCounts.aadhaar, 1);
    assert.equal(result.redactionCounts.phone, 1);
    assert.equal(result.redactionCounts.email, 1);
    assert.equal(result.redactionCounts.total, 3);
  });
});

describe("Security Hardening - Rate Limiting & DoS Protection", () => {
  it("rate limiter middleware should reject requests exceeding limit with 429", async () => {
    const { default: rateLimit } = await import("express-rate-limit");
    const limiter = rateLimit({
      windowMs: 60 * 1000,
      max: 2,
      standardHeaders: true,
      legacyHeaders: false,
      validate: { trustProxy: false, xForwardedForHeader: false },
      message: { success: false, error: "Too many requests." }
    });

    let blockedStatus = 200;
    const clientIp = "10.0.0.99";

    // Send 3 requests (max is 2, 3rd should be blocked)
    for (let i = 0; i < 3; i++) {
      await new Promise((resolve) => {
        let finished = false;
        const done = () => {
          if (!finished) {
            finished = true;
            resolve();
          }
        };

        const mockReq = { ip: clientIp, headers: {} };
        const mockRes = {
          statusCode: 200,
          status(code) {
            this.statusCode = code;
            return this;
          },
          send() {
            blockedStatus = this.statusCode;
            done();
          },
          json() {
            blockedStatus = this.statusCode;
            done();
          },
          setHeader() {}
        };

        limiter(mockReq, mockRes, () => {
          done();
        });
      });
    }

    assert.equal(blockedStatus, 429);
  });
});
