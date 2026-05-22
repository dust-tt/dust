import config from "@app/lib/api/config";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { pokeApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";

export type PokeGetConversationConfig = {
  conversationDataSourceId: string | null;
  langfuseUiBaseUrl: string | null;
  temporalWorkspace: string;
};

// Mounted at /api/poke/workspaces/:wId/conversations/:cId/config.
const app = pokeApp();

app.get("/", async (ctx): HandlerResult<PokeGetConversationConfig> => {
  const auth = ctx.get("auth");
  const cId = ctx.req.param("cId") ?? "";

  const cRes = await ConversationResource.fetchConversationWithoutContent(
    auth,
    cId,
    { includeDeleted: true }
  );
  if (cRes.isErr()) {
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
    cRes.value
  );

  return ctx.json({
    conversationDataSourceId: conversationDataSource?.sId ?? null,
    langfuseUiBaseUrl: config.getLangfuseUiBaseUrl() ?? null,
    temporalWorkspace: config.getTemporalAgentNamespace() ?? "",
  });
});

export default app;
