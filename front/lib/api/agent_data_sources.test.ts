import {
  getDataSourcesUsageByCategory,
  getDataSourceUsage,
  getDataSourceViewsUsageByModelIds,
  getDataSourceViewUsage,
} from "@app/lib/api/agent_data_sources";
import { Authenticator } from "@app/lib/auth";
import { AgentDataSourceConfigurationModel } from "@app/lib/models/agent/actions/data_sources";
import { AgentTablesQueryConfigurationTableModel } from "@app/lib/models/agent/actions/tables_query";
import { AgentResource } from "@app/lib/resources/agent_resource";
import type { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import type { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { AgentMCPServerConfigurationFactory } from "@app/tests/utils/AgentMCPServerConfigurationFactory";
import { DataSourceViewFactory } from "@app/tests/utils/DataSourceViewFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MCPServerViewFactory } from "@app/tests/utils/MCPServerViewFactory";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import type { AgentConfigurationType } from "@app/types/assistant/agent";
import assert from "assert";
import { describe, expect, it } from "vitest";

describe("data source view/source usage with skills", () => {
  it("includes skills that attached the view as knowledge, respecting visibility", async () => {
    const testContext = await createResourceTest({ role: "admin" });
    const regularSpace = await SpaceFactory.regular(testContext.workspace);
    const view = await DataSourceViewFactory.folder(
      testContext.workspace,
      regularSpace
    );
    const unrelatedView = await DataSourceViewFactory.folder(
      testContext.workspace,
      regularSpace
    );

    const visibleSkill = await SkillFactory.create(testContext.authenticator, {
      name: "Visible skill",
      availability: "workspace_users",
      attachedKnowledge: [{ dataSourceView: view, nodeId: "node-1" }],
    });
    const restrictedSkill = await SkillFactory.create(
      testContext.authenticator,
      {
        name: "Restricted skill",
        availability: "editors",
        attachedKnowledge: [{ dataSourceView: view, nodeId: "node-1" }],
      }
    );

    // Admin sees both skills.
    const adminUsage = await getDataSourceViewsUsageByModelIds({
      auth: testContext.authenticator,
      dataSourceViewModelIds: [view.id, unrelatedView.id],
    });

    expect(adminUsage[view.id]?.count).toBe(2);
    expect(adminUsage[view.id]?.agents).toEqual([]);
    // Skills are sorted by name ("Restricted skill" < "Visible skill").
    expect(adminUsage[view.id]?.skills.map((skill) => skill.sId)).toEqual([
      restrictedSkill.sId,
      visibleSkill.sId,
    ]);
    expect(adminUsage[unrelatedView.id]).toBeUndefined();

    // A non-admin, non-editor member only sees the workspace_users-visible skill.
    const member = await UserFactory.basic();
    await MembershipFactory.associate(testContext.workspace, member, {
      role: "user",
    });
    const memberAuth = await Authenticator.fromUserIdAndWorkspaceId(
      member.sId,
      testContext.workspace.sId
    );

    const memberUsage = await getDataSourceViewsUsageByModelIds({
      auth: memberAuth,
      dataSourceViewModelIds: [view.id],
    });

    expect(memberUsage[view.id]?.count).toBe(1);
    expect(memberUsage[view.id]?.skills.map((skill) => skill.sId)).toEqual([
      visibleSkill.sId,
    ]);

    // The category-scoped variant (used for the system space) is keyed by
    // dataSource.id instead, but exercises the same skills merge.
    const categoryUsage = await getDataSourcesUsageByCategory({
      auth: testContext.authenticator,
      category: "folder",
    });

    expect(categoryUsage[view.dataSource.id]?.count).toBe(2);
    expect(
      categoryUsage[view.dataSource.id]?.skills.map((skill) => skill.sId)
    ).toEqual([restrictedSkill.sId, visibleSkill.sId]);

    // Single-item variants used by Poke and the delete-confirmation dialogs.
    const singleViewUsage = await getDataSourceViewUsage({
      auth: testContext.authenticator,
      dataSourceView: view,
    });
    expect(singleViewUsage.isOk() && singleViewUsage.value.count).toBe(2);
    expect(
      singleViewUsage.isOk() &&
        singleViewUsage.value.skills.map((skill) => skill.sId)
    ).toEqual([restrictedSkill.sId, visibleSkill.sId]);

    const singleSourceUsage = await getDataSourceUsage({
      auth: testContext.authenticator,
      dataSource: view.dataSource,
    });
    expect(singleSourceUsage.isOk() && singleSourceUsage.value.count).toBe(2);

    // A view with no skill (and no agent) attached has zero usage.
    const unrelatedSingleUsage = await getDataSourceViewUsage({
      auth: testContext.authenticator,
      dataSourceView: unrelatedView,
    });
    expect(
      unrelatedSingleUsage.isOk() && unrelatedSingleUsage.value.count
    ).toBe(0);
    expect(
      unrelatedSingleUsage.isOk() && unrelatedSingleUsage.value.skills
    ).toEqual([]);
  });
});

describe("data source view/source usage with agents", () => {
  it("only counts the current version of active agents, respecting scope for non-admins", async () => {
    const testContext = await createResourceTest({ role: "admin" });
    const auth = testContext.authenticator;
    const workspace = testContext.workspace;
    const regularSpace = await SpaceFactory.regular(workspace);
    const view = await DataSourceViewFactory.folder(workspace, regularSpace);
    const mcpServerView = await MCPServerViewFactory.internal(
      workspace,
      "search",
      regularSpace
    );

    const member = await UserFactory.basic();
    await MembershipFactory.associate(workspace, member, { role: "user" });
    const memberAuth = await Authenticator.fromUserIdAndWorkspaceId(
      member.sId,
      workspace.sId
    );

    const linkAgentToView = async (
      agent: AgentConfigurationType,
      dataSourceView: DataSourceViewResource,
      serverView: MCPServerViewResource,
      { withTable }: { withTable: boolean }
    ) => {
      const mcpServerConfiguration =
        await AgentMCPServerConfigurationFactory.create(auth, regularSpace, {
          agent,
          mcpServerView: serverView,
        });
      await AgentDataSourceConfigurationModel.create({
        workspaceId: workspace.id,
        dataSourceId: dataSourceView.dataSource.id,
        dataSourceViewId: dataSourceView.id,
        mcpServerConfigurationId: mcpServerConfiguration.id,
        tagsMode: null,
        tagsIn: null,
        tagsNotIn: null,
      });
      if (withTable) {
        await AgentTablesQueryConfigurationTableModel.create({
          workspaceId: workspace.id,
          tableId: "table-1",
          dataSourceId: dataSourceView.dataSource.id,
          dataSourceViewId: dataSourceView.id,
          mcpServerConfigurationId: mcpServerConfiguration.id,
        });
      }
    };

    const visibleAgent = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "A visible",
      scope: "visible",
    });
    await linkAgentToView(visibleAgent, view, mcpServerView, {
      withTable: true,
    });

    const hiddenAgent = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "B hidden",
      scope: "hidden",
    });
    await linkAgentToView(hiddenAgent, view, mcpServerView, {
      withTable: false,
    });

    const memberHiddenAgent = await AgentConfigurationFactory.createTestAgent(
      memberAuth,
      { name: "C member hidden", scope: "hidden" }
    );
    await linkAgentToView(memberHiddenAgent, view, mcpServerView, {
      withTable: false,
    });

    // The link sits on a superseded version: the current version has no tools.
    const supersededAgent = await AgentConfigurationFactory.createTestAgent(
      auth,
      { name: "D superseded", scope: "visible" }
    );
    await linkAgentToView(supersededAgent, view, mcpServerView, {
      withTable: true,
    });
    await AgentConfigurationFactory.updateTestAgent(auth, supersededAgent.sId, {
      name: "D superseded",
    });

    const archivedAgent = await AgentConfigurationFactory.createTestAgent(
      auth,
      { name: "E archived", scope: "visible" }
    );
    await linkAgentToView(archivedAgent, view, mcpServerView, {
      withTable: true,
    });
    const archivedAgentResource = await AgentResource.fetchById(
      auth,
      archivedAgent.sId
    );
    assert(archivedAgentResource);
    const archiveResult = await archivedAgentResource.archive(auth);
    expect(archiveResult.isOk()).toBe(true);

    const allCurrentAgentIds = [
      visibleAgent.sId,
      hiddenAgent.sId,
      memberHiddenAgent.sId,
    ];

    const adminUsage = await getDataSourceViewsUsageByModelIds({
      auth,
      dataSourceViewModelIds: [view.id],
    });
    expect(adminUsage[view.id]?.agents.map((agent) => agent.sId)).toEqual(
      allCurrentAgentIds
    );

    // A non-admin sees published agents and the hidden agents they edit.
    const memberUsage = await getDataSourceViewsUsageByModelIds({
      auth: memberAuth,
      dataSourceViewModelIds: [view.id],
    });
    expect(memberUsage[view.id]?.agents.map((agent) => agent.sId)).toEqual([
      visibleAgent.sId,
      memberHiddenAgent.sId,
    ]);

    const categoryUsage = await getDataSourcesUsageByCategory({
      auth,
      category: "folder",
    });
    expect(
      categoryUsage[view.dataSource.id]?.agents.map((agent) => agent.sId)
    ).toEqual(allCurrentAgentIds);

    const singleViewUsage = await getDataSourceViewUsage({
      auth,
      dataSourceView: view,
    });
    assert(singleViewUsage.isOk());
    expect(singleViewUsage.value.agents.map((agent) => agent.sId)).toEqual(
      allCurrentAgentIds
    );

    const singleSourceUsage = await getDataSourceUsage({
      auth,
      dataSource: view.dataSource,
    });
    assert(singleSourceUsage.isOk());
    expect(singleSourceUsage.value.agents.map((agent) => agent.sId)).toEqual(
      allCurrentAgentIds
    );
  });
});
