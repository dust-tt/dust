import { assertNever } from "@app/types/shared/utils/assert_never";
import { z } from "zod";

/**
 * Closed provider registry. Add providers here; do not branch on provider id
 * at call sites. Lookup goes through INFERENCE_HOOK_PROVIDERS.
 */
export const INFERENCE_HOOK_PROVIDER_IDS = ["datadog_ai_guard"] as const;
export type InferenceHookProviderId =
  (typeof INFERENCE_HOOK_PROVIDER_IDS)[number];

export const DatadogAiGuardActions = ["ALLOW", "DENY", "ABORT"] as const;
export type DatadogAiGuardAction = (typeof DatadogAiGuardActions)[number];

/**
 * Dust enforcement rulings. Provider-specific actions map through
 * toEnforcement; callers only see this closed union.
 */
export const EnforcementRulings = ["proceed", "block", "terminate"] as const;
export type EnforcementRuling = (typeof EnforcementRulings)[number];

export type InferenceHookProviderMeta = {
  id: InferenceHookProviderId;
  displayName: string;
  description: string;
};

export const INFERENCE_HOOK_PROVIDERS: Record<
  InferenceHookProviderId,
  InferenceHookProviderMeta
> = {
  datadog_ai_guard: {
    id: "datadog_ai_guard",
    displayName: "Datadog AI Guard",
    description:
      "Evaluate agent inputs and outputs for prompt attacks via Datadog AI Guard.",
  },
};

export function isInferenceHookProviderId(
  value: string
): value is InferenceHookProviderId {
  return (INFERENCE_HOOK_PROVIDER_IDS as readonly string[]).includes(value);
}

/**
 * Maps a provider action (or any failure/garbage) to a Dust ruling.
 * Fail-closed: unknown values become block. Only typed ABORT terminates.
 */
export function toEnforcement(action: unknown): EnforcementRuling {
  if (action === "ALLOW") {
    return "proceed";
  }
  if (action === "DENY") {
    return "block";
  }
  if (action === "ABORT") {
    return "terminate";
  }
  return "block";
}

export const InferenceHookCredentialsSchema = z.object({
  apiKey: z.string().min(1),
  appKey: z.string().min(1),
});
export type InferenceHookCredentials = z.infer<
  typeof InferenceHookCredentialsSchema
>;

const DATADOG_EVALUATE_PATH = "/api/v2/ai-guard/evaluate";

export function parseInferenceHookEndpoint(
  raw: string
): { ok: true; endpoint: string } | { ok: false; message: string } {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { ok: false, message: "Endpoint must be a valid URL." };
  }
  if (url.protocol !== "https:") {
    return { ok: false, message: "Endpoint must use HTTPS." };
  }
  if (url.pathname !== DATADOG_EVALUATE_PATH) {
    return {
      ok: false,
      message: `Endpoint path must be ${DATADOG_EVALUATE_PATH}.`,
    };
  }
  // Strip hash/search; keep origin + required path.
  return {
    ok: true,
    endpoint: `${url.origin}${DATADOG_EVALUATE_PATH}`,
  };
}

export const UpsertInferenceHookBodySchema = z.object({
  providerId: z.enum(INFERENCE_HOOK_PROVIDER_IDS),
  endpoint: z.string().min(1),
  apiKey: z.string().min(1),
  appKey: z.string().min(1),
});
export type UpsertInferenceHookBody = z.infer<
  typeof UpsertInferenceHookBodySchema
>;

/** Public API shape. Secrets never leave the resource layer. */
export type InferenceHookType = {
  sId: string;
  providerId: InferenceHookProviderId;
  endpoint: string;
  hasCredentials: boolean;
  createdAt: number;
  updatedAt: number;
};

export type GetInferenceHookResponseBody = {
  inferenceHook: InferenceHookType | null;
};

export type UpsertInferenceHookResponseBody = {
  inferenceHook: InferenceHookType;
};

export type DeleteInferenceHookResponseBody = {
  success: true;
};

export type InferenceHookEnforcementResult = {
  ruling: EnforcementRuling;
  code?: "inference_hook_blocked" | "inference_hook_terminated";
  message?: string;
};

export function enforcementUserFacing(
  ruling: EnforcementRuling
): InferenceHookEnforcementResult {
  switch (ruling) {
    case "proceed":
      return { ruling };
    case "block":
      return {
        ruling,
        code: "inference_hook_blocked",
        message:
          "This request was blocked by the workspace inference security policy.",
      };
    case "terminate":
      return {
        ruling,
        code: "inference_hook_terminated",
        message:
          "This conversation was terminated by the workspace inference security policy.",
      };
    default:
      assertNever(ruling);
  }
}
