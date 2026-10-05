import type { Authenticator } from "@app/lib/auth";
import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import { AgentResource } from "@app/lib/resources/agent_resource";
import { GroupPermissionResource } from "@app/lib/resources/group_permission_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { SkillSuggestionResource } from "@app/lib/resources/skill_suggestion_resource";
import {
  purgeExpiredPendingAgentsActivity,
  purgeExpiredPendingSkillsActivity,
  purgeExpiredSyntheticSkillSuggestionsActivity,
} from "@app/temporal/hard_delete/activities";
import {
  PENDING_AGENTS_RETENTION_HOURS,
  PENDING_SKILLS_RETENTION_HOURS,
  SYNTHETIC_SUGGESTIONS_RETENTION_DAYS,
} from "@app/temporal/hard_delete/utils";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { SkillSuggestionFactory } from "@app/tests/utils/SkillSuggestionFactory";
import { SKILL_STATUSES } from "@app/types/assistant/skill_configuration_constants";
import type { ModelId } from "@app/types/shared/model_id";
import assert from "assert";
import { randomUUID } from "crypto";
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
  // Only fake Date — leave setImmediate/setTimeout real for async work.
  vi.useFakeTimers({ toFake: ["Date"] });
});

afterEach(() => {
  vi.useRealTimers();
});

async function createPendingAgent(
  authenticator: Authenticator
): Promise<{ sId: string }> {
  const res = await AgentResource.createPending(authenticator);
  if (res.isErr()) {
    throw res.error;
  }
  return res.value;
}

async function getEditorGrantGroupModelId(
  authenticator: Authenticator,
  agent: AgentResource
): Promise<ModelId> {
  const group = await GroupPermissionResource.findRegularAutoGroupForGrant(
    authenticator,
    {
      grantType: "editor",
      resourceType: "agent",
      resourceId: agent.id,
    }
  );
  if (!group) {
    throw new Error("Agent editor grant was not created");
  }
  return group.id;
}

describe("purgeExpiredPendingAgentsActivity", () => {
  it("deletes pending agents older than threshold with their editor grants", async () => {
    const { authenticator, workspace } = await createResourceTest({
      role: "admin",
    });

    const { sId } = await createPendingAgent(authenticator);
    const agent = await AgentConfigurationModel.findOne({
      where: { sId, workspaceId: workspace.id },
    });
    if (!agent) {
      throw new Error("Pending agent was not created");
    }
    const grantGroupModelId = await getEditorGrantGroupModelId(
      authenticator,
      (
        await AgentResource.dangerouslyFromConfigurationModels(authenticator, [
          agent,
        ])
      )[0]
    );

    // Advance time past the retention threshold.
    vi.advanceTimersByTime(PAST_THRESHOLD_MS);

    await purgeExpiredPendingAgentsActivity();

    // Agent should be deleted.
    const agentAfter = await AgentConfigurationModel.findOne({
      where: { sId, workspaceId: workspace.id },
    });
    expect(agentAfter).toBeNull();

    // Editor grant group should be deleted too.
    const groupsAfter = await GroupResource.dangerouslyFetchByModelIds(
      authenticator,
      [grantGroupModelId]
    );
    expect(groupsAfter).toHaveLength(0);
  });

  it("does not delete pending agents younger than threshold", async () => {
    const { authenticator, workspace } = await createResourceTest({
      role: "admin",
    });

    const { sId } = await createPendingAgent(authenticator);
    const agent = await AgentConfigurationModel.findOne({
      where: { sId, workspaceId: workspace.id },
    });
    if (!agent) {
      throw new Error("Pending agent was not created");
    }
    const grantGroupModelId = await getEditorGrantGroupModelId(
      authenticator,
      (
        await AgentResource.dangerouslyFromConfigurationModels(authenticator, [
          agent,
        ])
      )[0]
    );

    await purgeExpiredPendingAgentsActivity();

    // Agent should survive.
    const agentAfter = await AgentConfigurationModel.findOne({
      where: { sId, workspaceId: workspace.id },
    });
    expect(agentAfter).not.toBeNull();
    expect(agentAfter!.status).toBe("pending");

    // Editor grant group should survive too.
    const groupsAfter = await GroupResource.dangerouslyFetchByModelIds(
      authenticator,
      [grantGroupModelId]
    );
    expect(groupsAfter).toHaveLength(1);
  });

  it("deletes all expired agents across multiple batches", async () => {
    const { authenticator, workspace } = await createResourceTest({
      role: "admin",
    });

    const sIds: string[] = [];
    for (let i = 0; i < 3; i++) {
      const { sId } = await createPendingAgent(authenticator);
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

  it("does not delete active agents or their editor grants", async () => {
    const { authenticator, workspace } = await createResourceTest({
      role: "admin",
    });

    const agentConfig = await AgentConfigurationFactory.createTestAgent(
      authenticator,
      { name: "Active Agent" }
    );
    const activeResource = await AgentResource.fetchById(
      authenticator,
      agentConfig.sId
    );
    assert(activeResource !== null);
    const grantGroupModelId = await getEditorGrantGroupModelId(
      authenticator,
      activeResource
    );

    // Advance time past the retention threshold.
    vi.advanceTimersByTime(PAST_THRESHOLD_MS);

    await purgeExpiredPendingAgentsActivity();

    // Active agent should survive.
    const agents = await AgentConfigurationModel.findAll({
      where: { name: "Active Agent", workspaceId: workspace.id },
    });
    expect(agents).toHaveLength(1);
    expect(agents[0].status).toBe("active");

    // Its editor grant group should survive too.
    const groupsAfter = await GroupResource.dangerouslyFetchByModelIds(
      authenticator,
      [grantGroupModelId]
    );
    expect(groupsAfter).toHaveLength(1);
  });

  it("only deletes expired pending agents, leaves fresh pending and active intact", async () => {
    const { authenticator, workspace } = await createResourceTest({
      role: "admin",
    });

    // Create a pending agent that will expire.
    const { sId: expiredId } = await createPendingAgent(authenticator);
    const expiredAgent = await AgentConfigurationModel.findOne({
      where: { sId: expiredId, workspaceId: workspace.id },
    });
    if (!expiredAgent) {
      throw new Error("Expired pending agent was not created");
    }
    const expiredGroupModelId = await getEditorGrantGroupModelId(
      authenticator,
      (
        await AgentResource.dangerouslyFromConfigurationModels(authenticator, [
          expiredAgent,
        ])
      )[0]
    );

    // Advance time past the threshold.
    vi.advanceTimersByTime(PAST_THRESHOLD_MS);

    // Create a fresh pending agent (after time advance, so it's young).
    const { sId: freshId } = await createPendingAgent(authenticator);
    const freshAgent = await AgentConfigurationModel.findOne({
      where: { sId: freshId, workspaceId: workspace.id },
    });
    if (!freshAgent) {
      throw new Error("Fresh pending agent was not created");
    }
    const freshGroupModelId = await getEditorGrantGroupModelId(
      authenticator,
      (
        await AgentResource.dangerouslyFromConfigurationModels(authenticator, [
          freshAgent,
        ])
      )[0]
    );

    // Create an active agent.
    const activeAgent = await AgentConfigurationFactory.createTestAgent(
      authenticator,
      { name: "Survivor" }
    );
    const activeResource = await AgentResource.fetchById(
      authenticator,
      activeAgent.sId
    );
    assert(activeResource !== null);
    const activeGroupModelId = await getEditorGrantGroupModelId(
      authenticator,
      activeResource
    );

    await purgeExpiredPendingAgentsActivity();

    // Expired pending agent + editor grant: deleted.
    expect(
      await AgentConfigurationModel.findOne({
        where: { sId: expiredId, workspaceId: workspace.id },
      })
    ).toBeNull();
    expect(
      await GroupResource.dangerouslyFetchByModelIds(authenticator, [
        expiredGroupModelId,
      ])
    ).toHaveLength(0);

    // Fresh pending agent + editor grant: survived.
    const freshAfter = await AgentConfigurationModel.findOne({
      where: { sId: freshId, workspaceId: workspace.id },
    });
    expect(freshAfter).not.toBeNull();
    expect(freshAfter!.status).toBe("pending");
    expect(
      await GroupResource.dangerouslyFetchByModelIds(authenticator, [
        freshGroupModelId,
      ])
    ).toHaveLength(1);

    // Active agent + editor grant: survived.
    expect(
      await AgentConfigurationModel.findAll({
        where: { name: "Survivor", workspaceId: workspace.id },
      })
    ).toHaveLength(1);
    expect(
      await GroupResource.dangerouslyFetchByModelIds(authenticator, [
        activeGroupModelId,
      ])
    ).toHaveLength(1);
  });
});

const PAST_PENDING_SKILLS_THRESHOLD_MS =
  (PENDING_SKILLS_RETENTION_HOURS + 1) * 3600 * 1000;

function createPendingSkill(
  authenticator: Authenticator
): Promise<SkillResource> {
  // Pending skills share a status, so they need distinct names (unique on workspace, name, status).
  return SkillFactory.create(authenticator, {
    name: `Pending ${randomUUID()}`,
    status: "pending",
  });
}

// Fetches the skills still in the database, whatever their status or the caller's access.
function fetchRemainingSkills(
  authenticator: Authenticator,
  skillModelIds: ModelId[]
): Promise<SkillResource[]> {
  return SkillResource.fetchByModelIds(authenticator, skillModelIds, {
    status: [...SKILL_STATUSES],
    permissionFiltering: "dangerously_skip",
  });
}

async function getSkillEditorGrantGroupModelId(
  authenticator: Authenticator,
  skill: SkillResource
): Promise<ModelId> {
  const group = await GroupPermissionResource.findRegularAutoGroupForGrant(
    authenticator,
    {
      grantType: "editor",
      resourceType: "skill",
      resourceId: skill.id,
    }
  );
  if (!group) {
    throw new Error("Skill editor grant was not created");
  }
  return group.id;
}

describe("purgeExpiredPendingSkillsActivity", () => {
  it("only deletes expired pending skills with their editor grants", async () => {
    const { authenticator } = await createResourceTest({
      role: "admin",
    });

    const expiredSkill = await createPendingSkill(authenticator);
    const expiredGroupModelId = await getSkillEditorGrantGroupModelId(
      authenticator,
      expiredSkill
    );
    const activeSkill = await SkillFactory.create(authenticator);

    // Advance time past the retention threshold.
    vi.advanceTimersByTime(PAST_PENDING_SKILLS_THRESHOLD_MS);

    // Created after the time advance, so it is still fresh.
    const freshSkill = await createPendingSkill(authenticator);
    const freshGroupModelId = await getSkillEditorGrantGroupModelId(
      authenticator,
      freshSkill
    );

    await purgeExpiredPendingSkillsActivity();

    const remaining = await fetchRemainingSkills(authenticator, [
      expiredSkill.id,
      activeSkill.id,
      freshSkill.id,
    ]);
    expect(remaining.map((s) => s.id).sort()).toEqual(
      [activeSkill.id, freshSkill.id].sort()
    );

    expect(
      await GroupResource.dangerouslyFetchByModelIds(authenticator, [
        expiredGroupModelId,
      ])
    ).toHaveLength(0);
    expect(
      await GroupResource.dangerouslyFetchByModelIds(authenticator, [
        freshGroupModelId,
      ])
    ).toHaveLength(1);
  });

  it("deletes all expired pending skills across multiple batches", async () => {
    const { authenticator } = await createResourceTest({
      role: "admin",
    });

    const ids: ModelId[] = [];
    for (let i = 0; i < 3; i++) {
      ids.push((await createPendingSkill(authenticator)).id);
    }

    vi.advanceTimersByTime(PAST_PENDING_SKILLS_THRESHOLD_MS);

    // Use batchSize=1 to force multiple pagination loops.
    await purgeExpiredPendingSkillsActivity(1);

    expect(await fetchRemainingSkills(authenticator, ids)).toHaveLength(0);
  });
});

const PAST_SYNTHETIC_THRESHOLD_MS =
  (SYNTHETIC_SUGGESTIONS_RETENTION_DAYS + 1) * 24 * 3600 * 1000;

describe("purgeExpiredSyntheticSkillSuggestionsActivity", () => {
  it("deletes synthetic skill suggestions older than threshold", async () => {
    const { authenticator } = await createResourceTest({
      role: "admin",
    });

    const skill = await SkillFactory.create(authenticator);
    const suggestion = await SkillSuggestionFactory.create(
      authenticator,
      skill,
      { source: "synthetic" }
    );

    // Advance time past the synthetic retention threshold.
    vi.advanceTimersByTime(PAST_SYNTHETIC_THRESHOLD_MS);

    await purgeExpiredSyntheticSkillSuggestionsActivity();

    const remaining = await SkillSuggestionResource.fetchById(
      authenticator,
      suggestion.sId
    );
    expect(remaining).toBeNull();
  });

  it("does not delete synthetic skill suggestions younger than threshold", async () => {
    const { authenticator } = await createResourceTest({
      role: "admin",
    });

    const skill = await SkillFactory.create(authenticator);
    const suggestion = await SkillSuggestionFactory.create(
      authenticator,
      skill,
      { source: "synthetic" }
    );

    await purgeExpiredSyntheticSkillSuggestionsActivity();

    const remaining = await SkillSuggestionResource.fetchById(
      authenticator,
      suggestion.sId
    );
    expect(remaining).not.toBeNull();
  });

  it("does not delete non-synthetic skill suggestions older than threshold", async () => {
    const { authenticator } = await createResourceTest({
      role: "admin",
    });

    const skill = await SkillFactory.create(authenticator);
    const suggestion = await SkillSuggestionFactory.create(
      authenticator,
      skill,
      { source: "reinforcement" }
    );

    // Advance time past the synthetic retention threshold.
    vi.advanceTimersByTime(PAST_SYNTHETIC_THRESHOLD_MS);

    await purgeExpiredSyntheticSkillSuggestionsActivity();

    const remaining = await SkillSuggestionResource.fetchById(
      authenticator,
      suggestion.sId
    );
    expect(remaining).not.toBeNull();
  });
});
