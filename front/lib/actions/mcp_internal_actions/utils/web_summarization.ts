import type { AgentLoopRunContext } from "@app/lib/actions/types";
import { runMultiActionsAgent } from "@app/lib/api/assistant/call_llm";
import {
  getEffectiveWhiteListedProviders,
  getSmallWhitelistedModel,
  selectEnabledModel,
} from "@app/lib/api/assistant/models";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import type { ModelProviderIdType } from "@app/lib/resources/storage/models/workspace";
import type { ModelConversationTypeMultiActions } from "@app/types/assistant/generation";
import { GPT_5_6_LUNA_MODEL_CONFIG } from "@app/types/assistant/models/openai";
import type {
  ModelConfigurationType,
  ReasoningEffort,
} from "@app/types/assistant/models/types";
import type { WhitelistableFeature } from "@app/types/shared/feature_flags";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

const MAX_CHARACTERS_TO_SUMMARIZE = 100_000;
const browserSummaryAgentInstructions = `<primary_goal>
You are a web page summary agent. Your primary role is to summarize web page content.
You are provided with a web page content and you must produce a high quality comprehensive summary of the content.
Your goal is to remove the noise without altering meaning or removing important information. You may use a bullet-points-heavy format.
Provide URLs for sub-pages that that are relevant to the summary.
</primary_goal>`;

/**
 * Uses a direct LLM call via runMultiActionsAgent.
 * This avoids creating a conversation and streaming through the Dust API, instead making a direct
 * LLM call for faster summarization.
 */
export async function summarizeWithLLM({
  auth,
  content,
  agentLoopRunContext,
}: {
  auth: Authenticator;
  content: string;
  agentLoopRunContext: AgentLoopRunContext;
}): Promise<Result<string, Error>> {
  const toSummarize = content.slice(0, MAX_CHARACTERS_TO_SUMMARIZE);

  const featureFlags = await getFeatureFlags(auth);
  const whiteListedProviders = await getEffectiveWhiteListedProviders(auth);
  const modelConfig = getModelConfigForWebSummarization(
    auth,
    featureFlags,
    whiteListedProviders
  );
  if (!modelConfig) {
    return new Err(
      new Error("Failed to find a whitelisted model to generate summary")
    );
  }

  const conversation: ModelConversationTypeMultiActions = {
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Summarize the following web page content.\n\n${toSummarize}`,
          },
        ],
        name: "",
      },
    ],
  };

  const res = await runMultiActionsAgent(
    auth,
    {
      providerId: modelConfig.modelConfiguration.providerId,
      modelId: modelConfig.modelConfiguration.modelId,
      functionCall: null, // No function call needed, just text generation
      reasoningEffort: modelConfig.reasoningEffort,
      temperature: 0.3,
      useCache: false,
    },
    {
      conversation,
      prompt: browserSummaryAgentInstructions,
      specifications: [], // No tools needed for simple summarization
    },
    {
      context: {
        operationType: "web_content_summarization",
        userId: auth.user()?.sId,
        workspaceId: auth.getNonNullableWorkspace().sId,
        ...(agentLoopRunContext && {
          conversationId: agentLoopRunContext.conversation.sId,
        }),
      },
    }
  );

  if (res.isErr()) {
    return new Err(res.error);
  }

  const summary = res.value.generation?.trim();
  if (!summary) {
    return new Err(new Error("LLM returned empty summary"));
  }

  return new Ok(summary);
}

export function getModelConfigForWebSummarization(
  auth: Authenticator,
  featureFlags: WhitelistableFeature[],
  whiteListedProviders: ModelProviderIdType[] | null
): {
  modelConfiguration: ModelConfigurationType;
  reasoningEffort: ReasoningEffort;
} | null {
  const luna = selectEnabledModel(auth, [GPT_5_6_LUNA_MODEL_CONFIG], {
    featureFlags,
    whiteListedProviders,
  });
  if (luna) {
    return {
      modelConfiguration: luna,
      reasoningEffort: "light",
    };
  }

  const smallModel = getSmallWhitelistedModel(auth, new Set(), {
    featureFlags,
    whiteListedProviders,
  });
  return smallModel
    ? {
        modelConfiguration: smallModel,
        reasoningEffort: smallModel.defaultReasoningEffort,
      }
    : null;
}
