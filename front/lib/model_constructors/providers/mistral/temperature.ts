import { z } from "zod";

// Mistral accepts `temperature` in 0..1.5 — 1.5 is fine, 1.6 is rejected with
// "Input should be less than or equal to 1.5" (verified live on 2026-07-27
// against Large, Medium 3.5 and Small). That is wider than the shared
// `temperatureSchema` (0..1), which matches Anthropic.
export const mistralTemperatureSchema = z.number().min(0).max(1.5);

// Same range, minus greedy sampling. `temperature: 0` puts Mistral in greedy
// mode, which additionally requires `top_p: 1`; we do not send `top_p`, so the
// API answers "top_p must be 1 when using greedy sampling". Only Medium 3.5
// with reasoning on is affected — Small accepts 0 at every effort, and the
// non-reasoning models accept it too. 0.001 is already fine.
export const mistralNonGreedyTemperatureSchema = z.number().gt(0).max(1.5);
