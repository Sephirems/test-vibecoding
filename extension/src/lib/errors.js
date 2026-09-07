/**
 * Every failure the UI can display. The background maps exceptions to one of
 * these codes; the side panel decides how to render them. Messages are written
 * for the person reading them: what failed, and what to do about it.
 */
import {
  APIConnectionError,
  APIConnectionTimeoutError,
  AuthenticationError,
  BadRequestError,
  InternalServerError,
  PermissionDeniedError,
  RateLimitError,
} from '@anthropic-ai/sdk';

/**
 * @typedef {object} AppError
 * @property {string} code
 * @property {string} message
 * @property {boolean} retryable
 */

/**
 * @param {string} code
 * @param {string} message
 * @param {boolean} [retryable]
 * @returns {AppError}
 */
export function appError(code, message, retryable = false) {
  return { code, message, retryable };
}

/**
 * Translates an unknown thrown value into an AppError.
 * @param {unknown} error
 * @returns {AppError}
 */
export function toAppError(error) {
  if (isAppError(error)) return error;

  if (error instanceof AuthenticationError) {
    return appError(
      'INVALID_API_KEY',
      "Clé API refusée. Vérifie-la dans les options de l'extension.",
    );
  }
  if (error instanceof PermissionDeniedError) {
    return appError(
      'FORBIDDEN',
      "Cette clé API n'a pas accès au modèle demandé (crédits épuisés ou permissions insuffisantes).",
    );
  }
  if (error instanceof RateLimitError) {
    return appError('RATE_LIMITED', 'Trop de requêtes. Réessaie dans une minute.', true);
  }
  if (error instanceof APIConnectionTimeoutError) {
    return appError('TIMEOUT', "L'API n'a pas répondu à temps. Réessaie.", true);
  }
  if (error instanceof APIConnectionError) {
    return appError(
      'NETWORK_ERROR',
      "Impossible de joindre l'API Anthropic. Vérifie ta connexion.",
      true,
    );
  }
  if (error instanceof InternalServerError) {
    return appError('SERVER_ERROR', "L'API Anthropic rencontre un problème. Réessaie.", true);
  }
  if (error instanceof BadRequestError) {
    return appError('BAD_REQUEST', `Requête refusée par l'API : ${error.message}`);
  }

  const detail = error instanceof Error ? error.message : String(error);
  return appError('UNKNOWN', `Erreur inattendue : ${detail}`, true);
}

/**
 * @param {unknown} value
 * @returns {value is AppError}
 */
export function isAppError(value) {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (/** @type {AppError} */ (value).code) === 'string' &&
    typeof (/** @type {AppError} */ (value).message) === 'string'
  );
}
