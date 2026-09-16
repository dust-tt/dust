import { assertNever } from "@app/types/shared/utils/assert_never";
import { z } from "zod";

/**
 * Closed provider registry. Add providers here; do not branch on provider id
 * at call sites. Lookup goes through INFERENCE_HOOK_PROVIDERS.
 *
 * `generic_http` is the unbranded webhook. `datadog_ai_guard` is the same
 * enforcement loop with Datadog AI Guard request/response and co-branding.
 */
export const INFERENCE_HOOK_PROVIDER_IDS = [
  "generic_http",
  "datadog_ai_guard",
] as const;
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
  /** Shown in Governance; Datadog is co-branded under Inference Hooks. */
  cobranded: boolean;
  requiresAppKey: boolean;
};

export const INFERENCE_HOOK_PROVIDERS: Record<
  InferenceHookProviderId,
  InferenceHookProviderMeta
> = {
  generic_http: {
    id: "generic_http",
    displayName: "Generic HTTP",
    description:
      "Call your own HTTPS evaluate endpoint with ALLOW / DENY / ABORT rulings.",
    cobranded: false,
    requiresAppKey: false,
  },
  datadog_ai_guard: {
    id: "datadog_ai_guard",
    displayName: "Datadog AI Guard",
    description:
      "Evaluate agent inputs and outputs for prompt attacks via Datadog AI Guard.",
    cobranded: true,
    requiresAppKey: true,
  },
};

export function isInferenceHookProviderId(
  value: string
): value is InferenceHookProviderId {
  return (INFERENCE_HOOK_PROVIDER_IDS as readonly string[]).includes(value);
}

/**
 * Maps a provider action (or any failure/garbage) to a Dust ruling.
 * Unknown values become block. Only typed ABORT terminates. Workspace
 * failMode / enforcementMode are applied later via applyHookPolicy.
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

export const InferenceHookEnforcementModes = ["monitor", "block"] as const;
export type InferenceHookEnforcementMode =
  (typeof InferenceHookEnforcementModes)[number];

export const InferenceHookFailModes = ["open", "closed"] as const;
export type InferenceHookFailMode = (typeof InferenceHookFailModes)[number];

/** Hard cap for evaluate wait. Config cannot exceed this. */
export const INFERENCE_HOOK_TIMEOUT_MS_MAX = 1000;
export const INFERENCE_HOOK_TIMEOUT_MS_DEFAULT = 1000;
export const INFERENCE_HOOK_ENFORCEMENT_MODE_DEFAULT: InferenceHookEnforcementMode =
  "block";
export const INFERENCE_HOOK_FAIL_MODE_DEFAULT: InferenceHookFailMode = "closed";

/**
 * Workspace-owned enforcement policy. Encoded as columns on the hook row so
 * monitor vs block and fail-open vs fail-closed are not scattered booleans.
 */
export type InferenceHookPolicy = {
  enforcementMode: InferenceHookEnforcementMode;
  failMode: InferenceHookFailMode;
  timeoutMs: number;
};

/**
 * Resolve the user-facing ruling from a provider outcome + workspace policy.
 * Transport/parse failures use failMode. Successful evaluations use
 * enforcementMode (monitor logs but always proceeds).
 */
export function applyHookPolicy({
  providerRuling,
  policy,
  isFailure,
}: {
  providerRuling: EnforcementRuling;
  policy: InferenceHookPolicy;
  isFailure: boolean;
}): EnforcementRuling {
  if (isFailure) {
    return policy.failMode === "open" ? "proceed" : "block";
  }
  if (policy.enforcementMode === "monitor") {
    return "proceed";
  }
  return providerRuling;
}

export const InferenceHookCredentialsSchema = z.object({
  apiKey: z.string().min(1),
  appKey: z.string().min(1).optional(),
});
export type InferenceHookCredentials = z.infer<
  typeof InferenceHookCredentialsSchema
>;

const DATADOG_EVALUATE_PATH = "/api/v2/ai-guard/evaluate";

export function parseInferenceHookEndpoint(
  raw: string,
  providerId: InferenceHookProviderId
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

  switch (providerId) {
    case "datadog_ai_guard": {
      if (url.pathname !== DATADOG_EVALUATE_PATH) {
        return {
          ok: false,
          message: `Endpoint path must be ${DATADOG_EVALUATE_PATH}.`,
        };
      }
      return {
        ok: true,
        endpoint: `${url.origin}${DATADOG_EVALUATE_PATH}`,
      };
    }
    case "generic_http": {
      if (!url.pathname || url.pathname === "/") {
        return {
          ok: false,
          message: "Generic endpoint must include a path.",
        };
      }
      // Keep path/query; drop hash.
      url.hash = "";
      return { ok: true, endpoint: url.toString() };
    }
    default:
      assertNever(providerId);
  }
}

export function parseInferenceHookTimeoutMs(
  raw: unknown
): { ok: true; timeoutMs: number } | { ok: false; message: string } {
  const value =
    typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
  if (!Number.isInteger(value) || value < 1) {
    return {
      ok: false,
      message: "Timeout must be an integer of at least 1ms.",
    };
  }
  if (value > INFERENCE_HOOK_TIMEOUT_MS_MAX) {
    return {
      ok: false,
      message: `Timeout must be at most ${INFERENCE_HOOK_TIMEOUT_MS_MAX}ms.`,
    };
  }
  return { ok: true, timeoutMs: value };
}

export function validateInferenceHookCredentials({
  providerId,
  apiKey,
  appKey,
}: {
  providerId: InferenceHookProviderId;
  apiKey: string | undefined;
  appKey: string | undefined;
}):
  | { ok: true; credentials: InferenceHookCredentials }
  | { ok: false; message: string } {
  if (!apiKey || apiKey.trim().length === 0) {
    return { ok: false, message: "API key is required." };
  }
  const meta = INFERENCE_HOOK_PROVIDERS[providerId];
  if (meta.requiresAppKey && (!appKey || appKey.trim().length === 0)) {
    return {
      ok: false,
      message: "Application key is required for Datadog AI Guard.",
    };
  }
  return {
    ok: true,
    credentials: {
      apiKey: apiKey.trim(),
      ...(appKey && appKey.trim().length > 0 ? { appKey: appKey.trim() } : {}),
    },
  };
}

export const UpsertInferenceHookBodySchema = z.object({
  providerId: z.enum(INFERENCE_HOOK_PROVIDER_IDS),
  endpoint: z.string().min(1),
  apiKey: z.string().min(1).optional(),
  appKey: z.string().min(1).optional(),
  enforcementMode: z.enum(InferenceHookEnforcementModes),
  failMode: z.enum(InferenceHookFailModes),
  timeoutMs: z.number().int().min(1).max(INFERENCE_HOOK_TIMEOUT_MS_MAX),
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
  enforcementMode: InferenceHookEnforcementMode;
  failMode: InferenceHookFailMode;
  timeoutMs: number;
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
