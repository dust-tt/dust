// Shared config for Gemini 3.x models that expose the full set of native
// thinking levels (Flash, Flash-Lite). Pro narrows this further (no `minimal`),
// so it defines its own schema; the capability constants are still reused.

// Verified against https://ai.google.dev/gemini-api/docs/models (2026-06-18):
// Gemini 3.x has a 1M-token context window and up to 64k output tokens.
export const GEMINI_3_CONTEXT_SIZE = 1_000_000;
export const GEMINI_3_MAX_OUTPUT_TOKENS = 65_536;
