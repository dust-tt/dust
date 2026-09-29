import {
  sortAgentSuggestionsByBuilderOrder,
  sortSkillSuggestionsByBuilderOrder,
} from "@app/components/markdown/suggestion/suggestion_order";
import { describe, expect, it } from "vitest";

describe("sortAgentSuggestionsByBuilderOrder", () => {
  it("lists name and description first, then the agent builder's order", () => {
    const sorted = sortAgentSuggestionsByBuilderOrder([
      { kind: "scope" as const },
      { kind: "tools" as const },
      { kind: "name" as const },
      { kind: "model" as const },
      { kind: "skills" as const },
      { kind: "instructions" as const },
      { kind: "description" as const },
    ]);

    expect(sorted.map((s) => s.kind)).toEqual([
      "name",
      "description",
      "instructions",
      "model",
      "skills",
      "tools",
      "scope",
    ]);
  });

  it("keeps the original order within a kind", () => {
    const sorted = sortAgentSuggestionsByBuilderOrder([
      { kind: "skills" as const, sId: "b" },
      { kind: "model" as const, sId: "m" },
      { kind: "skills" as const, sId: "a" },
    ]);

    expect(sorted.map((s) => s.sId)).toEqual(["m", "b", "a"]);
  });
});

describe("sortSkillSuggestionsByBuilderOrder", () => {
  it("lists name and description first, then the skill builder's order", () => {
    const sorted = sortSkillSuggestionsByBuilderOrder([
      { kind: "availability" as const },
      { kind: "editors" as const },
      { kind: "name" as const },
      { kind: "edit" as const },
      { kind: "user_facing_description" as const },
    ]);

    expect(sorted.map((s) => s.kind)).toEqual([
      "name",
      "user_facing_description",
      "edit",
      "editors",
      "availability",
    ]);
  });
});
