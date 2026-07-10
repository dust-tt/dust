import { getSandboxFunctionInvocationEvents } from "@app/lib/api/sandbox_functions/events";
import type { Authenticator } from "@app/lib/auth";
import type { SandboxFunctionResource } from "@app/lib/resources/sandbox_function_resource";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { z } from "zod";

// The runner Output envelope dsbx POSTs back as the result event. Mirrors Output in
// cli/dust-sandbox/functions-runner/protocol.ts.
const responseOutputSchema = z.object({
  status: z.number(),
  headers: z.record(z.string()),
  body: z.string().nullable(),
  encoding: z.enum(["utf8", "base64"]),
});
const resultEnvelopeSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), response: responseOutputSchema }),
  z.object({
    ok: z.literal(false),
    error: z.object({
      kind: z.string(),
      message: z.string(),
      stack: z.string().optional(),
    }),
  }),
]);

// Safety ceiling on waiting for the result event (delivered over the stream, not invoke()'s
// return). Under blocking exec it is already in history when we subscribe, so this rarely bites.
const CALL_RESULT_WAIT_TIMEOUT_MS = 2 * 60 * 1_000;

export type SandboxFunctionCallOutcome =
  | { ok: true; status: number; output: string }
  | { ok: false; errorKind: string; message: string };

function decodeResponseBody(
  body: string | null,
  encoding: "utf8" | "base64"
): string {
  if (body === null) {
    return "";
  }
  return encoding === "base64"
    ? Buffer.from(body, "base64").toString("utf8")
    : body;
}

/**
 * Invoke a sandbox function and wait for its result.
 *
 * Returns Err for infra failures (sandbox unavailable, exec failure, missing/unparseable result),
 * and Ok with `ok: false` when the function ran but returned an error envelope, so the caller can
 * surface that as a correctable tool error. Input is validated by the runner, not here.
 */
export async function callSandboxFunction(
  auth: Authenticator,
  sandboxFunction: SandboxFunctionResource,
  input: unknown
): Promise<Result<SandboxFunctionCallOutcome, Error>> {
  const invocationResult = await sandboxFunction.invoke(auth, { input });
  if (invocationResult.isErr()) {
    return invocationResult;
  }
  const { sId: invocationId } = invocationResult.value;

  for await (const { data } of getSandboxFunctionInvocationEvents({
    invocationId,
    lastEventId: null,
    signal: AbortSignal.timeout(CALL_RESULT_WAIT_TIMEOUT_MS),
  })) {
    // Terminal error published when the invocation failed before producing a result.
    if (data.type === "sandbox_function_invocation_error") {
      return new Err(new Error(data.message));
    }

    if (data.type !== "sandbox_function_invocation_result") {
      continue;
    }

    const parsed = resultEnvelopeSchema.safeParse(data.result);
    if (!parsed.success) {
      return new Err(
        new Error("Sandbox function returned an unexpected result envelope.")
      );
    }
    if (!parsed.data.ok) {
      return new Ok({
        ok: false,
        errorKind: parsed.data.error.kind,
        message: parsed.data.error.message,
      });
    }

    // A non-2xx (e.g. the runner's 400 on invalid input) is a valid response, not a tool error;
    // the handler surfaces the status so the model can react.
    const { response } = parsed.data;
    return new Ok({
      ok: true,
      status: response.status,
      output: decodeResponseBody(response.body, response.encoding),
    });
  }

  return new Err(
    new Error("Sandbox function did not return a result in time.")
  );
}
