import config from "@app/lib/api/config";
import type { PokeGetConversationConfig } from "@app/lib/api/poke/conversations";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { ConversationSandboxAdapter } from "@app/lib/resources/conversation_sandbox_adapter";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { pokeApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const ParamsSchema = z.object({
  cId: z.string(),
});

// Mounted at /api/poke/workspaces/:wId/conversations/:cId/config.
const app = pokeApp();

/** @ignoreswagger */
app.get(
  "/",
  validate("param", ParamsSchema),
  async (ctx): HandlerResult<PokeGetConversationConfig> => {
    const auth = ctx.get("auth");
    const { cId } = ctx.req.valid("param");

    const conversation = await ConversationResource.fetchById(auth, cId, {
      includeDeleted: true,
    });
    if (!conversation) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "conversation_not_found",
          message: "Conversation not found.",
        },
      });
    }

    const conversationDataSource = await DataSourceResource.fetchByConversation(
      auth,
      conversation
    );

    const sandbox = await ConversationSandboxAdapter.fetchSandbox(
      auth,
      conversation
    );

    return ctx.json({
      conversationDataSourceId: conversationDataSource?.sId ?? null,
      langfuseUiBaseUrl: config.getLangfuseUiBaseUrl() ?? null,
      sandbox: sandbox ? sandbox.toPokeJSON() : null,
      temporalWorkspace: config.getTemporalAgentNamespace() ?? "",
    });
  }
);

export default app;
