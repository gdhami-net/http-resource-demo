import { InjectionToken } from '@angular/core';

/** Where the recording server lives. See server/record-server.mjs. */
export const SEARCH_BASE = new InjectionToken<string>('SEARCH_BASE', {
  providedIn: 'root',
  factory: () => 'http://127.0.0.1:8931',
});

export interface SearchResponse {
  term: string;
  delayMs: number;
  results: string[];
}

/**
 * The server takes its own latency as a query parameter, which is the only way
 * this demo can script a race instead of hoping for one.
 */
export function searchUrl(base: string, term: string, delayMs: number): string {
  return `${base}/search?term=${encodeURIComponent(term)}&delay=${delayMs}`;
}
