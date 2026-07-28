import { z } from "zod";

// OpenAI's Responses API accepts `temperature` in 0..2 — 2 is fine, 2.1 is
// rejected with "Invalid 'temperature': decimal above maximum value" (verified
// live on 2026-07-27). That is wider than the shared `temperatureSchema`
// (0..1), which matches Anthropic's range, so OpenAI models that expose a real
// temperature use this one instead.
//
// Note this only applies with reasoning effort "none": with any other effort
// the Responses API accepts `1` and nothing else.
export const openaiTemperatureSchema = z.number().min(0).max(2);
