import { z } from "zod";

// `code` is deliberately not an enum: front forwards the runner code or the API error type that
// caused the failure rather than mapping it onto a viz-side taxonomy, so validating against a
// copy of that taxonomy here would only turn every code viz has not heard of yet into
// `transport_error`.
const SandboxFunctionCallErrorPayloadSchema = z.object({
  code: z.string().min(1),
  message: z.string(),
  status: z.number().optional(),
});

type SandboxFunctionCallErrorPayload = z.infer<
  typeof SandboxFunctionCallErrorPayloadSchema
>;

export class SandboxFunctionCallError extends Error {
  readonly code: SandboxFunctionCallErrorPayload["code"];
  readonly status?: number;

  constructor(payload: SandboxFunctionCallErrorPayload) {
    super(payload.message);
    this.name = "SandboxFunctionCallError";
    this.code = payload.code;
    this.status = payload.status;
  }
}

export function normalizeSandboxFunctionCallError(
  error: unknown
): SandboxFunctionCallError {
  if (error instanceof SandboxFunctionCallError) {
    return error;
  }

  const parsed = SandboxFunctionCallErrorPayloadSchema.safeParse(error);
  if (parsed.success) {
    return new SandboxFunctionCallError(parsed.data);
  }

  return new SandboxFunctionCallError({
    code: "transport_error",
    message:
      error instanceof Error
        ? error.message
        : "Failed to call sandbox function.",
  });
}
