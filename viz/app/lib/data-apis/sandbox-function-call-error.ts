import { z } from "zod";

export const SANDBOX_FUNCTION_CALL_ERROR_CODES = [
  "bad_input",
  "invalid_input",
  "import_failed",
  "threw",
  "bad_return",
  "http_error",
  "invalid_output",
  "function_not_found",
  "invocation_failed",
  "transport_error",
  "not_supported",
] as const;

const SandboxFunctionCallErrorPayloadSchema = z.object({
  code: z.enum(SANDBOX_FUNCTION_CALL_ERROR_CODES),
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
