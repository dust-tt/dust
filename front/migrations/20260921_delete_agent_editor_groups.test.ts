import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import { GroupAgentModel } from "@app/lib/models/agent/group_agent";
import { GroupResource } from "@app/lib/resources/group_resource";
import { GroupMembershipModel } from "@app/lib/resources/storage/models/group_memberships";
import { GroupPermissionModel } from "@app/lib/resources/storage/models/group_permissions";
import { GroupModel } from "@app/lib/resources/storage/models/groups";
import { KeyModel } from "@app/lib/resources/storage/models/keys";
import { deleteWorkspaceAgentEditorGroups } from "@app/migrations/20260921_delete_agent_editor_groups";
import baseLogger from "@app/logger/logger";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { GroupFactory } from "@app/tests/utils/GroupFactory";
import { KeyFactory } from "@app/tests/utils/KeyFactory";
import assert from "assert";
import { Op } from "sequelize";
import { describe, expect, it } from "vitest";

const logger = baseLogger.child({}, { level: "silent" });

describe("deleteWorkspaceAgentEditorGroups", () => {
  it("deletes legacy groups and their references in batches, idempotently", async () => {
    const { authenticator, workspace, user, globalGroup } =
      await createResourceTest({ role: "admin" });
    const agents = [
      await AgentConfigurationFactory.createTestAgent(authenticator, {
        name: "First agent",
      }),
      await AgentConfigurationFactory.createTestAgent(authenticator, {
        name: "Second agent",
      }),
    ];
    const agentModels = await AgentConfigurationModel.findAll({
      where: { workspaceId: workspace.id, id: agents.map(({ id }) => id) },
      order: [["id", "ASC"]],
    });
    expect(agentModels).toHaveLength(2);

    const legacyGroups: GroupResource[] = [];
    for (const agentModel of agentModels) {
      legacyGroups.push(
        await GroupResource.makeNewAgentEditorsGroup(
          authenticator,
          agentModel,
          { authorId: user.id }
        )
      );
    }
    const keptGroup = await GroupFactory.regularManual(
      workspace,
      "Kept manual group"
    );
    const key = await KeyFactory.regular([globalGroup, legacyGroups[0]]);
    await GroupPermissionModel.create({
      workspaceId: workspace.id,
      groupId: legacyGroups[0].id,
      grantType: "editor",
      resourceType: "agent",
      resourceId: agents[0].id,
    });

    const groupModelIds = legacyGroups.map(({ id }) => id);
    const expectedReferences = {
      memberships: await GroupMembershipModel.count({
        where: { workspaceId: workspace.id, groupId: groupModelIds },
      }),
      agentLinks: await GroupAgentModel.count({
        where: { workspaceId: workspace.id, groupId: groupModelIds },
      }),
      permissions: await GroupPermissionModel.count({
        where: { workspaceId: workspace.id, groupId: groupModelIds },
      }),
      keyReferences: await KeyModel.count({
        where: {
          workspaceId: workspace.id,
          groupIds: { [Op.overlap]: groupModelIds },
        },
      }),
    };

    await expect(
      deleteWorkspaceAgentEditorGroups({
        execute: false,
        logger,
        workspace,
        batchSize: 1,
      })
    ).resolves.toEqual({
      groups: 2,
      ...expectedReferences,
      deletedGroups: 0,
      batches: 2,
    });
    expect(
      await GroupModel.count({
        where: { workspaceId: workspace.id, kind: "agent_editors" },
      })
    ).toBe(2);

    await expect(
      deleteWorkspaceAgentEditorGroups({
        execute: true,
        logger,
        workspace,
        batchSize: 1,
      })
    ).resolves.toEqual({
      groups: 2,
      ...expectedReferences,
      deletedGroups: 2,
      batches: 2,
    });

    expect(
      await GroupModel.count({
        where: { workspaceId: workspace.id, id: groupModelIds },
      })
    ).toBe(0);
    expect(
      await GroupMembershipModel.count({
        where: { workspaceId: workspace.id, groupId: groupModelIds },
      })
    ).toBe(0);
    expect(
      await GroupAgentModel.count({
        where: { workspaceId: workspace.id, groupId: groupModelIds },
      })
    ).toBe(0);
    expect(
      await GroupPermissionModel.count({
        where: { workspaceId: workspace.id, groupId: groupModelIds },
      })
    ).toBe(0);

    const refreshedKey = await KeyModel.findOne({
      where: { workspaceId: workspace.id, id: key.id },
    });
    assert(refreshedKey);
    expect(refreshedKey.groupIds).toEqual([globalGroup.id]);
    expect(
      await GroupModel.count({
        where: { workspaceId: workspace.id, id: keptGroup.id },
      })
    ).toBe(1);

    await expect(
      deleteWorkspaceAgentEditorGroups({
        execute: true,
        logger,
        workspace,
        batchSize: 1,
      })
    ).resolves.toEqual({
      groups: 0,
      memberships: 0,
      agentLinks: 0,
      permissions: 0,
      keyReferences: 0,
      deletedGroups: 0,
      batches: 0,
    });
  });
});
