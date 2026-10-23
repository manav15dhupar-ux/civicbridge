/**
 * @fileoverview Action Plan Service for CivicBridge.
 * Generates plain-language civic action plans, department routing,
 * official SLAs, online/offline filing blueprints, and community impact rationales.
 */

import fs from "node:fs/promises";
import path from "node:path";

/**
 * Path to Pune municipal authorities registry.
 */
const AUTHORITIES_PATH = path.resolve(process.cwd(), "server", "config", "authorities.json");

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
    console.error("Failed to load authorities.json:", error.message);
    return [];
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
    if (auth.categories.some((c) => c.toLowerCase() === (subcategory || "").toLowerCase())) {
      return auth;
    }
  }

  // Try category match
  for (const auth of authorities) {
    if (auth.categories.some((c) => c.toLowerCase() === (category || "").toLowerCase())) {
      return auth;
    }
  }

  // Default to PMC Road Department or first authority
  return authorities[0];
}

/**
 * Generates an end-to-end actionable civic plan for the citizen.
 * @param {object} structuredReport - The structured complaint report.
 * @returns {Promise<object>} Detailed action plan.
 */
export async function generateActionPlan(structuredReport) {
  const authority = await matchAuthority(
    structuredReport.category,
    structuredReport.subcategory
  );

  const slaHours = authority.slaHours || 48;
  const targetDate = new Date(Date.now() + slaHours * 60 * 60 * 1000).toLocaleDateString("en-IN", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });

  // Plain-language phases of what will happen
  const phases = [
    {
      step: 1,
      title: "Grievance Logging & Token Generation",
      description: `Report registered with PMC Central Redressal under token prefix PMC-2026. Automated SMS sent with Junior Engineer contact.`
    },
    {
      step: 2,
      title: "Ward Field Inspection",
      description: `Sanitary / Junior Road Inspector visits ${structuredReport.location_text} within ${Math.round(slaHours / 2)} hours to assess defect dimensions and safety risk.`
    },
    {
      step: 3,
      title: "Crew Dispatch & Rectification",
      description: `${authority.name} assigns registered contractor or municipal maintenance squad for on-site repair.`
    },
    {
      step: 4,
      title: "Civic Audit & Closure",
      description: `Before-and-after photo uploaded to PMC Care portal. Citizen receives SMS prompt to verify satisfaction before case is officially closed.`
    }
  ];

  // Community impact statement
  const impactStatements = {
    "Roads & Footpaths": "Reporting this pothole/damage prevents two-wheeler skid accidents, reduces suspension damage for thousands of commuters, and triggers preventative road repaving.",
    "Drainage & Sewage": "Immediate reporting curbs toxic sewage contact, eliminates Dengue/Chikungunya mosquito larvae hotspots, and preserves stormwater drainage capacity.",
    "Garbage & Waste": "Eliminating this illegal dumping spot stops disease transmission, prevents plastic ingestion by stray animals, and restores neighborhood hygiene.",
    "Street Lighting & Electricity": "Fixing dark spots significantly boosts women and senior citizen safety at night and reduces vehicular collisions in low-visibility corners.",
    "Water Supply": "Stopping pipeline leakage conserves thousands of liters of purified municipal water daily and maintains vital water pressure for surrounding societies.",
    "Traffic & Obstructions": "Clearing the bottleneck restores smooth traffic throughput, decreases vehicle idling emissions, and ensures unhindered passage for emergency ambulances."
  };

  const communityImpact =
    impactStatements[structuredReport.category] ||
    "Every verified civic report builds public transparency and holds municipal ward officers directly accountable to statutory service level agreements (SLAs).";

  // Formatted copy-ready text
  const copyReadyText = `[CIVIC GRIEVANCE NOTICE]
Category: ${structuredReport.category} - ${structuredReport.subcategory}
Location: ${structuredReport.location_text}
Severity: ${structuredReport.severity}/5
Urgency: ${structuredReport.urgency_reason}
Authority: ${authority.name}
Helpline: ${authority.helpline}
Official SLA: ${slaHours} Hours (Target Resolution: ${targetDate})
Reference: CivicBridge Pune #CB-${Date.now().toString().slice(-6)}`;

  return {
    authority: {
      id: authority.id,
      name: authority.name,
      marathiName: authority.marathiName,
      hindiName: authority.hindiName,
      jurisdiction: authority.jurisdiction,
      portalUrl: authority.portalUrl,
      portalName: authority.portalName,
      helpline: authority.helpline,
      whatsapp: authority.whatsapp,
      email: authority.email
    },
    expectedTimeline: {
      slaHours,
      targetResolutionDate: targetDate,
      plainExplanation: `Statutory resolution timeframe under PMC Citizen's Charter is within ${slaHours} hours.`
    },
    phases,
    onlineFilingSteps: authority.onlineFilingSteps || [],
    offlineOfficeDetails: authority.offlineOfficeDetails || {},
    communityImpact,
    copyReadyText
  };
}
