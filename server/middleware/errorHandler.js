/**
 * Redacts configured and recognizable Google API keys from diagnostic text.
 * @param {string} message - Original error text.
 * @returns {string} Safe diagnostic text.
 */
function redactSecrets(message) {
  const apiKey = process.env.GEMINI_API_KEY;
  let cleanMessage = message || "An unexpected error occurred.";

  if (apiKey && apiKey.trim()) {
    cleanMessage = cleanMessage.replaceAll(apiKey, "[REDACTED_API_KEY]");
  }

  return cleanMessage
    .replace(/([?&]key=)[^&\s"`']+/gi, "$1[REDACTED_API_KEY]")
    .replace(/AIza[0-9A-Za-z-_]{35}/g, "[REDACTED_API_KEY]");
}

/**
 * Central Express error middleware. It never exposes production diagnostics.
 * @param {Error & { status?: number, statusCode?: number, code?: string, isUserFacing?: boolean, userMessage?: string }} error - Handled error.
 * @param {import("express").Request} req - Current request.
 * @param {import("express").Response} res - Current response.
 * @param {import("express").NextFunction} _next - Express continuation.
 * @returns {void}
 */
export function errorHandler(error, req, res, _next) {
  const requestedStatus = error.statusCode || error.status || 500;
  const statusCode =
    Number.isInteger(requestedStatus) &&
    requestedStatus >= 400 &&
    requestedStatus < 600
      ? requestedStatus
      : 500;
  const cleanMessage = redactSecrets(error.message);

  console.error(`[ERROR] ${req.method} ${req.path}`, {
    message: cleanMessage,
    code: error.code,
    status: statusCode
  });

  const clientMessage =
    error.isUserFacing && error.userMessage
      ? error.userMessage
      : process.env.NODE_ENV === "development"
        ? cleanMessage
        : "An error occurred while processing your request.";

  res.status(statusCode).json({
    success: false,
    error: clientMessage,
    code: error.code || "INTERNAL_SERVER_ERROR"
  });
}
