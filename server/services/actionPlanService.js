/**
 * @fileoverview Action Plan and Filing Service for CivicBridge.
 * Generates plain-language civic action plans, department routing,
 * official SLAs, online/offline filing blueprints, and community impact rationales.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { DEFAULT_SLA_HOURS } from "../config/constants.js";
import { AppError } from "../utils/appError.js";
import {
  buildShareLinks,
  buildStatusTimeline,
  generateCopyReadyComplaint
} from "./actionPlanFiling.js";
import {
  createActionPhases,
  createAuthoritySummary,
  createOfflineGuide,
  createUrgentHazardDetails,
  getCommunityImpact
} from "./actionPlanContent.js";

export {
  buildShareLinks,
  buildStatusTimeline,
  generateCopyReadyComplaint
} from "./actionPlanFiling.js";

/**
 * Path to Pune municipal authorities registry.
 */
const AUTHORITIES_PATH = path.resolve(
  process.cwd(),
  "server",
  "config",
  "authorities.json"
);

/**
 * Cached authorities list.
 * @type {Array<object>|null}
 */
let cachedAuthorities = null;

/**
 * Loads Pune authorities from the configuration registry.
 * @returns {Promise<Array<object>>} List of authorities.
 */
export async function getAuthorities() {
  if (cachedAuthorities) return cachedAuthorities;
  try {
    const raw = await fs.readFile(AUTHORITIES_PATH, "utf-8");
    const data = JSON.parse(raw);
    cachedAuthorities = data.authorities || [];
    return cachedAuthorities;
  } catch (error) {
    throw new AppError("Failed to load authorities.json.", {
      code: "AUTHORITY_REGISTRY_UNAVAILABLE",
      userMessage: "Civic authority information is temporarily unavailable.",
      cause: error
    });
  }
}

/**
 * Finds the matching authority for a given category and subcategory.
 * @param {string} category - Report category.
 * @param {string} subcategory - Report subcategory.
 * @returns {Promise<object>} Matching authority object.
 */
export async function matchAuthority(category, subcategory) {
  const authorities = await getAuthorities();

  // Try exact subcategory match
  for (const auth of authorities) {
    if (
      auth.categories &&
      auth.categories.some(
        (c) => c.toLowerCase() === (subcategory || "").toLowerCase()
      )
    ) {
      return auth;
    }
  }

  // Try category match
  for (const auth of authorities) {
    if (
      auth.category &&
      auth.category.toLowerCase() === (category || "").toLowerCase()
    ) {
      return auth;
    }
    if (
      auth.categories &&
      auth.categories.some(
        (c) => c.toLowerCase() === (category || "").toLowerCase()
      )
    ) {
      return auth;
    }
  }

  // Default to PMC Road Department or first authority
  return authorities[0];
}

async function resolveActionAuthority(report, hazardTriage) {
  if (!hazardTriage) {
    return matchAuthority(report.category, report.subcategory);
  }

  const authorities = await getAuthorities();
  return (
    authorities.find(({ id }) => id === hazardTriage.authorityId) ||
    matchAuthority(report.category, report.subcategory)
  );
}

/**
 * Generates an end-to-end actionable civic plan for the citizen.
 * @param {object} structuredReport - The structured complaint report.
 * @param {object|null} [hazardTriage=null] - Prioritized emergency details.
 * @returns {Promise<object>} Detailed action plan.
 */
export async function generateActionPlan(
  structuredReport,
  hazardTriage = null
) {
  const resolvedAuthority = await resolveActionAuthority(
    structuredReport,
    hazardTriage
  );
  const slaHours = resolvedAuthority.slaHours || DEFAULT_SLA_HOURS;
  const trackingId = `PMC-2026-${Math.floor(10000 + Math.random() * 90000)}`;
  const copyReadyText = generateCopyReadyComplaint(
    structuredReport,
    resolvedAuthority,
    trackingId
  );
  const shareLinks = buildShareLinks(
    resolvedAuthority,
    copyReadyText,
    trackingId
  );
  const statusTimeline = buildStatusTimeline(trackingId, resolvedAuthority);

  return {
    authority: createAuthoritySummary(resolvedAuthority),
    expectedTimeline: {
      slaHours,
      targetResolutionDate: new Date(
        Date.now() + slaHours * 60 * 60 * 1000
      ).toLocaleDateString("en-IN", {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      }),
      plainExplanation: `Statutory resolution timeframe under PMC Citizen's Charter is within ${slaHours} hours.`
    },
    phases: createActionPhases(structuredReport, resolvedAuthority, slaHours),
    onlineFilingSteps: resolvedAuthority.onlineFilingSteps || [],
    offlineOfficeDetails: resolvedAuthority.offlineOfficeDetails || {},
    offlineGuide: createOfflineGuide(resolvedAuthority),
    communityImpact: getCommunityImpact(structuredReport.category),
    urgentHazard: createUrgentHazardDetails(hazardTriage, resolvedAuthority),
    copyReadyText,
    shareLinks,
    statusTimeline,
    initialTrackingId: trackingId
  };
}
