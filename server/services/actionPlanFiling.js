import { DEFAULT_SLA_HOURS } from "../config/constants.js";

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

Statutory Redressal SLA: ${authority.slaHours || DEFAULT_SLA_HOURS} Hours (as per PMC Citizen's Charter)
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
  const subject = encodeURIComponent(
    `URGENT: Civic Grievance [${trackingId}] - ${authority.department || authority.name}`
  );
  const whatsappTarget = authority.whatsapp
    ? authority.whatsapp.replace(/[^0-9]/g, "")
    : "";
  const whatsappUrl = whatsappTarget
    ? `https://wa.me/${whatsappTarget}?text=${encodedText}`
    : `https://wa.me/?text=${encodedText}`;
  const emailTarget = authority.email || "pmccare@punecorporation.org";

  return {
    whatsappUrl,
    emailUrl: `mailto:${emailTarget}?subject=${subject}&body=${encodeURIComponent(copyText)}`
  };
}

/**
 * Builds the four-stage civic lifecycle status timeline.
 * @param {string} trackingId - Tracking ID.
 * @param {object} authority - Assigned authority.
 * @returns {object} Status timeline structure.
 */
export function buildStatusTimeline(trackingId, authority) {
  const now = new Date();
  const formatTime = (date) =>
    date.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });

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
        description:
          "AI structured with Gemini and cross-checked against Pune 200m spatial cluster."
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
        timestamp: `Within ${authority.slaHours || DEFAULT_SLA_HOURS}h`,
        description:
          "Field works inspection, photo audit, and official citizen sign-off."
      }
    ]
  };
}
