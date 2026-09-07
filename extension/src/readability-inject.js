/**
 * Injected into the page's isolated world before extraction, so that the
 * extraction function (which Chrome serialises as source text and therefore
 * cannot carry imports) can reach Readability through a global.
 */
import { Readability } from '@mozilla/readability';

globalThis.__articleSummarizerReadability = Readability;
