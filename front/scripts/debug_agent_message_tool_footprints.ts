/**
 * Explains how stored tool footprints compare with tokenizer variants and provider usage.
 *
 * This script is read-only and never logs tool result contents.
 *
 * npx tsx scripts/debug_agent_message_tool_footprints.ts \
 *   --workspaceId 8DpNy5tEUG \
 *   --agentMessageId Ut5LbnRe3M \
 *   --compareOpenAI \
 *   --compareGemini \
 *   --execute
 */

import { getToolNameFromFunctionCallName } from "@app/lib/actions/tool_display_labels";
import { isSandboxChildActionInfo } from "@app/lib/actions/types";
import { AGENT_MESSAGE_CONSUMPTION_ATTRIBUTION_VERSION } from "@app/lib/api/assistant/agent_message_consumption_attribution/attribution_builder";
import {
  getEnabledSkillIdsFromAction,
  getEnabledSkillInputTextByActionId,
} from "@app/lib/api/assistant/agent_message_consumption_attribution/enabled_skill_footprint";
import { toolCallFootprintTexts } from "@app/lib/api/assistant/agent_message_consumption_attribution/tool_footprint";
import { getLlmCredentials } from "@app/lib/api/provider_credentials";
import { Authenticator } from "@app/lib/auth";
import { buildAgentMessageBillingPlan } from "@app/lib/credits/agent_message_billing";
import { roundCreditsToMicroCredits } from "@app/lib/credits/units";
import { trustedFetch } from "@app/lib/egress/server";
import { getModelConfigByModelId } from "@app/lib/llms/model_configurations";
import {
  OPENAI_EU_BASE_URL,
  OPENAI_GLOBAL_BASE_URL,
} from "@app/lib/model_constructors/providers/openai/base_url";
import { isToolSearchEnabledForModel } from "@app/lib/model_constructors/types/tool_search";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import { AgentMessageConsumptionItemResource } from "@app/lib/resources/agent_message_consumption_item_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import type { RunUsageWithRunKeyType } from "@app/lib/resources/run_resource";
import { RunResource } from "@app/lib/resources/run_resource";
import { tokenCountForTexts } from "@app/lib/tokenization";
import { makeScript } from "@app/scripts/helpers";
import type { AgentMCPActionWithOutputType } from "@app/types/actions";
import type { ModelId } from "@app/types/shared/model_id";
import type { TiktokenTokenizerBase } from "@app/types/tokenizer";
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";

const TOKENIZER_BASES = [
  "r50k_base",
  "o200k_base",
  "cl100k_base",
] as const satisfies TiktokenTokenizerBase[];

type TokenCounts = {
  configuredAdjustedInput: number;
  configuredAdjustedCall: number;
  configuredRawInput: number;
  geminiInputTokensIncludingFraming?: number;
  openAIInputTokensIncludingFraming?: number;
  rawInputByTokenizerBase: Partial<Record<TiktokenTokenizerBase, number>>;
};

const OpenAIInputTokenCountResponseSchema = z.object({
  input_tokens: z.number().int().nonnegative(),
});

function openAIBaseUrl(credentials: {
  OPENAI_BASE_URL?: string;
  OPENAI_USE_EU_ENDPOINT?: string;
}): string {
  if (credentials.OPENAI_BASE_URL) {
    return credentials.OPENAI_BASE_URL;
  }
  return credentials.OPENAI_USE_EU_ENDPOINT === "true"
    ? OPENAI_EU_BASE_URL
    : OPENAI_GLOBAL_BASE_URL;
}

async function countOpenAIInputTokens({
  apiKey,
  baseUrl,
  input,
  modelId,
}: {
  apiKey: string;
  baseUrl: string;
  input: string;
  modelId: string;
}): Promise<number> {
  const endpoint = new URL(
    "responses/input_tokens",
    `${baseUrl.replace(/\/$/, "")}/`
  );
  const response = await trustedFetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: modelId, input }),
  });
  if (!response.ok) {
    throw new Error(
      `OpenAI input-token count failed for ${modelId} with HTTP ${response.status}.`
    );
  }

  return OpenAIInputTokenCountResponseSchema.parse(await response.json())
    .input_tokens;
}

async function countGeminiInputTokens({
  client,
  input,
  modelId,
}: {
  client: GoogleGenAI;
  input: string;
  modelId: string;
}): Promise<number> {
  const response = await client.models.countTokens({
    model: modelId,
    contents: input,
  });
  if (response.totalTokens === undefined) {
    throw new Error(
      `Gemini input-token count returned no total for ${modelId}.`
    );
  }

  return response.totalTokens;
}

async function tokenizeOrThrow({
  auth,
  model,
  texts,
}: {
  auth: Authenticator;
  model: Parameters<typeof tokenCountForTexts>[1];
  texts: string[];
}): Promise<number[]> {
  const credentials = await getLlmCredentials(auth, {
    skipEmbeddingApiKeyRequirement: true,
  });
  const result = await tokenCountForTexts(texts, model, credentials);
  if (result.isErr()) {
    throw result.error;
  }
  return result.value;
}

function providerNewInputTokens(usage: RunUsageWithRunKeyType): number {
  return usage.promptTokens - (usage.cachedTokens ?? 0);
}

makeScript(
  {
    workspaceId: {
      type: "string",
      demandOption: true,
      description: "Workspace sId.",
    },
    agentMessageId: {
      type: "string",
      demandOption: true,
      description: "Agent message sId.",
    },
    compareOpenAI: {
      type: "boolean",
      default: false,
      description:
        "Send rendered tool-result text to OpenAI's input-token count endpoint; its count includes request framing.",
    },
    compareGemini: {
      type: "boolean",
      default: false,
      description:
        "Send rendered tool-result text to Gemini's countTokens endpoint; its count includes request framing.",
    },
  },
  async ({
    agentMessageId,
    compareGemini,
    compareOpenAI,
    execute,
    workspaceId,
  }) => {
    if (!execute) {
      console.log("Read-only diagnostic. Pass --execute to run it.");
      return;
    }

    const auth = await Authenticator.internalBuilderForWorkspace(workspaceId);
    const creditContext =
      await ConversationResource.fetchAgentMessageCreditContext(auth, {
        agentMessageId,
      });
    if (!creditContext) {
      throw new Error(`Agent message ${agentMessageId} was not found.`);
    }
    const analyticsContext =
      await ConversationResource.fetchAgentMessageConsumptionAnalyticsContext(
        auth,
        { agentMessageId }
      );

    const dustRunIds = [...new Set(creditContext.runIds ?? [])];
    const runs = await RunResource.listByDustRunIds(auth, { dustRunIds });
    const usages = await RunResource.listRunUsagesForRuns(auth, { runs });
    const [actions, items] = await Promise.all([
      AgentMCPActionResource.listByAgentMessageIds(auth, [
        creditContext.agentMessageModelId,
      ]),
      AgentMessageConsumptionItemResource.listByAgentMessageModelIds(auth, {
        agentMessageModelIds: [creditContext.agentMessageModelId],
        maxAttributionVersion: AGENT_MESSAGE_CONSUMPTION_ATTRIBUTION_VERSION,
      }),
    ]);
    const billingPlan = buildAgentMessageBillingPlan({
      actions: actions.map((action) => ({
        actionId: action.sId,
        internalMCPServerName: action.metadata.internalMCPServerName,
        mcpServerId: action.metadata.mcpServerId ?? null,
        status: action.status,
        toolName: getToolNameFromFunctionCallName(action.functionCallName),
      })),
      contextOrigin: creditContext.triggeringUserMessageOrigin,
      runUsages: usages,
    });

    const currentItems = items.filter(
      (item) =>
        item.attributionVersion ===
        AGENT_MESSAGE_CONSUMPTION_ATTRIBUTION_VERSION
    );
    const currentToolItems = currentItems.filter((item) => item.isToolItem());
    const diagnosticAttributionVersion =
      currentItems.length > 0
        ? AGENT_MESSAGE_CONSUMPTION_ATTRIBUTION_VERSION
        : items.reduce(
            (latest, item) => Math.max(latest, item.attributionVersion),
            0
          );
    const diagnosticItems = items.filter(
      (item) => item.attributionVersion === diagnosticAttributionVersion
    );
    const diagnosticToolItems = diagnosticItems.filter((item) =>
      item.isToolItem()
    );
    const currentToolItemByActionModelId = new Map(
      currentToolItems.map((item) => [item.agentMCPActionId, item])
    );
    const toolItemByActionModelId = new Map(
      diagnosticToolItems.map((item) => [item.agentMCPActionId, item])
    );
    const runByDustRunId = new Map(runs.map((run) => [run.dustRunId, run]));
    const usagesByRunModelId = new Map<ModelId, RunUsageWithRunKeyType[]>();
    for (const usage of usages) {
      const runUsages = usagesByRunModelId.get(usage.runModelId) ?? [];
      runUsages.push(usage);
      usagesByRunModelId.set(usage.runModelId, runUsages);
    }

    const itemCountByVersion: Record<string, Record<string, number>> = {};
    for (const item of items) {
      const version = String(item.attributionVersion);
      const counts = itemCountByVersion[version] ?? {};
      counts[item.itemType] = (counts[item.itemType] ?? 0) + 1;
      itemCountByVersion[version] = counts;
    }

    const billedCreditAmountMicro =
      creditContext.previousCostCredits === null
        ? null
        : roundCreditsToMicroCredits(creditContext.previousCostCredits);
    const diagnosticGrossInputCreditAmountMicro = diagnosticItems.reduce(
      (total, item) =>
        item.itemType === "input"
          ? total + item.grossAttributedCreditAmountMicro
          : total,
      0
    );
    const diagnosticGrossNonInputCreditAmountMicro = diagnosticItems.reduce(
      (total, item) =>
        item.itemType === "input"
          ? total
          : total + item.grossAttributedCreditAmountMicro,
      0
    );
    const diagnosticGrossCreditAmountMicroByItemType = diagnosticItems.reduce<
      Record<string, number>
    >((counts, item) => {
      counts[item.itemType] =
        (counts[item.itemType] ?? 0) + item.grossAttributedCreditAmountMicro;
      return counts;
    }, {});
    const diagnosticDirectToolCreditAmountMicro = diagnosticToolItems.reduce(
      (total, item) => total + (item.directCreditAmountMicro ?? 0),
      0
    );
    const diagnosticReconciledCreditAmountMicro = diagnosticItems.reduce(
      (total, item) => total + (item.reconciledCreditAmountMicro ?? 0),
      0
    );
    const diagnosticReconciledItemCount = diagnosticItems.filter(
      (item) => item.reconciledCreditAmountMicro !== null
    ).length;
    const reconciledInputCreditAmountMicro =
      billedCreditAmountMicro === null
        ? null
        : billedCreditAmountMicro - diagnosticGrossNonInputCreditAmountMicro;

    const actionCoverage = actions.map((action) => {
      const dustRunId = action.stepContent.dustRunId;
      const run = dustRunId ? runByDustRunId.get(dustRunId) : undefined;
      const runUsages = run ? (usagesByRunModelId.get(run.id) ?? []) : [];
      const currentToolItem = currentToolItemByActionModelId.get(action.id);
      const diagnosticToolItem = toolItemByActionModelId.get(action.id);
      const flags: string[] = [];

      if (!dustRunId) {
        flags.push("missing_step_dust_run_id");
      } else if (!run) {
        flags.push("step_dust_run_not_found_on_message");
      } else if (runUsages.length === 0) {
        flags.push("action_run_has_no_usage");
      }
      if (!currentToolItem) {
        flags.push("missing_current_tool_item");
      }
      if (!diagnosticToolItem) {
        flags.push("missing_diagnostic_tool_item");
      }

      return {
        actionModelId: action.id,
        actionId: action.sId,
        toolName: action.toolConfiguration.originalName,
        actionStatus: action.status,
        actionUpdatedAt: action.updatedAt,
        isSandboxChild: isSandboxChildActionInfo(
          action.stepContext.sandboxChildActionInfo
        ),
        dustRunId,
        runModelId: run?.id,
        runUsageModelIds: runUsages.map((usage) => usage.runUsageModelId),
        currentToolItemRunUsageModelId: currentToolItem?.runUsageId,
        diagnosticToolItemRunUsageModelId: diagnosticToolItem?.runUsageId,
        flags,
      };
    });
    const coverageFlags: string[] = [];
    if (currentItems.length === 0) {
      coverageFlags.push("no_current_version_items");
    } else if (currentToolItems.length === 0 && actions.length > 0) {
      coverageFlags.push("no_current_tool_items");
    }
    if (
      reconciledInputCreditAmountMicro !== null &&
      reconciledInputCreditAmountMicro < 0
    ) {
      coverageFlags.push("non_input_attribution_exceeds_bill");
    }
    if (actionCoverage.some((action) => action.flags.length > 0)) {
      coverageFlags.push("action_coverage_gaps");
    }

    console.log("\nAttribution coverage");
    console.table([
      {
        workspace: workspaceId,
        message: agentMessageId,
        currentVersion: AGENT_MESSAGE_CONSUMPTION_ATTRIBUTION_VERSION,
        inspectedVersion: diagnosticAttributionVersion,
        currentItems: currentItems.length,
        inspectedItems: diagnosticItems.length,
        billedCredits: creditContext.previousCostCredits,
        grossInputCredits: diagnosticGrossInputCreditAmountMicro / 1_000_000,
        grossNonInputCredits:
          diagnosticGrossNonInputCreditAmountMicro / 1_000_000,
        directToolCredits: diagnosticDirectToolCreditAmountMicro / 1_000_000,
        reconciledItems: `${diagnosticReconciledItemCount}/${diagnosticItems.length}`,
        reconciledCredits: diagnosticReconciledCreditAmountMicro / 1_000_000,
        inputBudget:
          reconciledInputCreditAmountMicro === null
            ? "n/a"
            : reconciledInputCreditAmountMicro / 1_000_000,
        completedAt:
          analyticsContext?.agentMessage.completedAt?.toISOString() ?? "n/a",
        flags: coverageFlags.join(", ") || "none",
      },
    ]);
    console.log("\nItems by version");
    console.table(
      Object.entries(itemCountByVersion).map(([version, counts]) => ({
        version,
        ...counts,
      }))
    );
    console.log("\nGross credits by item type");
    console.table(
      Object.entries(diagnosticGrossCreditAmountMicroByItemType).map(
        ([itemType, amountMicro]) => ({
          itemType,
          grossCredits: amountMicro / 1_000_000,
          directCredits:
            itemType === "tool"
              ? diagnosticDirectToolCreditAmountMicro / 1_000_000
              : 0,
          modelDerivedCredits:
            (amountMicro -
              (itemType === "tool"
                ? diagnosticDirectToolCreditAmountMicro
                : 0)) /
            1_000_000,
        })
      )
    );
    console.log("\nCanonical LLM billing lines");
    console.table(
      billingPlan.llm.map((line) => ({
        runKey: line.runKey,
        provider: line.providerId,
        model: line.modelId,
        promptTokens: line.promptTokensCount,
        cachedTokens: line.cachedTokensCount,
        cacheCreationTokens: line.cacheCreationTokensCount,
        completionTokens: line.completionTokensCount,
        providerCostMicroUsd: line.providerCostMicroUsd,
        ratedCredits: line.ratedCredits,
        billedCredits: line.billedCredits,
        disposition: line.billingDisposition,
      }))
    );
    console.log("\nCanonical tool billing lines");
    console.table(
      billingPlan.tools.map((line) => ({
        action: line.action.actionId,
        tool: line.action.toolName,
        category: line.toolCostCategory,
        ratedCredits: line.ratedCredits,
        billedCredits: line.billedCredits,
        disposition: line.billingDisposition,
      }))
    );
    console.log("\nCanonical billing totals");
    console.table([billingPlan.totals]);
    const coverageGaps = actionCoverage.filter(
      (coverage) => coverage.flags.length > 0
    );
    if (coverageGaps.length > 0) {
      console.log("\nAction coverage gaps");
      console.table(
        coverageGaps.map((coverage) => ({
          action: coverage.actionId,
          tool: coverage.toolName,
          status: coverage.actionStatus,
          updatedAt: coverage.actionUpdatedAt.toISOString(),
          runUsageIds: coverage.runUsageModelIds.join(", "),
          inspectedItemRunUsageId:
            coverage.diagnosticToolItemRunUsageModelId ?? "missing",
          flags: coverage.flags.join(", "),
        }))
      );
    }

    const modelVisibleActions = actions.filter(
      (action) =>
        toolItemByActionModelId.has(action.id) &&
        !isSandboxChildActionInfo(action.stepContext.sandboxChildActionInfo)
    );
    const enrichedActions =
      await AgentMCPActionResource.enrichActionsWithOutputItems(auth, {
        actions: modelVisibleActions,
        ignoreContent: false,
      });
    const actionResourceByModelId = new Map(
      modelVisibleActions.map((action) => [action.id, action])
    );
    const usageByModelId = new Map(
      usages.map((usage) => [usage.runUsageModelId, usage])
    );
    const enabledSkillIdsByActionId = new Map(
      enrichedActions.map((action) => [
        action.sId,
        getEnabledSkillIdsFromAction(action),
      ])
    );
    const actionsByModelId = new Map<string, AgentMCPActionWithOutputType[]>();
    for (const action of enrichedActions) {
      const item = toolItemByActionModelId.get(action.id);
      const usage = item ? usageByModelId.get(item.runUsageId) : undefined;
      if (!usage) {
        continue;
      }
      const modelActions = actionsByModelId.get(usage.modelId) ?? [];
      modelActions.push(action);
      actionsByModelId.set(usage.modelId, modelActions);
    }
    const enabledSkillInputTextByActionId = new Map<string, string>();
    for (const [modelId, modelActions] of actionsByModelId) {
      const configuredModel = getModelConfigByModelId(modelId);
      try {
        const modelInputTextByActionId =
          await getEnabledSkillInputTextByActionId(auth, modelActions, {
            toolSearchEnabled:
              configuredModel !== undefined &&
              isToolSearchEnabledForModel(configuredModel),
          });
        for (const [actionId, inputText] of modelInputTextByActionId) {
          enabledSkillInputTextByActionId.set(actionId, inputText);
        }
      } catch (error) {
        console.error(
          `\nEnabled-skill footprint failed for model ${modelId}. Continuing without its additional input text.`
        );
        console.error(error);
      }
    }

    const footprintInputs = enrichedActions.flatMap((action) => {
      const item = toolItemByActionModelId.get(action.id);
      const usage = item ? usageByModelId.get(item.runUsageId) : undefined;
      const actionResource = actionResourceByModelId.get(action.id);
      if (!item || !usage || !actionResource) {
        return [];
      }

      return [
        {
          action,
          item,
          usage,
          texts: toolCallFootprintTexts(
            {
              action,
              functionCallArguments: actionResource.functionCallArguments,
            },
            enabledSkillInputTextByActionId.get(action.sId)
          ),
        },
      ];
    });
    const footprintInputsByModelId = new Map<string, typeof footprintInputs>();
    for (const input of footprintInputs) {
      const modelInputs =
        footprintInputsByModelId.get(input.usage.modelId) ?? [];
      modelInputs.push(input);
      footprintInputsByModelId.set(input.usage.modelId, modelInputs);
    }

    const tokenCountsByActionModelId = new Map<ModelId, TokenCounts>();
    for (const [modelId, modelInputs] of footprintInputsByModelId) {
      const configuredModel = getModelConfigByModelId(modelId);
      if (!configuredModel) {
        console.warn(`Skipping unknown model configuration: ${modelId}`);
        continue;
      }

      const inputTexts = modelInputs.map(({ texts }) => texts.inputText);
      const callTexts = modelInputs.map(({ texts }) => texts.callText);
      const configuredAdjustedInput = await tokenizeOrThrow({
        auth,
        model: configuredModel,
        texts: inputTexts,
      });
      const configuredAdjustedCall = await tokenizeOrThrow({
        auth,
        model: configuredModel,
        texts: callTexts,
      });
      const configuredRawInput = await tokenizeOrThrow({
        auth,
        model: { ...configuredModel, tokenCountAdjustment: 1 },
        texts: inputTexts,
      });
      const rawInputCountsByTokenizerBase = new Map<
        TiktokenTokenizerBase,
        number[]
      >();
      for (const tokenizerBase of TOKENIZER_BASES) {
        rawInputCountsByTokenizerBase.set(
          tokenizerBase,
          await tokenizeOrThrow({
            auth,
            model: {
              ...configuredModel,
              tokenizer: { type: "tiktoken", base: tokenizerBase },
              tokenCountAdjustment: 1,
            },
            texts: inputTexts,
          })
        );
      }
      let openAIInputTokensIncludingFraming: number[] | undefined;
      if (compareOpenAI && configuredModel.providerId === "openai") {
        const credentials = await getLlmCredentials(auth, {
          skipEmbeddingApiKeyRequirement: true,
        });
        if (!credentials.OPENAI_API_KEY) {
          throw new Error("OPENAI_API_KEY is required for --compareOpenAI.");
        }
        const baseUrl = openAIBaseUrl(credentials);
        openAIInputTokensIncludingFraming = [];
        for (const inputText of inputTexts) {
          const tokensWithInput = await countOpenAIInputTokens({
            apiKey: credentials.OPENAI_API_KEY,
            baseUrl,
            input: inputText,
            modelId,
          });
          openAIInputTokensIncludingFraming.push(tokensWithInput);
        }
      }
      let geminiInputTokensIncludingFraming: number[] | undefined;
      if (compareGemini && configuredModel.providerId === "google_ai_studio") {
        const credentials = await getLlmCredentials(auth, {
          skipEmbeddingApiKeyRequirement: true,
        });
        if (!credentials.GOOGLE_AI_STUDIO_API_KEY) {
          throw new Error(
            "GOOGLE_AI_STUDIO_API_KEY is required for --compareGemini."
          );
        }
        const client = new GoogleGenAI({
          apiKey: credentials.GOOGLE_AI_STUDIO_API_KEY,
        });
        geminiInputTokensIncludingFraming = [];
        for (const inputText of inputTexts) {
          const tokensWithInput = await countGeminiInputTokens({
            client,
            input: inputText,
            modelId,
          });
          geminiInputTokensIncludingFraming.push(tokensWithInput);
        }
      }

      modelInputs.forEach(({ action }, index) => {
        tokenCountsByActionModelId.set(action.id, {
          configuredAdjustedInput: configuredAdjustedInput[index],
          configuredAdjustedCall: configuredAdjustedCall[index],
          configuredRawInput: configuredRawInput[index],
          geminiInputTokensIncludingFraming:
            geminiInputTokensIncludingFraming?.[index],
          openAIInputTokensIncludingFraming:
            openAIInputTokensIncludingFraming?.[index],
          rawInputByTokenizerBase: Object.fromEntries(
            TOKENIZER_BASES.map((tokenizerBase) => [
              tokenizerBase,
              rawInputCountsByTokenizerBase.get(tokenizerBase)?.[index],
            ])
          ),
        });
      });
    }

    const runOrderByModelId = new Map(
      [...runs]
        .sort(
          (left, right) =>
            left.createdAt.getTime() - right.createdAt.getTime() ||
            left.id - right.id
        )
        .map((run, index) => [run.id, index])
    );
    const orderedUsages = [...usages].sort(
      (left, right) =>
        (runOrderByModelId.get(left.runModelId) ?? Number.MAX_SAFE_INTEGER) -
          (runOrderByModelId.get(right.runModelId) ??
            Number.MAX_SAFE_INTEGER) ||
        left.runUsageModelId - right.runUsageModelId
    );
    const nextUsageByUsageModelId = new Map<ModelId, RunUsageWithRunKeyType>();
    for (let index = 0; index < orderedUsages.length - 1; index++) {
      nextUsageByUsageModelId.set(
        orderedUsages[index].runUsageModelId,
        orderedUsages[index + 1]
      );
    }

    const diagnostics = footprintInputs.flatMap(
      ({ action, item, texts, usage }) => {
        const counts = tokenCountsByActionModelId.get(action.id);
        if (!counts) {
          return [];
        }
        const nextUsage = nextUsageByUsageModelId.get(usage.runUsageModelId);
        const nextProviderInputTokens = nextUsage?.promptTokens ?? null;
        const nextProviderNewInputTokens = nextUsage
          ? providerNewInputTokens(nextUsage)
          : null;
        const flags = [];
        const enabledSkillIds = enabledSkillIdsByActionId.get(action.sId) ?? [];
        const enabledSkillInputText = enabledSkillInputTextByActionId.get(
          action.sId
        );
        if (counts.configuredAdjustedInput > counts.configuredRawInput) {
          flags.push("default_token_count_adjustment_inflates_footprint");
        }
        if (
          nextProviderInputTokens !== null &&
          counts.configuredRawInput > nextProviderInputTokens
        ) {
          flags.push("configured_tokenizer_exceeds_provider_input");
        }
        if (
          nextProviderInputTokens !== null &&
          (counts.rawInputByTokenizerBase.o200k_base ?? 0) >
            nextProviderInputTokens
        ) {
          flags.push("raw_rendered_result_exceeds_provider_input");
        }
        if (nextUsage === undefined && (item.inputTokensCount ?? 0) > 0) {
          flags.push("terminal_result_has_no_consuming_usage");
        }

        return [
          {
            actionModelId: action.id,
            actionId: action.sId,
            toolName: action.toolName,
            actionStatus: action.status,
            actionUpdatedAt: action.updatedAt,
            producingRunUsageModelId: usage.runUsageModelId,
            modelId: usage.modelId,
            configuredTokenizer: getModelConfigByModelId(usage.modelId)
              ?.tokenizer,
            resultTextCharacters: texts.inputText.length,
            storedResultTokens: item.inputTokensCount,
            storedCallTokens: item.outputTokensCount,
            storedDirectCreditAmountMicro: item.directCreditAmountMicro,
            storedGrossAttributedCreditAmountMicro:
              item.grossAttributedCreditAmountMicro,
            storedItemCompletedAt: item.completedAt,
            enabledSkillIds,
            enabledSkillResolution:
              enabledSkillIds.length === 0
                ? "no_skill_id"
                : enabledSkillInputText === undefined
                  ? "unresolved"
                  : "resolved",
            enabledSkillInputCharacters: enabledSkillInputText?.length ?? 0,
            computed: counts,
            storedMatchesCurrentComputation:
              item.inputTokensCount === counts.configuredAdjustedInput,
            nextUsage: nextUsage
              ? {
                  runUsageModelId: nextUsage.runUsageModelId,
                  promptTokens: nextUsage.promptTokens,
                  cachedTokens: nextUsage.cachedTokens,
                  cacheCreationTokens: nextUsage.cacheCreationTokens,
                  providerNewInputTokens: nextProviderNewInputTokens,
                }
              : null,
            flags,
          },
        ];
      }
    );

    const diagnosticsByProducingUsageModelId = new Map<
      ModelId,
      typeof diagnostics
    >();
    for (const diagnostic of diagnostics) {
      const usageDiagnostics =
        diagnosticsByProducingUsageModelId.get(
          diagnostic.producingRunUsageModelId
        ) ?? [];
      usageDiagnostics.push(diagnostic);
      diagnosticsByProducingUsageModelId.set(
        diagnostic.producingRunUsageModelId,
        usageDiagnostics
      );
    }

    const usageSummaries: Array<Record<string, unknown>> = [];
    for (const [
      producingRunUsageModelId,
      usageDiagnostics,
    ] of diagnosticsByProducingUsageModelId) {
      const nextUsage = nextUsageByUsageModelId.get(producingRunUsageModelId);
      const sum = (values: Array<number | null | undefined>) =>
        values.reduce<number>((total, value) => total + (value ?? 0), 0);
      const storedResultTokens = sum(
        usageDiagnostics.map((diagnostic) => diagnostic.storedResultTokens)
      );
      const configuredRawResultTokens = sum(
        usageDiagnostics.map(
          (diagnostic) => diagnostic.computed.configuredRawInput
        )
      );
      const o200kRawResultTokens = sum(
        usageDiagnostics.map(
          (diagnostic) => diagnostic.computed.rawInputByTokenizerBase.o200k_base
        )
      );
      const openAIInputTokensIncludingFraming = compareOpenAI
        ? sum(
            usageDiagnostics.map(
              (diagnostic) =>
                diagnostic.computed.openAIInputTokensIncludingFraming
            )
          )
        : null;
      const geminiInputTokensIncludingFraming =
        compareGemini &&
        usageDiagnostics.every(
          (diagnostic) =>
            diagnostic.computed.geminiInputTokensIncludingFraming !== undefined
        )
          ? sum(
              usageDiagnostics.map(
                (diagnostic) =>
                  diagnostic.computed.geminiInputTokensIncludingFraming
              )
            )
          : null;
      const nextProviderNewInputTokens = nextUsage
        ? providerNewInputTokens(nextUsage)
        : null;
      const nextProviderInputTokens = nextUsage?.promptTokens ?? null;

      usageSummaries.push({
        runUsageId: producingRunUsageModelId,
        actions: usageDiagnostics.length,
        storedResult: storedResultTokens,
        configuredRaw: configuredRawResultTokens,
        o200kRaw: o200kRawResultTokens,
        openAI:
          openAIInputTokensIncludingFraming === null
            ? "n/a"
            : openAIInputTokensIncludingFraming,
        gemini:
          geminiInputTokensIncludingFraming === null
            ? "n/a"
            : geminiInputTokensIncludingFraming,
        nextRunUsageId: nextUsage?.runUsageModelId ?? "none",
        providerInput: nextProviderInputTokens ?? "none",
        providerCachedInput: nextUsage?.cachedTokens ?? 0,
        providerNewInput: nextProviderNewInputTokens ?? "none",
        storedMinusProvider:
          nextProviderInputTokens === null
            ? "n/a"
            : storedResultTokens - nextProviderInputTokens,
        rawMinusProvider:
          nextProviderInputTokens === null
            ? "n/a"
            : configuredRawResultTokens - nextProviderInputTokens,
      });
    }

    if (usageSummaries.length > 0) {
      console.log("\nFootprints by producing run");
      console.table(usageSummaries);
    }

    if (diagnostics.length > 0) {
      console.log("\nTool footprints");
      console.table(
        diagnostics.map((diagnostic) => ({
          action: diagnostic.actionId,
          tool: diagnostic.toolName,
          status: diagnostic.actionStatus,
          actionUpdatedAt: new Date(diagnostic.actionUpdatedAt).toISOString(),
          model: diagnostic.modelId,
          runUsageId: diagnostic.producingRunUsageModelId,
          storedResult: diagnostic.storedResultTokens ?? "pending",
          rawResult: diagnostic.computed.configuredRawInput,
          storedCall: diagnostic.storedCallTokens,
          rawCall: diagnostic.computed.configuredAdjustedCall,
          directCredits:
            (diagnostic.storedDirectCreditAmountMicro ?? 0) / 1_000_000,
          grossCredits:
            diagnostic.storedGrossAttributedCreditAmountMicro / 1_000_000,
          nextProviderInput: diagnostic.nextUsage?.promptTokens ?? "none",
          nextProviderCachedInput: diagnostic.nextUsage?.cachedTokens ?? "none",
          nextProviderNewInput:
            diagnostic.nextUsage?.providerNewInputTokens ?? "none",
          skillIds: diagnostic.enabledSkillIds.join(", ") || "n/a",
          skillResolution: diagnostic.enabledSkillResolution,
          skillInputChars: diagnostic.enabledSkillInputCharacters,
          flags: diagnostic.flags.join(", ") || "none",
        }))
      );
    }

    console.log(
      `\nDone: ${creditContext.status}, ${runs.length} runs, ${usages.length} usages, ` +
        `${actions.length} actions, ${diagnostics.length} diagnosed tools.`
    );
  }
);
