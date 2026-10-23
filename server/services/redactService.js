/**
 * @fileoverview Privacy Shield and Redaction Service for CivicBridge.
 * Detects and masks Personally Identifiable Information (PII) including Aadhaar numbers,
 * Indian mobile phone numbers, vehicle registration numbers (MH-12/MH-14), and personal names.
 */

/**
 * Regular expressions for Indian identity markers and sensitive data patterns.
 */
const PATTERNS = {
  // Aadhaar: 12 digits, optionally spaced in blocks of 4 (e.g., 1234 5678 9012 or 123456789012)
  aadhaar: /\b([2-9]{1}\d{3})\s?(\d{4})\s?(\d{4})\b/g,

  // Indian Mobile Numbers: +91, 0, or 10-digit starting with 6, 7, 8, or 9
  // Supports spaces, hyphens, or continuous digits
  indianPhone: /(?:\+91[\s.-]?|91[\s.-]?|0)?\b([6-9]\d{4})[\s.-]?(\d{5})\b/g,

  // Permanent Account Number (PAN): 5 letters, 4 digits, 1 letter
  panCard: /\b([A-Z]{5})(\d{4})([A-Z]{1})\b/g,

  // Vehicle Registration Plates: e.g., MH 12 AB 1234 or MH-14-CZ-9876
  vehiclePlate: /\b(MH[\s-]?[0-9]{1,2}[\s-]?[A-Z]{1,3}[\s-]?[0-9]{1,4})\b/gi,

  // Personal name declaration markers in English, Hindi, and Marathi
  // Negative lookahead avoids matching phrases like "Complainant Aadhaar" or "Complainant Phone"
  nameIntroEn: /(?:my\s+name\s+is|i\s+am|reported\s+by|complainant(?:\s+is)?)\s+(?!(?:aadhaar|phone|number|mobile|id|officer)\b)([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/gi,
  nameIntroHi: /(?:मेरा\s+नाम|शिकायतकर्ता(?:\s+का\s+नाम)?)\s+([^\s,.]+)/gi,
  nameIntroMr: /(?:(?:माझे|माझं)\s+नाव|तक्रारदार(?:\s+नाव)?)\s+([^\s,.]+)/gi
};

/**
 * Masks an Aadhaar number to display only the last 4 digits (e.g. "XXXX-XXXX-9012").
 * @param {string} match - Full matched Aadhaar.
 * @returns {string} Masked Aadhaar string.
 */
function maskAadhaar(match) {
  const digits = match.replace(/\D/g, "");
  const last4 = digits.slice(-4);
  return `XXXX-XXXX-${last4}`;
}

/**
 * Masks a phone number displaying only first 2 and last 2 digits (e.g. "+91 98*** **34").
 * @param {string} match - Full matched phone number.
 * @returns {string} Masked phone number string.
 */
function maskPhone(match) {
  const digits = match.replace(/\D/g, "");
  const cleanDigits = digits.startsWith("91") && digits.length === 12 ? digits.slice(2) : digits;
  if (cleanDigits.length === 10) {
    return `+91 ${cleanDigits.slice(0, 2)}***-**${cleanDigits.slice(-2)}`;
  }
  return `[REDACTED-PHONE]`;
}

/**
 * Masks a vehicle license plate number (e.g. "MH-12-XX-XXXX").
 * @param {string} match - Full matched vehicle plate.
 * @returns {string} Masked plate string.
 */
function maskVehiclePlate(match) {
  const upper = match.toUpperCase().replace(/\s+/g, "-");
  const prefix = upper.slice(0, 5); // e.g. "MH-12"
  return `${prefix}-XX-XXXX`;
}

/**
 * Redacts PII from text and logs all redaction operations for the Privacy Shield inspection panel.
 * @param {string} text - Raw input text from citizen complaint.
 * @returns {{ cleanedText: string, redactionLog: Array<{ type: string, original: string, masked: string, timestamp: string }> }}
 */
export function redactSensitiveData(text) {
  if (typeof text !== "string" || !text.trim()) {
    return { cleanedText: "", redactionLog: [] };
  }

  let cleaned = text;
  const redactionLog = [];
  const now = new Date().toISOString();

  // 1. Redact Aadhaar Numbers
  cleaned = cleaned.replace(PATTERNS.aadhaar, (fullMatch) => {
    const masked = maskAadhaar(fullMatch);
    redactionLog.push({
      type: "Aadhaar Identity Number",
      original: `Aadhaar ending in ${fullMatch.replace(/\D/g, "").slice(-4)}`,
      masked,
      timestamp: now
    });
    return masked;
  });

  // 2. Redact Phone Numbers
  cleaned = cleaned.replace(PATTERNS.indianPhone, (fullMatch) => {
    // Avoid redacting statutory helpline numbers (e.g. 1912 or short codes)
    const digits = fullMatch.replace(/\D/g, "");
    if (digits.length < 10) return fullMatch;

    const masked = maskPhone(fullMatch);
    redactionLog.push({
      type: "Citizen Mobile Number",
      original: `Phone ${digits.slice(0, 2)}******${digits.slice(-2)}`,
      masked,
      timestamp: now
    });
    return masked;
  });

  // 3. Redact PAN Cards
  cleaned = cleaned.replace(PATTERNS.panCard, (fullMatch) => {
    const masked = `[PAN-CARD-REDACTED]`;
    redactionLog.push({
      type: "Income Tax PAN",
      original: `PAN Card (${fullMatch.slice(0, 2)}****${fullMatch.slice(-1)})`,
      masked,
      timestamp: now
    });
    return masked;
  });

  // 4. Redact Vehicle Registration Plates
  cleaned = cleaned.replace(PATTERNS.vehiclePlate, (fullMatch) => {
    const masked = maskVehiclePlate(fullMatch);
    redactionLog.push({
      type: "Vehicle Registration Plate",
      original: fullMatch,
      masked,
      timestamp: now
    });
    return masked;
  });

  // 5. Redact English name disclosures
  cleaned = cleaned.replace(PATTERNS.nameIntroEn, (fullMatch, nameGroup) => {
    const masked = "[Citizen Complainant]";
    redactionLog.push({
      type: "Personal Name Disclosure",
      original: nameGroup,
      masked,
      timestamp: now
    });
    return fullMatch.replace(nameGroup, masked);
  });

  // 6. Redact Hindi name disclosures
  cleaned = cleaned.replace(PATTERNS.nameIntroHi, (fullMatch, nameGroup) => {
    const masked = "[नागरिक तक्रारकर्ता]";
    redactionLog.push({
      type: "Personal Name Disclosure (Hindi)",
      original: nameGroup,
      masked,
      timestamp: now
    });
    return fullMatch.replace(nameGroup, masked);
  });

  // 7. Redact Marathi name disclosures
  cleaned = cleaned.replace(PATTERNS.nameIntroMr, (fullMatch, nameGroup) => {
    const masked = "[नागरिक तक्रारदार]";
    redactionLog.push({
      type: "Personal Name Disclosure (Marathi)",
      original: nameGroup,
      masked,
      timestamp: now
    });
    return fullMatch.replace(nameGroup, masked);
  });

  return {
    cleanedText: cleaned,
    redactionLog
  };
}

/**
 * Enforces zero-retention raw media policy.
 * Scrubs temporary buffers from memory after extracting essential multimodal bytes for analysis.
 * @param {Express.Multer.File|undefined} file - Uploaded Multer file.
 */
export function scrubRawMediaBuffer(file) {
  if (file && file.buffer) {
    // Fill buffer with zeros before letting garbage collector reclaim
    try {
      file.buffer.fill(0);
    } catch {
      // Buffer scrub best-effort
    }
  }
}
