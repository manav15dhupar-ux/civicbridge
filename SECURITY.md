# CivicBridge Security Policy & Hardening Architecture

CivicBridge is designed with **defense-in-depth**, **statutory privacy compliance (DPDPA 2023)**, and **zero-retention raw data principles**. This document outlines our threat model, data storage boundaries, automated PII redaction pipeline, and known security limitations.

---

## 1. Threat Model & Mitigations

| Threat Vector | Potential Impact | CivicBridge Countermeasure |
| :--- | :--- | :--- |
| **Prompt Injection** | Attacker crafts text designed to override LLM instructions or extract confidential prompt logic. | **Fixed System Mandate + Delimitation**: User text is sanitized, redacted, and encapsulated strictly within `<citizen_complaint_data>` XML-style data delimiters with an explicit security mandate instructing Gemini to ignore procedural commands inside the data block. All Gemini responses are validated against a strict Zod `StructuredReportSchema`; any invalid or off-schema response is rejected and safely falls back to deterministic local parsing. |
| **PII Exfiltration / Privacy Leak** | Citizen personal identifiers (phone, Aadhaar, email, license plates) leaked to AI logs, databases, or public feeds. | **Pre-AI Redaction Shield**: Raw text is intercepted and cleansed by `redactSensitiveData()` *before* being transmitted to external Gemini APIs or saved to disk. Redaction logs only store masked tokens and aggregate count metrics (`redactionCounts`), never raw PII. |
| **Malicious File Uploads** | Executable payloads disguised with image/document extensions (.jpg.exe, polyglot PDFs). | **Magic Bytes Inspection + Memory Storage**: Files are stored exclusively in RAM using `multer.memoryStorage()`; no raw files are ever written to disk. MIME types are validated via deep binary header inspection (`detectMimeTypeFromMagicBytes`). Buffers are scrubbed immediately after processing (`scrubRawMediaBuffer`). |
| **EXIF Geolocation & Identity Tracking** | Hidden camera metadata in uploaded photos exposing private homes, camera serials, or timestamps. | **Automated EXIF Sanitization**: JPEGs have APP1 markers (`0xFFE1`) stripped in-memory; PNGs have `eXIf`, `tEXt`, `zTXt`, and `iTXt` metadata chunks excised prior to ingestion. |
| **Cross-Site Scripting (XSS)** | Malicious HTML/script injected through grievance descriptions or authority responses. | **Zero-Raw-HTML Frontend**: The vanilla JS UI utilities wrap all dynamic values (user text, AI outputs, and authority details) in `escapeHtml()` before rendering into the DOM. |
| **API Cost & Resource Exhaustion (DoS)** | Automated bots spamming `/api/complaints/analyze` causing high Gemini API bills or server overload. | **Layered Rate Limiting**: General `/api` routes capped at 120 req / 15 min; expensive `/api/complaints/analyze` endpoint capped at 20 req / 15 min per IP. Request payload size strictly limited to 1MB. |
| **Malformed Payload Attacks** | Attackers sending unexpected JSON fields, prototype pollution, or out-of-range coordinates. | **Strict Zod Schema Validation**: All incoming requests (`/analyze`, `/draft-letter`, `/file`) are validated with strict Zod schemas (`.strict()`) that immediately reject unknown fields, enforce coordinate ranges, and clamp string lengths. |

---

## 2. What Is Stored vs. What Is Discarded

### Stored in `data/reports.json`
- **Sanitized Complaint Record**: Cleaned description (all PII pre-masked), geocoded coordinates, category, severity (1–5), urgency justification, and responsible municipal authority.
- **Tracking Identifiers**: Randomized tracking token (`PMC-2026-XXXXX`) and report ID (`PUN-REP-XXXX`).
- **Aggregate Verification Metrics**: Reporter count, ward assignment, status timeline.
- **Redacted Citizen Notes**: User notes are passed through `redactSensitiveData()` before persistence.

### Never Stored (Zero Retention Policy)
- ❌ **No raw media files on disk**: Uploaded photos, PDFs, and audio recordings exist in ephemeral RAM buffers only and are overwritten (`file.buffer.fill(0)`) once analysis completes.
- ❌ **No raw PII in logs or database**: Unmasked phone numbers, Aadhaar IDs, email addresses, and vehicle plates are never persisted or printed to server console logs.
- ❌ **No API keys in client code**: `GEMINI_API_KEY` is strictly server-side, read from environment variables via `process.env`.
- ❌ **No stack traces sent to client**: In production mode (`NODE_ENV=production`), Express returns generic error messages to prevent internal framework disclosure.

---

## 3. What Is Redacted by Privacy Shield

The `redactService` scans all citizen inputs across 8 privacy patterns before any AI or database processing:

1. **Aadhaar Numbers**: 12-digit Indian national identity numbers (with or without spaces) are masked as `XXXX-XXXX-NNNN` (last 4 digits only).
2. **Indian Mobile Numbers**: 10-digit mobile numbers (with prefixes `+91`, `91`, `0`, or bare `6-9` series) are masked as `+91 XX***-**NN`.
3. **Email Addresses**: Masked as `u***r@domain.com`.
4. **Permanent Account Numbers (PAN)**: 10-character Indian tax IDs are replaced with `[PAN-CARD-REDACTED]`.
5. **Vehicle Registration Plates**: Pune RTO formats (`MH 12`, `MH 14`) are masked as `MH-12-XX-XXXX`.
6. **English Personal Name Disclosures**: Contextual self-introductions ("My name is...", "Reported by...") have names replaced with `[Citizen Complainant]`.
7. **Hindi Personal Name Disclosures**: ("मेरा नाम...", "शिकायतकर्ता...") replaced with `[नागरिक तक्रारकर्ता]`.
8. **Marathi Personal Name Disclosures**: ("माझे नाव...", "तक्रारदार...") replaced with `[नागरिक तक्रारदार]`.

---

## 4. Known Limits & Boundaries

1. **Maximum Upload Size**: 20MB per file upload (enforced by Multer and Zod).
2. **Allowed Magic-Byte File Formats**:
   - Images: JPEG (`FF D8 FF`), PNG (`89 50 4E 47`), WebP (`RIFF...WEBP`)
   - Documents: PDF (`%PDF`)
   - Video: MP4 (`ftyp`), WebM (`1A 45 DF A3`)
   - Audio: MP3 (`ID3` or sync frame), WAV (`RIFF...WAVE`), OGG (`OggS`)
3. **Text Length Constraints**: Complaint descriptions are clamped to a maximum of 4,000 characters; citizen notes to 1,000 characters.
4. **Geographic Bounds**: Coordinates are bounded to valid latitude (-90 to 90) and longitude (-180 to 180), with spatial proximity detection optimized for the Pune Municipal Corporation (PMC) boundary.
5. **Rate Limiting Scope**: IP-based rate limiting via memory store; distributed deployments on reverse proxies should ensure `trust proxy` is configured for accurate client IP identification.

---

## 5. Security Inquiries & Reporting

To report a vulnerability or privacy concern regarding CivicBridge, please open an issue labeled `security` or reach out to the project maintainers.
