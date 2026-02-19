import { createPendingAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import { GroupAgentModel } from "@app/lib/models/agent/group_agent";
import { GroupResource } from "@app/lib/resources/group_resource";
import { purgeExpiredPendingAgentsActivity } from "@app/temporal/hard_delete/activities";
import { PENDING_AGENTS_RETENTION_HOURS } from "@app/temporal/hard_delete/utils";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@temporalio/activity", () => ({
  Context: {
    current: vi.fn(() => ({
      heartbeat: vi.fn(),
      info: { attempt: 1 },
      cancellationSignal: { aborted: false },
    })),
  },
}));

const PAST_THRESHOLD_MS = (PENDING_AGENTS_RETENTION_HOURS + 1) * 3600 * 1000;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

async function getEditorGroupId(
  agentConfigurationId: number,
  workspaceId: number
): Promise<number> {
  const groupAgent = await GroupAgentModel.findOne({
    where: { agentConfigurationId, workspaceId },
  });
  expect(groupAgent).not.toBeNull();
  return groupAgent!.groupId;
}

describe("purgeExpiredPendingAgentsActivity", () => {
  it("deletes pending agents older than threshold with their editor groups", async () => {
    const { authenticator, workspace } = await createResourceTest({
      role: "admin",
    });

    const { sId } = await createPendingAgentConfiguration(authenticator);
    const agent = await AgentConfigurationModel.findOne({
      where: { sId, workspaceId: workspace.id },
    });
    const editorGroupId = await getEditorGroupId(agent!.id, workspace.id);

    // Advance time past the retention threshold.
    vi.advanceTimersByTime(PAST_THRESHOLD_MS);

    await purgeExpiredPendingAgentsActivity();

    // Agent should be deleted.
    const agentAfter = await AgentConfigurationModel.findOne({
      where: { sId, workspaceId: workspace.id },
    });
    expect(agentAfter).toBeNull();

    // Editor group should be deleted too.
    const groupsAfter = await GroupResource.fetchByModelIds(authenticator, [
      editorGroupId,
    ]);
    expect(groupsAfter).toHaveLength(0);
  });

  it("does not delete pending agents younger than threshold", async () => {
    const { authenticator, workspace } = await createResourceTest({
      role: "admin",
    });

    const { sId } = await createPendingAgentConfiguration(authenticator);
    const agent = await AgentConfigurationModel.findOne({
      where: { sId, workspaceId: workspace.id },
    });
    const editorGroupId = await getEditorGroupId(agent!.id, workspace.id);

    await purgeExpiredPendingAgentsActivity();

    // Agent should survive.
    const agentAfter = await AgentConfigurationModel.findOne({
      where: { sId, workspaceId: workspace.id },
    });
    expect(agentAfter).not.toBeNull();
    expect(agentAfter!.status).toBe("pending");

    // Editor group should survive too.
    const groupsAfter = await GroupResource.fetchByModelIds(authenticator, [
      editorGroupId,
    ]);
    expect(groupsAfter).toHaveLength(1);
  });

  it("deletes all expired agents across multiple batches", async () => {
    const { authenticator, workspace } = await createResourceTest({
      role: "admin",
    });

    const sIds: string[] = [];
    for (let i = 0; i < 3; i++) {
      const { sId } = await createPendingAgentConfiguration(authenticator);
      sIds.push(sId);
    }

    // Advance time past the retention threshold.
    vi.advanceTimersByTime(PAST_THRESHOLD_MS);

    // Use batchSize=1 to force multiple pagination loops.
    await purgeExpiredPendingAgentsActivity(1);

    const remaining = await AgentConfigurationModel.findAll({
      where: { sId: sIds, workspaceId: workspace.id },
    });
    expect(remaining).toHaveLength(0);
  });

  it("does not delete active agents or their groups", async () => {
    const { authenticator, workspace } = await createResourceTest({
      role: "admin",
    });

    const agentConfig = await AgentConfigurationFactory.createTestAgent(
      authenticator,
      { name: "Active Agent" }
    );
    const editorGroupId = await getEditorGroupId(agentConfig.id, workspace.id);

    // Advance time past the retention threshold.
    vi.advanceTimersByTime(PAST_THRESHOLD_MS);

    await purgeExpiredPendingAgentsActivity();

    // Active agent should survive.
    const agents = await AgentConfigurationModel.findAll({
      where: { name: "Active Agent", workspaceId: workspace.id },
    });
    expect(agents).toHaveLength(1);
    expect(agents[0].status).toBe("active");

    // Its editor group should survive too.
    const groupsAfter = await GroupResource.fetchByModelIds(authenticator, [
      editorGroupId,
    ]);
    expect(groupsAfter).toHaveLength(1);
  });

  it("only deletes expired pending agents, leaves fresh pending and active intact", async () => {
    const { authenticator, workspace } = await createResourceTest({
      role: "admin",
    });

    // Create a pending agent that will expire.
    const { sId: expiredSId } =
      await createPendingAgentConfiguration(authenticator);
    const expiredAgent = await AgentConfigurationModel.findOne({
      where: { sId: expiredSId, workspaceId: workspace.id },
    });
    const expiredGroupId = await getEditorGroupId(
      expiredAgent!.id,
      workspace.id
    );

    // Advance time past the threshold.
    vi.advanceTimersByTime(PAST_THRESHOLD_MS);

    // Create a fresh pending agent (after time advance, so it's young).
    const { sId: freshSId } =
      await createPendingAgentConfiguration(authenticator);
    const freshAgent = await AgentConfigurationModel.findOne({
      where: { sId: freshSId, workspaceId: workspace.id },
    });
    const freshGroupId = await getEditorGroupId(freshAgent!.id, workspace.id);

    // Create an active agent.
    const activeAgent = await AgentConfigurationFactory.createTestAgent(
      authenticator,
      { name: "Survivor" }
    );
    const activeGroupId = await getEditorGroupId(activeAgent.id, workspace.id);

    await purgeExpiredPendingAgentsActivity();

    // Expired pending agent + group: deleted.
    expect(
      await AgentConfigurationModel.findOne({
        where: { sId: expiredSId, workspaceId: workspace.id },
      })
    ).toBeNull();
    expect(
      await GroupResource.fetchByModelIds(authenticator, [expiredGroupId])
    ).toHaveLength(0);

    // Fresh pending agent + group: survived.
    const freshAfter = await AgentConfigurationModel.findOne({
      where: { sId: freshSId, workspaceId: workspace.id },
    });
    expect(freshAfter).not.toBeNull();
    expect(freshAfter!.status).toBe("pending");
    expect(
      await GroupResource.fetchByModelIds(authenticator, [freshGroupId])
    ).toHaveLength(1);

    // Active agent + group: survived.
    expect(
      await AgentConfigurationModel.findAll({
        where: { name: "Survivor", workspaceId: workspace.id },
      })
    ).toHaveLength(1);
    expect(
      await GroupResource.fetchByModelIds(authenticator, [activeGroupId])
    ).toHaveLength(1);
  });
});
