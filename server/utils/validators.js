/**
 * @fileoverview Input validation, file magic-byte inspection, EXIF stripping,
 * and strict request schema enforcement for CivicBridge.
 */

import { z } from "zod";
import {
  BYTES_PER_MEGABYTE,
  MAX_AUTHORITY_NAME_LENGTH,
  MAX_CITIZEN_NOTE_LENGTH,
  MAX_COMPLAINT_TEXT_LENGTH,
  MAX_EVIDENCE_SUMMARY_LENGTH,
  MAX_FILE_SIZE_BYTES,
  MAX_FILE_SIZE_MEGABYTES,
  MAX_LOCATION_TEXT_LENGTH,
  MAX_REPORT_DESCRIPTION_LENGTH,
  MAX_REPORT_LOCATION_LENGTH,
  MAX_REPORT_SUBCATEGORY_LENGTH,
  MAX_URGENCY_REASON_LENGTH,
  MIN_REPORT_DESCRIPTION_LENGTH,
  MIN_REPORT_LOCATION_LENGTH
} from "../config/constants.js";

export { MAX_FILE_SIZE_BYTES } from "../config/constants.js";

/**
 * Allowed MIME types for complaint media evidence.
 * @constant {Set<string>}
 */
export const ALLOWED_MIME_TYPES = new Set([
  // Images
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  // Videos
  "video/mp4",
  "video/webm",
  // Documents
  "application/pdf",
  // Audio
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/webm",
  "audio/ogg"
]);

/**
 * Allowed civic complaint categories.
 * @constant {string[]}
 */
export const ALLOWED_CATEGORIES = [
  "Roads & Footpaths",
  "Drainage & Sewage",
  "Garbage & Waste",
  "Street Lighting & Electricity",
  "Water Supply",
  "Public Health & Sanitation",
  "Traffic & Obstructions",
  "Other"
];

/**
 * Detects real MIME type from file buffer magic bytes.
 * @param {Buffer} buffer - File buffer.
 * @returns {string|null} Detected MIME type or null if unrecognized.
 */
export function detectMimeTypeFromMagicBytes(buffer) {
  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length < 4) {
    return null;
  }

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return "image/png";
  }

  // PDF: %PDF (25 50 44 46)
  if (
    buffer[0] === 0x25 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x44 &&
    buffer[3] === 0x46
  ) {
    return "application/pdf";
  }

  // WebP: RIFF....WEBP (52 49 46 46 ... 57 45 42 50)
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }

  // MP4: bytes 4-8 contain "ftyp"
  if (buffer.length >= 12) {
    const brand = buffer.subarray(4, 8).toString("ascii");
    if (brand === "ftyp") {
      return "video/mp4";
    }
  }

  // WebM / EBML: 1A 45 DF A3
  if (
    buffer[0] === 0x1a &&
    buffer[1] === 0x45 &&
    buffer[2] === 0xdf &&
    buffer[3] === 0xa3
  ) {
    return "video/webm";
  }

  // OGG: OggS (4F 67 67 53)
  if (buffer.subarray(0, 4).toString("ascii") === "OggS") {
    return "audio/ogg";
  }

  // MP3: ID3 or frame sync FF FB / FF F3 / FF F2
  if (buffer.subarray(0, 3).toString("ascii") === "ID3") {
    return "audio/mpeg";
  }
  if (
    buffer[0] === 0xff &&
    (buffer[1] === 0xfb || buffer[1] === 0xf3 || buffer[1] === 0xf2)
  ) {
    return "audio/mpeg";
  }

  // WAV: RIFF....WAVE
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WAVE"
  ) {
    return "audio/wav";
  }

  return null;
}

/**
 * Normalizes MIME types to canonical standards recognized by Google Gemini and browsers.
 * Strips charset and codec parameters (e.g. ";codecs=opus").
 * @param {string} mime - Raw MIME string from header or magic bytes.
 * @param {boolean} [isAudio=false] - Whether the context indicates an audio track/upload.
 * @returns {string} Clean canonical MIME type.
 */
export function normalizeMimeType(mime, isAudio = false) {
  if (!mime || typeof mime !== "string") {
    return isAudio ? "audio/webm" : "application/octet-stream";
  }
  let clean = mime.split(";")[0].trim().toLowerCase();
  if (clean === "image/jpg" || clean === "image/pjpeg") return "image/jpeg";
  if (clean === "audio/mpeg" || clean === "audio/mpga") return "audio/mp3";
  if (clean === "audio/x-wav") return "audio/wav";
  if (
    isAudio &&
    (clean === "video/webm" || clean === "application/octet-stream")
  ) {
    return "audio/webm";
  }
  return clean;
}

/**
 * Strips EXIF metadata from JPEG or PNG buffer to protect citizen privacy.
 * Preserves complete image stream and prevents truncation.
 * @param {Buffer} buffer - Raw file buffer.
 * @param {string} detectedMime - Detected MIME type.
 * @returns {Buffer} Sanitized buffer without EXIF segments.
 */
export function stripExifMetadata(buffer, detectedMime) {
  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length < 4) return buffer;

  try {
    // 1. JPEG EXIF Stripping (APP1 marker 0xFFE1)
    if (
      detectedMime === "image/jpeg" &&
      buffer[0] === 0xff &&
      buffer[1] === 0xd8
    ) {
      const chunks = [];
      chunks.push(buffer.subarray(0, 2)); // Keep SOI 0xFF, 0xD8
      let pos = 2;
      let strippedAny = false;

      while (pos < buffer.length - 1) {
        // Skip fill bytes
        while (pos < buffer.length && buffer[pos] === 0xff) pos++;
        if (pos >= buffer.length) break;

        const marker = buffer[pos++];

        // Stop at Start of Scan (SOS 0xFFDA) or EOI (0xFFD9)
        if (marker === 0xda || marker === 0xd9) {
          chunks.push(Buffer.from([0xff, marker]));
          chunks.push(buffer.subarray(pos));
          return Buffer.concat(chunks);
        }

        // Standalone markers without length: RST0-RST7 (0xD0-0xD7), SOI (0xD8), TEM (0x01)
        if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
          chunks.push(Buffer.from([0xff, marker]));
          continue;
        }

        // Variable length marker
        if (pos + 2 > buffer.length) {
          chunks.push(buffer.subarray(pos - 2));
          break;
        }

        const length = buffer.readUInt16BE(pos);
        if (length < 2 || pos + length > buffer.length) {
          return buffer;
        }

        const segmentStart = pos - 2;
        const segmentEnd = pos + length;

        // Skip APP1 EXIF segment (0xFFE1)
        if (marker === 0xe1) {
          strippedAny = true;
          pos = segmentEnd;
          continue;
        }

        chunks.push(buffer.subarray(segmentStart, segmentEnd));
        pos = segmentEnd;
      }

      if (pos < buffer.length) {
        chunks.push(buffer.subarray(pos));
      }

      return strippedAny ? Buffer.concat(chunks) : buffer;
    }

    // 2. PNG Metadata Chunk Stripping (eXIf, tEXt, zTXt, iTXt)
    if (detectedMime === "image/png" && buffer.length >= 8) {
      const strippedChunks = [];
      strippedChunks.push(buffer.subarray(0, 8)); // Keep 8-byte PNG signature
      let offset = 8;
      const metadataChunkTypes = new Set(["eXIf", "tEXt", "zTXt", "iTXt"]);
      let strippedAny = false;

      while (offset <= buffer.length - 12) {
        const chunkLen = buffer.readUInt32BE(offset);
        const totalChunkSize = 4 + 4 + chunkLen + 4; // length + type + data + crc
        if (offset + totalChunkSize > buffer.length) {
          strippedChunks.push(buffer.subarray(offset));
          break;
        }

        const chunkType = buffer
          .subarray(offset + 4, offset + 8)
          .toString("ascii");

        if (metadataChunkTypes.has(chunkType)) {
          strippedAny = true;
        } else {
          strippedChunks.push(buffer.subarray(offset, offset + totalChunkSize));
        }

        offset += totalChunkSize;
        if (chunkType === "IEND") break;
      }

      if (offset < buffer.length) {
        strippedChunks.push(buffer.subarray(offset));
      }

      return strippedAny ? Buffer.concat(strippedChunks) : buffer;
    }
  } catch {
    // If parsing fails, return original buffer safely
    return buffer;
  }

  return buffer;
}

/**
 * Validates uploaded file by size, allowed list, and magic bytes.
 * Strips EXIF metadata if valid image and normalizes MIME type.
 * @param {Express.Multer.File|undefined} file - Multer file object.
 * @param {boolean} [isAudio=false] - Whether this file is an audio recording.
 * @returns {{ valid: boolean, error?: string, sanitizedBuffer?: Buffer, detectedMime?: string, canonicalMime?: string }} Validation result.
 */
export function validateUploadedFile(file, isAudio = false) {
  if (!file) {
    return { valid: true };
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return {
      valid: false,
      error: `File size exceeds the ${MAX_FILE_SIZE_MEGABYTES}MB limit (uploaded: ${(file.size / BYTES_PER_MEGABYTE).toFixed(2)} MB).`
    };
  }

  // Magic bytes check
  const realMime = detectMimeTypeFromMagicBytes(file.buffer);
  if (!realMime || !ALLOWED_MIME_TYPES.has(realMime)) {
    return {
      valid: false,
      error: `Invalid file content. Real file signature does not match allowed types (JPG, PNG, WebP, MP4, WebM, PDF, MP3, WAV, OGG).`
    };
  }

  // Strip EXIF metadata
  const sanitized = stripExifMetadata(file.buffer, realMime);

  // Compute clean canonical MIME
  const canonicalMime = normalizeMimeType(
    isAudio ? file.mimetype || realMime : realMime,
    isAudio
  );

  return {
    valid: true,
    detectedMime: realMime,
    canonicalMime,
    sanitizedBuffer: sanitized
  };
}

/**
 * Strict Zod Schema for Analyze Request.
 * Rejects unknown fields.
 */
export const AnalyzePayloadSchema = z
  .object({
    text: z
      .string()
      .max(
        MAX_COMPLAINT_TEXT_LENGTH,
        `Text must not exceed ${MAX_COMPLAINT_TEXT_LENGTH} characters`
      )
      .optional()
      .default(""),
    consent: z
      .union([z.boolean(), z.literal("true"), z.literal("1"), z.literal(1)])
      .refine(
        (val) => val === true || val === "true" || val === "1" || val === 1,
        {
          message: "Citizen privacy consent is required."
        }
      ),
    lat: z
      .union([z.number(), z.string()])
      .optional()
      .transform((val) => {
        if (val === undefined || val === "") return undefined;
        return typeof val === "number" ? val : parseFloat(val);
      })
      .refine(
        (val) =>
          val === undefined || (!Number.isNaN(val) && val >= -90 && val <= 90),
        {
          message: "Invalid latitude (-90 to 90)."
        }
      ),
    lng: z
      .union([z.number(), z.string()])
      .optional()
      .transform((val) => {
        if (val === undefined || val === "") return undefined;
        return typeof val === "number" ? val : parseFloat(val);
      })
      .refine(
        (val) =>
          val === undefined ||
          (!Number.isNaN(val) && val >= -180 && val <= 180),
        {
          message: "Invalid longitude (-180 to 180)."
        }
      ),
    location_text: z
      .string()
      .max(
        MAX_LOCATION_TEXT_LENGTH,
        `Location text must not exceed ${MAX_LOCATION_TEXT_LENGTH} characters`
      )
      .optional()
  })
  .strict();

/**
 * Strict Zod Schema for Complaint Report.
 * Enforces valid category, severity 1-5, and string bounds.
 */
export const StructuredReportSchema = z
  .object({
    category: z.enum([
      "Roads & Footpaths",
      "Drainage & Sewage",
      "Garbage & Waste",
      "Street Lighting & Electricity",
      "Water Supply",
      "Public Health & Sanitation",
      "Traffic & Obstructions",
      "Other"
    ]),
    subcategory: z.string().min(1).max(MAX_REPORT_SUBCATEGORY_LENGTH),
    severity: z.number().int().min(1).max(5),
    description: z
      .string()
      .min(MIN_REPORT_DESCRIPTION_LENGTH)
      .max(MAX_REPORT_DESCRIPTION_LENGTH),
    location_text: z
      .string()
      .min(MIN_REPORT_LOCATION_LENGTH)
      .max(MAX_REPORT_LOCATION_LENGTH),
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    evidence_summary: z
      .string()
      .max(MAX_EVIDENCE_SUMMARY_LENGTH)
      .optional()
      .default(""),
    urgency_reason: z
      .string()
      .max(MAX_URGENCY_REASON_LENGTH)
      .optional()
      .default(""),
    responsible_authority: z.string().min(2).max(MAX_AUTHORITY_NAME_LENGTH),
    confidence: z.number().min(0).max(1).optional().default(0.9)
  })
  .strict();

/**
 * Strict Zod Schema for Letter Drafting.
 * Rejects unknown fields.
 */
export const DraftLetterRequestSchema = z
  .object({
    report: StructuredReportSchema,
    language: z.enum(["en", "mr", "hi"]).default("en")
  })
  .strict();

/**
 * Strict Zod Schema for File Complaint Request.
 * Rejects unknown fields.
 */
export const FileComplaintRequestSchema = z
  .object({
    report: StructuredReportSchema,
    actionPlan: z.object({}).passthrough().optional(),
    citizenNote: z
      .string()
      .max(
        MAX_CITIZEN_NOTE_LENGTH,
        `Citizen note must not exceed ${MAX_CITIZEN_NOTE_LENGTH} characters`
      )
      .optional()
      .default("")
  })
  .strict();

/**
 * Validates complaint intake payload (FormData & files).
 * @param {object} payload - Complaint submission parameters.
 * @param {Express.Multer.File} [file] - Optional uploaded file.
 * @param {Express.Multer.File} [audioFile] - Optional uploaded audio file.
 * @returns {{ valid: boolean, errors: string[], data?: object }}
 */
export function validateComplaintInput(payload = {}, file, audioFile) {
  const errors = [];

  const parseResult = AnalyzePayloadSchema.safeParse(payload);
  if (!parseResult.success) {
    for (const issue of parseResult.error.issues) {
      errors.push(`${issue.path.join(".")}: ${issue.message}`);
    }
  }

  const hasText =
    typeof payload.text === "string" && payload.text.trim().length > 0;
  const hasFile = Boolean(file);
  const hasAudio = Boolean(audioFile);

  if (!hasText && !hasFile && !hasAudio) {
    errors.push(
      "Please provide at least a text description, a voice recording, or photo/document evidence."
    );
  }

  if (file) {
    const fileRes = validateUploadedFile(file, false);
    if (!fileRes.valid) {
      errors.push(fileRes.error);
    } else {
      if (fileRes.sanitizedBuffer) file.buffer = fileRes.sanitizedBuffer;
      file.detectedMime = fileRes.detectedMime;
      file.canonicalMime = fileRes.canonicalMime;
    }
  }

  if (audioFile) {
    const audioRes = validateUploadedFile(audioFile, true);
    if (!audioRes.valid) {
      errors.push(audioRes.error);
    } else {
      if (audioRes.sanitizedBuffer) audioFile.buffer = audioRes.sanitizedBuffer;
      audioFile.detectedMime = audioRes.detectedMime;
      audioFile.canonicalMime = audioRes.canonicalMime;
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    data: parseResult.success ? parseResult.data : undefined
  };
}
