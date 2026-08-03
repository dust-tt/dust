import { z } from "zod";

// Gemini accepts `temperature` in 0..2 — 2 is fine, 2.1 is rejected with
// "temperature must be in the range [0.0, 2.0]" (verified live on 2026-07-27
// against Flash, Flash-Lite and Pro, with thinking both on and off). That is
// wider than the shared `temperatureSchema` (0..1), which matches Anthropic.
//
// Google *recommends* `temperature: 1` for Gemini 3, but recommending is not
// rejecting: every value in range is accepted. Forcing 1 is a Dust product
// choice and lives in the llms layer as a `configParsers` entry, not here — the
// endpoint schema mirrors the API.
export const geminiTemperatureSchema = z.number().min(0).max(2);
