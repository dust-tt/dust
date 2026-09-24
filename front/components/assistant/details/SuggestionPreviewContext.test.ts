import {
  getEditedAgentSections,
  getEditedSkillSections,
} from "@app/components/assistant/details/SuggestionPreviewContext";
import type { AgentSuggestionType } from "@app/types/suggestions/agent_suggestion";
import type { SkillSuggestionType } from "@app/types/suggestions/skill_suggestion";
import { describe, expect, it } from "vitest";

const SKILL_SUGGESTION: Omit<SkillSuggestionType, "kind" | "suggestion"> = {
  sId: "sug",
  createdAt: 0,
  updatedAt: 0,
  skillConfigurationId: "skl",
  analysis: null,
  title: null,
  state: "pending",
  source: "conversational",
  sourceConversationsCount: 0,
  visibleSourceConversationIds: [],
  notificationConversationId: null,
  updatedBy: null,
  batchId: null,
};

const AGENT_SUGGESTION: Omit<AgentSuggestionType, "kind" | "suggestion"> = {
  id: 1,
  sId: "sug",
  createdAt: 0,
  updatedAt: 0,
  agentConfigurationId: 1,
  analysis: null,
  state: "pending",
  source: "conversational",
  conversationId: null,
  batchId: null,
};

describe("getEditedSkillSections", () => {
  it("returns no section without suggestions", () => {
    expect(getEditedSkillSections([])).toEqual(new Set());
  });

  it("maps instruction edits to guidelines", () => {
    const sections = getEditedSkillSections([
      {
        ...SKILL_SUGGESTION,
        kind: "edit",
        suggestion: {
          instructionEdits: [
            { targetBlockId: "b1", content: "<p>x</p>", type: "replace" },
          ],
        },
      },
    ]);
    expect(sections).toEqual(new Set(["guidelines"]));
  });

  it("maps an agent-facing description edit to when to use", () => {
    const sections = getEditedSkillSections([
      {
        ...SKILL_SUGGESTION,
        kind: "edit",
        suggestion: { agentFacingDescriptionEdit: { content: "Use it" } },
      },
    ]);
    expect(sections).toEqual(new Set(["when_to_use"]));
  });

  it("merges the sections of several suggestions", () => {
    const sections = getEditedSkillSections([
      {
        ...SKILL_SUGGESTION,
        kind: "user_facing_description",
        suggestion: { userFacingDescription: "New description" },
      },
      {
        ...SKILL_SUGGESTION,
        kind: "editors",
        suggestion: { addUserIds: ["u1"], removeUserIds: [] },
      },
    ]);
    expect(sections).toEqual(new Set(["description", "editors"]));
  });

  it("maps header kinds to their own section", () => {
    const sections = getEditedSkillSections([
      {
        ...SKILL_SUGGESTION,
        kind: "name",
        suggestion: { name: "Renamed" },
      },
      {
        ...SKILL_SUGGESTION,
        kind: "availability",
        suggestion: { availability: "users_and_agents" },
      },
    ]);
    expect(sections).toEqual(new Set(["name", "availability"]));
  });
});

describe("getEditedAgentSections", () => {
  it("maps each content kind to its own section", () => {
    const sections = getEditedAgentSections([
      {
        ...AGENT_SUGGESTION,
        kind: "description",
        suggestion: { description: "New description" },
      },
      {
        ...AGENT_SUGGESTION,
        kind: "knowledge",
        suggestion: {
          action: "add",
          method: "search",
          dataSourceViewId: "dsv",
        },
      },
    ]);
    expect(sections).toEqual(new Set(["description", "knowledge"]));
  });

  it("maps sub agents to tools", () => {
    const sections = getEditedAgentSections([
      {
        ...AGENT_SUGGESTION,
        kind: "sub_agent",
        suggestion: { action: "add", toolId: "tool", childAgentId: "agent" },
      },
    ]);
    expect(sections).toEqual(new Set(["tools"]));
  });

  it("maps header kinds and ignores lifecycle kinds", () => {
    const sections = getEditedAgentSections([
      { ...AGENT_SUGGESTION, kind: "name", suggestion: { name: "Renamed" } },
      { ...AGENT_SUGGESTION, kind: "scope", suggestion: { scope: "visible" } },
      { ...AGENT_SUGGESTION, kind: "delete", suggestion: { name: "Agent" } },
    ]);
    expect(sections).toEqual(new Set(["name", "scope"]));
  });
});
