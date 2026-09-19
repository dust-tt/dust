import { untrustedFetch } from "@app/lib/egress/server";
import type { InferenceHookTranscriptMessage } from "@app/lib/inference_hook/transcript";
import type { DatadogAiGuardAction } from "@app/types/inference_hook";
import { DatadogAiGuardActions } from "@app/types/inference_hook";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { z } from "zod";

const ActionSchema = z.object({
  action: z.enum(DatadogAiGuardActions),
  reason: z.string().optional(),
});

/**
 * Accept either Dust-native `{ action, reason }` or Datadog JSON:API shape so
 * generic webhooks can stay simple while still interoperating.
 */
function parseEvaluateAction(
  json: unknown
): { action: DatadogAiGuardAction; reason: string | null } | null {
  const flat = ActionSchema.safeParse(json);
  if (flat.success) {
    return {
      action: flat.data.action,
      reason: flat.data.reason ?? null,
    };
  }

  const nested = z
    .object({
      data: z.object({
        attributes: ActionSchema,
      }),
    })
    .safeParse(json);
  if (nested.success) {
    return {
      action: nested.data.data.attributes.action,
      reason: nested.data.data.attributes.reason ?? null,
    };
  }

  return null;
}

export type GenericHttpEvaluateSuccess = {
  action: DatadogAiGuardAction;
  reason: string | null;
};

export async function evaluateGenericHttpHook({
  endpoint,
  apiKey,
  messages,
  phase,
  timeoutMs,
}: {
  endpoint: string;
  apiKey: string;
  messages: InferenceHookTranscriptMessage[];
  phase: "input" | "output";
  timeoutMs: number;
}): Promise<Result<GenericHttpEvaluateSuccess, Error>> {
  try {
    const response = await untrustedFetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        messages,
        phase,
        meta: { service: "dust-front" },
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      return new Err(
        new Error(
          `Inference hook evaluate returned ${response.status}: ${body.slice(0, 200)}`
        )
      );
    }

    let json: unknown;
    try {
      json = await response.json();
    } catch (error) {
      return new Err(normalizeError(error));
    }

    const parsed = parseEvaluateAction(json);
    if (!parsed) {
      return new Err(
        new Error(
          "Inference hook evaluate returned an invalid payload (expected action ALLOW|DENY|ABORT)."
        )
      );
    }

    return new Ok(parsed);
  } catch (error) {
    return new Err(normalizeError(error));
  }
}
