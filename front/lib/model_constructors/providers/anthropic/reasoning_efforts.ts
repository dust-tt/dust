// The non-null reasoning efforts the Anthropic Messages API accepts. Lives at
// the provider level (not on a surface client) so both the stream/batch clients
// and the per-model config helpers can reference it without depending on a
// surface.
export const ANTHROPIC_SUPPORTED_NON_NULL_REASONING_EFFORTS = [
  "low",
  "medium",
  "high",
  "maximal",
] as const;
