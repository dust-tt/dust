import { getConversation } from "@app/lib/api/assistant/conversation/fetch";
import { renderConversationForModel } from "@app/lib/api/assistant/conversation_rendering";
import {
  buildSpecificationsWithReplayPlaceholders,
  getMissingActionCatcherFunctionCallIds,
  prepareModelRender,
} from "@app/lib/api/assistant/model_rendering";
import {
  getHistoricalRunAgentData,
  getPreviewRunAgentData,
  RenderTargetError,
} from "@app/lib/api/poke/conversation_render";
import { getFeatureFlags } from "@app/lib/auth";
import type { PostRenderConversationResponseBody } from "@app/types/api/poke/conversation_render";
import { pokeApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const RenderConversationBodySchema = z
  .object({
    agentId: z.string().optional(),
    agentMessageId: z.string().optional(),
    agentMessageVersion: z.number().int().nonnegative().optional(),
    contextSizeOverride: z.number().positive().nullable().optional(),
    excludeActions: z.boolean().optional(),
    excludeImages: z.boolean().optional(),
    onMissingAction: z.enum(["inject-placeholder", "skip"]).optional(),
    step: z.number().int().nonnegative().optional(),
  })
  .refine(
    (body) => body.agentId !== undefined || body.agentMessageId !== undefined,
    {
      message: "Either agentId or agentMessageId is required.",
    }
  );

const ParamsSchema = z.object({
  cId: z.string(),
});

// Mounted at /api/poke/workspaces/:wId/conversations/:cId/render.
const app = pokeApp();

/** @ignoreswagger */
app.post(
  "/",
  validate("param", ParamsSchema),
  validate("json", RenderConversationBodySchema),
  async (ctx): HandlerResult<PostRenderConversationResponseBody> => {
    const auth = ctx.get("auth");
    const { cId } = ctx.req.valid("param");
    const {
      agentId,
      agentMessageId,
      agentMessageVersion,
      contextSizeOverride,
      excludeActions,
      excludeImages,
      onMissingAction,
      step = 0,
    } = ctx.req.valid("json");

    const conversationRes = await getConversation(auth, cId, true);
    if (conversationRes.isErr()) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "conversation_not_found",
          message: conversationRes.error.message,
        },
      });
    }
    const conversation = conversationRes.value;

    const renderTarget = agentMessageId
      ? await getHistoricalRunAgentData(auth, {
          agentMessageId,
          agentMessageVersion,
          conversation,
          step,
        })
      : await getPreviewRunAgentData(auth, {
          agentId: agentId ?? "",
          conversation,
        });
    if (renderTarget instanceof RenderTargetError) {
      return apiError(ctx, {
        status_code: renderTarget.statusCode,
        api_error: {
          type: renderTarget.errorType,
          message: renderTarget.message,
        },
      });
    }

    const {
      agentMessage,
      conversation: conversationForRender,
      runAgentData,
      reconstruction,
    } = renderTarget;
    const featureFlags = await getFeatureFlags(auth);
    const preparedRender = await prepareModelRender(auth, {
      featureFlags,
      runAgentData,
      conversation: conversationForRender,
      agentMessage,
    });

    const { agentConfiguration, model } = runAgentData;
    const contextSize = contextSizeOverride ?? model.contextSize;
    const allowedTokenCount = Math.max(
      0,
      contextSize - model.generationTokensCount
    );
    const convoRes = await renderConversationForModel(auth, {
      conversation: conversationForRender,
      model,
      prompt: preparedRender.promptText,
      tools: preparedRender.tools,
      allowedTokenCount,
      excludeActions,
      excludeImages,
      onMissingAction,
      agentConfiguration,
      leadingMessages: preparedRender.leadingMessages,
      enabledSkills: preparedRender.enabledSkills,
    });
    if (convoRes.isErr()) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: convoRes.error.message,
        },
      });
    }

    const parsedToolDefinitions: unknown = JSON.parse(preparedRender.tools);
    const { diagnostics, modelConversation, prunedContext, tokensUsed } =
      convoRes.value;
    const { specifications } = buildSpecificationsWithReplayPlaceholders(
      preparedRender.baseSpecifications,
      {
        modelConversation,
        missingActionCatcherFunctionCallIds:
          getMissingActionCatcherFunctionCallIds(conversationForRender),
      }
    );

    return ctx.json({
      diagnostics,
      model: {
        contextSize: model.contextSize,
        generationTokensCount: model.generationTokensCount,
        modelId: model.modelId,
        providerId: model.providerId,
      },
      modelContextSizeUsed: contextSize,
      modelConversation,
      prompt: preparedRender.promptText,
      promptTokenCountApprox: diagnostics.tokenCounts.prompt,
      prunedContext,
      reconstruction,
      runtimeContext: {
        equippedSkillCount: preparedRender.equippedSkillCount,
        systemSkillCount: preparedRender.systemSkillCount,
        toolSearchEnabled: preparedRender.toolSearchEnabled,
      },
      tokensUsed,
      toolDefinitionsInContext: Array.isArray(parsedToolDefinitions)
        ? parsedToolDefinitions
        : [],
      toolSpecifications: specifications,
      toolsTokenCountApprox: diagnostics.tokenCounts.toolDefinitionsRaw,
    });
  }
);

export default app;
