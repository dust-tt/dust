import type { Authenticator } from "@app/lib/auth";
import { hasFeatureFlag } from "@app/lib/auth";
import { evaluateDatadogAiGuard } from "@app/lib/inference_hook/providers/datadog_ai_guard";
import { buildInferenceHookTranscript } from "@app/lib/inference_hook/transcript";
import { InferenceHookResource } from "@app/lib/resources/inference_hook_resource";
import logger from "@app/logger/logger";
import type {
  AssistantFunctionCallMessageTypeModel,
  ModelConversationTypeMultiActions,
} from "@app/types/assistant/generation";
import type { InferenceHookEnforcementResult } from "@app/types/inference_hook";
import {
  enforcementUserFacing,
  toEnforcement,
} from "@app/types/inference_hook";
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
  const credentials = hook.getCredentials(auth);
  if (!credentials) {
    logger.warn(
      {
        workspaceId: auth.getNonNullableWorkspace().sId,
        phase,
        providerId,
      },
      "Inference hook credentials missing or undecryptable; failing closed"
    );
    return enforcementUserFacing("block");
  }

  const messages = buildInferenceHookTranscript({
    systemPrompt,
    modelConversation,
    trailingAssistant,
  });

  if (messages.length === 0) {
    return { ruling: "proceed" };
  }

  switch (providerId) {
    case "datadog_ai_guard": {
      const result = await evaluateDatadogAiGuard({
        endpoint: hook.endpoint,
        apiKey: credentials.apiKey,
        appKey: credentials.appKey,
        messages,
      });

      if (result.isErr()) {
        logger.warn(
          {
            workspaceId: auth.getNonNullableWorkspace().sId,
            phase,
            providerId,
            error: result.error.message,
          },
          "Inference hook evaluate failed; failing closed"
        );
        return enforcementUserFacing("block");
      }

      const ruling = toEnforcement(result.value.action);
      logger.info(
        {
          workspaceId: auth.getNonNullableWorkspace().sId,
          phase,
          providerId,
          action: result.value.action,
          // Reason is audit-only; never forwarded to users/LLM.
          reason: result.value.reason,
          ruling,
        },
        "Inference hook evaluation completed"
      );
      return enforcementUserFacing(ruling);
    }
    default:
      assertNever(providerId);
  }
}
