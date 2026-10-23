/**
 * @fileoverview Input validation and sanitization helpers for CivicBridge complaints.
 */

/**
 * Maximum allowed media upload size in bytes (20 MB).
 * @constant {number}
 */
export const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024;

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
  "image/heic",
  // Videos
  "video/mp4",
  "video/quicktime",
  "video/webm",
  // Documents
  "application/pdf",
  // Audio
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/webm",
  "audio/ogg",
  "audio/m4a",
  "audio/x-m4a"
]);

/**
 * Validates the uploaded file object from Multer.
 * @param {Express.Multer.File|undefined} file - Multer file object.
 * @returns {{ valid: boolean, error?: string }} Validation result.
 */
export function validateUploadedFile(file) {
  if (!file) {
    return { valid: true };
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return {
      valid: false,
      error: `File size exceeds the 20MB limit (uploaded: ${(file.size / (1024 * 1024)).toFixed(2)} MB).`
    };
  }

  if (!ALLOWED_MIME_TYPES.has(file.mimetype.toLowerCase())) {
    return {
      valid: false,
      error: `Unsupported file type (${file.mimetype}). Please upload an image (JPG, PNG, WebP), short video (MP4, WebM), audio, or PDF.`
    };
  }

  return { valid: true };
}

/**
 * Validates complaint intake payload.
 * @param {object} payload - Complaint submission parameters.
 * @param {string} [payload.text] - Complaint text.
 * @param {boolean|string} [payload.consent] - Citizen privacy consent.
 * @param {number|string} [payload.lat] - Latitude.
 * @param {number|string} [payload.lng] - Longitude.
 * @param {Express.Multer.File} [file] - Optional uploaded file.
 * @param {Express.Multer.File} [audioFile] - Optional uploaded audio file.
 * @returns {{ valid: boolean, errors: string[] }} Validation result.
 */
export function validateComplaintInput(payload = {}, file, audioFile) {
  const errors = [];

  const hasText = typeof payload.text === "string" && payload.text.trim().length > 0;
  const hasFile = Boolean(file);
  const hasAudio = Boolean(audioFile);

  if (!hasText && !hasFile && !hasAudio) {
    errors.push("Please provide at least a text description, a voice recording, or photo/document evidence.");
  }

  const consentGiven =
    payload.consent === true ||
    payload.consent === "true" ||
    payload.consent === 1 ||
    payload.consent === "1";

  if (!consentGiven) {
    errors.push("Citizen privacy consent is required before processing civic complaints.");
  }

  if (payload.lat !== undefined && payload.lng !== undefined) {
    const lat = parseFloat(payload.lat);
    const lng = parseFloat(payload.lng);
    if (Number.isNaN(lat) || lat < -90 || lat > 90) {
      errors.push("Invalid latitude coordinate provided.");
    }
    if (Number.isNaN(lng) || lng < -180 || lng > 180) {
      errors.push("Invalid longitude coordinate provided.");
    }
  }

  if (file) {
    const fileValidation = validateUploadedFile(file);
    if (!fileValidation.valid) {
      errors.push(fileValidation.error);
    }
  }

  if (audioFile) {
    const audioValidation = validateUploadedFile(audioFile);
    if (!audioValidation.valid) {
      errors.push(audioValidation.error);
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}
