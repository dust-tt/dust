import { getConversation } from "@app/lib/api/assistant/conversation";
import type { Authenticator } from "@app/lib/auth";
import { AgentBrowseAction } from "@app/lib/models/assistant/actions/browse";
import { AgentDustAppRunAction } from "@app/lib/models/assistant/actions/dust_app_run";
import { AgentProcessAction } from "@app/lib/models/assistant/actions/process";
import { AgentRetrievalAction } from "@app/lib/models/assistant/actions/retrieval";
import { AgentTablesQueryAction } from "@app/lib/models/assistant/actions/tables_query";
import { AgentWebsearchAction } from "@app/lib/models/assistant/actions/websearch";
import { AgentMessage } from "@app/lib/models/assistant/conversation";
import { getDustProdAction } from "@app/lib/registry";
import { SpaceResource } from "@app/lib/resources/space_resource";
import type {
  ConversationError,
  PokeConversationType,
  Result,
} from "@app/types";
import { assertNever, Ok } from "@app/types";

export async function getPokeConversation(
  auth: Authenticator,
  conversationId: string,
  includeDeleted?: boolean
): Promise<Result<PokeConversationType, ConversationError>> {
  const conversation = await getConversation(
    auth,
    conversationId,
    includeDeleted
  );

  // Enrich the returned conversation with the apps runs linked to the agent messages
  // Decided to do it as a separate step because I didn't want to modify the getConversation to make it more complex based on the use case
  // and I still wanted to use the existing getConversation code for rendering.
  if (conversation.isOk()) {
    const pokeConversation = conversation.value as PokeConversationType;
    const globalSpace = await SpaceResource.fetchWorkspaceGlobalSpace(auth);
    // Cycle through the message and actions and enrich them with the runId(s)
    for (const messages of pokeConversation.content) {
      for (const m of messages) {
        if (m.type === "agent_message") {
          m.runIds = (
            await AgentMessage.findOne({
              where: { id: m.agentMessageId },
              attributes: ["runIds"],
              raw: true,
            })
          )?.runIds;

          if (m.actions.length > 0) {
            {
              for (const a of m.actions) {
                switch (a.type) {
                  case "browse_action": {
                    a.runId = (
                      await AgentBrowseAction.findOne({
                        where: { id: a.id },
                        attributes: ["runId"],
                        raw: true,
                      })
                    )?.runId;
                    const { app } = getDustProdAction("assistant-v2-browse");
                    a.appId = app.appId;
                    a.appSpaceId = app.appSpaceId;
                    a.appWorkspaceId = app.workspaceId;
                    break;
                  }
                  case "process_action": {
                    a.runId = (
                      await AgentProcessAction.findOne({
                        where: { id: a.id },
                        attributes: ["runId"],
                        raw: true,
                      })
                    )?.runId;
                    const { app } = getDustProdAction("assistant-v2-process");
                    a.appId = app.appId;
                    a.appSpaceId = app.appSpaceId;
                    a.appWorkspaceId = app.workspaceId;
                    break;
                  }
                  case "retrieval_action": {
                    a.runId = (
                      await AgentRetrievalAction.findOne({
                        where: { id: a.id },
                        attributes: ["runId"],
                        raw: true,
                      })
                    )?.runId;
                    const { app } = getDustProdAction("assistant-v2-retrieval");
                    a.appId = app.appId;
                    a.appSpaceId = app.appSpaceId;
                    a.appWorkspaceId = app.workspaceId;
                    break;
                  }
                  case "tables_query_action": {
                    a.runId = (
                      await AgentTablesQueryAction.findOne({
                        where: { id: a.id },
                        attributes: ["runId"],
                        raw: true,
                      })
                    )?.runId;
                    const { app } = getDustProdAction(
                      "assistant-v2-query-tables"
                    );
                    a.appId = app.appId;
                    a.appSpaceId = app.appSpaceId;
                    a.appWorkspaceId = app.workspaceId;
                    break;
                  }
                  case "websearch_action": {
                    a.runId = (
                      await AgentWebsearchAction.findOne({
                        where: { id: a.id },
                        attributes: ["runId"],
                        raw: true,
                      })
                    )?.runId;
                    const { app } = getDustProdAction("assistant-v2-websearch");
                    a.appId = app.appId;
                    a.appSpaceId = app.appSpaceId;
                    a.appWorkspaceId = app.workspaceId;
                    break;
                  }
                  case "dust_app_run_action": {
                    const runAction = await AgentDustAppRunAction.findOne({
                      where: { id: a.id },
                      attributes: ["runId", "appWorkspaceId", "appId"],
                      raw: true,
                    });

                    if (runAction) {
                      a.runId = runAction.runId;
                      a.appWorkspaceId = runAction.appWorkspaceId;
                      a.appSpaceId = globalSpace.sId;
                      a.appId = runAction.appId;
                    }
                    break;
                  }

                  case "mcp_action":
                    //TODO(mcp) link to the MCP action logs
                    break;

                  case "conversation_include_file_action":
                  case "conversation_list_files_action":
                  case "reasoning_action":
                  case "search_labels_action":
                    // TODO(REASONING TOOL): reasoning_action
                    // Theses actions do not call a dust app
                    break;

                  default:
                    assertNever(a);
                }
              }
            }
          }
        }
      }
    }
    return new Ok(pokeConversation);
  }

  return conversation;
}
