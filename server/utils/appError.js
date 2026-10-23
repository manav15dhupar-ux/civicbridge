/**
 * Error carrying an expected HTTP status and safe response metadata.
 */
export class AppError extends Error {
  /**
   * @param {string} message - Diagnostic message.
   * @param {object} [options] - HTTP and client-facing error metadata.
   * @param {number} [options.statusCode=500] - HTTP status code.
   * @param {string} [options.code="INTERNAL_SERVER_ERROR"] - Stable error code.
   * @param {boolean} [options.isUserFacing=false] - Whether userMessage is safe to return.
   * @param {string} [options.userMessage] - Safe user-facing message.
   * @param {Error} [options.cause] - Original error that caused this error.
   */
  constructor(
    message,
    {
      statusCode = 500,
      code = "INTERNAL_SERVER_ERROR",
      isUserFacing = false,
      userMessage,
      cause
    } = {}
  ) {
    super(message, { cause });
    this.name = "AppError";
    this.statusCode = statusCode;
    this.status = statusCode;
    this.code = code;
    this.isUserFacing = isUserFacing;
    this.userMessage = userMessage;
  }
}
