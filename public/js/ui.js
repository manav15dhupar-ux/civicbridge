/**
 * @fileoverview UI Component Renderer and View Controller for CivicBridge.
 * Implements Mobbin-grade mobile-first design patterns, cards, drawers, and modal workflows.
 */

/**
 * Severity configuration styling.
 */
const SEVERITY_CONFIG = {
  1: { label: "1 - Low", color: "bg-slate-100 text-slate-700 border-slate-300", dot: "bg-slate-400" },
  2: { label: "2 - Minor", color: "bg-blue-50 text-blue-700 border-blue-300", dot: "bg-blue-500" },
  3: { label: "3 - Moderate", color: "bg-amber-50 text-amber-700 border-amber-300", dot: "bg-amber-500" },
  4: { label: "4 - High Hazard", color: "bg-orange-50 text-orange-700 border-orange-300", dot: "bg-orange-500" },
  5: { label: "5 - Critical Emergency", color: "bg-rose-50 text-rose-700 border-rose-300", dot: "bg-rose-600 animate-pulse" }
};

/**
 * Displays a non-intrusive toast notification.
 * @param {string} message - Message text.
 * @param {"success"|"error"|"info"|"warning"} [type="info"] - Toast category.
 */
export function showToast(message, type = "info") {
  const container = document.getElementById("toastContainer");
  if (!container) return;

  const bgColors = {
    success: "bg-emerald-900/90 text-white border-emerald-700",
    error: "bg-rose-900/90 text-white border-rose-700",
    warning: "bg-amber-900/90 text-white border-amber-700",
    info: "bg-slate-900/90 text-white border-slate-700"
  };

  const icons = {
    success: "✓",
    error: "✕",
    warning: "⚠",
    info: "ℹ"
  };

  const toast = document.createElement("div");
  toast.className = `flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-lg border backdrop-blur text-sm font-medium transition-all duration-300 transform translate-y-2 opacity-0 ${bgColors[type] || bgColors.info}`;
  toast.innerHTML = `
    <span class="font-bold text-base leading-none">${icons[type] || "ℹ"}</span>
    <span class="flex-1">${message}</span>
  `;

  container.appendChild(toast);

  // Animate in
  requestAnimationFrame(() => {
    toast.classList.remove("translate-y-2", "opacity-0");
    toast.classList.add("translate-y-0", "opacity-100");
  });

  // Auto remove after 3.5s
  setTimeout(() => {
    toast.classList.add("opacity-0", "translate-y-2");
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

/**
 * Renders the Gemini structured complaint card.
 * @param {object} report - Structured report.
 * @returns {string} HTML string.
 */
export function renderStructuredCard(report) {
  const sev = SEVERITY_CONFIG[report.severity] || SEVERITY_CONFIG[3];

  return `
    <div class="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm space-y-4">
      <div class="flex items-start justify-between gap-3">
        <div>
          <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
            <span class="w-1.5 h-1.5 rounded-full bg-blue-600"></span>
            ${report.category}
          </span>
          <h3 class="text-lg font-bold text-slate-900 mt-2">${report.subcategory || report.category}</h3>
        </div>
        <div class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold ${sev.color}">
          <span class="w-2 h-2 rounded-full ${sev.dot}"></span>
          ${sev.label}
        </div>
      </div>

      <p class="text-sm text-slate-700 leading-relaxed bg-slate-50/70 p-3.5 rounded-xl border border-slate-100">
        ${report.description}
      </p>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 text-xs">
        <div class="flex items-start gap-2 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
          <span class="text-slate-400 font-bold text-sm">📍</span>
          <div>
            <span class="font-semibold text-slate-800 block">Identified Location</span>
            <span class="text-slate-600">${report.location_text}</span>
            <span class="text-[11px] text-slate-400 font-mono block mt-0.5">${report.lat?.toFixed(4)}, ${report.lng?.toFixed(4)}</span>
          </div>
        </div>
        <div class="flex items-start gap-2 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
          <span class="text-slate-400 font-bold text-sm">🏛️</span>
          <div>
            <span class="font-semibold text-slate-800 block">Responsible Department</span>
            <span class="text-slate-600">${report.responsible_authority}</span>
            <span class="text-[11px] text-emerald-600 font-semibold block mt-0.5">Confidence: ${Math.round((report.confidence || 0.95) * 100)}%</span>
          </div>
        </div>
      </div>

      <div class="space-y-2 pt-1">
        <div class="text-xs">
          <span class="font-bold text-rose-700 uppercase tracking-wide text-[10px]">Urgency Justification</span>
          <p class="text-slate-600 mt-0.5">${report.urgency_reason}</p>
        </div>
        <div class="text-xs">
          <span class="font-bold text-slate-700 uppercase tracking-wide text-[10px]">Evidence Synthesis</span>
          <p class="text-slate-500 mt-0.5">${report.evidence_summary}</p>
        </div>
      </div>
    </div>
  `;
}

/**
 * Renders the Verification Engine Results Card.
 * @param {object} verification - Verification results.
 * @returns {string} HTML string.
 */
export function renderVerificationCard(verification) {
  const isHigh = verification.verificationScore >= 88;
  const isMed = verification.verificationScore >= 70 && verification.verificationScore < 88;

  const scoreBadgeColor = isHigh
    ? "bg-emerald-500 text-white"
    : isMed
    ? "bg-blue-600 text-white"
    : "bg-amber-500 text-white";

  const matchesHtml = verification.matches && verification.matches.length > 0
    ? `
      <div class="mt-3 pt-3 border-t border-slate-100 space-y-2">
        <span class="text-xs font-bold text-slate-700 uppercase tracking-wide block">
          Matching Civic Complaints Within 200m (${verification.matches.length})
        </span>
        <div class="space-y-2 max-h-48 overflow-y-auto pr-1">
          ${verification.matches.map((m) => `
            <div class="p-2.5 rounded-xl border border-slate-200/90 bg-slate-50/60 flex items-center justify-between text-xs hover:bg-white transition">
              <div>
                <div class="font-bold text-slate-800 flex items-center gap-1.5">
                  <span>${m.subcategory || m.category}</span>
                  <span class="font-mono text-[10px] text-slate-400">#${m.trackingId}</span>
                </div>
                <div class="text-slate-500 text-[11px] mt-0.5">
                  📍 ${m.distanceMeters}m away • ${m.reporters} citizen(s) reported
                </div>
              </div>
              <span class="px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                m.status === 'Resolved' ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'
              }">
                ${m.status}
              </span>
            </div>
          `).join("")}
        </div>
      </div>
    `
    : `
      <div class="mt-2 text-xs text-slate-500 bg-slate-50 p-2.5 rounded-lg border border-slate-100 flex items-center gap-2">
        <span>🌱</span>
        <span>First recorded grievance in this 200m zone. Geocoded and ready for municipal dispatch.</span>
      </div>
    `;

  return `
    <div class="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm space-y-4">
      <div class="flex items-center justify-between gap-3">
        <div>
          <span class="text-xs font-bold text-slate-400 uppercase tracking-wider block">Civic Verification</span>
          <h3 class="text-base font-bold text-slate-900 mt-0.5">Community & Spatial Cross-Check</h3>
        </div>
        <div class="text-right">
          <div class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ${scoreBadgeColor}">
            ${verification.verificationScore}% Verified
          </div>
          <div class="text-[10px] text-slate-500 mt-0.5">${verification.verificationLabel}</div>
        </div>
      </div>

      <!-- Reporter Consensus Banner -->
      <div class="p-3.5 rounded-xl ${verification.otherReportersCount > 0 ? 'bg-amber-50 border border-amber-200' : 'bg-blue-50 border border-blue-200'} flex items-center gap-3">
        <div class="w-10 h-10 rounded-full ${verification.otherReportersCount > 0 ? 'bg-amber-500 text-white' : 'bg-blue-600 text-white'} flex items-center justify-center font-bold text-base flex-shrink-0">
          ${verification.otherReportersCount > 0 ? verification.otherReportersCount : "1"}
        </div>
        <div class="text-xs">
          <span class="font-bold text-slate-900 block text-sm">
            ${verification.otherReportersCount > 0
              ? `${verification.otherReportersCount} other citizens reported this issue nearby`
              : "Single-source new incident report"}
          </span>
          <span class="text-slate-600">${verification.reason}</span>
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
    <div class="bg-gradient-to-br from-slate-900 to-slate-800 text-white rounded-2xl p-5 shadow-md space-y-4">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <div class="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center justify-center font-bold text-base">
            🛡️
          </div>
          <div>
            <h3 class="text-sm font-bold text-white">CivicBridge Privacy Shield</h3>
            <span class="text-[11px] text-slate-300">Statutory PII Redaction & Zero-Retention Memory</span>
          </div>
        </div>
        <span class="px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-xs font-semibold">
          Active
        </span>
      </div>

      <div class="grid grid-cols-2 gap-2 text-xs">
        <div class="bg-white/5 border border-white/10 rounded-xl p-2.5">
          <span class="text-slate-400 block text-[11px]">Identities Protected</span>
          <span class="text-white font-bold text-base mt-0.5 block">${logs.length} Entities</span>
        </div>
        <div class="bg-white/5 border border-white/10 rounded-xl p-2.5">
          <span class="text-slate-400 block text-[11px]">Raw Media Stored</span>
          <span class="text-emerald-400 font-bold text-base mt-0.5 block">0 Bytes (Zero Retention)</span>
        </div>
      </div>

      ${logs.length > 0 ? `
        <div class="space-y-1.5 pt-1">
          <span class="text-[11px] font-bold text-slate-300 uppercase tracking-wider block">Redaction Audit Trail</span>
          <div class="space-y-1.5 max-h-36 overflow-y-auto pr-1">
            ${logs.map((item) => `
              <div class="text-xs bg-white/5 rounded-lg p-2 border border-white/10 flex items-center justify-between">
                <div>
                  <span class="text-[10px] text-slate-400 uppercase tracking-wide block">${item.type}</span>
                  <span class="font-mono text-emerald-300 text-[11px]">${item.masked}</span>
                </div>
                <span class="text-[10px] text-slate-400">Scrubbed</span>
              </div>
            `).join("")}
          </div>
        </div>
      ` : `
        <div class="text-xs text-slate-300 bg-white/5 p-2.5 rounded-lg border border-white/10 flex items-center gap-2">
          <span>✓</span>
          <span>No sensitive phone numbers, Aadhaar cards, or personal names detected in complaint text.</span>
        </div>
      `}

      <div class="text-[11px] text-slate-400 flex items-center gap-1.5 pt-1 border-t border-white/10">
        <span>🔒</span>
        <span>Compliant with Digital Personal Data Protection Act (DPDPA 2023).</span>
      </div>
    </div>
  `;
}

/**
 * Renders the Action Plan & Filing Blueprint Card.
 * @param {object} actionPlan - Generated action plan.
 * @returns {string} HTML string.
 */
export function renderActionPlanCard(actionPlan) {
  const auth = actionPlan.authority;
  const timeline = actionPlan.expectedTimeline;

  return `
    <div class="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm space-y-5">
      <div>
        <span class="text-xs font-bold text-slate-400 uppercase tracking-wider block">Action Plan</span>
        <h3 class="text-lg font-bold text-slate-900 mt-0.5">Municipal Resolution Roadmap</h3>
      </div>

      <!-- Authority Header Card -->
      <div class="p-4 rounded-xl bg-slate-50 border border-slate-200/90 space-y-3">
        <div class="flex items-start justify-between gap-2">
          <div>
            <span class="text-[10px] font-bold uppercase tracking-wider text-slate-500">Responsible Public Body</span>
            <h4 class="font-bold text-slate-900 text-sm mt-0.5">${auth.name}</h4>
            <div class="text-xs text-slate-500 font-medium">${auth.marathiName || ""}</div>
          </div>
          <span class="px-2.5 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-800 flex-shrink-0">
            SLA: ${timeline.slaHours}h
          </span>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs pt-1 border-t border-slate-200">
          <a href="tel:${auth.helpline.replace(/[^0-9]/g, '')}" class="flex items-center gap-2 p-2 rounded-lg bg-white border border-slate-200 hover:border-blue-400 transition text-slate-700">
            <span>📞</span>
            <span class="truncate">Helpline: <strong class="font-bold">${auth.helpline}</strong></span>
          </a>
          <a href="https://wa.me/${auth.whatsapp ? auth.whatsapp.replace(/[^0-9]/g, '') : '919689900002'}" target="_blank" rel="noopener noreferrer" class="flex items-center gap-2 p-2 rounded-lg bg-white border border-slate-200 hover:border-emerald-400 transition text-slate-700">
            <span>💬</span>
            <span class="truncate">WhatsApp: <strong class="font-bold">${auth.whatsapp || "+91 96899 00002"}</strong></span>
          </a>
        </div>
      </div>

      <!-- 4-Phase Roadmap -->
      <div class="space-y-3">
        <h4 class="text-xs font-bold text-slate-700 uppercase tracking-wide">What Will Happen (4 Stages)</h4>
        <div class="space-y-2">
          ${actionPlan.phases.map((phase) => `
            <div class="flex items-start gap-3 p-3 rounded-xl bg-slate-50/70 border border-slate-100">
              <div class="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-xs flex-shrink-0 mt-0.5">
                ${phase.step}
              </div>
              <div class="text-xs">
                <span class="font-bold text-slate-900 block">${phase.title}</span>
                <span class="text-slate-600 mt-0.5 block leading-relaxed">${phase.description}</span>
              </div>
            </div>
          `).join("")}
        </div>
      </div>

      <!-- Online Steps Accordion -->
      <div class="space-y-2 pt-1">
        <h4 class="text-xs font-bold text-slate-700 uppercase tracking-wide">File Online Directly</h4>
        <ol class="list-decimal list-inside space-y-1 text-xs text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-100">
          ${actionPlan.onlineFilingSteps.map((step) => `<li class="leading-relaxed">${step}</li>`).join("")}
        </ol>
        <div class="pt-1">
          <a href="${auth.portalUrl}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-800">
            <span>Open ${auth.portalName}</span>
            <span>↗</span>
          </a>
        </div>
      </div>

      <!-- Offline Ward Office Details -->
      <div class="space-y-2 pt-1 border-t border-slate-100">
        <h4 class="text-xs font-bold text-slate-700 uppercase tracking-wide">Offline Office Visit Blueprint</h4>
        <div class="bg-slate-50 p-3.5 rounded-xl border border-slate-100 text-xs space-y-2">
          <div>
            <span class="font-bold text-slate-800 block">PMC Head Office</span>
            <span class="text-slate-600">${actionPlan.offlineOfficeDetails.headOffice || "PMC Main Building, Shivajinagar, Pune"}</span>
          </div>
          <div>
            <span class="font-bold text-slate-800 block">Timings & Operating Hours</span>
            <span class="text-slate-600">${actionPlan.offlineOfficeDetails.timings || "10:00 AM - 5:30 PM (Mon-Fri)"}</span>
          </div>
          <div>
            <span class="font-bold text-slate-800 block">Documents to Carry</span>
            <ul class="list-disc list-inside text-slate-600 mt-0.5 space-y-0.5">
              ${(actionPlan.offlineOfficeDetails.documentsToCarry || [
                "2 printed photographs of defect",
                "Application letter addressed to Ward Officer"
              ]).map((doc) => `<li>${doc}</li>`).join("")}
            </ul>
          </div>
        </div>
      </div>

      <!-- Community Impact Callout -->
      <div class="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-950 flex items-start gap-2.5">
        <span class="text-emerald-700 text-sm">🌱</span>
        <div>
          <span class="font-bold block">How Your Report Helps Pune</span>
          <span class="text-emerald-800 mt-0.5 block leading-relaxed">${actionPlan.communityImpact}</span>
        </div>
      </div>

      <!-- Primary Action Buttons -->
      <div class="pt-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <button id="btnOpenLetterModal" class="flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-bold text-xs bg-slate-900 text-white hover:bg-slate-800 active:scale-[0.99] transition shadow-sm">
          <span>📝</span>
          <span>Draft Complaint Letter</span>
        </button>
        <a href="#fileComplaintSlot" class="flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-bold text-xs bg-blue-600 text-white hover:bg-blue-700 active:scale-[0.99] transition shadow-sm text-center">
          <span>🚀</span>
          <span>Proceed to File It ↓</span>
        </a>
      </div>
    </div>
  `;
}

/**
 * Renders the dedicated "File this complaint" step panel after the action plan.
 * Displays online route (copy-ready text + portal button), offline route
 * (office name, documents, best time, what to say), WhatsApp/Email share,
 * and 4-stage status timeline (Submitted -> Verified -> Forwarded -> Resolved).
 * @param {object} data - Filing data payload.
 * @returns {string} HTML string.
 */
export function renderFileComplaintPanel(data) {
  const auth = data.authority || {};
  const timeline = data.statusTimeline || {
    currentStage: "Forwarded",
    stages: [
      { id: "submitted", name: "Submitted", status: "completed", timestamp: "Completed", description: "Complaint registered" },
      { id: "verified", name: "Verified", status: "completed", timestamp: "Completed", description: "AI & spatial verified" },
      { id: "forwarded", name: "Forwarded", status: "active", timestamp: "In Progress", description: "Dispatched to Ward Junior Engineer" },
      { id: "resolved", name: "Resolved", status: "pending", timestamp: `Within ${auth.slaHours || 48}h`, description: "Resolution verification & sign-off" }
    ]
  };

  const offline = data.offlineRoute || data.offlineGuide || auth.offlineGuide || {
    officeName: auth.name,
    officeAddress: auth.officeAddress || "PMC Main Building, Shivajinagar, Pune",
    documentsToCarry: [
      "2 printed color photographs of defect",
      "Formal grievance application letter",
      "Government photo ID for visitor register"
    ],
    bestTimeToVisit: "10:30 AM - 1:00 PM (Monday to Friday)",
    whatToSay: "I am registering an urgent civic defect at this location under statutory PMC SLAs."
  };

  const copyText = data.onlineRoute?.copyReadyText || data.copyReadyText || "";
  const portalUrl = auth.portalUrl || "https://complaint.punecorporation.org/";
  const portalName = auth.portalName || "PMC Care Portal";

  const share = data.shareRoutes || data.shareLinks || {
    whatsappUrl: `https://wa.me/?text=${encodeURIComponent(copyText)}`,
    emailUrl: `mailto:${auth.email || 'pmccare@punecorporation.org'}?subject=${encodeURIComponent('URGENT: Civic Grievance')}&body=${encodeURIComponent(copyText)}`
  };

  const trackingId = data.trackingId || data.initialTrackingId || "PMC-2026-PENDING";
  const isFiled = Boolean(data.isFiled);

  return `
    <div class="bg-white rounded-3xl border border-slate-200/90 p-5 sm:p-7 shadow-sm space-y-6">

      <!-- Header & Tracking Banner -->
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
        <div>
          <div class="flex items-center gap-2">
            <span class="w-2.5 h-2.5 rounded-full ${isFiled ? 'bg-emerald-500 animate-pulse' : 'bg-blue-600'}"></span>
            <span class="text-xs font-bold uppercase tracking-wider text-blue-600">Step 5: File This Complaint</span>
          </div>
          <h3 class="text-xl font-extrabold text-slate-900 mt-1">Official Municipal Filing Hub</h3>
          <p class="text-xs text-slate-500 mt-0.5">
            ${auth.authorityName || "Pune Municipal Corporation"} • ${auth.department || "Public Grievance Cell"}
          </p>
        </div>
        <div class="flex items-center gap-2 self-start sm:self-center">
          <div class="bg-slate-50 border border-slate-200 px-3.5 py-1.5 rounded-xl text-right">
            <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wide block">Tracking Token</span>
            <span id="filingTrackingToken" class="font-mono text-sm font-extrabold text-blue-600">${trackingId}</span>
          </div>
        </div>
      </div>

      <!-- 4-Stage Status Timeline: Submitted -> Verified -> Forwarded -> Resolved -->
      <div class="space-y-3 bg-slate-50/70 p-4 rounded-2xl border border-slate-200/80">
        <div class="flex items-center justify-between">
          <h4 class="text-xs font-bold text-slate-700 uppercase tracking-wide">Live Grievance Lifecycle</h4>
          <span class="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
            ${isFiled ? 'Active & Dispatched' : 'Ready for Submission'}
          </span>
        </div>

        <div class="grid grid-cols-2 md:grid-cols-4 gap-2 pt-1">
          ${timeline.stages.map((stage, idx) => {
            const isCompleted = stage.status === "completed" || (isFiled && (stage.id === "submitted" || stage.id === "verified"));
            const isActive = stage.status === "active" || (isFiled && stage.id === "forwarded");
            const badgeClass = isCompleted
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : isActive
              ? "bg-blue-50 border-blue-300 text-blue-800 ring-2 ring-blue-500/20"
              : "bg-white border-slate-200 text-slate-400";

            const icon = isCompleted
              ? "✓"
              : isActive
              ? "⚡"
              : `${idx + 1}`;

            return `
              <div class="p-3 rounded-xl border ${badgeClass} text-xs flex flex-col justify-between transition">
                <div class="flex items-center justify-between gap-1 mb-1.5">
                  <span class="w-5 h-5 rounded-full flex items-center justify-center font-bold text-[11px] ${
                    isCompleted ? 'bg-emerald-500 text-white' : isActive ? 'bg-blue-600 text-white animate-pulse' : 'bg-slate-200 text-slate-600'
                  }">
                    ${icon}
                  </span>
                  <span class="text-[10px] font-mono text-slate-500 font-medium">${stage.timestamp}</span>
                </div>
                <div>
                  <span class="font-bold text-slate-900 block text-xs">${stage.name}</span>
                  <span class="text-[11px] text-slate-500 line-clamp-2 mt-0.5 leading-snug">${stage.description}</span>
                </div>
              </div>
            `;
          }).join("")}
        </div>
      </div>

      <!-- Two-Column Routes Grid: Online vs Offline -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-5 pt-1">

        <!-- Online Route Panel -->
        <div class="space-y-3 p-4 sm:p-5 rounded-2xl bg-white border border-slate-200 shadow-sm flex flex-col">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span class="text-base">🌐</span>
              <h4 class="text-sm font-bold text-slate-900">Online Route</h4>
            </div>
            <span class="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-mono">PMC Care Web</span>
          </div>

          <p class="text-xs text-slate-500">
            Use the official municipal grievance portal with this pre-formatted, copy-ready text:
          </p>

          <textarea
            id="filingCopyReadyText"
            rows="6"
            readonly
            class="w-full text-xs font-mono p-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 resize-none focus:outline-none focus:ring-1 focus:ring-blue-500 leading-relaxed"
          >${copyText}</textarea>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 mt-auto">
            <button
              type="button"
              id="btnCopyComplaintText"
              class="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition"
            >
              <span>📋</span>
              <span>Copy Text</span>
            </button>
            <a
              href="${portalUrl}"
              target="_blank"
              rel="noopener noreferrer"
              class="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition shadow-sm text-center"
            >
              <span>Open Portal</span>
              <span>↗</span>
            </a>
          </div>
        </div>

        <!-- Offline Route Panel -->
        <div class="space-y-3 p-4 sm:p-5 rounded-2xl bg-white border border-slate-200 shadow-sm flex flex-col">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span class="text-base">🏢</span>
              <h4 class="text-sm font-bold text-slate-900">Offline Route (Ward Visit)</h4>
            </div>
            <span class="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-50 text-amber-700 font-mono">In-Person</span>
          </div>

          <div class="text-xs space-y-2 text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-200/80">
            <div>
              <span class="font-bold text-slate-900 block text-[11px] uppercase tracking-wide">Office Name & Address</span>
              <span class="font-medium text-slate-800">${offline.officeName || auth.name}</span>
              <span class="text-[11px] text-slate-500 block mt-0.5">${offline.officeAddress || auth.officeAddress || "PMC Main Building, Shivajinagar, Pune"}</span>
            </div>

            <div class="pt-1 border-t border-slate-200">
              <span class="font-bold text-slate-900 block text-[11px] uppercase tracking-wide">Best Time to Visit</span>
              <span class="text-emerald-700 font-semibold">${offline.bestTimeToVisit || "10:30 AM - 1:00 PM (Monday to Friday)"}</span>
            </div>

            <div class="pt-1 border-t border-slate-200">
              <span class="font-bold text-slate-900 block text-[11px] uppercase tracking-wide">What to Carry</span>
              <ul class="list-disc list-inside mt-0.5 space-y-0.5 text-[11px] text-slate-600">
                ${(offline.documentsToCarry || [
                  "2 printed photographs showing defect with identifiable landmark",
                  "Printed grievance application letter addressed to Ward Officer",
                  "Government photo ID for visitor register"
                ]).map((doc) => `<li>${doc}</li>`).join("")}
              </ul>
            </div>
          </div>

          <!-- What To Say Script Box -->
          <div class="bg-amber-50/70 border border-amber-200/90 rounded-xl p-3 text-xs text-amber-950 mt-auto">
            <span class="font-bold block text-[10px] uppercase tracking-wide text-amber-900 mb-1">
              💬 What to Say to the Junior Engineer:
            </span>
            <p class="italic text-[11px] leading-relaxed">
              "${offline.whatToSay || `I am here to register an urgent civic defect at this location under statutory PMC SLAs. Please provide my in-ward acknowledgment stamp.`}"
            </p>
          </div>
        </div>
      </div>

      <!-- WhatsApp & Email Instant Escalation Row -->
      <div class="p-4 rounded-2xl bg-gradient-to-r from-slate-900 to-slate-800 text-white flex flex-col sm:flex-row items-center justify-between gap-4">
        <div class="space-y-0.5 text-center sm:text-left">
          <h4 class="text-xs font-bold uppercase tracking-wider text-slate-300">Prefilled Quick Escalation</h4>
          <p class="text-xs text-slate-400">Share with PMC WhatsApp bot or mail the department desk in 1 click</p>
        </div>
        <div class="flex items-center gap-2.5 w-full sm:w-auto">
          <a
            href="${share.whatsappUrl}"
            target="_blank"
            rel="noopener noreferrer"
            class="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 font-bold text-xs text-white transition shadow-sm"
          >
            <span>💬</span>
            <span>WhatsApp Share</span>
          </a>
          <a
            href="${share.emailUrl}"
            class="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-700 hover:bg-slate-600 font-bold text-xs text-white transition shadow-sm border border-slate-600"
          >
            <span>✉️</span>
            <span>Email Authority</span>
          </a>
        </div>
      </div>

      <!-- Direct Official Dispatch CTA -->
      <div class="pt-2">
        <button
          type="button"
          id="btnExecuteFiling"
          class="w-full py-3.5 px-6 rounded-2xl font-bold text-xs sm:text-sm text-white transition shadow-md flex items-center justify-center gap-2 ${
            isFiled
              ? 'bg-emerald-600 hover:bg-emerald-700 cursor-default'
              : 'bg-blue-600 hover:bg-blue-700 active:scale-[0.99]'
          }"
        >
          <span>${isFiled ? '✓' : '🚀'}</span>
          <span>${isFiled ? `Grievance Filed & Logged (#${trackingId})` : 'File This Complaint & Generate Tracking Token'}</span>
        </button>
      </div>

    </div>
  `;
}
