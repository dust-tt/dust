/* Commented out as this migration is no longer needed.
import { destroyConversationMessages } from "@app/lib/api/assistant/conversation/destroy";
import { Authenticator } from "@app/lib/auth";
import { MessageModel } from "@app/lib/models/agent/conversation";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { makeScript } from "@app/scripts/helpers";
import { Op } from "sequelize";

makeScript({}, async ({ execute }, logger) => {
  const workspaceIds = (
    await MessageModel.findAll({
      attributes: ["workspaceId"],
      group: ["workspaceId"],
      where: {
        branchId: { [Op.ne]: null },
      },
    })
  ).map((m) => m.workspaceId);
  for (const workspaceId of workspaceIds) {
    const workspace = await WorkspaceResource.fetchByModelId(workspaceId);
    if (!workspace) {
      logger.error({ workspaceId }, "Workspace not found");
      continue;
    }
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    const messages = await MessageModel.findAll({
      attributes: [
        "id",
        "userMessageId",
        "agentMessageId",
        "contentFragmentId",
        "compactionMessageId",
      ],
      where: {
        branchId: { [Op.ne]: null },
        workspaceId,
      },
    });

    if (execute) {
      await destroyConversationMessages(auth, messages);
    } else {
      logger.info(
        { workspaceId, messagesCount: messages.length },
        "Would delete branch messages"
      );
    }
  }

  logger.info({ execute }, "Completed delete branch messages");
});
*/
