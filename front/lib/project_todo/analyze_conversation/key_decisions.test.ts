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
        short_description: "Use PostgreSQL",
        status: "decided" as const,
      },
    ];
    const result = buildKeyDecisions(raw, new Set([knownSId]), new Set());
    expect(result[0].sId).toBe(knownSId);
  });

  it("maps decided status", () => {
    const raw = [
      {
        short_description: "Ship without feature flags",
        status: "decided" as const,
      },
    ];
    const result = buildKeyDecisions(raw, new Set(), new Set());
    expect(result[0].status).toBe("decided");
  });

  it("maps open status", () => {
    const raw = [
      {
        short_description: "Decide on caching strategy",
        status: "open" as const,
      },
    ];
    const result = buildKeyDecisions(raw, new Set(), new Set());
    expect(result[0].status).toBe("open");
  });

  it("returns empty relevantUserIds when no user ids provided", () => {
    const raw = [
      {
        short_description: "Use Redis",
        status: "decided" as const,
      },
    ];
    const result = buildKeyDecisions(raw, new Set(), new Set());
    expect(result[0].relevantUserIds).toEqual([]);
  });

  it("resolves relevantUserIds from valid participant ids", () => {
    const raw = [
      {
        short_description: "Use Redis",
        status: "decided" as const,
        relevant_user_ids: ["user-abc", "unknown-id"],
      },
    ];
    const participants = new Set(["user-abc", "user-def"]);
    const result = buildKeyDecisions(raw, new Set(), participants);
    expect(result[0].relevantUserIds).toEqual(["user-abc"]);
  });

  it("preserves shortDescription", () => {
    const raw = [
      {
        short_description: "Launch in Europe first",
        status: "decided" as const,
      },
    ];
    const result = buildKeyDecisions(raw, new Set(), new Set());
    expect(result[0].shortDescription).toBe("Launch in Europe first");
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
        shortDescription: "Adopt monorepo",
        relevantUserIds: [],
        status: "decided",
      },
      {
        sId: "dec-2",
        shortDescription: "Frontend framework TBD",
        relevantUserIds: [],
        status: "open",
      },
    ];
    const prompt = buildPromptKeyDecisions(decisions);
    expect(prompt).toContain("Known key decisions:");
    expect(prompt).toContain(
      `<key_decision sId="dec-1" status="decided"><short_description>Adopt monorepo</short_description></key_decision>`
    );
    expect(prompt).toContain(
      `<key_decision sId="dec-2" status="open"><short_description>Frontend framework TBD</short_description></key_decision>`
    );
  });
});
