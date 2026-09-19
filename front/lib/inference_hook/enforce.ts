import type { Authenticator } from "@app/lib/auth";
import { hasFeatureFlag } from "@app/lib/auth";
import { evaluateDatadogAiGuard } from "@app/lib/inference_hook/providers/datadog_ai_guard";
import { evaluateGenericHttpHook } from "@app/lib/inference_hook/providers/generic_http";
import { buildInferenceHookTranscript } from "@app/lib/inference_hook/transcript";
import { InferenceHookResource } from "@app/lib/resources/inference_hook_resource";
import logger from "@app/logger/logger";
import type {
  AssistantFunctionCallMessageTypeModel,
  ModelConversationTypeMultiActions,
} from "@app/types/assistant/generation";
import type { InferenceHookEnforcementResult } from "@app/types/inference_hook";
import {
  applyHookPolicy,
  enforcementUserFacing,
  toEnforcement,
} from "@app/types/inference_hook";
import type { Result } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";

export async function enforceInferenceHooks(
  auth: Authenticator,
  {
    phase,
    systemPrompt,
    modelConversation,
    trailingAssistant,
  }: {
    phase: "input" | "output";
    systemPrompt?: string | null;
    modelConversation: ModelConversationTypeMultiActions;
    trailingAssistant?: AssistantFunctionCallMessageTypeModel | null;
  }
): Promise<InferenceHookEnforcementResult> {
  if (!(await hasFeatureFlag(auth, "inference_hooks"))) {
    return { ruling: "proceed" };
  }

  const hook = await InferenceHookResource.fetchForWorkspace(auth);
  if (!hook) {
    return { ruling: "proceed" };
  }

  const providerId = hook.getTypedProviderId();
  const policy = hook.getPolicy();
  const credentials = hook.getCredentials(auth);
  if (!credentials) {
    logger.warn(
      {
        workspaceId: auth.getNonNullableWorkspace().sId,
        phase,
        providerId,
        failMode: policy.failMode,
      },
      "Inference hook credentials missing or undecryptable"
    );
    return enforcementUserFacing(
      applyHookPolicy({
        providerRuling: "block",
        policy,
        isFailure: true,
      })
    );
  }

  const messages = buildInferenceHookTranscript({
    systemPrompt,
    modelConversation,
    trailingAssistant,
  });

  if (messages.length === 0) {
    return { ruling: "proceed" };
  }

  let result: Result<{ action: string; reason: string | null }, Error>;
  switch (providerId) {
    case "datadog_ai_guard": {
      if (!credentials.appKey) {
        return enforcementUserFacing(
          applyHookPolicy({
            providerRuling: "block",
            policy,
            isFailure: true,
          })
        );
      }
      result = await evaluateDatadogAiGuard({
        endpoint: hook.endpoint,
        apiKey: credentials.apiKey,
        appKey: credentials.appKey,
        messages,
        timeoutMs: policy.timeoutMs,
      });
      break;
    }
    case "generic_http": {
      result = await evaluateGenericHttpHook({
        endpoint: hook.endpoint,
        apiKey: credentials.apiKey,
        messages,
        phase,
        timeoutMs: policy.timeoutMs,
      });
      break;
    }
    default:
      assertNever(providerId);
  }

  if (result.isErr()) {
    logger.warn(
      {
        workspaceId: auth.getNonNullableWorkspace().sId,
        phase,
        providerId,
        error: result.error.message,
        failMode: policy.failMode,
        timeoutMs: policy.timeoutMs,
      },
      "Inference hook evaluate failed"
    );
    return enforcementUserFacing(
      applyHookPolicy({
        providerRuling: "block",
        policy,
        isFailure: true,
      })
    );
  }

  const providerRuling = toEnforcement(result.value.action);
  const ruling = applyHookPolicy({
    providerRuling,
    policy,
    isFailure: false,
  });
  logger.info(
    {
      workspaceId: auth.getNonNullableWorkspace().sId,
      phase,
      providerId,
      action: result.value.action,
      // Reason is audit-only; never forwarded to users/LLM.
      reason: result.value.reason,
      providerRuling,
      ruling,
      enforcementMode: policy.enforcementMode,
      failMode: policy.failMode,
    },
    "Inference hook evaluation completed"
  );
  return enforcementUserFacing(ruling);
}
