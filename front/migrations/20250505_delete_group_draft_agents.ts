import { Authenticator } from "@app/lib/auth";
import { AgentConfiguration } from "@app/lib/models/assistant/agent";
import { GroupAgentModel } from "@app/lib/models/assistant/group_agent";
import { GroupResource } from "@app/lib/resources/group_resource";
import { WorkspaceModel } from "@app/lib/resources/storage/models/workspace";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { makeScript } from "@app/scripts/helpers";
import { Op } from "sequelize";

makeScript({}, async ({ execute }, logger) => {
  // Get all groupIds that are associated with at least one draft agent
  const draftGroupLinks = await GroupAgentModel.findAll({
    attributes: ["groupId"],
    include: [
      {
        model: AgentConfiguration,
        where: {
          status: "draft",
        },
        required: true,
      },
    ],
  });

  const draftGroupIds = Array.from(
    new Set(draftGroupLinks.map((rel) => rel.groupId))
  );

  logger.info(
    `Found ${draftGroupIds.length} unique groups associated with draft agents`
  );

  // Only delete groups that are NOT linked to any non-draft agent versions
  await concurrentExecutor(
    draftGroupIds,
    async (groupId) => {
      // Check if the group is also linked to non-draft agents
      const linkedToNonDraft = await GroupAgentModel.findOne({
        where: { groupId },
        include: [
          {
            model: AgentConfiguration,
            where: { status: { [Op.ne]: "draft" } },
            required: true,
          },
        ],
      });

      if (linkedToNonDraft) {
        logger.info(
          { groupId },
          "Skipping deletion: group linked to non-draft agents"
        );
        return;
      }

      const group = await GroupResource.fetchByModelId(groupId);
      if (!group) {
        logger.info({ groupId }, "Group already deleted");
        return;
      }

      const workspace = await WorkspaceModel.findOne({
        where: { id: group.workspaceId },
      });
      if (!workspace) {
        logger.error({ groupId }, "Workspace not found for group");
        return;
      }

      const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
      logger.info({ groupName: group.name, id: group.id }, "Deleting group");
      if (execute) {
        await group.delete(auth);
      }
    },
    { concurrency: 4 }
  );
});
