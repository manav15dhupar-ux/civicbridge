/**
 * Builds the four service steps for the citizen-facing action plan.
 * @param {object} report - Structured complaint.
 * @param {object} authority - Responsible authority.
 * @param {number} slaHours - Authority resolution target in hours.
 * @returns {Array<object>} Action plan phases.
 */
export function createActionPhases(report, authority, slaHours) {
  return [
    {
      step: 1,
      title: "Grievance Logging & Token Generation",
      description:
        "Report registered with PMC Central Redressal under token prefix PMC-2026. Automated SMS sent with Junior Engineer contact."
    },
    {
      step: 2,
      title: "Ward Field Inspection",
      description: `Sanitary / Junior Road Inspector visits ${report.location_text} within ${Math.round(slaHours / 2)} hours to assess defect dimensions and safety risk.`
    },
    {
      step: 3,
      title: "Crew Dispatch & Rectification",
      description: `${authority.name} assigns registered contractor or municipal maintenance squad for on-site repair.`
    },
    {
      step: 4,
      title: "Civic Audit & Closure",
      description:
        "Before-and-after photo uploaded to PMC Care portal. Citizen receives SMS prompt to verify satisfaction before case is officially closed."
    }
  ];
}

/**
 * Finds the community-impact message for a category.
 * @param {string} category - Civic report category.
 * @returns {string} Citizen-facing impact statement.
 */
export function getCommunityImpact(category) {
  const impactStatements = {
    "Roads & Footpaths":
      "Reporting this pothole/damage prevents two-wheeler skid accidents, reduces suspension damage for thousands of commuters, and triggers preventative road repaving.",
    "Drainage & Sewage":
      "Immediate reporting curbs toxic sewage contact, eliminates Dengue/Chikungunya mosquito larvae hotspots, and preserves stormwater drainage capacity.",
    "Garbage & Waste":
      "Eliminating this illegal dumping spot stops disease transmission, prevents plastic ingestion by stray animals, and restores neighborhood hygiene.",
    "Street Lighting & Electricity":
      "Fixing dark spots significantly boosts women and senior citizen safety at night and reduces vehicular collisions in low-visibility corners.",
    "Water Supply":
      "Stopping pipeline leakage conserves thousands of liters of purified municipal water daily and maintains vital water pressure for surrounding societies.",
    "Traffic & Obstructions":
      "Clearing the bottleneck restores smooth traffic throughput, decreases vehicle idling emissions, and ensures unhindered passage for emergency ambulances."
  };

  return (
    impactStatements[category] ||
    "Every verified civic report builds public transparency and holds municipal ward officers directly accountable to statutory service level agreements (SLAs)."
  );
}

/**
 * Selects the configured offline guide or the generic filing guidance.
 * @param {object} authority - Responsible authority.
 * @returns {object} Offline filing guidance.
 */
export function createOfflineGuide(authority) {
  return (
    authority.offlineGuide || {
      officeName: authority.name,
      officeAddress: authority.officeAddress,
      documentsToCarry: [
        "2 printed defect photos",
        "Complaint application letter",
        "Photo ID"
      ],
      bestTimeToVisit: "10:30 AM - 1:00 PM (Monday to Friday)",
      whatToSay:
        "I am registering an urgent civic defect at this location under statutory PMC SLAs."
    }
  );
}

/**
 * Selects public authority details for API responses.
 * @param {object} authority - Responsible authority.
 * @returns {object} Authority details included in the action plan.
 */
export function createAuthoritySummary(authority) {
  return {
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
  };
}

/**
 * Adds the resolved authority contact to urgent hazard guidance.
 * @param {object|null} hazardTriage - Hazard triage details.
 * @param {object} authority - Responsible authority.
 * @returns {object|null} Extended urgent guidance.
 */
export function createUrgentHazardDetails(hazardTriage, authority) {
  if (!hazardTriage) return null;

  return {
    ...hazardTriage,
    authorityContact: {
      name: authority.name,
      number: authority.helpline
    }
  };
}
