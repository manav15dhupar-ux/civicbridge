/**
 * Forwards rejected async route handlers to Express error middleware.
 * @param {Function} handler - Express request handler.
 * @returns {Function} Express-compatible error-forwarding handler.
 */
export function asyncHandler(handler) {
  return function forwardAsyncErrors(req, res, next) {
    return Promise.resolve(handler(req, res, next)).catch(next);
  };
}
