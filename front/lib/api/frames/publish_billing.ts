import { buildServerSideMCPServerConfiguration } from "@app/lib/actions/configuration/helpers";
import { buildToolConfigurationsFromRawTools } from "@app/lib/actions/mcp_actions";
import {
  CREATE_INTERACTIVE_CONTENT_FILE_TOOL_NAME,
  INTERACTIVE_CONTENT_SERVER_NAME,
  PUBLISH_INTERACTIVE_CONTENT_FILE_TOOL_NAME,
} from "@app/lib/api/actions/servers/interactive_content/metadata";
import type { PublishFrameFromSourceResult } from "@app/lib/api/frames/publish_from_source";
import { createMCPAction } from "@app/lib/api/mcp/create_mcp";
import type { Authenticator } from "@app/lib/auth";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import type { ConversationResource } from "@app/lib/resources/conversation_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";

// The legacy Frame tools already carry the Frame prices: creating is "advanced", editing and
// publishing are "basic".
function getFramePublishBillingToolName(
  publication: PublishFrameFromSourceResult
): string {
  switch (publication.kind) {
    case "legacy":
      return PUBLISH_INTERACTIVE_CONTENT_FILE_TOOL_NAME;
    case "v2":
      return publication.created
        ? CREATE_INTERACTIVE_CONTENT_FILE_TOOL_NAME
        : PUBLISH_INTERACTIVE_CONTENT_FILE_TOOL_NAME;
    default:
      return assertNever(publication);
  }
}

/**
 * @cc [owner:davidebbo,label:product] frame-publish-recorded-as-child-action
 * Records exactly one `succeeded` sandbox child action of `parentActionId` on the
 * `interactive_content` server. Its tool MUST be `create_interactive_content_file` (advanced) when
 * the publish registered a new Frames v2 identity, and `publish_interactive_content_file` (basic)
 * for any other publish (v2 republish, legacy publish, legacy-to-v2 replacement). Agent message
 * billing prices the Frame publish through this action alone. Returns an error, recording nothing,
 * when the parent action or the `interactive_content` view cannot be found, or the tool is disabled.
 */
export async function recordFramePublishAction(
  auth: Authenticator,
  {
    conversation,
    parentActionId,
    publication,
  }: {
    conversation: ConversationResource;
    parentActionId: string;
    publication: PublishFrameFromSourceResult;
  }
): Promise<Result<void, Error>> {
  const parentAction = await AgentMCPActionResource.fetchById(
    auth,
    parentActionId
  );
  if (!parentAction) {
    return new Err(new Error(`Parent action ${parentActionId} not found.`));
  }

  const view = await MCPServerViewResource.getMCPServerViewForAutoInternalTool(
    auth,
    INTERACTIVE_CONTENT_SERVER_NAME,
    { mode: "configuration" }
  );
  if (!view) {
    return new Err(
      new Error("MCPServerView not found for interactive_content server.")
    );
  }

  const toolName = getFramePublishBillingToolName(publication);
  const toolConfigurations = await buildToolConfigurationsFromRawTools(
    auth,
    view.mcpServerId,
    buildServerSideMCPServerConfiguration({ mcpServerView: view }),
    [{ name: toolName, description: "" }],
    null
  );
  if (toolConfigurations.isErr()) {
    return toolConfigurations;
  }
  // Empty when the tool has been disabled by an admin.
  const [actionConfiguration] = toolConfigurations.value;
  if (!actionConfiguration) {
    return new Err(new Error(`Tool ${toolName} is disabled.`));
  }

  await createMCPAction(auth, {
    actionConfiguration,
    agentMessage: { agentMessageId: parentAction.agentMessageId },
    augmentedInputs: {
      frameId: publication.frameId,
      sourcePath: publication.sourcePath,
    },
    conversation,
    status: "succeeded",
    stepContent: parentAction.stepContent,
    stepContext: {
      citationsCount: 0,
      citationsOffset: parentAction.stepContext.citationsOffset,
      resumeState: null,
      retrievalTopK: 0,
      websearchResultCount: 0,
      sandboxChildActionInfo: { parentActionId: parentAction.sId },
    },
  });

  return new Ok(undefined);
}
