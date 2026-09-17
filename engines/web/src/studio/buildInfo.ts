/** Embedded at build time — diagnostic only, not used in deterministic art. */

declare const __NUMBRANE_BUILD_SHA__: string | undefined;
declare const __NUMBRANE_BUILD_VERSION__: string | undefined;
declare const __NUMBRANE_BUILD_TIME__: string | undefined;

export const BUILD_SHA =
  typeof __NUMBRANE_BUILD_SHA__ !== "undefined" ? __NUMBRANE_BUILD_SHA__ : "dev";

export const BUILD_VERSION =
  typeof __NUMBRANE_BUILD_VERSION__ !== "undefined" ? __NUMBRANE_BUILD_VERSION__ : "0.1.0";

export const BUILD_TIME =
  typeof __NUMBRANE_BUILD_TIME__ !== "undefined" ? __NUMBRANE_BUILD_TIME__ : "local";

export function buildInfoLine(): string {
  return `commit ${BUILD_SHA} · built ${BUILD_TIME}`;
}
