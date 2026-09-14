import { fetchArchivableAgents } from "@app/lib/api/assistant/inactivity/fetch_inactive_agents";
import { ONE_DAY_MS } from "@app/lib/api/assistant/inactivity/policy";
import type { Authenticator } from "@app/lib/auth";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MentionFactory } from "@app/tests/utils/MentionFactory";
import { describe, expect, it } from "vitest";

const CUTOFF_AT = new Date("2026-07-19T00:00:00.000Z");

function daysBeforeCutoff(days: number): Date {
  return new Date(CUTOFF_AT.getTime() - days * ONE_DAY_MS);
}

function daysAfterCutoff(days: number): Date {
  return new Date(CUTOFF_AT.getTime() + days * ONE_DAY_MS);
}

/** Every test needs its agent to predate the cutoff; a fresh one never qualifies. */
async function createAgedAgent(
  auth: Authenticator,
  { name, createdAt }: { name: string; createdAt: Date }
) {
  const agent = await AgentConfigurationFactory.createTestAgent(auth, { name });
  await AgentConfigurationFactory.backdate(auth, agent.sId, createdAt);

  return agent;
}

describe("fetchArchivableAgents", () => {
  it("returns an agent that has never been mentioned", async () => {
    const { authenticator } = await createResourceTest({ role: "admin" });
    const agent = await createAgedAgent(authenticator, {
      name: "Never used",
      createdAt: daysBeforeCutoff(10),
    });

    const page = await fetchArchivableAgents(authenticator, {
      cutoffAt: CUTOFF_AT,
    });

    expect(page.eligible).toHaveLength(1);
    expect(page.eligible[0]).toMatchObject({
      agentId: agent.sId,
      lastMentionedAt: null,
    });
    expect(page.skipped).toEqual([]);
  });

  it("returns an agent whose last mention predates the cutoff", async () => {
    const { authenticator } = await createResourceTest({ role: "admin" });
    const agent = await createAgedAgent(authenticator, {
      name: "Long unused",
      createdAt: daysBeforeCutoff(90),
    });
    const mentionedAt = daysBeforeCutoff(5);
    await MentionFactory.agentMentionedAt(authenticator, {
      agentId: agent.sId,
      mentionedAt,
    });

    const page = await fetchArchivableAgents(authenticator, {
      cutoffAt: CUTOFF_AT,
    });

    expect(page.eligible).toHaveLength(1);
    expect(page.eligible[0]).toMatchObject({
      agentId: agent.sId,
      lastMentionedAt: mentionedAt,
    });
  });

  it("excludes an agent mentioned after the cutoff", async () => {
    const { authenticator } = await createResourceTest({ role: "admin" });
    const agent = await createAgedAgent(authenticator, {
      name: "Still used",
      createdAt: daysBeforeCutoff(90),
    });
    await MentionFactory.agentMentionedAt(authenticator, {
      agentId: agent.sId,
      mentionedAt: daysAfterCutoff(1),
    });

    const page = await fetchArchivableAgents(authenticator, {
      cutoffAt: CUTOFF_AT,
    });

    // Filtered by the mentions query, so it is never a candidate the rules have to refuse.
    expect(page.eligible).toEqual([]);
    expect(page.skipped).toEqual([]);
  });

  it("takes the newest mention, not just any", async () => {
    const { authenticator } = await createResourceTest({ role: "admin" });
    const agent = await createAgedAgent(authenticator, {
      name: "Used again",
      createdAt: daysBeforeCutoff(90),
    });
    await MentionFactory.agentMentionedAt(authenticator, {
      agentId: agent.sId,
      mentionedAt: daysBeforeCutoff(40),
    });
    await MentionFactory.agentMentionedAt(authenticator, {
      agentId: agent.sId,
      mentionedAt: daysAfterCutoff(2),
    });

    const page = await fetchArchivableAgents(authenticator, {
      cutoffAt: CUTOFF_AT,
    });

    expect(page.eligible).toEqual([]);
  });

  it("counts a rejected mention as activity", async () => {
    // `status` is about whether the mentioning user was allowed to proceed, not about the run.
    const { authenticator } = await createResourceTest({ role: "admin" });
    const agent = await createAgedAgent(authenticator, {
      name: "Blocked but wanted",
      createdAt: daysBeforeCutoff(90),
    });
    await MentionFactory.agentMentionedAt(authenticator, {
      agentId: agent.sId,
      mentionedAt: daysAfterCutoff(1),
      status: "rejected",
    });

    const page = await fetchArchivableAgents(authenticator, {
      cutoffAt: CUTOFF_AT,
    });

    expect(page.eligible).toEqual([]);
  });

  it("still returns an agent that was edited recently", async () => {
    // Reading the active row's own `createdAt` would make editing an agent postpone its archival.
    const { authenticator } = await createResourceTest({ role: "admin" });
    const agent = await createAgedAgent(authenticator, {
      name: "Edited yesterday",
      createdAt: daysBeforeCutoff(90),
    });

    await AgentConfigurationFactory.updateTestAgent(authenticator, agent.sId, {
      instructions: "Freshly edited, still unused.",
    });

    const page = await fetchArchivableAgents(authenticator, {
      cutoffAt: CUTOFF_AT,
    });

    expect(page.eligible).toHaveLength(1);
    expect(page.eligible[0]).toMatchObject({ agentId: agent.sId });
  });

  it("excludes an agent created after the cutoff, however unused", async () => {
    // Archiving an agent the night it was built is the bug this guards.
    const { authenticator } = await createResourceTest({ role: "admin" });
    const agent = await createAgedAgent(authenticator, {
      name: "Brand new",
      createdAt: daysAfterCutoff(1),
    });

    const page = await fetchArchivableAgents(authenticator, {
      cutoffAt: CUTOFF_AT,
    });

    // Unmentioned, so the query does return it; the rules are what refuse it.
    expect(page.eligible).toEqual([]);
    expect(page.skipped).toEqual([
      { agentId: agent.sId, reason: "recent_creation" },
    ]);
  });

  it("never returns a global agent, whatever its mentions", async () => {
    // Global agents have no row in `agent_configurations`, which is what the query selects from
    const { authenticator } = await createResourceTest({ role: "admin" });
    const agent = await createAgedAgent(authenticator, {
      name: "Idle custom agent",
      createdAt: daysBeforeCutoff(90),
    });
    await MentionFactory.agentMentionedAt(authenticator, {
      agentId: "dust",
      mentionedAt: daysBeforeCutoff(90),
    });

    const page = await fetchArchivableAgents(authenticator, {
      cutoffAt: CUTOFF_AT,
    });

    expect(page.eligible.map(({ agentId }) => agentId)).toEqual([agent.sId]);
  });

  it("does not return another workspace's agents", async () => {
    const { authenticator } = await createResourceTest({ role: "admin" });
    const other = await createResourceTest({ role: "admin" });
    await createAgedAgent(other.authenticator, {
      name: "Foreign agent",
      createdAt: daysBeforeCutoff(10),
    });

    const page = await fetchArchivableAgents(authenticator, {
      cutoffAt: CUTOFF_AT,
    });

    expect(page.eligible).toEqual([]);
  });
});
