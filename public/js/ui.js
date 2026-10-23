/**
 * Renders the dedicated "File this complaint" step panel after the action plan.
 * Displays Mobbin-grade status tracker timeline, token copy card, online/offline routes,
 * and high-contrast touch targets.
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

      <!-- Header & Ticket Hero Card -->
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
        <div>
          <div class="flex items-center gap-2">
            <span class="w-2.5 h-2.5 rounded-full ${isFiled ? 'bg-emerald-500 animate-pulse' : 'bg-blue-600'}"></span>
            <span class="text-xs font-black uppercase tracking-wider text-blue-600">Step 5: File & Track</span>
          </div>
          <h3 class="text-xl sm:text-2xl font-black text-slate-900 mt-1">Official Grievance Dispatch Hub</h3>
          <p class="text-xs text-slate-500 mt-0.5 font-medium">
            ${escapeHtml(auth.authorityName || "Pune Municipal Corporation")} • ${escapeHtml(auth.department || "Public Grievance Cell")}
          </p>
        </div>

        <!-- 1-Tap Copyable Tracking Token Card (Mobbin Pattern) -->
        <div class="flex items-center gap-2 self-start sm:self-center">
          <div class="bg-blue-50/80 border border-blue-200 p-2 sm:p-2.5 rounded-2xl flex items-center gap-3 shadow-xs">
            <div>
              <span class="text-[9px] font-extrabold text-blue-600 uppercase tracking-widest block">Reference Token</span>
              <span id="filingTrackingToken" class="font-mono text-sm sm:text-base font-black text-blue-900">${escapeHtml(trackingId)}</span>
            </div>
            <button
              type="button"
              id="btnCopyTrackingToken"
              class="min-h-[40px] px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-bold text-xs transition flex items-center gap-1.5 shadow-sm cursor-pointer"
              title="Copy tracking token"
              data-token="${escapeHtml(trackingId)}"
            >
              <span>📋</span>
              <span id="copyTokenLabel">Copy</span>
            </button>
          </div>
        </div>
      </div>

      <!-- Connected Stepper Status Tracker (Mobbin Pattern) -->
      <div class="space-y-3.5 bg-slate-50/80 p-4 sm:p-6 rounded-3xl border border-slate-200">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span class="text-sm">📍</span>
            <h4 class="text-xs font-black text-slate-800 uppercase tracking-wider">Live Municipal Status Tracker</h4>
          </div>
          <span class="text-[11px] font-bold text-emerald-800 bg-emerald-100 px-3 py-1 rounded-full border border-emerald-200">
            ${isFiled ? 'Active & Dispatched' : 'Ready for Submission'}
          </span>
        </div>

        <!-- Stepper Nodes Grid with connecting line -->
        <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 pt-2">
          ${timeline.stages.map((stage, idx) => {
            const isCompleted = stage.status === "completed" || (isFiled && (stage.id === "submitted" || stage.id === "verified"));
            const isActive = stage.status === "active" || (isFiled && stage.id === "forwarded");

            const cardStyle = isCompleted
              ? "bg-emerald-50/90 border-emerald-200 text-emerald-900"
              : isActive
              ? "bg-blue-50 border-blue-300 text-blue-950 ring-2 ring-blue-500/30"
              : "bg-white border-slate-200 text-slate-500";

            const nodeIcon = isCompleted
              ? "✓"
              : isActive
              ? "⚡"
              : `${idx + 1}`;

            const nodeBg = isCompleted
              ? "bg-emerald-500 text-white step-node-glow-success"
              : isActive
              ? "bg-blue-600 text-white animate-pulse step-node-glow"
              : "bg-slate-200 text-slate-600";

            return `
              <div class="p-3.5 rounded-2xl border ${cardStyle} flex flex-col justify-between transition shadow-xs">
                <div class="flex items-center justify-between gap-1 mb-2">
                  <span class="w-6 h-6 rounded-full flex items-center justify-center font-black text-xs ${nodeBg}">
                    ${nodeIcon}
                  </span>
                  <span class="text-[10px] font-mono text-slate-500 font-bold px-2 py-0.5 rounded-full bg-white/80 border border-slate-100">
                    ${escapeHtml(stage.timestamp)}
                  </span>
                </div>
                <div>
                  <span class="font-extrabold text-slate-900 block text-xs sm:text-sm">${escapeHtml(stage.name)}</span>
                  <span class="text-[11px] text-slate-600 line-clamp-2 mt-0.5 leading-snug">${escapeHtml(stage.description)}</span>
                </div>
              </div>
            `;
          }).join("")}
        </div>
      </div>

      <!-- Two-Column Routes Grid: Online vs Offline (With big tap targets) -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-5 pt-1">

        <!-- Online Route Panel -->
        <div class="space-y-3.5 p-4 sm:p-6 rounded-3xl bg-white border border-slate-200 shadow-sm flex flex-col">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span class="text-lg">🌐</span>
              <h4 class="text-sm font-extrabold text-slate-900">Online Submission Route</h4>
            </div>
            <span class="text-[10px] font-black px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 font-mono border border-blue-100">Official Portal</span>
          </div>

          <p class="text-xs text-slate-600 leading-relaxed font-medium">
            Pre-formatted formal grievance ready to paste into the municipal portal:
          </p>

          <textarea
            id="filingCopyReadyText"
            rows="6"
            readonly
            class="w-full text-xs font-mono p-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-slate-800 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 leading-relaxed"
          >${copyText}</textarea>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1 mt-auto">
            <button
              type="button"
              id="btnCopyComplaintText"
              class="min-h-[44px] flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 active:scale-[0.98] text-slate-800 text-xs font-bold transition cursor-pointer shadow-xs"
            >
              <span id="copyGrievanceIcon">📋</span>
              <span id="copyGrievanceText">Copy Text</span>
            </button>
            <a
              href="${portalUrl}"
              target="_blank"
              rel="noopener noreferrer"
              class="min-h-[44px] flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white text-xs font-bold transition shadow-sm text-center cursor-pointer"
            >
              <span>Open Portal</span>
              <span>↗</span>
            </a>
          </div>
        </div>

        <!-- Offline Route Panel -->
        <div class="space-y-3.5 p-4 sm:p-6 rounded-3xl bg-white border border-slate-200 shadow-sm flex flex-col">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span class="text-lg">🏢</span>
              <h4 class="text-sm font-extrabold text-slate-900">Ward Office Walk-In Blueprint</h4>
            </div>
            <span class="text-[10px] font-black px-2.5 py-1 rounded-full bg-amber-50 text-amber-800 font-mono border border-amber-100">In-Person</span>
          </div>

          <div class="text-xs space-y-3 text-slate-700 bg-slate-50/80 p-4 rounded-2xl border border-slate-200/90">
            <div>
              <span class="font-extrabold text-slate-900 block text-[11px] uppercase tracking-wider text-slate-400">Office Location</span>
              <span class="font-bold text-slate-800 block text-xs mt-0.5">${escapeHtml(offline.officeName || auth.name)}</span>
              <span class="text-[11px] text-slate-500 block mt-0.5">${escapeHtml(offline.officeAddress || auth.officeAddress || "PMC Main Building, Shivajinagar, Pune")}</span>
            </div>

            <div class="pt-2 border-t border-slate-200">
              <span class="font-extrabold text-slate-900 block text-[11px] uppercase tracking-wider text-slate-400">Visiting Hours</span>
              <span class="text-emerald-700 font-extrabold block text-xs mt-0.5">${escapeHtml(offline.bestTimeToVisit || "10:30 AM - 1:00 PM (Monday to Friday)")}</span>
            </div>

            <div class="pt-2 border-t border-slate-200">
              <span class="font-extrabold text-slate-900 block text-[11px] uppercase tracking-wider text-slate-400">Documents Checklist</span>
              <ul class="list-disc list-inside mt-1 space-y-1 text-[11px] text-slate-600">
                ${(offline.documentsToCarry || [
                  "2 printed photographs showing defect with identifiable landmark",
                  "Printed grievance application letter addressed to Ward Officer",
                  "Government photo ID for visitor register"
                ]).map((doc) => `<li>${escapeHtml(doc)}</li>`).join("")}
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
              ? 'bg-emerald-600 hover:bg-emerald-700 cursor-default'
              : 'bg-blue-600 hover:bg-blue-700 active:scale-[0.98]'
          }"
        >
          <span class="text-base">${isFiled ? '✓' : '🚀'}</span>
          <span>${isFiled ? `Grievance Dispatched & Logged (#${escapeHtml(trackingId)})` : 'File This Complaint & Generate Tracking Token'}</span>
        </button>
      </div>

    </div>
  `;
}
