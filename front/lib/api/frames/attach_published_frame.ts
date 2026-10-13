import type { ToolGeneratedFileType } from "@app/lib/actions/mcp_internal_actions/output_schemas";
import type { Authenticator } from "@app/lib/auth";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import { FileResource } from "@app/lib/resources/file_resource";
import logger from "@app/logger/logger";
import { getFileDisplayName, isFrameContentType } from "@app/types/files";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
// oxlint-disable-next-line dust/enforceClientTypesInPublicApi okay as this is internal API
import { INTERNAL_MIME_TYPES } from "@dust-tt/client";

/**
 * Attaches the published Frame as a `TOOL_OUTPUT.FILE` on the parent sandbox
 * action so it appears in the agent message's `generatedFiles` (Frame card)
 * once the message is rendered or completes streaming.
 *
 * Best-effort from the publish route: missing frame/action or persist failure
 * should be logged and must not fail the publish HTTP response.
 */
export async function attachPublishedFrameToParentAction(
  auth: Authenticator,
  {
    actionId,
    frameId,
  }: {
    actionId: string;
    frameId: string;
  }
): Promise<Result<void, Error>> {
  const [frame, action] = await Promise.all([
    FileResource.fetchById(auth, frameId),
    AgentMCPActionResource.fetchById(auth, actionId),
  ]);

  if (!frame || !isFrameContentType(frame.contentType)) {
    logger.warn(
      { frameId, actionId },
      "Skipping Frame publish generated file: Frame not found."
    );
    return new Err(new Error(`Frame not found: ${frameId}`));
  }

  if (!action) {
    logger.warn(
      { actionId, frameId },
      "Skipping Frame publish generated file: parent action not found."
    );
    return new Err(new Error(`Parent action not found: ${actionId}`));
  }

  const title = getFileDisplayName(frame);
  const resource: ToolGeneratedFileType = {
    contentType: frame.contentType,
    fileId: frame.sId,
    mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.FILE,
    snippet: frame.snippet,
    text: `Published Frame '${frame.sId}' (${title}).`,
    title,
    uri: frame.getPublicUrl(auth),
  };
  const outputRes = await action.createOutputItems(auth, [
    {
      content: {
        type: "resource",
        resource,
      },
      fileId: frame.id,
    },
  ]);

  if (outputRes.isErr()) {
    return outputRes;
  }

  return new Ok(undefined);
}
