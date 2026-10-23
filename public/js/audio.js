/**
 * @fileoverview Audio Recording and Voice Intake Controller for CivicBridge.
 * Uses the Web MediaRecorder API to record voice complaints in Marathi, Hindi, or English.
 */

let mediaRecorder = null;
let audioChunks = [];
let recordedAudioBlob = null;
let recordingInterval = null;
let recordingSeconds = 0;

/**
 * Checks if voice recording is supported by the user's browser.
 * @returns {boolean}
 */
export function isAudioRecordingSupported() {
  return Boolean(
    navigator.mediaDevices &&
    navigator.mediaDevices.getUserMedia &&
    window.MediaRecorder
  );
}

/**
 * Starts recording citizen voice note.
 * @param {object} callbacks - Event callbacks.
 * @param {Function} callbacks.onStart - Triggered when recording begins.
 * @param {Function} callbacks.onTick - Triggered every second with formatted time string.
 * @param {Function} callbacks.onStop - Triggered when recording ends with the final audio Blob.
 * @param {Function} callbacks.onError - Triggered if microphone access fails.
 */
export async function startRecording({ onStart, onTick, onStop, onError }) {
  if (!isAudioRecordingSupported()) {
    onError(
      new Error(
        "Voice recording is not supported in this browser. Please type your complaint."
      )
    );
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioChunks = [];
    recordingSeconds = 0;

    mediaRecorder = new MediaRecorder(stream);

    mediaRecorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        audioChunks.push(event.data);
      }
    };

    mediaRecorder.onstop = () => {
      const mimeType = mediaRecorder.mimeType || "audio/webm";
      recordedAudioBlob = new Blob(audioChunks, { type: mimeType });

      // Stop all tracks to turn off mic indicator
      stream.getTracks().forEach((track) => track.stop());

      if (recordingInterval) {
        clearInterval(recordingInterval);
        recordingInterval = null;
      }

      if (typeof onStop === "function") {
        onStop(recordedAudioBlob);
      }
    };

    mediaRecorder.start(250); // Slice every 250ms

    recordingInterval = setInterval(() => {
      recordingSeconds += 1;
      const mins = String(Math.floor(recordingSeconds / 60)).padStart(2, "0");
      const secs = String(recordingSeconds % 60).padStart(2, "0");
      if (typeof onTick === "function") {
        onTick(`${mins}:${secs}`, recordingSeconds);
      }
    }, 1000);

    if (typeof onStart === "function") {
      onStart();
    }
  } catch (err) {
    console.error("Microphone access error:", err);
    let msg = "Could not access microphone.";
    if (err.name === "NotAllowedError") {
      msg =
        "Microphone permission denied. Please allow microphone access to record voice complaints.";
    }
    if (typeof onError === "function") {
      onError(new Error(msg));
    }
  }
}

/**
 * Stops the active audio recording session.
 */
export function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    mediaRecorder.stop();
  }
}

/**
 * Returns the recorded audio Blob or null.
 * @returns {Blob|null}
 */
export function getRecordedAudioBlob() {
  return recordedAudioBlob;
}

/**
 * Clears current audio recording state.
 */
export function clearRecording() {
  recordedAudioBlob = null;
  audioChunks = [];
  recordingSeconds = 0;
  if (recordingInterval) {
    clearInterval(recordingInterval);
    recordingInterval = null;
  }
}
