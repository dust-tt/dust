import {
  buildNotableFacts,
  buildPromptNotableFacts,
} from "@app/lib/project_todo/analyze_conversation/notable_facts";
import type { TodoVersionedNotableFact } from "@app/types/takeaways";
import { describe, expect, it } from "vitest";

describe("buildNotableFacts", () => {
  it("reuses sId when it matches a previous sId", () => {
    const knownSId = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
    const raw = [
      { sId: knownSId, text: "Launch date is Q3", source_message_rank: 3 },
    ];
    const result = buildNotableFacts(raw, new Set([knownSId]), new Set());
    expect(result[0].sId).toBe(knownSId);
  });

  it("returns empty relevantUserIds when no user ids provided", () => {
    const raw = [{ text: "Some fact", source_message_rank: 1 }];
    const result = buildNotableFacts(raw, new Set(), new Set());
    expect(result[0].relevantUserIds).toEqual([]);
  });

  it("resolves relevantUserIds from valid participant ids", () => {
    const raw = [
      {
        text: "Budget is 100k",
        source_message_rank: 1,
        relevant_user_ids: ["user-abc", "user-def", "unknown-id"],
      },
    ];
    const participants = new Set(["user-abc", "user-def"]);
    const result = buildNotableFacts(raw, new Set(), participants);
    expect(result[0].relevantUserIds).toEqual(["user-abc", "user-def"]);
  });

  it("preserves text and sourceMessageRank", () => {
    const raw = [{ text: "Deadline is Friday", source_message_rank: 7 }];
    const result = buildNotableFacts(raw, new Set(), new Set());
    expect(result[0].text).toBe("Deadline is Friday");
    expect(result[0].sourceMessageRank).toBe(7);
  });

  it("returns an empty array for empty input", () => {
    expect(buildNotableFacts([], new Set(), new Set())).toEqual([]);
  });
});

describe("buildPromptNotableFacts", () => {
  it("returns guidelines only when no previous facts", () => {
    const prompt = buildPromptNotableFacts([]);
    expect(prompt).toContain("Notable fact guidelines:");
    expect(prompt).not.toContain("Known notable facts:");
  });

  it("includes known facts when previous facts exist", () => {
    const facts: TodoVersionedNotableFact[] = [
      {
        sId: "fact-1",
        text: "Budget capped at €100k",
        relevantUserIds: [],
        sourceMessageRank: 1,
      },
    ];
    const prompt = buildPromptNotableFacts(facts);
    expect(prompt).toContain("Known notable facts:");
    expect(prompt).toContain("sId: fact-1");
    expect(prompt).toContain("Budget capped at €100k");
  });
});
