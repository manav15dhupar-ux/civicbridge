/**
 * @fileoverview Main Application Controller for CivicBridge.
 * Orchestrates multilingual citizen input, voice capture, spatial verification,
 * letter drafting, and mock PMC Care dispatch.
 */

import { analyzeComplaint, draftLetter, submitMockGrievance, fileComplaint, fetchReports, checkHealth, fetchReverseGeocode } from "./api.js";
import { initMap, setUserLocation, renderReportsOnMap, focusCoordinate, confirmPin } from "./map.js";
import { startRecording, stopRecording, isAudioRecordingSupported, clearRecording } from "./audio.js";
import { extractExifGpsFromBlob } from "./exif.js";
import {
  showToast,
  renderStructuredCard,
  renderVerificationCard,
  renderPrivacyShieldCard,
  renderActionPlanCard,
  renderFileComplaintPanel
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
  isPinConfirmed: false,
  gpsAccuracy: null,
  photoGpsCoordinates: null,
  resolvedAddress: "PMC Main Building, Shivajinagar, Pune, Maharashtra 411005",
  currentAnalysis: null,
  allReports: []
};

/**
 * Updates the UI location control bar with reverse geocoded address,
 * coordinates display, confidence badge, and accuracy warnings.
 *
 * @param {number} lat - Latitude.
 * @param {number} lng - Longitude.
 * @param {number|null} [accuracy=null] - Accuracy in meters.
 * @param {boolean} [isConfirmed=false] - Whether citizen manually dragged/confirmed pin.
 */
export async function updateLocationDisplay(lat, lng, accuracy = null, isConfirmed = false) {
  const coordsDisplay = document.getElementById("coordsDisplay");
  const locInput = document.getElementById("locationManualInput");
  const spinner = document.getElementById("geocodingSpinner");
  const confidenceBadge = document.getElementById("locationConfidenceBadge");
  const accuracyWarning = document.getElementById("accuracyWarning");
  const accuracyValueText = document.getElementById("accuracyValueText");
  const accuracyPill = document.getElementById("accuracyPill");
  const btnConfirmLocation = document.getElementById("btnConfirmLocation");
  const btnConfirmText = document.getElementById("btnConfirmText");

  if (coordsDisplay) {
    coordsDisplay.textContent = `${lat.toFixed(5)}° N, ${lng.toFixed(5)}° E`;
  }

  // Handle Accuracy Warning (> 50m)
  if (typeof accuracy === "number" && accuracy > 0) {
    if (accuracy > 50) {
      accuracyWarning?.classList.remove("hidden");
      if (accuracyValueText) accuracyValueText.textContent = Math.round(accuracy);
      if (accuracyPill) {
        accuracyPill.textContent = `GPS (±${Math.round(accuracy)}m) ⚠️`;
        accuracyPill.className = "text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-semibold border border-amber-200";
      }
    } else {
      accuracyWarning?.classList.add("hidden");
      if (accuracyPill) {
        accuracyPill.textContent = `GPS (±${Math.round(accuracy)}m) ✓`;
        accuracyPill.className = "text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-semibold border border-emerald-200";
      }
    }
  } else if (isConfirmed) {
    accuracyWarning?.classList.add("hidden");
    if (accuracyPill) {
      accuracyPill.textContent = "Pin Confirmed ✓";
      accuracyPill.className = "text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-semibold border border-emerald-200";
    }
    if (btnConfirmLocation) {
      btnConfirmLocation.className = "inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-700 text-white font-bold text-[11px] shadow-sm";
    }
    if (btnConfirmText) btnConfirmText.textContent = "Pin Confirmed ✓";
  } else {
    accuracyWarning?.classList.add("hidden");
    if (accuracyPill) {
      accuracyPill.textContent = "Draggable Pin";
      accuracyPill.className = "text-[10px] px-2 py-0.5 rounded-full bg-slate-200 text-slate-700 font-medium";
    }
  }

  // Reverse geocode via server route
  try {
    spinner?.classList.remove("hidden");
    const geocode = await fetchReverseGeocode(lat, lng);

    if (locInput && geocode.address) {
      locInput.value = geocode.address;
      state.resolvedAddress = geocode.address;
    }

    if (confidenceBadge) {
      if (geocode.isWithinPune) {
        const badgeLabel = isConfirmed
          ? "High Precision (Pin Confirmed)"
          : (typeof accuracy === "number" && accuracy <= 50)
          ? "High Precision (GPS Verified)"
          : "Inside PMC Boundary";

        confidenceBadge.className = "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200";
        confidenceBadge.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-emerald-600"></span><span>${badgeLabel}</span>`;
      } else {
        confidenceBadge.className = "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300";
        confidenceBadge.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-amber-600"></span><span>Outside Pune Boundary</span>`;
        showToast("Selected pin is outside Pune Municipal boundaries. Please keep reports inside Pune.", "warning");
      }
    }
  } catch (err) {
    console.debug("Reverse geocode update error:", err);
  } finally {
    spinner?.classList.add("hidden");
  }
}

/**
 * Initializes the entire CivicBridge application upon DOM readiness.
 */
export async function initApp() {
  // 1. Initialize Map with draggable pin and accuracy callbacks
  initMap("civicMap", (lat, lng, accuracy, isDragged) => {
    state.userCoordinates = { lat, lng };
    if (isDragged) {
      state.isPinConfirmed = true;
    }
    updateLocationDisplay(lat, lng, accuracy, isDragged);
  });

  // Default initial pin at Pune Municipal Corporation
  setUserLocation(state.userCoordinates.lat, state.userCoordinates.lng);
  updateLocationDisplay(state.userCoordinates.lat, state.userCoordinates.lng);

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

  // High-Accuracy GPS Location button
  if (btnGetLocation) {
    btnGetLocation.addEventListener("click", () => {
      if (!navigator.geolocation) {
        showToast("Geolocation is not supported by your browser.", "warning");
        return;
      }

      btnGetLocation.classList.add("animate-pulse");
      const icon = document.getElementById("locateIcon");
      const text = document.getElementById("locateText");
      if (text) text.textContent = "Acquiring...";

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          btnGetLocation.classList.remove("animate-pulse");
          if (text) text.textContent = "GPS Located ✓";

          const { latitude, longitude, accuracy } = pos.coords;
          const roundedLat = Math.round(latitude * 100000) / 100000;
          const roundedLng = Math.round(longitude * 100000) / 100000;

          state.userCoordinates = { lat: roundedLat, lng: roundedLng };
          state.gpsAccuracy = accuracy;
          state.isPinConfirmed = false;

          setUserLocation(roundedLat, roundedLng, true, accuracy, false);
          updateLocationDisplay(roundedLat, roundedLng, accuracy, false);

          if (accuracy > 50) {
            showToast(`GPS acquired with ±${Math.round(accuracy)}m accuracy (worse than 50m). Drag the pin to pinpoint the exact defect.`, "warning");
          } else {
            showToast(`High-accuracy GPS location acquired (±${Math.round(accuracy)}m)!`, "success");
          }
        },
        (err) => {
          btnGetLocation.classList.remove("animate-pulse");
          if (text) text.textContent = "High-Accuracy GPS";
          console.warn("Geolocation denied or timed out:", err.message);
          showToast("Location request timed out or permission denied. Drag the blue pin on the map to place your report.", "info");
        },
        {
          enableHighAccuracy: true,
          timeout: 12000,
          maximumAge: 0
        }
      );
    });
  }

  // Pin Confirmation Button
  const btnConfirmLocation = document.getElementById("btnConfirmLocation");
  if (btnConfirmLocation) {
    btnConfirmLocation.addEventListener("click", () => {
      state.isPinConfirmed = true;
      confirmPin();
      updateLocationDisplay(state.userCoordinates.lat, state.userCoordinates.lng, null, true);
      showToast(`Location confirmed at ${state.userCoordinates.lat.toFixed(5)}° N, ${state.userCoordinates.lng.toFixed(5)}° E!`, "success");
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

  // Render Step 5: File This Complaint Panel (after the action plan)
  const fileSlot = document.getElementById("fileComplaintSlot");
  if (fileSlot) {
    fileSlot.innerHTML = renderFileComplaintPanel({
      authority: data.actionPlan.authority,
      report: data.structuredReport,
      actionPlan: data.actionPlan,
      trackingId: data.actionPlan.initialTrackingId,
      offlineRoute: data.actionPlan.offlineGuide,
      copyReadyText: data.actionPlan.copyReadyText,
      shareRoutes: data.actionPlan.shareLinks,
      statusTimeline: data.actionPlan.statusTimeline,
      isFiled: false
    });
    attachFilingPanelListeners(data);
  }

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
 * Attaches event listeners for the "File this complaint" panel.
 * @param {object} data - Analysis data.
 */
function attachFilingPanelListeners(data) {
  const btnCopy = document.getElementById("btnCopyComplaintText");
  const copyArea = document.getElementById("filingCopyReadyText");

  if (btnCopy && copyArea) {
    btnCopy.addEventListener("click", () => {
      navigator.clipboard.writeText(copyArea.value).then(
        () => showToast("Complaint text copied to clipboard!", "success"),
        () => showToast("Failed to copy text", "error")
      );
    });
  }

  const btnExecute = document.getElementById("btnExecuteFiling");
  if (btnExecute) {
    btnExecute.addEventListener("click", async () => {
      btnExecute.disabled = true;
      btnExecute.innerHTML = `<span>⟳</span><span>Dispatching Grievance to Authority...</span>`;

      try {
        const res = await fileComplaint(data.structuredReport, data.actionPlan);
        if (res.success && res.data) {
          showToast(`Filed Successfully! Tracking Token: ${res.data.trackingId}`, "success");

          // Re-render filing panel in confirmed active state
          const fileSlot = document.getElementById("fileComplaintSlot");
          if (fileSlot) {
            fileSlot.innerHTML = renderFileComplaintPanel({
              authority: res.data.authority,
              report: data.structuredReport,
              actionPlan: data.actionPlan,
              trackingId: res.data.trackingId,
              statusTimeline: res.data.statusTimeline,
              onlineRoute: res.data.onlineRoute,
              offlineRoute: res.data.offlineRoute,
              shareRoutes: res.data.shareRoutes,
              copyReadyText: res.data.onlineRoute?.copyReadyText,
              isFiled: true
            });
            attachFilingPanelListeners(data);
          }

          // Show confirmation receipt modal
          showSubmissionConfirmation(res.data);

          // Refresh map reports to show new pin immediately
          await loadReports();
        }
      } catch (err) {
        showToast(err.message || "Failed to file complaint", "error");
        btnExecute.disabled = false;
        btnExecute.innerHTML = `<span>🚀</span><span>File This Complaint & Generate Tracking Token</span>`;
      }
    });
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

  async function handleFileSelected(file) {
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

    // Check for photo EXIF GPS metadata
    if (file.type.startsWith("image/")) {
      try {
        const exif = await extractExifGpsFromBlob(file);
        const photoGpsBanner = document.getElementById("photoGpsBanner");
        const photoGpsCoords = document.getElementById("photoGpsCoords");
        const btnUsePhotoGps = document.getElementById("btnUsePhotoGps");
        const btnDismissPhotoGps = document.getElementById("btnDismissPhotoGps");

        if (exif && exif.hasGps && typeof exif.lat === "number" && typeof exif.lng === "number") {
          state.photoGpsCoordinates = { lat: exif.lat, lng: exif.lng };
          if (photoGpsCoords) {
            photoGpsCoords.textContent = `${exif.lat.toFixed(5)}° N, ${exif.lng.toFixed(5)}° E`;
          }
          photoGpsBanner?.classList.remove("hidden");

          if (btnUsePhotoGps) {
            btnUsePhotoGps.onclick = () => {
              state.userCoordinates = { lat: exif.lat, lng: exif.lng };
              state.isPinConfirmed = true;
              setUserLocation(exif.lat, exif.lng, true, null, true);
              updateLocationDisplay(exif.lat, exif.lng, null, true);
              photoGpsBanner?.classList.add("hidden");
              showToast("Map pin updated to photo GPS coordinates!", "success");
            };
          }

          if (btnDismissPhotoGps) {
            btnDismissPhotoGps.onclick = () => {
              photoGpsBanner?.classList.add("hidden");
            };
          }
        } else {
          photoGpsBanner?.classList.add("hidden");
        }
      } catch (err) {
        console.debug("EXIF scan error:", err);
      }
    }
  }

  if (btnRemoveFile) {
    btnRemoveFile.addEventListener("click", (e) => {
      e.stopPropagation();
      state.selectedFile = null;
      state.photoGpsCoordinates = null;
      document.getElementById("photoGpsBanner")?.classList.add("hidden");
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
        state.isPinConfirmed = true;
        setUserLocation(lat, lng, true, null, true);
        updateLocationDisplay(lat, lng, null, true);
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
