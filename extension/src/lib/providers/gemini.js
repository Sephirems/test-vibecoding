/**
 * Google Gemini provider, called over plain REST.
 *
 * No SDK on purpose: the request is a single POST, and @google/genai would add
 * a second large dependency to a service worker that already bundles the
 * Anthropic SDK.
 */
import { appError } from '../errors.js';
import { PROVIDER_CATALOG } from './catalog.js';

const MODEL = PROVIDER_CATALOG.gemini.model;

const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

/**
 * Field naming below is mixed on purpose: it copies the shapes shown in
 * Google's own REST examples (`system_instruction`, `max_output_tokens` inside
 * a camelCase `generationConfig`). The API accepts both conventions, but
 * matching the documented example removes any doubt.
 *
 * Note: `thinkingLevel` is deliberately not sent. Gemini 3 Flash thinks at
 * "medium" by default and `low` would be cheaper, but that field could not be
 * verified against a live call — sending an unknown field would fail the whole
 * request with a 400.
 *
 * @param {{ apiKey: string, system: string, userContent: string, maxOutputTokens: number }} input
 * @returns {Promise<string>} raw model text
 */
export async function summarize({ apiKey, system, userContent, maxOutputTokens }) {
  let response;
  try {
    response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Header rather than the `?key=` query parameter Google also documents:
        // a secret in a URL leaks into logs, history and referrers.
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: userContent }] }],
        generationConfig: { max_output_tokens: maxOutputTokens, temperature: 0.3 },
      }),
    });
  } catch (cause) {
    throw appError(
      'NETWORK_ERROR',
      "Impossible de joindre l'API Google. Vérifie ta connexion.",
      true,
    );
  }

  const body = await response.text();
  if (!response.ok) throw geminiHttpError(response.status, body);

  /** @type {any} */
  let payload;
  try {
    payload = JSON.parse(body);
  } catch {
    throw appError('BAD_RESPONSE', "Réponse illisible de l'API Google.", true);
  }

  return extractText(payload);
}

/**
 * Pulls the generated text out of a generateContent response, or throws an
 * explanatory error. Exported for testing.
 * @param {any} payload
 * @returns {string}
 */
export function extractText(payload) {
  const blocked = payload?.promptFeedback?.blockReason;
  if (blocked) {
    throw appError('REFUSED', `Google a bloqué cette requête (${blocked}).`);
  }

  const candidate = payload?.candidates?.[0];
  const finish = candidate?.finishReason ?? candidate?.finish_reason;
  if (finish && finish !== 'STOP' && finish !== 'MAX_TOKENS') {
    throw appError('REFUSED', `Google a interrompu la réponse (${finish}).`);
  }

  const text = (candidate?.content?.parts ?? [])
    .map((part) => part?.text ?? '')
    .join('')
    .trim();

  if (!text) {
    throw appError('EMPTY_RESPONSE', "L'API Google a répondu sans contenu. Réessaie.", true);
  }
  return text;
}

/**
 * @param {number} status
 * @param {string} body
 */
function geminiHttpError(status, body) {
  const detail = readErrorMessage(body);

  // The full response goes to the service worker console: a message trimmed for
  // the panel is not enough to debug an unexpected status. The key is in a
  // header, never in the body, so nothing secret is logged here.
  console.error(`[Résumé] Google a répondu ${status} :`, body.slice(0, 1000));

  if (status === 400 && /API_KEY_INVALID|API key not valid/i.test(body)) {
    return appError('INVALID_API_KEY', 'Clé API Google refusée. Vérifie-la dans les options.');
  }
  if (status === 401 || status === 403) {
    return appError(
      'INVALID_API_KEY',
      `Clé API Google refusée ou sans accès au modèle${detail ? ` : ${detail}` : '.'}`,
    );
  }
  if (status === 404) {
    return appError(
      'MODEL_NOT_FOUND',
      `Le modèle ${MODEL} est introuvable pour cette clé${detail ? ` : ${detail}` : '.'}`,
    );
  }
  if (status === 429) {
    return appError('RATE_LIMITED', 'Quota Google atteint. Réessaie dans une minute.', true);
  }
  if (status >= 500) {
    // Google's own message is the only thing that makes a 5xx actionable —
    // "réessaie" alone sent the user to a dead end.
    return appError(
      'SERVER_ERROR',
      `Erreur ${status} côté Google${detail ? ` : ${detail}` : '. Réessaie.'}`,
      true,
    );
  }
  return appError(
    'BAD_REQUEST',
    `Requête refusée par Google (${status})${detail ? ` : ${detail}` : '.'}`,
  );
}

/**
 * @param {string} body
 * @returns {string}
 */
function readErrorMessage(body) {
  try {
    return JSON.parse(body)?.error?.message ?? '';
  } catch {
    return '';
  }
}
