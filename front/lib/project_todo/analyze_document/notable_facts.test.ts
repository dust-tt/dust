import {
  buildNotableFacts,
  buildPromptNotableFacts,
} from "@app/lib/project_todo/analyze_document/notable_facts";
import type { TodoVersionedNotableFact } from "@app/types/takeaways";
import { describe, expect, it } from "vitest";

describe("buildNotableFacts", () => {
  it("reuses sId when it matches a previous sId", () => {
    const knownId = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
    const raw = [{ sId: knownId, short_description: "Launch date is Q3" }];
    const result = buildNotableFacts(raw, [{ sId: knownId }], new Set());
    expect(result[0].sId).toBe(knownId);
  });

  it("returns empty relevantUserIds when no user ids provided", () => {
    const raw = [{ short_description: "Some fact" }];
    const result = buildNotableFacts(raw, [], new Set());
    expect(result[0].relevantUserIds).toEqual([]);
  });

  it("resolves relevantUserIds from valid participant ids", () => {
    const raw = [
      {
        short_description: "Budget is 100k",
        relevant_user_ids: ["user-abc", "user-def", "unknown-id"],
      },
    ];
    const participants = new Set(["user-abc", "user-def"]);
    const result = buildNotableFacts(raw, [], participants);
    expect(result[0].relevantUserIds).toEqual(["user-abc", "user-def"]);
  });

  it("preserves shortDescription", () => {
    const raw = [{ short_description: "Deadline is Friday" }];
    const result = buildNotableFacts(raw, [], new Set());
    expect(result[0].shortDescription).toBe("Deadline is Friday");
  });

  it("returns an empty array for empty input", () => {
    expect(buildNotableFacts([], [], new Set())).toEqual([]);
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
        shortDescription: "Budget capped at €100k",
        relevantUserIds: [],
      },
    ];
    const prompt = buildPromptNotableFacts(facts);
    expect(prompt).toContain("Known notable facts:");
    expect(prompt).toContain(
      `<notable_fact sId="fact-1"><short_description>Budget capped at €100k</short_description></notable_fact>`
    );
  });
});
