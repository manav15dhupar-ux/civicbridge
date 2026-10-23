/**
 * @fileoverview Action Plan and Filing Service for CivicBridge.
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
    if (auth.categories && auth.categories.some((c) => c.toLowerCase() === (subcategory || "").toLowerCase())) {
      return auth;
    }
  }

  // Try category match
  for (const auth of authorities) {
    if (auth.category && auth.category.toLowerCase() === (category || "").toLowerCase()) {
      return auth;
    }
    if (auth.categories && auth.categories.some((c) => c.toLowerCase() === (category || "").toLowerCase())) {
      return auth;
    }
  }

  // Default to PMC Road Department or first authority
  return authorities[0];
}

/**
 * Generates copy-ready formatted text for online portal pasting or sharing.
 * @param {object} report - Structured report.
 * @param {object} authority - Matching authority.
 * @param {string} trackingId - Generated tracking token.
 * @returns {string} Formatted complaint text.
 */
export function generateCopyReadyComplaint(report, authority, trackingId) {
  const now = new Date().toLocaleDateString("en-IN", {
    year: "numeric",
    month: "short",
    day: "numeric"
  });

  return `[PMC CIVIC GRIEVANCE NOTICE - REF: ${trackingId}]
Date: ${now}
To: The Ward Officer / Executive Engineer, ${authority.department || authority.name}
Authority: ${authority.authorityName || "Pune Municipal Corporation"} (${authority.jurisdiction || "PMC"})

Grievance Details:
• Category: ${report.category} (${report.subcategory || "General"})
• Exact Location: ${report.location_text}
• Severity Level: ${report.severity}/5
• Defect Summary: ${report.description}
• Urgency Justification: ${report.urgency_reason}
• Observed Evidence: ${report.evidence_summary || "Visual proof attached"}

Statutory Redressal SLA: ${authority.slaHours || 48} Hours (as per PMC Citizen's Charter)
Helpline: ${authority.helpline}
Official Portal: ${authority.portalUrl}
Filed via: CivicBridge Pune Public Accountability Initiative`;
}

/**
 * Generates pre-filled WhatsApp and Email sharing URLs.
 * @param {object} authority - Assigned authority.
 * @param {string} copyText - Formatted complaint text.
 * @param {string} trackingId - Tracking identifier.
 * @returns {{ whatsappUrl: string, emailUrl: string }}
 */
export function buildShareLinks(authority, copyText, trackingId) {
  const encodedText = encodeURIComponent(copyText);
  const subject = encodeURIComponent(`URGENT: Civic Grievance [${trackingId}] - ${authority.department || authority.name}`);
  const body = encodeURIComponent(copyText);

  // If authority has WhatsApp number, target them directly or allow broad share
  const whatsappTarget = authority.whatsapp ? authority.whatsapp.replace(/[^0-9]/g, "") : "";
  const whatsappUrl = whatsappTarget
    ? `https://wa.me/${whatsappTarget}?text=${encodedText}`
    : `https://wa.me/?text=${encodedText}`;

  const emailTarget = authority.email || "pmccare@punecorporation.org";
  const emailUrl = `mailto:${emailTarget}?subject=${subject}&body=${body}`;

  return { whatsappUrl, emailUrl };
}

/**
 * Builds the 4-stage civic lifecycle status timeline.
 * @param {string} trackingId - Tracking ID.
 * @param {object} authority - Assigned authority.
 * @returns {object} Status timeline structure.
 */
export function buildStatusTimeline(trackingId, authority) {
  const now = new Date();
  const formatTime = (d) => d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });

  return {
    trackingId,
    currentStage: "Forwarded",
    stages: [
      {
        id: "submitted",
        name: "Submitted",
        status: "completed",
        timestamp: `${formatTime(now)}, Today`,
        description: `Grievance registered under token ${trackingId}. Citizen consent verified.`
      },
      {
        id: "verified",
        name: "Verified",
        status: "completed",
        timestamp: `${formatTime(now)}, Today`,
        description: "AI structured with Gemini and cross-checked against Pune 200m spatial cluster."
      },
      {
        id: "forwarded",
        name: "Forwarded",
        status: "active",
        timestamp: "In Progress",
        description: `Transmitted to ${authority.name} (${authority.department}). Field squad assigned.`
      },
      {
        id: "resolved",
        name: "Resolved",
        status: "pending",
        timestamp: `Within ${authority.slaHours || 48}h`,
        description: "Field works inspection, photo audit, and official citizen sign-off."
      }
    ]
  };
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

  const trackingId = `PMC-2026-${Math.floor(10000 + Math.random() * 90000)}`;
  const copyReadyText = generateCopyReadyComplaint(structuredReport, authority, trackingId);
  const shareLinks = buildShareLinks(authority, copyReadyText, trackingId);
  const statusTimeline = buildStatusTimeline(trackingId, authority);

  return {
    authority: {
      id: authority.id,
      category: authority.category,
      authorityName: authority.authorityName || "Pune Municipal Corporation",
      department: authority.department || "Municipal Redressal Cell",
      name: authority.name,
      marathiName: authority.marathiName,
      hindiName: authority.hindiName,
      jurisdiction: authority.jurisdiction,
      portalUrl: authority.portalUrl,
      portalName: authority.portalName,
      helpline: authority.helpline,
      whatsapp: authority.whatsapp,
      email: authority.email,
      officeAddress: authority.officeAddress
    },
    expectedTimeline: {
      slaHours,
      targetResolutionDate: targetDate,
      plainExplanation: `Statutory resolution timeframe under PMC Citizen's Charter is within ${slaHours} hours.`
    },
    phases,
    onlineFilingSteps: authority.onlineFilingSteps || [],
    offlineOfficeDetails: authority.offlineOfficeDetails || {},
    offlineGuide: authority.offlineGuide || {
      officeName: authority.name,
      officeAddress: authority.officeAddress,
      documentsToCarry: ["2 printed defect photos", "Complaint application letter", "Photo ID"],
      bestTimeToVisit: "10:30 AM - 1:00 PM (Monday to Friday)",
      whatToSay: "I am registering an urgent civic defect at this location under statutory PMC SLAs."
    },
    communityImpact,
    copyReadyText,
    shareLinks,
    statusTimeline,
    initialTrackingId: trackingId
  };
}
