import {
  sortAgentSuggestionsByBuilderOrder,
  sortSkillSuggestionsByBuilderOrder,
} from "@app/components/markdown/suggestion/suggestion_order";
import { describe, expect, it } from "vitest";

describe("sortAgentSuggestionsByBuilderOrder", () => {
  it("lists agent changes in the agent builder's order", () => {
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
      "instructions",
      "model",
      "skills",
      "tools",
      "name",
      "description",
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
  it("lists skill changes in the skill builder's order", () => {
    const sorted = sortSkillSuggestionsByBuilderOrder([
      { kind: "availability" as const },
      { kind: "editors" as const },
      { kind: "name" as const },
      { kind: "edit" as const },
      { kind: "user_facing_description" as const },
    ]);

    expect(sorted.map((s) => s.kind)).toEqual([
      "edit",
      "name",
      "user_facing_description",
      "editors",
      "availability",
    ]);
  });
});
