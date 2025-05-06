import { Authenticator } from "@app/lib/auth";
import { AgentConfiguration } from "@app/lib/models/assistant/agent";
import { GroupAgentModel } from "@app/lib/models/assistant/group_agent";
import { Workspace } from "@app/lib/models/workspace";
import { GroupResource } from "@app/lib/resources/group_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { makeScript } from "@app/scripts/helpers";

makeScript({}, async ({ execute }, logger) => {
  // get all ids of groups associated with draft agents
  const groupAgentRels = await GroupAgentModel.findAll({
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

  logger.info(
    `Found ${groupAgentRels.length} groups associated with draft agents`
  );
  await concurrentExecutor(
    groupAgentRels,
    async (groupAgentRel) => {
      const group = await GroupResource.fetchByModelId(groupAgentRel.groupId);
      const workspace = await Workspace.findOne({
        where: {
          id: group?.workspaceId,
        },
      });
      if (!workspace) {
        logger.error(`Workspace not found for group ${groupAgentRel.groupId}`);
        return;
      }
      const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
      if (group) {
        logger.info({ groupName: group.name, id: group.id }, "Deleting");
        if (execute) {
          await group.delete(auth);
        }
      }
    },
    {
      concurrency: 4,
    }
  );
});
