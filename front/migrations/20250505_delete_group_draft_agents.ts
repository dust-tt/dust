import { Authenticator } from "@app/lib/auth";
import { AgentConfiguration } from "@app/lib/models/assistant/agent";
import { GroupAgentModel } from "@app/lib/models/assistant/group_agent";
import { Workspace } from "@app/lib/models/workspace";
import { GroupResource } from "@app/lib/resources/group_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { makeScript } from "@app/scripts/helpers";

makeScript({}, async ({ execute }, logger) => {
  // get all ids of groups associated with draft agents
  const groups = await GroupAgentModel.findAll({
    attributes: ["groupId"],
    include: [
      {
        model: AgentConfiguration,
        where: {
          scope: "draft",
        },
        required: true,
      },
    ],
  });

  logger.info(`Found ${groups.length} groups associated with draft agents`);
  await concurrentExecutor(
    groups,
    async (groupModel) => {
      const group = await GroupResource.fetchByModelId(groupModel.id);
      const workspace = await Workspace.findOne({
        where: {
          id: group?.workspaceId,
        },
      });
      if (!workspace) {
        logger.error(`Workspace not found for group ${groupModel.id}`);
        return;
      }
      const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
      if (group && execute) {
        await group.delete(auth);
      }
    },
    {
      concurrency: 4,
    }
  );
});
