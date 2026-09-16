import { untrustedFetch } from "@app/lib/egress/server";
import type { InferenceHookTranscriptMessage } from "@app/lib/inference_hook/transcript";
import type { DatadogAiGuardAction } from "@app/types/inference_hook";
import { DatadogAiGuardActions } from "@app/types/inference_hook";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { z } from "zod";

const DatadogEvaluateAttributesSchema = z.object({
  action: z.enum(DatadogAiGuardActions),
  reason: z.string().optional(),
});

const DatadogEvaluateResponseSchema = z.object({
  data: z.object({
    attributes: DatadogEvaluateAttributesSchema,
  }),
});

export type DatadogAiGuardEvaluateSuccess = {
  action: DatadogAiGuardAction;
  reason: string | null;
};

export async function evaluateDatadogAiGuard({
  endpoint,
  apiKey,
  appKey,
  messages,
}: {
  endpoint: string;
  apiKey: string;
  appKey: string;
  messages: InferenceHookTranscriptMessage[];
}): Promise<Result<DatadogAiGuardEvaluateSuccess, Error>> {
  let response: Response;
  try {
    response = await untrustedFetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "DD-API-KEY": apiKey,
        "DD-APPLICATION-KEY": appKey,
      },
      body: JSON.stringify({
        data: {
          attributes: {
            messages,
            meta: { service: "dust-front" },
          },
        },
      }),
    });
  } catch (error) {
    return new Err(normalizeError(error));
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    return new Err(
      new Error(
        `AI Guard evaluate returned ${response.status}: ${body.slice(0, 200)}`
      )
    );
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch (error) {
    return new Err(normalizeError(error));
  }

  const parsed = DatadogEvaluateResponseSchema.safeParse(json);
  if (!parsed.success) {
    return new Err(
      new Error(
        `AI Guard evaluate returned an invalid payload: ${parsed.error.message}`
      )
    );
  }

  return new Ok({
    action: parsed.data.data.attributes.action,
    reason: parsed.data.data.attributes.reason ?? null,
  });
}
