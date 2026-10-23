/**
 * @fileoverview Main Application Controller for CivicBridge.
 * Orchestrates multilingual citizen input, voice capture, spatial verification,
 * letter drafting, and mock PMC Care dispatch.
 */

import { analyzeComplaint, draftLetter, submitMockGrievance, fetchReports, checkHealth } from "./api.js";
import { initMap, setUserLocation, renderReportsOnMap, focusCoordinate } from "./map.js";
import { startRecording, stopRecording, isAudioRecordingSupported, clearRecording } from "./audio.js";
import {
  showToast,
  renderStructuredCard,
  renderVerificationCard,
  renderPrivacyShieldCard,
  renderActionPlanCard
} from "./ui.js";

/**
 * Application Runtime State.
 */
const state = {
  activeLanguage: "en",
  isRecording: false,
  selectedFile: null,
  recordedAudioBlob: null,
  userCoordinates: { lat: 18.5204, lng: 73.8567 },
  currentAnalysis: null,
  allReports: []
};

/**
 * Initializes the entire CivicBridge application upon DOM readiness.
 */
export async function initApp() {
  // 1. Initialize Map
  initMap("civicMap", (lat, lng) => {
    state.userCoordinates = { lat, lng };
    const locInput = document.getElementById("locationManualInput");
    if (locInput) {
      locInput.value = `Pune (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
    }
  });

  // Default initial pin at Pune Municipal Corporation
  setUserLocation(state.userCoordinates.lat, state.userCoordinates.lng);

  // 2. Setup Event Listeners
  setupFormListeners();
  setupVoiceRecording();
  setupFileUploader();
  setupQuickPills();
  setupLetterModal();
  setupCategoryFilters();

  // 3. Load Live Reports from server
  await loadReports();

  // 4. Check Health & Gemini status
  checkSystemStatus();
}

/**
 * Checks server health and Gemini configuration.
 */
async function checkSystemStatus() {
  try {
    const health = await checkHealth();
    const statusPill = document.getElementById("systemStatusPill");
    if (statusPill) {
      if (health.geminiConfigured) {
        statusPill.innerHTML = `
          <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          <span class="text-xs font-semibold text-emerald-800">Gemini Live</span>
        `;
        statusPill.className = "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200";
      } else {
        statusPill.innerHTML = `
          <span class="w-2 h-2 rounded-full bg-blue-500"></span>
          <span class="text-xs font-semibold text-blue-800">Smart Demo Mode</span>
        `;
        statusPill.className = "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-50 border border-blue-200";
      }
    }
  } catch (err) {
    console.warn("Could not check system health:", err);
  }
}

/**
 * Loads reports from server and renders on Leaflet map.
 */
async function loadReports() {
  try {
    state.allReports = await fetchReports();
    renderReportsOnMap(state.allReports);
    updateReportCounter(state.allReports.length);
  } catch (err) {
    console.error("Failed to load reports:", err);
  }
}

/**
 * Updates UI counter for verified community reports.
 * @param {number} count
 */
function updateReportCounter(count) {
  const el = document.getElementById("reportCountBadge");
  if (el) {
    el.textContent = `${count} verified incidents`;
  }
}

/**
 * Sets up the main citizen complaint submission form.
 */
function setupFormListeners() {
  const form = document.getElementById("complaintForm");
  const btnAnalyze = document.getElementById("btnAnalyze");
  const consentCheckbox = document.getElementById("consentCheckbox");
  const btnGetLocation = document.getElementById("btnGetLocation");

  // GPS Location button
  if (btnGetLocation) {
    btnGetLocation.addEventListener("click", () => {
      if (!navigator.geolocation) {
        showToast("Geolocation is not supported by your browser.", "warning");
        return;
      }
      btnGetLocation.classList.add("animate-pulse");
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          btnGetLocation.classList.remove("animate-pulse");
          const { latitude, longitude } = pos.coords;
          state.userCoordinates = { lat: latitude, lng: longitude };
          setUserLocation(latitude, longitude, true);
          showToast("Pune GPS location acquired!", "success");
        },
        (err) => {
          btnGetLocation.classList.remove("animate-pulse");
          console.warn("Geolocation denied:", err.message);
          showToast("Location permission denied. Pinned to PMC Shivajinagar.", "info");
        },
        { timeout: 7000 }
      );
    });
  }

  // Form submit
  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();

      if (!consentCheckbox.checked) {
        showToast("Please check the privacy consent before submitting.", "warning");
        consentCheckbox.focus();
        return;
      }

      const text = document.getElementById("complaintText").value.trim();

      if (!text && !state.selectedFile && !state.recordedAudioBlob) {
        showToast("Please provide a text description, voice note, or media evidence.", "warning");
        return;
      }

      // Prepare multipart FormData
      const formData = new FormData();
      formData.append("text", text);
      formData.append("consent", "true");
      formData.append("lat", state.userCoordinates.lat);
      formData.append("lng", state.userCoordinates.lng);

      if (state.selectedFile) {
        formData.append("file", state.selectedFile);
      }
      if (state.recordedAudioBlob) {
        formData.append("audio", state.recordedAudioBlob, "voice-recording.webm");
      }

      // UI Loading state
      btnAnalyze.disabled = true;
      btnAnalyze.innerHTML = `
        <span class="inline-block animate-spin mr-2">⟳</span>
        <span>Structuring & Verifying with Gemini...</span>
      `;

      try {
        const response = await analyzeComplaint(formData);
        if (response.success && response.data) {
          state.currentAnalysis = response.data;
          renderAnalysisResults(response.data);
          showToast("Grievance structured and verified!", "success");

          // Focus map on the detected complaint location
          const rep = response.data.structuredReport;
          if (rep && rep.lat && rep.lng) {
            focusCoordinate(rep.lat, rep.lng);
            setUserLocation(rep.lat, rep.lng);
          }

          // Smooth scroll to results
          document.getElementById("resultsContainer")?.scrollIntoView({ behavior: "smooth" });
        }
      } catch (err) {
        showToast(err.message || "Failed to process complaint", "error");
      } finally {
        btnAnalyze.disabled = false;
        btnAnalyze.innerHTML = `
          <span>✨</span>
          <span>Analyze & Structure with Gemini</span>
        `;
      }
    });
  }
}

/**
 * Renders the full structured response into the output containers.
 * @param {object} data - Full analysis response data.
 */
function renderAnalysisResults(data) {
  const container = document.getElementById("resultsContainer");
  if (!container) return;

  container.classList.remove("hidden");

  // Render cards
  const structuredSlot = document.getElementById("structuredReportSlot");
  const verificationSlot = document.getElementById("verificationSlot");
  const privacySlot = document.getElementById("privacyShieldSlot");
  const actionPlanSlot = document.getElementById("actionPlanSlot");

  if (structuredSlot) structuredSlot.innerHTML = renderStructuredCard(data.structuredReport);
  if (verificationSlot) verificationSlot.innerHTML = renderVerificationCard(data.verification);
  if (privacySlot) privacySlot.innerHTML = renderPrivacyShieldCard(data.privacyShield);
  if (actionPlanSlot) actionPlanSlot.innerHTML = renderActionPlanCard(data.actionPlan);

  // Hook up dynamically rendered Action buttons
  const btnLetter = document.getElementById("btnOpenLetterModal");
  if (btnLetter) {
    btnLetter.addEventListener("click", () => openLetterModal(data.structuredReport));
  }

  const btnMockSubmit = document.getElementById("btnSubmitMock");
  if (btnMockSubmit) {
    btnMockSubmit.addEventListener("click", () => handleMockSubmission(data.structuredReport, data.actionPlan));
  }
}

/**
 * Sets up voice recording button and wave visualizer.
 */
function setupVoiceRecording() {
  const btnRecord = document.getElementById("btnRecordVoice");
  const recordingStatus = document.getElementById("recordingStatus");
  const timerLabel = document.getElementById("recordingTimer");
  const visualizer = document.getElementById("audioWaveformVisualizer");
  const audioPreview = document.getElementById("audioPlaybackPreview");
  const btnClearAudio = document.getElementById("btnClearAudio");

  if (!btnRecord) return;

  if (!isAudioRecordingSupported()) {
    btnRecord.title = "Voice recording not supported in this browser";
    btnRecord.classList.add("opacity-50", "cursor-not-allowed");
    return;
  }

  btnRecord.addEventListener("click", () => {
    if (!state.isRecording) {
      // Start recording
      startRecording({
        onStart: () => {
          state.isRecording = true;
          btnRecord.classList.add("recording-active");
          btnRecord.querySelector(".record-text").textContent = "Stop Recording";
          recordingStatus?.classList.remove("hidden");
          visualizer?.classList.remove("hidden");
          audioPreview?.classList.add("hidden");
        },
        onTick: (formattedTime) => {
          if (timerLabel) timerLabel.textContent = formattedTime;
        },
        onStop: (blob) => {
          state.isRecording = false;
          state.recordedAudioBlob = blob;
          btnRecord.classList.remove("recording-active");
          btnRecord.querySelector(".record-text").textContent = "Record Voice";
          visualizer?.classList.add("hidden");

          // Show audio playback preview
          if (audioPreview) {
            audioPreview.classList.remove("hidden");
            const audioTag = audioPreview.querySelector("audio");
            if (audioTag) {
              audioTag.src = URL.createObjectURL(blob);
            }
          }
          showToast("Voice recorded successfully!", "success");
        },
        onError: (err) => {
          state.isRecording = false;
          btnRecord.classList.remove("recording-active");
          recordingStatus?.classList.add("hidden");
          visualizer?.classList.add("hidden");
          showToast(err.message, "error");
        }
      });
    } else {
      // Stop recording
      stopRecording();
    }
  });

  if (btnClearAudio) {
    btnClearAudio.addEventListener("click", () => {
      clearRecording();
      state.recordedAudioBlob = null;
      audioPreview?.classList.add("hidden");
      recordingStatus?.classList.add("hidden");
      if (timerLabel) timerLabel.textContent = "00:00";
      showToast("Voice recording removed", "info");
    });
  }
}

/**
 * Sets up file drag-and-drop & file picker (max 20MB limit).
 */
function setupFileUploader() {
  const dropZone = document.getElementById("mediaDropZone");
  const fileInput = document.getElementById("evidenceFileInput");
  const filePreview = document.getElementById("filePreviewContainer");
  const fileNameLabel = document.getElementById("fileNameLabel");
  const fileSizeLabel = document.getElementById("fileSizeLabel");
  const btnRemoveFile = document.getElementById("btnRemoveFile");

  if (!dropZone || !fileInput) return;

  dropZone.addEventListener("click", () => fileInput.click());

  dropZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropZone.classList.add("border-blue-500", "bg-blue-50/50");
  });

  dropZone.addEventListener("dragleave", () => {
    dropZone.classList.remove("border-blue-500", "bg-blue-50/50");
  });

  dropZone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropZone.classList.remove("border-blue-500", "bg-blue-50/50");
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelected(e.dataTransfer.files[0]);
    }
  });

  fileInput.addEventListener("change", (e) => {
    if (e.target.files && e.target.files[0]) {
      handleFileSelected(e.target.files[0]);
    }
  });

  function handleFileSelected(file) {
    const maxBytes = 20 * 1024 * 1024;
    if (file.size > maxBytes) {
      showToast(`File exceeds 20MB limit (${(file.size / (1024 * 1024)).toFixed(1)} MB)`, "error");
      fileInput.value = "";
      return;
    }

    state.selectedFile = file;
    if (fileNameLabel) fileNameLabel.textContent = file.name;
    if (fileSizeLabel) fileSizeLabel.textContent = `${(file.size / 1024).toFixed(1)} KB`;
    filePreview?.classList.remove("hidden");
    dropZone.classList.add("hidden");
    showToast(`Attached ${file.name}`, "info");
  }

  if (btnRemoveFile) {
    btnRemoveFile.addEventListener("click", (e) => {
      e.stopPropagation();
      state.selectedFile = null;
      fileInput.value = "";
      filePreview?.classList.add("hidden");
      dropZone.classList.remove("hidden");
      showToast("Media file removed", "info");
    });
  }
}

/**
 * Sets up 1-click sample prompt pills for rapid testing of realistic Pune issues.
 */
function setupQuickPills() {
  const pills = document.querySelectorAll(".quick-prompt-pill");
  const textarea = document.getElementById("complaintText");

  pills.forEach((pill) => {
    pill.addEventListener("click", () => {
      const promptText = pill.dataset.prompt;
      const lat = parseFloat(pill.dataset.lat);
      const lng = parseFloat(pill.dataset.lng);

      if (textarea && promptText) {
        textarea.value = promptText;
      }

      if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
        state.userCoordinates = { lat, lng };
        setUserLocation(lat, lng, true);
      }

      showToast(`Loaded sample: "${pill.textContent.trim()}"`, "info");
    });
  });
}

/**
 * Opens the formal complaint letter drafting modal.
 * @param {object} report - Structured report.
 */
async function openLetterModal(report) {
  const modal = document.getElementById("letterModal");
  if (!modal) return;

  modal.classList.remove("hidden");
  await updateLetterDraft(report, "en");
}

/**
 * Updates complaint letter draft according to selected language.
 * @param {object} report - Structured report.
 * @param {"en"|"mr"|"hi"} language - Language code.
 */
async function updateLetterDraft(report, language) {
  const subjectEl = document.getElementById("letterSubject");
  const bodyEl = document.getElementById("letterBody");
  const loadingIndicator = document.getElementById("letterLoading");

  if (loadingIndicator) loadingIndicator.classList.remove("hidden");

  try {
    const res = await draftLetter(report, language);
    if (res.success && res.data) {
      if (subjectEl) subjectEl.value = res.data.subject;
      if (bodyEl) bodyEl.value = res.data.letterBody;
    }
  } catch (err) {
    showToast("Failed to draft letter in selected language.", "error");
  } finally {
    if (loadingIndicator) loadingIndicator.classList.add("hidden");
  }
}

/**
 * Sets up letter modal tabs, copy button, and close triggers.
 */
function setupLetterModal() {
  const modal = document.getElementById("letterModal");
  const btnClose = document.getElementById("btnCloseLetterModal");
  const btnCopy = document.getElementById("btnCopyLetter");
  const langTabs = document.querySelectorAll(".letter-lang-tab");

  if (btnClose && modal) {
    btnClose.addEventListener("click", () => modal.classList.add("hidden"));
    modal.addEventListener("click", (e) => {
      if (e.target === modal) modal.classList.add("hidden");
    });
  }

  langTabs.forEach((tab) => {
    tab.addEventListener("click", async () => {
      langTabs.forEach((t) => t.classList.remove("bg-white", "shadow-sm", "text-blue-600", "font-bold"));
      tab.classList.add("bg-white", "shadow-sm", "text-blue-600", "font-bold");

      const lang = tab.dataset.lang;
      if (state.currentAnalysis?.structuredReport) {
        await updateLetterDraft(state.currentAnalysis.structuredReport, lang);
      }
    });
  });

  if (btnCopy) {
    btnCopy.addEventListener("click", () => {
      const subject = document.getElementById("letterSubject")?.value || "";
      const body = document.getElementById("letterBody")?.value || "";
      const fullText = `SUBJECT: ${subject}\n\n${body}`;

      navigator.clipboard.writeText(fullText).then(
        () => showToast("Letter copied to clipboard!", "success"),
        () => showToast("Failed to copy to clipboard", "error")
      );
    });
  }
}

/**
 * Handles official mock submission to PMC Care API.
 * @param {object} report - Structured report.
 * @param {object} actionPlan - Action plan.
 */
async function handleMockSubmission(report, actionPlan) {
  const btn = document.getElementById("btnSubmitMock");
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<span>⟳</span><span>Dispatching to PMC Care API...</span>`;
  }

  try {
    const res = await submitMockGrievance(report, actionPlan);
    if (res.success && res.data) {
      showSubmissionConfirmation(res.data);
      showToast(`Grievance Dispatched! Token: ${res.data.trackingId}`, "success");

      // Refresh map reports to show the newly added point
      await loadReports();
    }
  } catch (err) {
    showToast(err.message || "Failed to submit mock grievance", "error");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<span>🚀</span><span>Submit to Authority (Mock API)</span>`;
    }
  }
}

/**
 * Shows confirmation modal with tracking ticket and SLA details.
 * @param {object} submissionData
 */
function showSubmissionConfirmation(submissionData) {
  const modal = document.getElementById("submissionModal");
  if (!modal) return;

  const trackingSlot = document.getElementById("subTrackingId");
  const authoritySlot = document.getElementById("subAuthority");
  const targetDateSlot = document.getElementById("subTargetDate");

  if (trackingSlot) trackingSlot.textContent = submissionData.trackingId;
  if (authoritySlot) authoritySlot.textContent = submissionData.authority;
  if (targetDateSlot) targetDateSlot.textContent = submissionData.targetResolutionDate || "Within 48 hours";

  modal.classList.remove("hidden");

  const btnClose = document.getElementById("btnCloseSubmissionModal");
  if (btnClose) {
    btnClose.onclick = () => modal.classList.add("hidden");
  }
}

/**
 * Category filter chips on the map feed.
 */
function setupCategoryFilters() {
  const filterBtns = document.querySelectorAll(".category-filter-chip");
  filterBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      filterBtns.forEach((b) => b.classList.remove("bg-slate-900", "text-white"));
      filterBtns.forEach((b) => b.classList.add("bg-white", "text-slate-700"));

      btn.classList.remove("bg-white", "text-slate-700");
      btn.classList.add("bg-slate-900", "text-white");

      const filter = btn.dataset.filter || "all";
      renderReportsOnMap(state.allReports, filter);
    });
  });
}

// Auto-boot on DOM ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initApp);
} else {
  initApp();
}
