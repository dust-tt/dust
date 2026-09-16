import type { Authenticator } from "@app/lib/auth";
import {
  AGENT_MEMORY_LIMIT,
  AgentMemoryResource,
} from "@app/lib/resources/agent_memory_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import type { UserType } from "@app/types/user";
import { beforeEach, describe, expect, it } from "vitest";

describe("AgentMemoryResource capacity handling", () => {
  let auth: Authenticator;
  let agentConfiguration: LightAgentConfigurationType;
  let user: UserType;

  beforeEach(async () => {
    const setup = await createResourceTest({});
    auth = setup.authenticator;
    agentConfiguration = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Test Agent",
    });
    user = auth.getNonNullableUser().toJSON();
  });

  function record(entries: string[]) {
    return AgentMemoryResource.recordEntries(auth, {
      agentConfiguration,
      user,
      entries,
    });
  }

  function totalLength(entries: { content: string }[]) {
    return entries.reduce((acc, entry) => acc + entry.content.length, 0);
  }

  // A quarter of the budget, so four entries fit exactly and a fifth forces an eviction.
  const quarterBudget = (label: string) =>
    label.repeat(AGENT_MEMORY_LIMIT / 4 / label.length);

  it("records entries without evicting anything when they fit", async () => {
    const { entries, evicted, skipped } = await record(["first", "second"]);

    expect(entries.map((e) => e.content).sort()).toEqual(["first", "second"]);
    expect(evicted).toEqual([]);
    expect(skipped).toEqual([]);
  });

  it("drops the least recently updated entries instead of failing when full", async () => {
    await record([quarterBudget("a")]);
    await record([quarterBudget("b")]);
    await record([quarterBudget("c")]);
    await record([quarterBudget("d")]);

    const { entries, evicted, skipped } = await record([quarterBudget("e")]);

    expect(skipped).toEqual([]);
    expect(evicted).toHaveLength(1);
    expect(evicted[0].content).toBe(quarterBudget("a"));

    expect(entries.map((e) => e.content[0])).toEqual(["e", "d", "c", "b"]);
    expect(totalLength(entries)).toBeLessThanOrEqual(AGENT_MEMORY_LIMIT);
  });

  it("keeps the memory within the limit when a single write overflows it", async () => {
    await record([quarterBudget("a"), quarterBudget("b")]);

    const { entries, evicted } = await record([
      quarterBudget("c"),
      quarterBudget("d"),
      quarterBudget("e"),
    ]);

    expect(evicted).toHaveLength(1);
    expect(totalLength(entries)).toBeLessThanOrEqual(AGENT_MEMORY_LIMIT);
  });

  it("evicts part of a single write that exceeds the limit on its own", async () => {
    const twoThirdsBudget = "a".repeat(
      Math.floor((AGENT_MEMORY_LIMIT * 2) / 3)
    );

    const { entries, evicted, skipped } = await record([
      twoThirdsBudget,
      twoThirdsBudget,
    ]);

    expect(skipped).toEqual([]);
    expect(evicted).toHaveLength(1);
    expect(entries).toHaveLength(1);
    expect(totalLength(entries)).toBeLessThanOrEqual(AGENT_MEMORY_LIMIT);
  });

  it("skips an entry larger than the whole budget and records the others", async () => {
    const tooLarge = "x".repeat(AGENT_MEMORY_LIMIT + 1);

    const { entries, evicted, skipped } = await record([tooLarge, "kept"]);

    expect(skipped).toEqual([tooLarge]);
    expect(evicted).toEqual([]);
    expect(entries.map((e) => e.content)).toEqual(["kept"]);
  });

  it("keeps the entry an edit just grew and evicts older ones", async () => {
    await record([quarterBudget("a")]);
    await record([quarterBudget("b")]);
    await record([quarterBudget("c")]);
    await record([quarterBudget("d")]);

    // Index 0 is the most recent entry, "d". Growing it to half the budget no longer fits.
    const { entries, evicted, skipped } = await AgentMemoryResource.editEntries(
      auth,
      {
        agentConfiguration,
        user,
        edits: [{ index: 0, content: quarterBudget("z").repeat(2) }],
      }
    );

    expect(skipped).toEqual([]);
    expect(evicted.map((e) => e.content[0])).toEqual(["a"]);
    expect(entries[0].content[0]).toBe("z");
    expect(totalLength(entries)).toBeLessThanOrEqual(AGENT_MEMORY_LIMIT);
  });

  it("skips an edit larger than the whole budget", async () => {
    await record(["original"]);
    const tooLarge = "x".repeat(AGENT_MEMORY_LIMIT + 1);

    const { entries, skipped } = await AgentMemoryResource.editEntries(auth, {
      agentConfiguration,
      user,
      edits: [{ index: 0, content: tooLarge }],
    });

    expect(skipped).toEqual([tooLarge]);
    expect(entries.map((e) => e.content)).toEqual(["original"]);
  });
});
