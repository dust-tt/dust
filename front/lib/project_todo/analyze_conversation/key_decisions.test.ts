import {
  buildKeyDecisions,
  buildPromptKeyDecisions,
} from "@app/lib/project_todo/analyze_conversation/key_decisions";
import type { TodoVersionedKeyDecision } from "@app/types/takeaways";
import { describe, expect, it } from "vitest";

describe("buildKeyDecisions", () => {
  it("reuses sId when it matches a previous sId", () => {
    const knownSId = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
    const raw = [
      {
        sId: knownSId,
        text: "Use PostgreSQL",
        source_message_rank: 3,
        status: "decided" as const,
      },
    ];
    const result = buildKeyDecisions(raw, new Set([knownSId]), new Set());
    expect(result[0].sId).toBe(knownSId);
  });

  it("maps decided status", () => {
    const raw = [
      {
        text: "Ship without feature flags",
        source_message_rank: 1,
        status: "decided" as const,
      },
    ];
    const result = buildKeyDecisions(raw, new Set(), new Set());
    expect(result[0].status).toBe("decided");
  });

  it("maps open status", () => {
    const raw = [
      {
        text: "Decide on caching strategy",
        source_message_rank: 2,
        status: "open" as const,
      },
    ];
    const result = buildKeyDecisions(raw, new Set(), new Set());
    expect(result[0].status).toBe("open");
  });

  it("returns empty relevantUserIds when no user ids provided", () => {
    const raw = [
      {
        text: "Use Redis",
        source_message_rank: 1,
        status: "decided" as const,
      },
    ];
    const result = buildKeyDecisions(raw, new Set(), new Set());
    expect(result[0].relevantUserIds).toEqual([]);
  });

  it("resolves relevantUserIds from valid participant ids", () => {
    const raw = [
      {
        text: "Use Redis",
        source_message_rank: 1,
        status: "decided" as const,
        relevant_user_ids: ["user-abc", "unknown-id"],
      },
    ];
    const participants = new Set(["user-abc", "user-def"]);
    const result = buildKeyDecisions(raw, new Set(), participants);
    expect(result[0].relevantUserIds).toEqual(["user-abc"]);
  });

  it("preserves text and sourceMessageRank", () => {
    const raw = [
      {
        text: "Launch in Europe first",
        source_message_rank: 10,
        status: "decided" as const,
      },
    ];
    const result = buildKeyDecisions(raw, new Set(), new Set());
    expect(result[0].text).toBe("Launch in Europe first");
    expect(result[0].sourceMessageRank).toBe(10);
  });

  it("returns an empty array for empty input", () => {
    expect(buildKeyDecisions([], new Set(), new Set())).toEqual([]);
  });
});

describe("buildPromptKeyDecisions", () => {
  it("returns guidelines only when no previous decisions", () => {
    const prompt = buildPromptKeyDecisions([]);
    expect(prompt).toContain("Key decision guidelines:");
    expect(prompt).not.toContain("Known key decisions:");
  });

  it("includes known decisions with status badges", () => {
    const decisions: TodoVersionedKeyDecision[] = [
      {
        sId: "dec-1",
        text: "Adopt monorepo",
        relevantUserIds: [],
        sourceMessageRank: 1,
        status: "decided",
      },
      {
        sId: "dec-2",
        text: "Frontend framework TBD",
        relevantUserIds: [],
        sourceMessageRank: 2,
        status: "open",
      },
    ];
    const prompt = buildPromptKeyDecisions(decisions);
    expect(prompt).toContain("Known key decisions:");
    expect(prompt).toContain("sId: dec-1");
    expect(prompt).toContain("[decided] Adopt monorepo");
    expect(prompt).toContain("sId: dec-2");
    expect(prompt).toContain("[open] Frontend framework TBD");
  });
});
