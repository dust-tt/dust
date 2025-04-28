import { getAgentConfigurations } from "@app/lib/api/assistant/configuration";
import { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import { AgentConfiguration } from "@app/lib/models/assistant/agent";
import { GroupResource } from "@app/lib/resources/group_resource";
import { UserModel } from "@app/lib/resources/storage/models/user";
import { UserResource } from "@app/lib/resources/user_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import { LightAgentConfigurationType, LightWorkspaceType } from "@app/types";
import { Logger } from "pino";

const migrateWorkspaceEditorsGroups = async (
  execute: boolean,
  logger: Logger,
  workspace: LightWorkspaceType
) => {
  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
  const agents = await getAgentConfigurations({
    auth,
    agentsGetView: "admin_internal",
    variant: "light",
  });

  if (agents.length === 0) {
    return;
  }

  logger.info(
    `Found ${agents.length} agents to migrate on workspace ${workspace.sId}`
  );

  if (!execute) {
    return;
  }

  await concurrentExecutor(
    agents,
    (agent) => backfillAgentEditorsGroup(auth, agent),
    { concurrency: 4 }
  );

  logger.info(
    `Agent editors group backfill completed for workspace ${workspace.sId}`
  );
};

makeScript({}, async ({ execute }, logger) => {
  logger.info("Starting agent editors group backfill");

  runOnAllWorkspaces(
    async (workspace) => {
      await migrateWorkspaceEditorsGroups(execute, logger, workspace);
    },
    { concurrency: 4 }
  );

  logger.info("Agent editors group backfill completed");
});

async function backfillAgentEditorsGroup(
  auth: Authenticator,
  agent: LightAgentConfigurationType
): Promise<void> {
  // find all editors of this agent
  const agentConfigs = await AgentConfiguration.findAll({
    where: {
      sId: agent.sId,
    },
  });

  const editorIds = agentConfigs.map((agentConfig) => agentConfig.authorId);

  // get or create the editor group for this agent
  const activeConfig = agentConfigs.find(
    (agentConfig) => agentConfig.status === "active"
  );

  if (!activeConfig) {
    throw new Error("No active agent configuration found");
  }

  const editorGroupResult = await GroupResource.findEditorGroupForAgent(
    auth,
    agent
  );

  let editorGroup: GroupResource | null = null;

  if (editorGroupResult.isErr()) {
    if (
      editorGroupResult.error instanceof DustError &&
      editorGroupResult.error.code === "group_not_found"
    ) {
      // create the editor group
      editorGroup = await GroupResource.makeNewAgentEditorsGroup(
        auth,
        activeConfig
      );
    } else {
      throw editorGroupResult.error;
    }
  } else {
    editorGroup = editorGroupResult.value;
  }

  // set all the editors of the agent to the editor group
  const users = await UserResource.fetchByModelIds(editorIds);
  const result = await editorGroup.setMembers(
    auth,
    users.map((user) => user.toJSON())
  );

  if (result.isErr()) {
    throw result.error;
  }
}
