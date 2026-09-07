/**
 * Anthropic provider. Uses the official SDK: it handles retries, typed errors
 * and the wire format, which is worth the bundle size here.
 */
import Anthropic from '@anthropic-ai/sdk';

import { appError } from '../errors.js';
import { PROVIDER_CATALOG } from './catalog.js';

const MODEL = PROVIDER_CATALOG.anthropic.model;

/**
 * @param {{ apiKey: string, system: string, userContent: string, maxOutputTokens: number }} input
 * @returns {Promise<string>} raw model text
 */
export async function summarize({ apiKey, system, userContent, maxOutputTokens }) {
  const client = new Anthropic({
    apiKey,
    // Not here to bypass the browser guard (a service worker has no `window`,
    // so the guard never fires) but because this flag is what makes the SDK
    // send the `anthropic-dangerous-direct-browser-access` header, which the
    // API requires for requests originating from an extension.
    dangerouslyAllowBrowser: true,
    maxRetries: 2,
  });

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: maxOutputTokens,
    // Summarising gains nothing from reasoning tokens; disabling them cuts both
    // latency and cost. Remove this line to trade money for quality.
    thinking: { type: 'disabled' },
    system,
    messages: [{ role: 'user', content: userContent }],
  });

  if (response.stop_reason === 'refusal') {
    throw appError('REFUSED', 'Le modèle a refusé de résumer ce contenu.');
  }

  return response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim();
}
