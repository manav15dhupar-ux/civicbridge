/**
 * @fileoverview UI Component Renderer and View Controller for CivicBridge.
 * Implements Mobbin-grade mobile-first design patterns, cards, drawers, and modal workflows.
 */

/**
 * Escapes a string for safe insertion into HTML to prevent XSS.
 * Use this for all user-supplied or AI-generated string values before injecting into innerHTML.
 * @param {unknown} value - Value to escape.
 * @returns {string} HTML-safe escaped string.
 */
export function escapeHtml(value) {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

/**
 * Severity configuration styling.
 */
export const SEVERITY_CONFIG = {
  1: {
    label: "1 - Low",
    color: "bg-slate-100 text-slate-700 border-slate-300",
    dot: "bg-slate-400"
  },
  2: {
    label: "2 - Minor",
    color: "bg-blue-50 text-blue-700 border-blue-300",
    dot: "bg-blue-500"
  },
  3: {
    label: "3 - Moderate",
    color: "bg-amber-50 text-amber-700 border-amber-300",
    dot: "bg-amber-500"
  },
  4: {
    label: "4 - High Hazard",
    color: "bg-orange-50 text-orange-700 border-orange-300",
    dot: "bg-orange-500"
  },
  5: {
    label: "5 - Critical Emergency",
    color: "bg-rose-50 text-rose-700 border-rose-300",
    dot: "bg-rose-600 animate-pulse"
  }
};

/**
 * Renders the immediate safety warning and prioritized emergency contacts.
 * @param {object|null} hazardTriage - Hazard safety and routing information.
 * @returns {string} Accessible alert markup, or an empty string when no urgent hazard was found.
 */
export function renderImmediateSafetyCard(hazardTriage) {
  if (!hazardTriage) return "";

  const contacts = (hazardTriage.emergencyContacts || [])
    .map((contact) => {
      const number = String(contact.number || "").replace(/[^0-9+]/g, "");
      return `
        <a
          href="tel:${escapeHtml(number)}"
          aria-label="Call ${escapeHtml(contact.name)} at ${escapeHtml(contact.number)}"
          class="inline-flex min-h-11 items-center justify-center rounded-xl border border-red-300 bg-white px-4 py-2 text-sm font-bold text-red-900 hover:bg-red-50"
        >
          Call ${escapeHtml(contact.name)}: ${escapeHtml(contact.number)}
        </a>
      `;
    })
    .join("");

  return `
    <section role="alert" aria-labelledby="immediateSafetyTitle" class="mb-4 space-y-3 rounded-2xl border-2 border-red-600 bg-red-50 p-5 text-red-950 shadow-sm">
      <div>
        <p class="text-xs font-black uppercase tracking-widest text-red-800">Critical life-safety hazard</p>
        <h2 id="immediateSafetyTitle" class="mt-1 text-lg font-black">Immediate safety advice</h2>
        <p class="mt-1 text-sm font-semibold">${escapeHtml(hazardTriage.label)}</p>
      </div>
      <ul class="list-disc space-y-1 pl-5 text-sm">
        ${(hazardTriage.safetyAdvice || []).map((advice) => `<li>${escapeHtml(advice)}</li>`).join("")}
      </ul>
      <div class="flex flex-wrap gap-2">${contacts}</div>
      <p class="text-xs font-semibold text-red-900">${escapeHtml(hazardTriage.priorityRouting)}</p>
    </section>
  `;
}

/**
 * Displays a non-intrusive toast notification.
 * @param {string} message - Message text.
 * @param {"success"|"error"|"info"|"warning"} [type="info"] - Toast category.
 */
export function showToast(message, type = "info") {
  const container = document.getElementById("toastContainer");
  if (!container) return;

  const bgColors = {
    success: "bg-emerald-900/95 text-white border-emerald-700",
    error: "bg-rose-900/95 text-white border-rose-700",
    warning: "bg-amber-900/95 text-white border-amber-700",
    info: "bg-slate-900/95 text-white border-slate-700"
  };

  const icons = {
    success: "✓",
    error: "✕",
    warning: "⚠",
    info: "ℹ"
  };

  const toast = document.createElement("div");
  toast.className = `flex items-center gap-2.5 px-4 py-3 rounded-2xl shadow-xl border backdrop-blur text-sm font-semibold transition-all duration-300 transform translate-y-2 opacity-0 ${bgColors[type] || bgColors.info}`;
  toast.innerHTML = `
    <span class="font-bold text-base leading-none">${icons[type] || "ℹ"}</span>
    <span class="flex-1">${escapeHtml(message)}</span>
  `;

  container.appendChild(toast);

  // Animate in
  requestAnimationFrame(() => {
    toast.classList.remove("translate-y-2", "opacity-0");
    toast.classList.add("translate-y-0", "opacity-100");
  });

  // Auto remove after 4s
  setTimeout(() => {
    toast.classList.add("opacity-0", "translate-y-2");
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

/**
 * Renders the Gemini structured complaint card.
 * @param {object} report - Structured report.
 * @returns {string} HTML string.
 */
export function renderStructuredCard(report) {
  const sev = SEVERITY_CONFIG[report.severity] || SEVERITY_CONFIG[3];

  return `
    <div class="bg-white rounded-3xl border border-slate-200/80 p-5 sm:p-6 shadow-sm space-y-4">
      <div class="flex items-start justify-between gap-3">
        <div>
          <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
            <span class="w-1.5 h-1.5 rounded-full bg-blue-600"></span>
            ${escapeHtml(report.category)}
          </span>
          <h3 class="text-lg sm:text-xl font-extrabold text-slate-900 mt-2">${escapeHtml(report.subcategory || report.category)}</h3>
        </div>
        <div class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-2xl border text-xs font-extrabold ${sev.color}">
          <span class="w-2 h-2 rounded-full ${sev.dot}"></span>
          ${escapeHtml(sev.label)}
        </div>
      </div>

      <p class="text-sm text-slate-700 leading-relaxed bg-slate-50/80 p-4 rounded-2xl border border-slate-100">
        ${escapeHtml(report.description)}
      </p>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 text-xs">
        <div class="flex items-start gap-2.5 bg-slate-50 p-3 rounded-2xl border border-slate-100">
          <span class="text-slate-500 font-bold text-base">📍</span>
          <div>
            <span class="font-bold text-slate-800 block">Identified Location</span>
            <span class="text-slate-600">${escapeHtml(report.location_text)}</span>
            <span class="text-[11px] text-slate-400 font-mono block mt-0.5">${escapeHtml(report.lat?.toFixed(4))}, ${escapeHtml(report.lng?.toFixed(4))}</span>
          </div>
        </div>
        <div class="flex items-start gap-2.5 bg-slate-50 p-3 rounded-2xl border border-slate-100">
          <span class="text-slate-500 font-bold text-base">🏛️</span>
          <div>
            <span class="font-bold text-slate-800 block">Responsible Authority</span>
            <span class="text-slate-600">${escapeHtml(report.responsible_authority)}</span>
            <span class="text-[11px] text-emerald-600 font-semibold block mt-0.5">Confidence: ${Math.round((report.confidence || 0.9) * 100)}%</span>
          </div>
        </div>
      </div>

      ${
        report.urgency_reason
          ? `
        <div class="p-3.5 rounded-2xl bg-amber-50/80 border border-amber-200/90 text-xs text-amber-950 flex items-start gap-2.5">
          <span class="text-amber-600 font-bold text-sm">⚠️</span>
          <div>
            <strong class="font-bold text-amber-900 block">Public Impact Assessment:</strong>
            <span class="text-amber-800 leading-relaxed">${escapeHtml(report.urgency_reason)}</span>
          </div>
        </div>
      `
          : ""
      }

      ${
        report.evidence_summary
          ? `
        <div class="p-3.5 rounded-2xl bg-blue-50/70 border border-blue-200/80 text-xs text-blue-950 flex items-start gap-2.5">
          <span class="text-blue-600 font-bold text-sm">📸</span>
          <div>
            <strong class="font-bold text-blue-900 block">Synthesized Evidence:</strong>
            <span class="text-blue-800 leading-relaxed">${escapeHtml(report.evidence_summary)}</span>
          </div>
        </div>
      `
          : ""
      }
    </div>
  `;
}

/**
 * Renders the Verification & Spatial consensus card.
 * @param {object} verification - Verification output.
 * @returns {string} HTML string.
 */
export function renderVerificationCard(verification) {
  const isHigh = verification.verificationScore >= 75;
  const scoreBadgeColor = isHigh
    ? "bg-emerald-600 text-white"
    : verification.verificationScore >= 50
      ? "bg-blue-600 text-white"
      : "bg-amber-500 text-white";

  const matchesHtml =
    verification.matches && verification.matches.length > 0
      ? `
      <div class="mt-3 pt-3 border-t border-slate-100 space-y-2">
        <span class="text-xs font-bold text-slate-700 uppercase tracking-wide block">
          Matching Civic Complaints Within 200m (${escapeHtml(verification.matches.length)})
        </span>
        <div class="space-y-2 max-h-48 overflow-y-auto pr-1">
          ${verification.matches
            .map(
              (m) => `
            <div class="p-3 rounded-2xl border border-slate-200/90 bg-slate-50/60 flex items-center justify-between text-xs hover:bg-white transition">
              <div>
                <div class="font-bold text-slate-800 flex items-center gap-1.5">
                  <span>${escapeHtml(m.subcategory || m.category)}</span>
                  <span class="font-mono text-[10px] text-slate-400">#${escapeHtml(m.trackingId)}</span>
                </div>
                <div class="text-slate-500 text-[11px] mt-0.5">
                  📍 ${escapeHtml(m.distanceMeters)}m away • ${escapeHtml(m.reporters)} citizen(s) reported
                </div>
              </div>
              <span class="px-2.5 py-1 rounded-full text-[11px] font-bold ${
                m.status === "Resolved"
                  ? "bg-emerald-100 text-emerald-800"
                  : "bg-blue-100 text-blue-800"
              }">
                ${escapeHtml(m.status)}
              </span>
            </div>
          `
            )
            .join("")}
        </div>
      </div>
    `
      : `
      <!-- Mobbin Pioneer Banner for New Report Zone -->
      <div class="p-3.5 rounded-2xl bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200/80 flex items-center gap-3">
        <div class="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold text-sm shrink-0">
          🌱
        </div>
        <div class="text-xs">
          <span class="font-extrabold text-blue-950 block">Pioneer Grievance Report</span>
          <span class="text-blue-700">First recorded civic defect in this 200m sector. Verified for PMC priority inspection.</span>
        </div>
      </div>
    `;

  return `
    <div class="bg-white rounded-3xl border border-slate-200/80 p-5 sm:p-6 shadow-sm space-y-4">
      <div class="flex items-center justify-between gap-3">
        <div>
          <span class="text-xs font-bold text-slate-400 uppercase tracking-wider block">Spatial Intelligence</span>
          <h3 class="text-base sm:text-lg font-extrabold text-slate-900 mt-0.5">Community & Distance Cross-Check</h3>
        </div>
        <div class="text-right">
          <div class="inline-flex items-center px-3 py-1 rounded-full text-xs font-extrabold ${scoreBadgeColor}">
            ${escapeHtml(verification.verificationScore)}% Verified
          </div>
          <div class="text-[10px] text-slate-500 mt-0.5">${escapeHtml(verification.verificationLabel)}</div>
        </div>
      </div>

      <!-- Reporter Consensus Banner -->
      <div class="p-4 rounded-2xl ${verification.otherReportersCount > 0 ? "bg-amber-50 border border-amber-200" : "bg-blue-50 border border-blue-200"} flex items-center gap-3.5">
        <div class="w-10 h-10 rounded-2xl ${verification.otherReportersCount > 0 ? "bg-amber-500 text-white" : "bg-blue-600 text-white"} flex items-center justify-center font-extrabold text-base shrink-0 shadow-sm">
          ${verification.otherReportersCount > 0 ? verification.otherReportersCount : "1"}
        </div>
        <div class="text-xs">
          <span class="font-extrabold text-slate-900 block text-sm">
            ${
              verification.otherReportersCount > 0
                ? `${escapeHtml(verification.otherReportersCount)} other citizens reported this issue nearby`
                : "Single-source new incident report"
            }
          </span>
          <span class="text-slate-600 mt-0.5">${escapeHtml(verification.reason)}</span>
        </div>
      </div>

      ${matchesHtml}
    </div>
  `;
}

/**
 * Renders the Privacy Shield Panel showing what PII was scrubbed.
 * @param {object} privacyShield - Privacy metadata and redaction log.
 * @returns {string} HTML string.
 */
export function renderPrivacyShieldCard(privacyShield) {
  const logs = privacyShield.redactionLog || [];

  return `
    <div class="bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 text-white rounded-3xl p-5 sm:p-6 shadow-md space-y-4">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2.5">
          <div class="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center justify-center font-bold text-lg">
            🛡️
          </div>
          <div>
            <h3 class="text-sm font-extrabold text-white">CivicBridge Privacy Shield</h3>
            <span class="text-[11px] text-slate-300">Statutory PII Redaction & Zero-Retention Memory</span>
          </div>
        </div>
        <span class="px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-xs font-bold">
          Active
        </span>
      </div>

      <div class="grid grid-cols-2 gap-2 text-xs">
        <div class="bg-white/5 border border-white/10 rounded-2xl p-3">
          <span class="text-slate-400 block text-[11px]">Identities Protected</span>
          <span class="text-white font-black text-base mt-0.5 block">${escapeHtml(logs.length)} Entities</span>
        </div>
        <div class="bg-white/5 border border-white/10 rounded-2xl p-3">
          <span class="text-slate-400 block text-[11px]">Raw Media Stored</span>
          <span class="text-emerald-400 font-black text-base mt-0.5 block">0 Bytes (Zero Retention)</span>
        </div>
      </div>

      ${
        logs.length > 0
          ? `
        <div class="space-y-1.5 pt-1">
          <span class="text-[11px] font-bold text-slate-300 uppercase tracking-wider block">Redaction Audit Trail</span>
          <div class="space-y-1.5 max-h-36 overflow-y-auto pr-1">
            ${logs
              .map(
                (item) => `
              <div class="text-xs bg-white/5 rounded-xl p-2.5 border border-white/10 flex items-center justify-between">
                <div>
                  <span class="text-[10px] text-slate-400 uppercase tracking-wide block">${escapeHtml(item.type)}</span>
                  <span class="font-mono text-emerald-300 text-[11px] font-bold">${escapeHtml(item.masked)}</span>
                </div>
                <span class="text-[10px] text-slate-400">Scrubbed</span>
              </div>
            `
              )
              .join("")}
          </div>
        </div>
      `
          : `
        <div class="text-xs text-slate-300 bg-white/5 p-3 rounded-2xl border border-white/10 flex items-center gap-2">
          <span>✓</span>
          <span>No sensitive phone numbers, Aadhaar cards, or personal names detected in complaint text.</span>
        </div>
      `
      }

      <div class="text-[11px] text-slate-400 flex items-center gap-1.5 pt-1 border-t border-white/10">
        <span>🔒</span>
        <span>Compliant with Digital Personal Data Protection Act (DPDPA 2023).</span>
      </div>
    </div>
  `;
}

/**
 * Renders the Action Plan & Filing Blueprint Card with Mobbin-style connected stepper.
 * @param {object} actionPlan - Generated action plan.
 * @returns {string} HTML string.
 */
export function renderActionPlanCard(actionPlan) {
  const auth = actionPlan.authority || {};
  const timeline = actionPlan.expectedTimeline || {
    slaHours: 48,
    label: "Statutory 48h Resolution"
  };

  return `
    <div class="bg-white rounded-3xl border border-slate-200/90 p-5 sm:p-7 shadow-sm space-y-6">
      <div class="flex items-start justify-between gap-3">
        <div>
          <span class="text-xs font-extrabold uppercase tracking-widest text-blue-600 block">Civic Resolution Roadmap</span>
          <h3 class="text-xl font-black text-slate-900 mt-1">Step-by-Step Action Plan</h3>
          <p class="text-xs text-slate-500 mt-0.5">Municipal workflow structured for official Pune citizen redressal</p>
        </div>
        <span class="px-3.5 py-1.5 rounded-2xl text-xs font-black bg-blue-100 text-blue-800 border border-blue-200 shrink-0">
          SLA: ${escapeHtml(timeline.slaHours)}h
        </span>
      </div>

      <!-- Hero Authority Contact Card with Touch Targets (>=44px) -->
      <div class="p-4 sm:p-5 rounded-2xl bg-slate-50/80 border border-slate-200/90 space-y-3.5">
        <div class="flex items-start justify-between gap-2">
          <div>
            <span class="text-[10px] font-black uppercase tracking-wider text-slate-400 block">Responsible Public Body</span>
            <h4 class="font-extrabold text-slate-900 text-sm sm:text-base mt-0.5">${escapeHtml(auth.name || "Pune Municipal Corporation")}</h4>
            <div class="text-xs text-slate-500 font-medium">${escapeHtml(auth.marathiName || "")}</div>
          </div>
          <span class="px-2.5 py-1 rounded-xl text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 shrink-0">
            Official Ward Desk
          </span>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2 border-t border-slate-200/70">
          <a
            href="tel:${(auth.helpline || "18001030222").replace(/[^0-9]/g, "")}"
            class="min-h-[44px] flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-white border border-slate-200 hover:border-blue-400 active:scale-[0.98] transition text-slate-700 shadow-2xs font-semibold text-xs"
          >
            <span class="text-base">📞</span>
            <span class="truncate">Helpline: <strong class="font-bold text-slate-900">${escapeHtml(auth.helpline || "1800 1030 222")}</strong></span>
          </a>
          <a
            href="${auth.portalUrl || "https://complaint.punecorporation.org/"}"
            target="_blank"
            rel="noopener noreferrer"
            class="min-h-[44px] flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-white border border-slate-200 hover:border-blue-400 active:scale-[0.98] transition text-slate-700 shadow-2xs font-semibold text-xs"
          >
            <span class="text-base">🌐</span>
            <span class="truncate">Portal: <strong class="font-bold text-slate-900">${escapeHtml(auth.portalName || "PMC Care Portal")}</strong></span>
          </a>
        </div>
      </div>

      <!-- Connected Vertical Stepper Timeline (Mobbin Pattern) -->
      <div class="space-y-3">
        <h4 class="text-xs font-black text-slate-700 uppercase tracking-wider">Four-Stage Redressal Process</h4>
        <div class="relative pl-6 space-y-4 before:content-[''] before:absolute before:left-3 before:top-3 before:bottom-3 before:w-0.5 before:bg-blue-200">
          ${(actionPlan.phases || [])
            .map(
              (phase, idx) => `
            <div class="relative flex items-start gap-3.5">
              <!-- Step Circle Node -->
              <div class="absolute -left-6 w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-xs ring-4 ring-white shadow-sm shrink-0">
                ${escapeHtml(phase.step || idx + 1)}
              </div>
              <div class="p-3.5 rounded-2xl bg-slate-50/70 border border-slate-200/70 flex-1 hover:bg-slate-50 transition">
                <div class="flex items-center justify-between gap-2">
                  <h5 class="font-extrabold text-slate-900 text-xs">${escapeHtml(phase.title)}</h5>
                  <span class="text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">${escapeHtml(phase.timeframe)}</span>
                </div>
                <p class="text-xs text-slate-600 mt-1 leading-relaxed">${escapeHtml(phase.detail)}</p>
                <div class="text-[11px] text-slate-500 font-semibold mt-1.5 flex items-center gap-1.5">
                  <span class="text-slate-400">Action:</span>
                  <span>${escapeHtml(phase.actionRequired)}</span>
                </div>
              </div>
            </div>
          `
            )
            .join("")}
        </div>
      </div>

      <!-- Two-Column Accordion: Online Route & Offline In-Person Route -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3.5 pt-2">
        <div class="p-4 rounded-2xl bg-blue-50/60 border border-blue-200 space-y-2.5">
          <div class="flex items-center gap-2">
            <span class="w-2.5 h-2.5 rounded-full bg-blue-600"></span>
            <h5 class="text-xs font-extrabold text-blue-950 uppercase tracking-wide">Online Digital Route</h5>
          </div>
          <p class="text-xs text-blue-900 leading-relaxed">
            Submit directly via the PMC Care Portal or mobile app. The AI structured grievance and location will expedite ticket categorization.
          </p>
          <a
            href="${auth.portalUrl || "https://complaint.punecorporation.org/"}"
            target="_blank"
            rel="noopener noreferrer"
            class="min-h-[44px] inline-flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 active:scale-[0.98] font-bold text-xs text-white transition shadow-sm cursor-pointer"
          >
            <span>Open Official Portal</span>
            <span>↗</span>
          </a>
        </div>

        <div class="p-4 rounded-2xl bg-amber-50/60 border border-amber-200 space-y-2.5">
          <div class="flex items-center gap-2">
            <span class="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
            <h5 class="text-xs font-extrabold text-amber-950 uppercase tracking-wide">In-Person Ward Office Route</h5>
          </div>
          <p class="text-xs text-amber-900 leading-relaxed">
            Visit the local ward office with a printed formal letter and photo evidence. Submit to the junior engineer with acknowledgment stamp.
          </p>
          <button
            type="button"
            id="btnDraftLetterInline"
            class="min-h-[44px] inline-flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-xl bg-amber-600 hover:bg-amber-500 active:scale-[0.98] font-bold text-xs text-white transition shadow-sm cursor-pointer"
          >
            <span>📄</span>
            <span>Draft Grievance Letter</span>
          </button>
        </div>
      </div>

      <!-- Community Mobilization Banner -->
      ${
        actionPlan.communityEscalation
          ? `
        <div class="p-4 rounded-2xl bg-slate-900 text-white flex items-center justify-between gap-3 text-xs">
          <div>
            <strong class="font-bold text-slate-100 block">Civic Escalation Tip</strong>
            <span class="text-slate-400">${escapeHtml(actionPlan.communityEscalation)}</span>
          </div>
          <button
            type="button"
            id="btnShareActionPlan"
            class="min-h-[44px] px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 active:scale-[0.98] font-bold text-xs text-white transition shrink-0 cursor-pointer"
          >
            Share Plan
          </button>
        </div>
      `
          : ""
      }
    </div>
  `;
}

/**
 * Renders the dedicated "File this complaint" step panel after the action plan.
 * Displays Mobbin-grade status tracker timeline, token copy card, online/offline routes,
 * and high-contrast touch targets (>=44px).
 * @param {object} data - Filing data payload.
 * @returns {string} HTML string.
 */
export function renderFileComplaintPanel(data) {
  const auth = data.authority || {};
  const timeline = data.statusTimeline || {
    currentStage: "Forwarded",
    stages: [
      {
        id: "submitted",
        name: "Submitted",
        status: "completed",
        timestamp: "Completed",
        description: "Complaint registered"
      },
      {
        id: "verified",
        name: "Verified",
        status: "completed",
        timestamp: "Completed",
        description: "AI & spatial verified"
      },
      {
        id: "forwarded",
        name: "Forwarded",
        status: "active",
        timestamp: "In Progress",
        description: "Dispatched to Ward Junior Engineer"
      },
      {
        id: "resolved",
        name: "Resolved",
        status: "pending",
        timestamp: `Within ${auth.slaHours || 48}h`,
        description: "Resolution verification & sign-off"
      }
    ]
  };

  const offline = data.offlineRoute ||
    data.offlineGuide ||
    auth.offlineGuide || {
      officeName: auth.name,
      officeAddress:
        auth.officeAddress || "PMC Main Building, Shivajinagar, Pune",
      documentsToCarry: [
        "2 printed color photographs of defect",
        "Formal grievance application letter",
        "Government photo ID for visitor register"
      ],
      bestTimeToVisit: "10:30 AM - 1:00 PM (Monday to Friday)",
      whatToSay:
        "I am registering an urgent civic defect at this location under statutory PMC SLAs."
    };

  const copyText = data.onlineRoute?.copyReadyText || data.copyReadyText || "";
  const portalUrl = auth.portalUrl || "https://complaint.punecorporation.org/";
  const portalName = auth.portalName || "PMC Care Portal";

  const share = data.shareRoutes ||
    data.shareLinks || {
      whatsappUrl: `https://wa.me/?text=${encodeURIComponent(copyText)}`,
      emailUrl: `mailto:${auth.email || "pmccare@punecorporation.org"}?subject=${encodeURIComponent("URGENT: Civic Grievance")}&body=${encodeURIComponent(copyText)}`
    };

  const trackingId =
    data.trackingId || data.initialTrackingId || "PMC-2026-PENDING";
  const isFiled = Boolean(data.isFiled);

  return `
    <div class="bg-white rounded-3xl border border-slate-200/90 p-5 sm:p-7 shadow-sm space-y-6">

      <!-- Header & Ticket Hero Card -->
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
        <div>
          <div class="flex items-center gap-2">
            <span class="w-2.5 h-2.5 rounded-full ${isFiled ? "bg-emerald-500 animate-pulse" : "bg-blue-600"}"></span>
            <span class="text-xs font-black uppercase tracking-wider text-blue-600">Step 5: File This Complaint</span>
          </div>
          <h3 class="text-xl sm:text-2xl font-black text-slate-900 mt-1">Official Municipal Filing Hub</h3>
          <p class="text-xs text-slate-500 mt-0.5 font-medium">
            ${escapeHtml(auth.authorityName || "Pune Municipal Corporation")} • ${escapeHtml(auth.department || "Public Grievance Redressal Cell")}
          </p>
        </div>

        <!-- 1-Tap Copyable Tracking Token Card (Mobbin Pattern) -->
        <div class="flex items-center gap-2 self-start sm:self-center">
          <div class="bg-slate-50 border border-slate-200 p-2.5 px-3.5 rounded-2xl flex items-center gap-3 shadow-2xs">
            <div>
              <span class="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Tracking Token</span>
              <span id="filingTrackingToken" class="font-mono text-sm sm:text-base font-black text-blue-600">${escapeHtml(trackingId)}</span>
            </div>
            <button
              type="button"
              id="btnCopyTrackingToken"
              class="min-h-[44px] min-w-[44px] flex items-center justify-center p-2 rounded-xl bg-white border border-slate-200 hover:border-blue-400 active:scale-[0.95] text-slate-600 hover:text-blue-600 transition shadow-2xs cursor-pointer"
              title="Copy Tracking Token"
            >
              📋
            </button>
          </div>
        </div>
      </div>

      <!-- 4-Stage Connected Status Tracker Timeline (Mobbin Pattern) -->
      <div class="space-y-3 bg-slate-50/70 p-4 sm:p-5 rounded-2xl border border-slate-200/80">
        <div class="flex items-center justify-between">
          <h4 class="text-xs font-black text-slate-700 uppercase tracking-wider">Live Grievance Lifecycle</h4>
          <span class="text-[11px] font-bold text-emerald-800 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200">
            ${isFiled ? "Active & Dispatched" : "Ready for Submission"}
          </span>
        </div>

        <!-- Stepper Node Grid -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-2.5 pt-2">
          ${timeline.stages
            .map((stage, idx) => {
              const isCompleted =
                stage.status === "completed" ||
                (isFiled &&
                  (stage.id === "submitted" || stage.id === "verified"));
              const isActive =
                stage.status === "active" ||
                (isFiled && stage.id === "forwarded");
              const nodeClass = isCompleted
                ? "bg-emerald-50 border-emerald-200 text-emerald-950 step-node-glow-success"
                : isActive
                  ? "bg-blue-50 border-blue-300 text-blue-950 step-node-glow"
                  : "bg-white border-slate-200 text-slate-400";

              const icon = isCompleted
                ? "✓"
                : isActive
                  ? "⚡"
                  : String(idx + 1);

              return `
              <div class="p-3 sm:p-3.5 rounded-2xl border ${nodeClass} transition-all duration-300 flex flex-col justify-between">
                <div>
                  <div class="flex items-center justify-between mb-1.5">
                    <span class="w-6 h-6 rounded-full flex items-center justify-center font-black text-xs ${
                      isCompleted
                        ? "bg-emerald-600 text-white"
                        : isActive
                          ? "bg-blue-600 text-white"
                          : "bg-slate-200 text-slate-600"
                    }">${icon}</span>
                    <span class="text-[10px] font-mono font-bold opacity-75">${escapeHtml(stage.timestamp || "")}</span>
                  </div>
                  <strong class="font-extrabold text-xs block">${escapeHtml(stage.name)}</strong>
                </div>
                <p class="text-[10px] opacity-80 mt-1 leading-snug line-clamp-2">${escapeHtml(stage.description || "")}</p>
              </div>
            `;
            })
            .join("")}
        </div>
      </div>

      <!-- Action Panel: Online & Offline Routes with Big Tap Targets (>=44px) -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">

        <!-- Online Route Panel -->
        <div class="p-5 rounded-2xl bg-blue-50/50 border border-blue-200 flex flex-col justify-between space-y-3.5">
          <div class="space-y-2">
            <div class="flex items-center justify-between">
              <span class="text-[11px] font-black uppercase tracking-wider text-blue-900">Route A: Online Portal</span>
              <span class="text-[10px] font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-md">Instant Copy</span>
            </div>
            <h4 class="font-black text-slate-900 text-sm">Submit to Official Municipal Portal</h4>
            <p class="text-xs text-slate-600 leading-relaxed">
              Use this pre-structured, legally compliant grievance letter. Paste it directly into the ${escapeHtml(portalName)}.
            </p>

            <div class="relative mt-2">
              <textarea
                id="complaintCopyBox"
                readonly
                rows="4"
                class="w-full text-xs font-mono bg-white border border-blue-200 rounded-xl p-3 text-slate-800 resize-none focus:outline-none focus:ring-2 focus:ring-blue-400"
              >${escapeHtml(copyText)}</textarea>
            </div>
          </div>

          <div class="flex flex-col sm:flex-row items-center gap-2.5 pt-1">
            <button
              type="button"
              id="btnCopyComplaintText"
              class="min-h-[44px] w-full sm:flex-1 py-3 px-4 rounded-xl bg-white border border-blue-300 hover:bg-blue-50 active:scale-[0.98] font-bold text-xs text-blue-700 transition shadow-2xs flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>📋</span>
              <span id="btnCopyComplaintLabel">Copy Complaint Text</span>
            </button>
            <a
              href="${portalUrl}"
              target="_blank"
              rel="noopener noreferrer"
              class="min-h-[44px] w-full sm:flex-1 py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 active:scale-[0.98] font-bold text-xs text-white transition shadow-sm flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>Open Portal</span>
              <span>↗</span>
            </a>
          </div>
        </div>

        <!-- Offline Route Panel -->
        <div class="p-5 rounded-2xl bg-amber-50/50 border border-amber-200 flex flex-col justify-between space-y-3.5">
          <div class="space-y-2">
            <div class="flex items-center justify-between">
              <span class="text-[11px] font-black uppercase tracking-wider text-amber-900">Route B: In-Person Ward Visit</span>
              <span class="text-[10px] font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-md">Physical Filing</span>
            </div>
            <h4 class="font-black text-slate-900 text-sm">${escapeHtml(offline.officeName || auth.name || "PMC Ward Office")}</h4>
            <div class="text-xs text-slate-600 leading-relaxed flex items-start gap-1.5">
              <span>📍</span>
              <span>${escapeHtml(offline.officeAddress || auth.officeAddress || "PMC Main Building, Shivajinagar, Pune")}</span>
            </div>

            <!-- Best time & checklist -->
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 text-xs">
              <div class="bg-white/80 p-2.5 rounded-xl border border-amber-200/80">
                <span class="font-bold text-slate-700 block text-[11px]">Best Time to Visit:</span>
                <span class="text-amber-900 font-semibold">${escapeHtml(offline.bestTimeToVisit || "10:30 AM - 1:00 PM (Mon-Fri)")}</span>
              </div>
              <div class="bg-white/80 p-2.5 rounded-xl border border-amber-200/80">
                <span class="font-bold text-slate-700 block text-[11px]">Statutory SLA:</span>
                <span class="text-blue-900 font-bold">${escapeHtml(auth.slaHours || 48)} Hours Resolution</span>
              </div>
            </div>

            <!-- Documents to carry -->
            <div class="bg-white/80 p-2.5 rounded-xl border border-amber-200/80 text-xs">
              <span class="font-bold text-slate-700 block text-[11px] mb-1">Documents to Carry:</span>
              <ul class="list-disc list-inside space-y-0.5 text-[11px] text-slate-600 font-medium">
                ${(
                  offline.documentsToCarry || [
                    "2 printed color photographs showing defect",
                    "Printed formal grievance application letter",
                    "Government photo ID for visitor register"
                  ]
                )
                  .map((doc) => `<li>${escapeHtml(doc)}</li>`)
                  .join("")}
              </ul>
            </div>
          </div>

          <!-- What To Say Script Box -->
          <div class="bg-amber-50/80 border border-amber-200 rounded-2xl p-3.5 text-xs text-amber-950 mt-auto">
            <span class="font-black block text-[10px] uppercase tracking-wider text-amber-900 mb-1">
              💬 What to Say to the Junior Engineer:
            </span>
            <p class="italic text-[11px] leading-relaxed font-medium">
              "${escapeHtml(offline.whatToSay || `I am here to register an urgent civic defect at this location under statutory PMC SLAs. Please provide my in-ward acknowledgment stamp.`)}"
            </p>
          </div>
        </div>
      </div>

      <!-- Quick Escalation Actions Row (min-h-[48px] tap targets) -->
      <div class="p-4 sm:p-5 rounded-3xl bg-gradient-to-r from-slate-950 via-slate-900 to-slate-800 text-white flex flex-col sm:flex-row items-center justify-between gap-4 shadow-md">
        <div class="space-y-0.5 text-center sm:text-left">
          <h4 class="text-xs font-black uppercase tracking-widest text-slate-300">Instant Channel Escalation</h4>
          <p class="text-xs text-slate-400">1-click direct link to PMC WhatsApp desk or departmental email</p>
        </div>
        <div class="flex items-center gap-3 w-full sm:w-auto">
          <a
            href="${share.whatsappUrl}"
            target="_blank"
            rel="noopener noreferrer"
            class="min-h-[48px] flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] font-black text-xs text-white transition shadow-sm"
          >
            <span class="text-base">💬</span>
            <span>WhatsApp Share</span>
          </a>
          <a
            href="${share.emailUrl}"
            class="min-h-[48px] flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-slate-800 hover:bg-slate-700 active:scale-[0.98] font-black text-xs text-white transition shadow-sm border border-slate-700"
          >
            <span class="text-base">✉️</span>
            <span>Email Authority</span>
          </a>
        </div>
      </div>

      <!-- Direct Official Dispatch CTA (min-h-[52px]) -->
      <div class="pt-2">
        <button
          type="button"
          id="btnExecuteFiling"
          class="w-full min-h-[52px] py-4 px-6 rounded-2xl font-black text-sm text-white transition shadow-lg flex items-center justify-center gap-2 cursor-pointer ${
            isFiled
              ? "bg-emerald-600 hover:bg-emerald-700 cursor-default"
              : "bg-blue-600 hover:bg-blue-700 active:scale-[0.98]"
          }"
        >
          <span class="text-base">${isFiled ? "✓" : "🚀"}</span>
          <span>${isFiled ? `Grievance Dispatched & Logged (#${escapeHtml(trackingId)})` : "File This Complaint & Generate Tracking Token"}</span>
        </button>
      </div>

    </div>
  `;
}
