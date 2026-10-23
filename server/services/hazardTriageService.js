import {
  NATIONAL_EMERGENCY_CONTACT,
  URGENT_HAZARD_TYPES
} from "../config/constants.js";

function findHazard(report, inputText) {
  const searchableText = [
    inputText,
    report.category,
    report.subcategory,
    report.description,
    report.urgency_reason,
    report.evidence_summary
  ]
    .filter(Boolean)
    .join(" ");

  return URGENT_HAZARD_TYPES.find(({ patterns }) =>
    patterns.some((pattern) => pattern.test(searchableText))
  );
}

function createCriticalReport(report, hazard) {
  const existingReason = report.urgency_reason?.trim();
  const safetyReason = `${hazard.label} poses an immediate risk of serious injury or death.`;

  return {
    ...report,
    category: hazard.category,
    subcategory: hazard.subcategory,
    severity: 5,
    urgency_reason: existingReason
      ? `${safetyReason} ${existingReason}`
      : safetyReason,
    responsible_authority: hazard.authorityName
  };
}

function createSafetyRouting(hazard) {
  return {
    type: hazard.type,
    label: hazard.label,
    authorityId: hazard.authorityId,
    safetyAdvice: [
      "Stay well away from the hazard and do not attempt to touch or cross it.",
      "Warn nearby people to keep clear, without putting yourself at risk.",
      `Call ${NATIONAL_EMERGENCY_CONTACT.name} on ${NATIONAL_EMERGENCY_CONTACT.number} now.`
    ],
    emergencyContacts: [NATIONAL_EMERGENCY_CONTACT, hazard.secondaryContact],
    priorityRouting: `Contact ${NATIONAL_EMERGENCY_CONTACT.number} first, then report to ${hazard.authorityName}.`
  };
}

/**
 * Identifies urgent hazards and upgrades the report to critical priority.
 * @param {object} report - Structured complaint report.
 * @param {string} inputText - Citizen-provided complaint text.
 * @returns {{ structuredReport: object, hazardTriage: object|null }} Updated report and safety routing, if applicable.
 */
export function applyUrgentHazardTriage(report, inputText = "") {
  const hazard = findHazard(report, inputText);
  if (!hazard) {
    return { structuredReport: report, hazardTriage: null };
  }

  return {
    structuredReport: createCriticalReport(report, hazard),
    hazardTriage: createSafetyRouting(hazard)
  };
}
