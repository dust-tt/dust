import assert from "assert";
import _ from "lodash";
import type { Logger } from "pino";
import { Op } from "sequelize";

import { Authenticator } from "@app/lib/auth";
import { AgentConfiguration } from "@app/lib/models/assistant/agent";
import { GroupAgentModel } from "@app/lib/models/assistant/group_agent";
import { GroupResource } from "@app/lib/resources/group_resource";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { GroupModel } from "@app/lib/resources/storage/models/groups";
import { WorkspaceModel } from "@app/lib/resources/storage/models/workspace";
import { UserResource } from "@app/lib/resources/user_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import type { LightWorkspaceType } from "@app/types";
import { AGENT_GROUP_PREFIX } from "@app/types";

async function backfillMissingEditorGroupForAgent(
  auth: Authenticator,
  agentConfigs: AgentConfiguration[],
  workspace: LightWorkspaceType,
  execute: boolean,
  logger: Logger
): Promise<void> {
  const activeAgentConfigs = agentConfigs.filter(
    (config) => config.status === "active"
  );

  if (activeAgentConfigs.length === 0) {
    return;
  }

  const currentConfig =
    _.maxBy(activeAgentConfigs, "version") ?? activeAgentConfigs[0];

  logger.info(
    { agent: currentConfig.sId, version: currentConfig.version },
    "Processing agent for missing editor group backfill"
  );

  const groupAgentRelationships = await GroupAgentModel.findAll({
    where: {
      agentConfigurationId: agentConfigs.map((config) => config.id),
      workspaceId: workspace.id,
    },
    attributes: ["groupId", "agentConfigurationId"],
  });

  const groupSet = new Set(
    groupAgentRelationships.map((relationship) => relationship.groupId)
  );

  if (groupSet.size > 1) {
    logger.warn(
      { agent: currentConfig.sId, groupCount: groupSet.size },
      "Skipping agent: multiple groups associated with configurations"
    );
    return;
  }

  const activeGroupAgentRelationships = groupAgentRelationships.filter(
    (relationship) => relationship.agentConfigurationId === currentConfig.id
  );

  let groupModel: GroupModel | null = null;

  if (groupSet.size === 1) {
    const [groupId] = Array.from(groupSet);
    groupModel = await GroupModel.findByPk(groupId);

    if (!groupModel) {
      logger.warn(
        { agent: currentConfig.sId, groupId },
        "Associated group not found, will create a new editor group"
      );
    }
  }

  const hadEditorGroupBefore =
    !!groupModel &&
    groupModel.kind === "agent_editors" &&
    activeGroupAgentRelationships.length > 0;

  // If the active configuration already has a proper editor group, there is nothing to do.
  if (hadEditorGroupBefore) {
    logger.info(
      { agent: currentConfig.sId },
      "Active agent already has an editor group, skipping"
    );
    return;
  }

  let editorGroup: GroupResource | null = null;

  if (groupModel) {
    // Reuse existing group, normalizing its kind if needed.
    if (groupModel.kind !== "agent_editors") {
      logger.info(
        { agent: currentConfig.sId, groupId: groupModel.id },
        "Updating group kind to agent_editors for agent"
      );
      if (execute) {
        await groupModel.update({
          kind: "agent_editors",
        });
      } else {
        groupModel.kind = "agent_editors";
      }
    }

    editorGroup = new GroupResource(GroupModel, groupModel.get());
  } else {
    logger.info(
      { agent: currentConfig.sId },
      "Creating editor group for agent with no associated group"
    );

    if (!execute) {
      // In dry-run mode, only log what would happen.
      return;
    }

    editorGroup = await GroupResource.makeNew({
      workspaceId: workspace.id,
      name: `${AGENT_GROUP_PREFIX} ${currentConfig.name} (${currentConfig.sId})`,
      kind: "agent_editors",
    });
  }

  assert(editorGroup, "Editor group should be defined at this point");

  const hasActiveAssociation = groupAgentRelationships.some(
    (relationship) =>
      relationship.agentConfigurationId === currentConfig.id &&
      relationship.groupId === editorGroup?.id
  );

  if (execute && !hasActiveAssociation) {
    await GroupAgentModel.create({
      groupId: editorGroup.id,
      agentConfigurationId: currentConfig.id,
      workspaceId: workspace.id,
    });
    logger.info(
      {
        agent: currentConfig.sId,
        groupId: editorGroup.id,
        agentConfigurationId: currentConfig.id,
      },
      "Linked editor group to active agent configuration"
    );
  }

  // Ensure the editor of the current version is a member of the editor group.
  const users = await UserResource.fetchByModelIds([currentConfig.authorId]);
  const [author] = users;

  if (!author) {
    logger.warn(
      { agent: currentConfig.sId, authorId: currentConfig.authorId },
      "Author for active agent configuration not found, skipping membership backfill"
    );
    return;
  }

  const { memberships } = await MembershipResource.getActiveMemberships({
    users: [author],
    workspace,
  });

  const isAuthorMember = memberships.some(
    (membership) => membership.userId === author.id
  );

  if (!isAuthorMember) {
    logger.warn(
      {
        agent: currentConfig.sId,
        authorId: currentConfig.authorId,
      },
      "Author is not an active member of the workspace, skipping membership backfill"
    );
    return;
  }

  if (execute) {
    const result = await editorGroup.addMembers(auth, [author.toJSON()]);
    if (result.isErr()) {
      if (result.error.code === "user_already_member") {
        logger.info(
          { agent: currentConfig.sId, authorId: author.id },
          "Author already member of editor group"
        );
      } else {
        throw result.error;
      }
    } else {
      logger.info(
        { agent: currentConfig.sId, authorId: author.id },
        "Added current version editor as member of editor group"
      );
    }
  }
}

const migrateWorkspaceMissingEditorGroups = async (
  execute: boolean,
  logger: Logger,
  workspace: LightWorkspaceType
) => {
  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

  const agents = await AgentConfiguration.findAll({
    where: {
      workspaceId: workspace.id,
      status: {
        [Op.not]: "draft",
      },
    },
  });

  if (agents.length === 0) {
    return;
  }

  const groupedAgents = Object.values(_.groupBy(agents, "sId"));

  logger.info(
    `Found ${groupedAgents.length} agents to inspect on workspace ${workspace.sId}`
  );

  await concurrentExecutor(
    groupedAgents,
    (agentConfigs) =>
      backfillMissingEditorGroupForAgent(
        auth,
        agentConfigs,
        workspace,
        execute,
        logger
      ),
    { concurrency: 4 }
  );

  logger.info(
    `Missing agent editors group backfill completed for workspace ${workspace.sId}`
  );
};

makeScript(
  {
    wId: { type: "string", required: false },
  },
  async ({ wId, execute }, logger) => {
    logger.info("Starting missing agent editors group backfill");

    if (wId) {
      const ws = await WorkspaceModel.findOne({ where: { sId: wId } });
      if (!ws) {
        throw new Error(`Workspace not found: ${wId}`);
      }
      await migrateWorkspaceMissingEditorGroups(
        execute,
        logger,
        renderLightWorkspaceType({ workspace: ws })
      );
    } else {
      await runOnAllWorkspaces(
        async (workspace) => {
          await migrateWorkspaceMissingEditorGroups(
            execute,
            logger,
            workspace
          );
        },
        { concurrency: 4 }
      );
    }

    logger.info("Missing agent editors group backfill completed");
  }
);

