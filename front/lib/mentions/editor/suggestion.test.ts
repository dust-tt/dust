import { describe, expect, it } from "vitest";

import type {
  RichAgentMention,
  RichMention,
} from "@app/types/assistant/mentions";

import {
  filterAgentSuggestions,
  filterMentionSuggestions,
  mentionSuggestions,
} from "./suggestion";

function makeAgent(
  id: string,
  label: string,
  extras: Partial<RichAgentMention> = {}
): RichAgentMention {
  return {
    id,
    label,
    type: "agent",
    pictureUrl: "",
    description: "",
    ...extras,
  };
}

describe("filterAgentSuggestions", () => {
  it("returns first N suggestions in order when query is empty", () => {
    const primary: RichAgentMention[] = Array.from({ length: 10 }).map((_, i) =>
      makeAgent(`id_${i + 1}`, `Agent ${i + 1}`)
    );

    const res = filterAgentSuggestions("", primary, []);

    expect(res.length).toBe(mentionSuggestions.displayLimit);
    expect(res.map((a) => a.id)).toEqual(
      primary.slice(0, mentionSuggestions.displayLimit).map((a) => a.id)
    );
  });

  it("prioritizes specific agents within the display limit", () => {
    const priorities = mentionSuggestions.priorities;
    const priorityIds = Object.keys(priorities);

    // Create a list where both priority agents and other matches are present.
    const primary: RichAgentMention[] = [
      makeAgent("x1", "Alpha"),
      makeAgent(priorityIds[1] ?? "prio2", "Zeta"), // DEEP_DIVE typically
      makeAgent("x2", "Beta"),
      makeAgent(priorityIds[0] ?? "prio1", "Gamma"), // DUST typically
      makeAgent("x3", "Delta"),
      makeAgent("x4", "Epsilon"),
      makeAgent("x5", "Theta"),
      makeAgent("x6", "Lambda"),
    ];

    const res = filterAgentSuggestions("a", primary, []);

    // Expect the two priority agents to come first, ordered by priority value (lower first).
    const expectedOrder = [...primary]
      .filter((a) => priorityIds.includes(a.id))
      .sort((a, b) => (priorities[a.id] ?? 999) - (priorities[b.id] ?? 999))
      .map((a) => a.id);

    expect(res.slice(0, expectedOrder.length).map((a) => a.id)).toEqual(
      expectedOrder
    );
    expect(res.length).toBe(mentionSuggestions.displayLimit);
  });

  it("uses fallback suggestions when primary does not provide enough results and avoids duplicates", () => {
    const primary: RichAgentMention[] = [
      makeAgent("a1", "Bot Alpha"),
      makeAgent("a2", "Helper"),
      makeAgent("a3", "Coder"),
    ];

    const fallback: RichAgentMention[] = [
      makeAgent("a2", "Helper"), // duplicate id with primary
      makeAgent("a4", "Alpha Assistant"),
      makeAgent("a5", "Alpha Buddy"),
      makeAgent("a6", "Alpha Coach"),
      makeAgent("a7", "Alpha Dev"),
      makeAgent("a8", "Alpha Expert"),
      makeAgent("a9", "Alpha Friend"),
    ];

    // Query for "alpha" to match 1 item in primary (a1) and many in fallback.
    const res = filterAgentSuggestions("alpha", primary, fallback);

    // Should be capped by display limit.
    expect(res.length).toBe(mentionSuggestions.displayLimit);
    // First item(s) should come from the primary list when available.
    expect(res[0].id).toBe("a1");
    // Duplicates (a2) must not be present since it does not match the query "alpha" anyway.
    expect(res.find((r) => r.id === "a2")).toBeUndefined();
    // All results must be unique by id.
    const ids = res.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("filterMentionSuggestions", () => {
  it.skip("filters only agent mentions and delegates to agent filter", () => {
    const primary: RichMention[] = [
      makeAgent("a1", "Alice"),
      {
        id: "u1",
        type: "user",
        label: "Bob",
        pictureUrl: "",
        description: "",
      },
    ];

    const fallback: RichMention[] = [makeAgent("a2", "Albert")];

    const res = filterMentionSuggestions("", primary, fallback);

    // Only agent suggestions are returned when query is empty (slice from primary).
    expect(res).toHaveLength(1);
    expect(res[0]).toMatchObject({ id: "a1", type: "agent" });
  });
});
