import { archiveAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import { GroupAgentModel } from "@app/lib/models/agent/group_agent";
import { GroupResource } from "@app/lib/resources/group_resource";
import logger from "@app/logger/logger";
import { backfillEditorGroups } from "@app/migrations/20260907_backfill_editor_groups";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import assert from "assert";
import { describe, expect, it } from "vitest";

describe("backfillEditorGroups", () => {
  it("creates a missing group with the author, skips drafts, and can be rerun", async () => {
    const {
      authenticator: auth,
      workspace,
      user,
    } = await createResourceTest({ role: "admin" });
    const draft = await AgentConfigurationFactory.createTestAgent(auth);
    const agent = await AgentConfigurationFactory.updateTestAgent(
      auth,
      draft.sId
    );
    const group = await GroupResource.fetchByAgentConfiguration({
      auth,
      agentConfiguration: agent,
    });
    assert(group);
    expect((await group.delete(auth)).isOk()).toBe(true);
    await AgentConfigurationModel.update(
      { status: "draft" },
      { where: { workspaceId: workspace.id, id: draft.id } }
    );

    await backfillEditorGroups(auth, agent.sId, false, logger);
    expect(
      (await GroupResource.findEditorGroupForAgent(auth, agent)).isErr()
    ).toBe(true);

    await backfillEditorGroups(auth, agent.sId, true, logger);
    const created = await GroupResource.fetchByAgentConfiguration({
      auth,
      agentConfiguration: agent,
    });
    assert(created);
    expect((await created.getActiveMembers(auth)).map(({ id }) => id)).toEqual([
      user.id,
    ]);
    expect(
      (await GroupResource.findEditorGroupForAgent(auth, draft)).isErr()
    ).toBe(true);

    await backfillEditorGroups(auth, agent.sId, true, logger);
    const reused = await GroupResource.fetchByAgentConfiguration({
      auth,
      agentConfiguration: agent,
    });
    expect(reused?.id).toBe(created.id);
  });

  it("reuses an earlier version's group for an archived agent", async () => {
    const {
      authenticator: auth,
      workspace,
      user,
    } = await createResourceTest({ role: "admin" });
    const first = await AgentConfigurationFactory.createTestAgent(auth);
    const latest = await AgentConfigurationFactory.updateTestAgent(
      auth,
      first.sId
    );
    const group = await GroupResource.fetchByAgentConfiguration({
      auth,
      agentConfiguration: first,
    });
    assert(group);
    await archiveAgentConfiguration(auth, latest.sId);
    // Reproduce the missing association without deleting the shared editor group.
    await GroupAgentModel.destroy({
      where: { workspaceId: workspace.id, agentConfigurationId: latest.id },
    });

    await backfillEditorGroups(auth, latest.sId, true, logger);
    const repaired = await GroupResource.fetchByAgentConfiguration({
      auth,
      agentConfiguration: latest,
    });
    expect(repaired?.id).toBe(group.id);
    expect((await group.getActiveMembers(auth)).map(({ id }) => id)).toEqual([
      user.id,
    ]);
  });
});
