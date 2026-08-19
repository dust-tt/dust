import { fetchInactiveAgents } from "@app/lib/api/assistant/inactivity/fetch_inactive_agents";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MentionFactory } from "@app/tests/utils/MentionFactory";
import { describe, expect, it } from "vitest";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const CUTOFF_AT = new Date("2026-07-19T00:00:00.000Z");

function daysBeforeCutoff(days: number): Date {
  return new Date(CUTOFF_AT.getTime() - days * ONE_DAY_MS);
}

function daysAfterCutoff(days: number): Date {
  return new Date(CUTOFF_AT.getTime() + days * ONE_DAY_MS);
}

/** Every test needs its agent to predate the cutoff; a fresh one never qualifies. */
async function createAgedAgent(
  auth: Parameters<typeof AgentConfigurationFactory.setCreatedAtForTest>[0],
  { name, createdAt }: { name: string; createdAt: Date }
) {
  const agent = await AgentConfigurationFactory.createTestAgent(auth, { name });
  await AgentConfigurationFactory.setCreatedAtForTest(
    auth,
    agent.sId,
    createdAt
  );

  return agent;
}

describe("fetchInactiveAgents", () => {
  it("returns an agent that has never been mentioned", async () => {
    const { authenticator } = await createResourceTest({ role: "admin" });
    const agent = await createAgedAgent(authenticator, {
      name: "Never used",
      createdAt: daysBeforeCutoff(10),
    });

    const page = await fetchInactiveAgents(authenticator, {
      cutoffAt: CUTOFF_AT,
      page: { cursor: null, limit: 50 },
    });

    expect(page.agents).toHaveLength(1);
    expect(page.agents[0]).toMatchObject({
      agentId: agent.sId,
      lastMentionedAt: null,
    });
    expect(page.nextCursor).toBeNull();
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

    const page = await fetchInactiveAgents(authenticator, {
      cutoffAt: CUTOFF_AT,
      page: { cursor: null, limit: 50 },
    });

    expect(page.agents).toHaveLength(1);
    expect(page.agents[0]).toMatchObject({
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

    const page = await fetchInactiveAgents(authenticator, {
      cutoffAt: CUTOFF_AT,
      page: { cursor: null, limit: 50 },
    });

    expect(page.agents).toEqual([]);
  });

  it("takes the newest mention, not just any", async () => {
    // One old mention and one recent one: the agent is in use, however long the older trace is.
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

    const page = await fetchInactiveAgents(authenticator, {
      cutoffAt: CUTOFF_AT,
      page: { cursor: null, limit: 50 },
    });

    expect(page.agents).toEqual([]);
  });

  it("counts a rejected mention as activity", async () => {
    // `status` is about whether the mentioning user was allowed to proceed, not about the run. Somebody
    // still reached for the agent.
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

    const page = await fetchInactiveAgents(authenticator, {
      cutoffAt: CUTOFF_AT,
      page: { cursor: null, limit: 50 },
    });

    expect(page.agents).toEqual([]);
  });

  it("still returns an agent that was edited recently", async () => {
    // Upgrading an agent archives the previous version and inserts a new row, so the active row's own
    // `createdAt` is the date of the last edit. Reading that would make editing an agent postpone its
    // archival, contradicting the rule that editing is not activity. What counts is the first version.
    const { authenticator } = await createResourceTest({ role: "admin" });
    const agent = await createAgedAgent(authenticator, {
      name: "Edited yesterday",
      createdAt: daysBeforeCutoff(90),
    });

    await AgentConfigurationFactory.updateTestAgent(authenticator, agent.sId, {
      instructions: "Freshly edited, still unused.",
    });

    const page = await fetchInactiveAgents(authenticator, {
      cutoffAt: CUTOFF_AT,
      page: { cursor: null, limit: 50 },
    });

    expect(page.agents).toHaveLength(1);
    expect(page.agents[0]).toMatchObject({ agentId: agent.sId });
  });

  it("excludes an agent created after the cutoff, however unused", async () => {
    // The threshold measures disuse. An agent that has not existed long enough to be used has not
    // been disused, and archiving it the night it was built is the bug this guards.
    const { authenticator } = await createResourceTest({ role: "admin" });
    await createAgedAgent(authenticator, {
      name: "Brand new",
      createdAt: daysAfterCutoff(1),
    });

    const page = await fetchInactiveAgents(authenticator, {
      cutoffAt: CUTOFF_AT,
      page: { cursor: null, limit: 50 },
    });

    expect(page.agents).toEqual([]);
  });

  it("paginates with a keyset cursor over the candidates", async () => {
    const { authenticator } = await createResourceTest({ role: "admin" });
    for (const name of ["Agent A", "Agent B", "Agent C"]) {
      await createAgedAgent(authenticator, {
        name,
        createdAt: daysBeforeCutoff(10),
      });
    }

    const firstPage = await fetchInactiveAgents(authenticator, {
      cutoffAt: CUTOFF_AT,
      page: { cursor: null, limit: 2 },
    });
    expect(firstPage.agents).toHaveLength(2);
    expect(firstPage.nextCursor).toBe(firstPage.agents[1].agentId);

    const secondPage = await fetchInactiveAgents(authenticator, {
      cutoffAt: CUTOFF_AT,
      page: { cursor: firstPage.nextCursor, limit: 2 },
    });
    expect(secondPage.agents).toHaveLength(1);
    // A short page means the workspace is exhausted.
    expect(secondPage.nextCursor).toBeNull();

    const firstPageIds = firstPage.agents.map(({ agentId }) => agentId);
    const secondPageIds = secondPage.agents.map(({ agentId }) => agentId);

    // Resuming excludes everything at or before the cursor, and the two pages together cover the
    // workspace exactly once.
    expect(secondPageIds).not.toContain(firstPage.nextCursor);
    expect(
      secondPageIds.every((agentId) => !firstPageIds.includes(agentId))
    ).toBe(true);
    expect(new Set([...firstPageIds, ...secondPageIds]).size).toBe(3);

    // Ordered by agent id, which is what makes the keyset cursor stable.
    expect([...firstPageIds].sort()).toEqual(firstPageIds);
    expect(
      secondPageIds.every((agentId) => agentId > firstPage.nextCursor!)
    ).toBe(true);
  });

  it("returns an empty page for a limit of zero", async () => {
    // The lookahead finds a candidate, so a cursor read off the page has no element to read.
    const { authenticator } = await createResourceTest({ role: "admin" });
    await createAgedAgent(authenticator, {
      name: "Out of budget",
      createdAt: daysBeforeCutoff(10),
    });

    const page = await fetchInactiveAgents(authenticator, {
      cutoffAt: CUTOFF_AT,
      page: { cursor: null, limit: 0 },
    });

    expect(page.agents).toEqual([]);
    expect(page.nextCursor).toBeNull();
  });

  it("does not return another workspace's agents", async () => {
    const { authenticator } = await createResourceTest({ role: "admin" });
    const other = await createResourceTest({ role: "admin" });
    await createAgedAgent(other.authenticator, {
      name: "Foreign agent",
      createdAt: daysBeforeCutoff(10),
    });

    const page = await fetchInactiveAgents(authenticator, {
      cutoffAt: CUTOFF_AT,
      page: { cursor: null, limit: 50 },
    });

    expect(page.agents).toEqual([]);
  });
});
