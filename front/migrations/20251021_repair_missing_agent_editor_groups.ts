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

async function repairMissingEditorGroupForAgentSId(
  auth: Authenticator,
  workspace: LightWorkspaceType,
  agentConfigs: AgentConfiguration[],
  execute: boolean,
  logger: Logger
): Promise<void> {
  // agentConfigs contain all non-draft versions for a single sId
  const sId = agentConfigs[0].sId;
  logger.info({ sId }, "Checking agent for missing editor group");

  const links = await GroupAgentModel.findAll({
    where: {
      agentConfigurationId: agentConfigs.map((a) => a.id),
      workspaceId: workspace.id,
    },
    attributes: ["groupId", "agentConfigurationId"],
  });

  const groupIds = Array.from(new Set(links.map((l) => l.groupId)));
  const editorGroups = groupIds.length
    ? await GroupModel.findAll({
        where: {
          id: { [Op.in]: groupIds },
          workspaceId: workspace.id,
          kind: "agent_editors",
        },
        attributes: ["id", "name", "kind"],
      })
    : [];

  if (editorGroups.length > 0) {
    logger.info({ sId }, "Editor group already exists, skipping");
    return;
  }

  // No editor group across any non-draft versions: create one and associate.
  logger.info({ sId }, "Creating missing agent_editors group");
  if (!execute) {
    return;
  }

  // Create group
  const editorGroup = await GroupResource.makeNew({
    workspaceId: workspace.id,
    name: `${AGENT_GROUP_PREFIX} ${agentConfigs[0].name} (${sId})`,
    kind: "agent_editors",
  });
  assert(editorGroup, "Failed to create editor group");

  // Associate to all non-draft versions for this sId that lack the link
  const existingLinkedAgentIds = new Set(links.map((l) => l.agentConfigurationId));
  const toLink = agentConfigs
    .filter((c) => !existingLinkedAgentIds.has(c.id))
    .map((c) => ({
      groupId: editorGroup.id,
      agentConfigurationId: c.id,
      workspaceId: workspace.id,
    }));
  if (toLink.length > 0) {
    await GroupAgentModel.bulkCreate(toLink);
  }

  // Seed members = authors of all versions who are active in workspace
  const authorIds = Array.from(new Set(agentConfigs.map((a) => a.authorId)));
  const users = await UserResource.fetchByModelIds(authorIds);
  const { memberships } = await MembershipResource.getActiveMemberships({
    users,
    workspace,
  });
  const authorsInWorkspace = users.filter((u) =>
    memberships.some((m) => m.userId === u.id)
  );

  const setMembersRes = await editorGroup.setMembers(
    auth,
    authorsInWorkspace.map((u) => u.toJSON())
  );
  if (setMembersRes.isErr()) {
    throw setMembersRes.error;
  }
}

const repairWorkspace = async (
  execute: boolean,
  logger: Logger,
  workspace: LightWorkspaceType
) => {
  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

  // Get all non-draft agents for workspace
  const agents = await AgentConfiguration.findAll({
    where: {
      workspaceId: workspace.id,
      status: { [Op.ne]: "draft" },
    },
    attributes: [
      "id",
      "sId",
      "name",
      "status",
      "version",
      "authorId",
      "workspaceId",
    ],
  });

  if (agents.length === 0) {
    logger.info({ workspaceId: workspace.sId }, "No agents found");
    return;
  }

  // Filter to only sIds with zero agent_editors groups across their versions
  const bySId = _.groupBy(agents, (a) => a.sId);

  const candidates: AgentConfiguration[][] = [];
  for (const sId of Object.keys(bySId)) {
    const cfgs = bySId[sId]!;
    const links = await GroupAgentModel.findAll({
      where: {
        agentConfigurationId: cfgs.map((c) => c.id),
        workspaceId: workspace.id,
      },
      attributes: ["groupId"],
    });
    const groupIds = Array.from(new Set(links.map((l) => l.groupId)));
    if (groupIds.length === 0) {
      candidates.push(cfgs);
      continue;
    }
    const editorGroups = await GroupModel.count({
      where: {
        id: { [Op.in]: groupIds },
        workspaceId: workspace.id,
        kind: "agent_editors",
      },
    });
    if (editorGroups === 0) {
      candidates.push(cfgs);
    }
  }

  logger.info(
    {
      workspaceId: workspace.sId,
      candidates: candidates.length,
    },
    "Agents missing editor groups to repair"
  );

  await concurrentExecutor(
    candidates,
    (cfgs) => repairMissingEditorGroupForAgentSId(auth, workspace, cfgs, execute, logger),
    { concurrency: 4 }
  );
};

makeScript(
  {
    wId: { type: "string", required: false },
  },
  async ({ wId, execute }, logger) => {
    logger.info("Starting repair of missing agent editor groups");

    if (wId) {
      const ws = await WorkspaceModel.findOne({ where: { sId: wId } });
      if (!ws) {
        throw new Error(`Workspace not found: ${wId}`);
      }
      await repairWorkspace(execute, logger, renderLightWorkspaceType({ workspace: ws }));
    } else {
      await runOnAllWorkspaces(
        async (workspace) => {
          await repairWorkspace(execute, logger, workspace);
        },
        { concurrency: 4 }
      );
    }

    logger.info("Repair completed");
  }
);

