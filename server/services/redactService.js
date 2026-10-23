/**
 * @fileoverview Privacy Shield and Redaction Service for CivicBridge.
 * Detects and masks Personally Identifiable Information (PII) including Aadhaar numbers,
 * Indian mobile numbers, email addresses, vehicle plates (MH-12/14), PAN cards, and personal names.
 *
 * CRITICAL PRIVACY INVARIANT:
 * Raw PII is never stored in persistent databases, never sent to external AI APIs,
 * and never written to server log streams. Only aggregate redaction counts and
 * sanitized token masks are logged.
 */

/**
 * Regular expressions for Indian identity markers and sensitive personal data.
 */
const PATTERNS = {
  // Aadhaar: 12 digits, optionally spaced in blocks of 4 (e.g., 1234 5678 9012 or 123456789012)
  aadhaar: /\b([2-9]{1}\d{3})\s?(\d{4})\s?(\d{4})\b/g,

  // Indian Mobile Numbers: +91, 0, or 10-digit starting with 6, 7, 8, or 9
  indianPhone: /(?:\+91[\s.-]?|91[\s.-]?|0)?\b([6-9]\d{4})[\s.-]?(\d{5})\b/g,

  // Email Addresses
  email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,

  // Permanent Account Number (PAN): 5 letters, 4 digits, 1 letter
  panCard: /\b([A-Z]{5})(\d{4})([A-Z]{1})\b/g,

  // Vehicle Registration Plates: e.g., MH 12 AB 1234 or MH-14-CZ-9876
  vehiclePlate: /\b(MH[\s-]?[0-9]{1,2}[\s-]?[A-Z]{1,3}[\s-]?[0-9]{1,4})\b/gi,

  // Personal name declaration markers in English, Hindi, and Marathi
  nameIntroEn:
    /(?:my\s+name\s+is|i\s+am|reported\s+by|complainant(?:\s+is)?)\s+(?!(?:aadhaar|phone|email|number|mobile|id|officer)\b)([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/gi,
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
 * Masks a phone number displaying only first 2 and last 2 digits (e.g. "+91 98***-**34").
 * @param {string} match - Full matched phone number.
 * @returns {string} Masked phone number string.
 */
function maskPhone(match) {
  const digits = match.replace(/\D/g, "");
  const cleanDigits =
    digits.startsWith("91") && digits.length === 12 ? digits.slice(2) : digits;
  if (cleanDigits.length === 10) {
    return `+91 ${cleanDigits.slice(0, 2)}***-**${cleanDigits.slice(-2)}`;
  }
  return `[REDACTED-PHONE]`;
}

/**
 * Masks an email address (e.g. "j***@domain.com").
 * @param {string} email - Raw matched email address.
 * @returns {string} Masked email string.
 */
function maskEmail(email) {
  const [user, domain] = email.split("@");
  if (!user || !domain) return "[REDACTED-EMAIL]";
  const maskedUser =
    user.length <= 2 ? `${user[0]}*` : `${user[0]}***${user[user.length - 1]}`;
  return `${maskedUser}@${domain}`;
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
 * Redacts all Personally Identifiable Information (PII) from text.
 * Strictly records counts and masked tokens only; never records or logs original raw PII.
 * @param {string} text - Raw input text from citizen complaint.
 * @returns {{
 *   cleanedText: string,
 *   redactionCounts: { aadhaar: number, phone: number, email: number, vehiclePlate: number, name: number, pan: number, total: number },
 *   redactionLog: Array<{ type: string, masked: string, timestamp: string }>
 * }}
 */
export function redactSensitiveData(text) {
  const emptyCounts = {
    aadhaar: 0,
    phone: 0,
    email: 0,
    vehiclePlate: 0,
    name: 0,
    pan: 0,
    total: 0
  };
  if (typeof text !== "string" || !text.trim()) {
    return { cleanedText: "", redactionCounts: emptyCounts, redactionLog: [] };
  }

  let cleaned = text;
  const redactionLog = [];
  const counts = { ...emptyCounts };
  const now = new Date().toISOString();

  // 1. Redact Aadhaar Numbers
  cleaned = cleaned.replace(PATTERNS.aadhaar, (fullMatch) => {
    const masked = maskAadhaar(fullMatch);
    counts.aadhaar += 1;
    counts.total += 1;
    redactionLog.push({
      type: "Aadhaar Identity Number",
      masked,
      timestamp: now
    });
    return masked;
  });

  // 2. Redact Phone Numbers (ignoring statutory short helplines)
  cleaned = cleaned.replace(PATTERNS.indianPhone, (fullMatch) => {
    const digits = fullMatch.replace(/\D/g, "");
    if (digits.length < 10) return fullMatch;

    const masked = maskPhone(fullMatch);
    counts.phone += 1;
    counts.total += 1;
    redactionLog.push({
      type: "Citizen Mobile Number",
      masked,
      timestamp: now
    });
    return masked;
  });

  // 3. Redact Email Addresses
  cleaned = cleaned.replace(PATTERNS.email, (fullMatch) => {
    const masked = maskEmail(fullMatch);
    counts.email += 1;
    counts.total += 1;
    redactionLog.push({
      type: "Email Address",
      masked,
      timestamp: now
    });
    return masked;
  });

  // 4. Redact PAN Cards
  cleaned = cleaned.replace(PATTERNS.panCard, () => {
    const masked = `[PAN-CARD-REDACTED]`;
    counts.pan += 1;
    counts.total += 1;
    redactionLog.push({
      type: "Income Tax PAN",
      masked,
      timestamp: now
    });
    return masked;
  });

  // 5. Redact Vehicle Registration Plates
  cleaned = cleaned.replace(PATTERNS.vehiclePlate, (fullMatch) => {
    const masked = maskVehiclePlate(fullMatch);
    counts.vehiclePlate += 1;
    counts.total += 1;
    redactionLog.push({
      type: "Vehicle Registration Plate",
      masked,
      timestamp: now
    });
    return masked;
  });

  // 6. Redact English name disclosures
  cleaned = cleaned.replace(PATTERNS.nameIntroEn, (fullMatch, nameGroup) => {
    const masked = "[Citizen Complainant]";
    counts.name += 1;
    counts.total += 1;
    redactionLog.push({
      type: "Personal Name Disclosure",
      masked,
      timestamp: now
    });
    return fullMatch.replace(nameGroup, masked);
  });

  // 7. Redact Hindi name disclosures
  cleaned = cleaned.replace(PATTERNS.nameIntroHi, (fullMatch, nameGroup) => {
    const masked = "[नागरिक तक्रारकर्ता]";
    counts.name += 1;
    counts.total += 1;
    redactionLog.push({
      type: "Personal Name Disclosure (Hindi)",
      masked,
      timestamp: now
    });
    return fullMatch.replace(nameGroup, masked);
  });

  // 8. Redact Marathi name disclosures
  cleaned = cleaned.replace(PATTERNS.nameIntroMr, (fullMatch, nameGroup) => {
    const masked = "[नागरिक तक्रारदार]";
    counts.name += 1;
    counts.total += 1;
    redactionLog.push({
      type: "Personal Name Disclosure (Marathi)",
      masked,
      timestamp: now
    });
    return fullMatch.replace(nameGroup, masked);
  });

  return {
    cleanedText: cleaned,
    redactionCounts: counts,
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
    try {
      file.buffer.fill(0);
    } catch {
      // Buffer scrub best-effort
    }
  }
}
