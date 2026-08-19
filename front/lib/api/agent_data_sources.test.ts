import {
  getDataSourcesUsageByCategory,
  getDataSourceUsage,
  getDataSourceViewsUsageByModelIds,
  getDataSourceViewUsage,
} from "@app/lib/api/agent_data_sources";
import { Authenticator } from "@app/lib/auth";
import { DataSourceViewFactory } from "@app/tests/utils/DataSourceViewFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
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
