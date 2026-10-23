/**
 * @fileoverview API Client for communicating with CivicBridge backend services.
 */

/**
 * Common request wrapper with JSON response parsing and network error handling.
 * @param {string} endpoint - API route.
 * @param {RequestInit} [options] - Fetch options.
 * @returns {Promise<any>}
 */
async function request(endpoint, options = {}) {
  try {
    const res = await fetch(endpoint, options);
    const data = await res.json();
    if (!res.ok) {
      const errorMsg = data.errors ? data.errors.join(", ") : data.error || `HTTP ${res.status}`;
      throw new Error(errorMsg);
    }
    return data;
  } catch (err) {
    console.error(`API Error on ${endpoint}:`, err);
    throw err;
  }
}

/**
 * Submits citizen input (text, audio, media, coordinates, consent) for AI structuring & verification.
 * @param {FormData} formData - Multipart form containing inputs.
 * @returns {Promise<object>} Analysis, verification, and action plan data.
 */
export async function analyzeComplaint(formData) {
  return request("/api/complaints/analyze", {
    method: "POST",
    body: formData
  });
}

/**
 * Requests formal complaint letter drafting in English, Marathi, or Hindi.
 * @param {object} report - Structured report.
 * @param {string} [language="en"] - Language code ("en", "mr", "hi").
 * @returns {Promise<{ subject: string, letterBody: string, language: string }>}
 */
export async function draftLetter(report, language = "en") {
  return request("/api/complaints/draft-letter", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ report, language })
  });
}

/**
 * Formally files the complaint, generates a tracking ID, appends to reports.json,
 * and retrieves status timeline and filing routes (online/offline/whatsapp/email).
 * @param {object} report - Structured complaint report.
 * @param {object} actionPlan - Action plan details.
 * @param {string} [citizenNote=""] - Optional citizen note.
 * @returns {Promise<object>} Complete filing confirmation payload.
 */
export async function fileComplaint(report, actionPlan, citizenNote = "") {
  return request("/api/complaints/file", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ report, actionPlan, citizenNote })
  });
}

/**
 * Simulates official grievance filing with the responsible Pune authority.
 * @param {object} report - Structured report.
 * @param {object} actionPlan - Action plan details.
 * @returns {Promise<object>} Submission tracking confirmation.
 */
export async function submitMockGrievance(report, actionPlan) {
  return request("/api/complaints/submit-mock", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ report, actionPlan })
  });
}

/**
 * Retrieves all stored Pune civic reports for the map and live feed.
 * @returns {Promise<Array<object>>}
 */
export async function fetchReports() {
  const result = await request("/api/complaints");
  return result.data || [];
}

/**
 * Retrieves the directory of Pune municipal authorities.
 * @returns {Promise<Array<object>>}
 */
export async function fetchAuthorities() {
  const result = await request("/api/authorities");
  return result.data || [];
}

/**
 * Checks system health and Gemini configuration status.
 * @returns {Promise<object>}
 */
export async function checkHealth() {
  return request("/health");
}
