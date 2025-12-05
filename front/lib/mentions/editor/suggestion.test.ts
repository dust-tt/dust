import { describe, expect, it } from "vitest";

import type { RichAgentMention } from "@app/types";
import { GLOBAL_AGENTS_SID } from "@app/types";

import {
  filterAndSortEditorSuggestionAgents,
  SUGGESTION_PRIORITY,
} from "./suggestion";

describe("filterAndSortEditorSuggestionAgents", () => {
  const createAgentMention = (
    id: string,
    label: string,
    userFavorite = false
  ): RichAgentMention => ({
    type: "agent",
    id,
    label,
    pictureUrl: "",
    description: "",
    userFavorite,
  });

  describe("filtering", () => {
    it("should filter agents by label substring", () => {
      const agents = [
        createAgentMention("1", "Data Analyst"),
        createAgentMention("2", "Code Helper"),
        createAgentMention("3", "Database Expert"),
      ];

      const result = filterAndSortEditorSuggestionAgents("data", agents);

      expect(result).toHaveLength(2);
      expect(result.map((a) => a.label)).toContain("Data Analyst");
      expect(result.map((a) => a.label)).toContain("Database Expert");
    });

    it("should return empty array when no matches", () => {
      const agents = [
        createAgentMention("1", "Data Analyst"),
        createAgentMention("2", "Code Helper"),
      ];

      const result = filterAndSortEditorSuggestionAgents("xyz", agents);

      expect(result).toHaveLength(0);
    });

    it("should handle empty input array", () => {
      const result = filterAndSortEditorSuggestionAgents("test", []);

      expect(result).toHaveLength(0);
    });

    it("should handle empty query string", () => {
      const agents = [
        createAgentMention("1", "Data Analyst"),
        createAgentMention("2", "Code Helper"),
      ];

      const result = filterAndSortEditorSuggestionAgents("", agents);

      expect(result).toHaveLength(2);
    });

    it("should filter case insensitively when query is lowercase", () => {
      const agents = [
        createAgentMention("1", "Data Analyst"),
        createAgentMention("2", "Code Helper"),
      ];

      const result = filterAndSortEditorSuggestionAgents("code", agents);

      expect(result).toHaveLength(1);
      expect(result[0].label).toBe("Code Helper");
    });

    it("should match partial substrings", () => {
      const agents = [
        createAgentMention("1", "JavaScript Expert"),
        createAgentMention("2", "Python Developer"),
      ];

      const result = filterAndSortEditorSuggestionAgents("script", agents);

      expect(result).toHaveLength(1);
      expect(result[0].label).toBe("JavaScript Expert");
    });
  });

  describe("sorting by fuzzy match quality", () => {
    it("should sort by spread and then alphabetically", () => {
      const agents = [
        createAgentMention("1", "Data Analysis Helper"),
        createAgentMention("2", "Data Analyst"),
        createAgentMention("3", "Database"),
      ];

      const result = filterAndSortEditorSuggestionAgents("data", agents);

      // All have same spread for "data", so sorted alphabetically
      expect(result[0].label).toBe("Data Analysis Helper");
      expect(result[1].label).toBe("Data Analyst");
      expect(result[2].label).toBe("Database");
    });

    it("should prioritize earlier matches in the string", () => {
      const agents = [
        createAgentMention("1", "Helper for Data"),
        createAgentMention("2", "Data Helper"),
      ];

      const result = filterAndSortEditorSuggestionAgents("data", agents);

      expect(result[0].label).toBe("Data Helper");
    });

    it("should prioritize shorter strings when match quality is equal", () => {
      const agents = [
        createAgentMention("1", "Test Agent with Extra Words"),
        createAgentMention("2", "Test Agent"),
      ];

      const result = filterAndSortEditorSuggestionAgents("test", agents);

      expect(result[0].label).toBe("Test Agent");
    });
  });

  describe("sorting by user favorites", () => {
    it("should prioritize favorite agents", () => {
      const agents = [
        createAgentMention("1", "Agent A", false),
        createAgentMention("2", "Agent B", true),
        createAgentMention("3", "Agent C", false),
      ];

      const result = filterAndSortEditorSuggestionAgents("agent", agents);

      expect(result[0].label).toBe("Agent B");
      expect(result[0].userFavorite).toBe(true);
    });

    it("should maintain fuzzy sort order within favorites", () => {
      const agents = [
        createAgentMention("1", "Agent Analysis", true),
        createAgentMention("2", "Agent", true),
        createAgentMention("3", "Agent Helper", false),
      ];

      const result = filterAndSortEditorSuggestionAgents("agent", agents);

      // Both favorites should come first, but "Agent" should be before "Agent Analysis"
      expect(result[0].label).toBe("Agent");
      expect(result[1].label).toBe("Agent Analysis");
    });
  });

  describe("priority agents (SUGGESTION_PRIORITY)", () => {
    it("should prioritize Dust agent at the top", () => {
      const agents = [
        createAgentMention("1", "Agent A", true),
        createAgentMention(GLOBAL_AGENTS_SID.DUST, "Dust", false),
        createAgentMention("2", "Agent B", true),
      ];

      const result = filterAndSortEditorSuggestionAgents("", agents);

      expect(result[0].id).toBe(GLOBAL_AGENTS_SID.DUST);
    });

    it("should prioritize Deep Dive after Dust", () => {
      const agents = [
        createAgentMention(GLOBAL_AGENTS_SID.DEEP_DIVE, "Deep Dive", false),
        createAgentMention("1", "Agent A", true),
        createAgentMention(GLOBAL_AGENTS_SID.DUST, "Dust", false),
      ];

      const result = filterAndSortEditorSuggestionAgents("", agents);

      expect(result[0].id).toBe(GLOBAL_AGENTS_SID.DUST);
      expect(result[1].id).toBe(GLOBAL_AGENTS_SID.DEEP_DIVE);
    });

    it("should respect SUGGESTION_PRIORITY order", () => {
      const agents = [
        createAgentMention("other1", "Other Agent 1", false),
        createAgentMention(GLOBAL_AGENTS_SID.DEEP_DIVE, "Deep Dive", false),
        createAgentMention("other2", "Other Agent 2", false),
        createAgentMention(GLOBAL_AGENTS_SID.DUST, "Dust", false),
      ];

      const result = filterAndSortEditorSuggestionAgents("", agents);

      expect(result[0].id).toBe(GLOBAL_AGENTS_SID.DUST);
      expect(result[1].id).toBe(GLOBAL_AGENTS_SID.DEEP_DIVE);
      expect(SUGGESTION_PRIORITY[GLOBAL_AGENTS_SID.DUST]).toBeLessThan(
        SUGGESTION_PRIORITY[GLOBAL_AGENTS_SID.DEEP_DIVE]
      );
    });

    it("should apply priority sorting after fuzzy sort and favorites", () => {
      const agents = [
        createAgentMention("1", "Agent A", true),
        createAgentMention(GLOBAL_AGENTS_SID.DUST, "Dust", false),
        createAgentMention("2", "Agent B", false),
        createAgentMention(GLOBAL_AGENTS_SID.DEEP_DIVE, "Deep Dive", false),
      ];

      const result = filterAndSortEditorSuggestionAgents("", agents);

      // Priority agents should be first
      expect(result[0].id).toBe(GLOBAL_AGENTS_SID.DUST);
      expect(result[1].id).toBe(GLOBAL_AGENTS_SID.DEEP_DIVE);
    });
  });

  describe("combined sorting logic", () => {
    it("should apply all sorting rules in correct order", () => {
      const agents = [
        createAgentMention("1", "Test Agent Long Name", false),
        createAgentMention("2", "Test", true),
        createAgentMention(GLOBAL_AGENTS_SID.DUST, "Dust Test", false),
        createAgentMention("3", "Test Agent", false),
        createAgentMention(
          GLOBAL_AGENTS_SID.DEEP_DIVE,
          "Deep Dive Test",
          false
        ),
      ];

      const result = filterAndSortEditorSuggestionAgents("test", agents);

      // Priority agents first
      expect(result[0].id).toBe(GLOBAL_AGENTS_SID.DUST);
      expect(result[1].id).toBe(GLOBAL_AGENTS_SID.DEEP_DIVE);
      // Then favorites
      expect(result[2].userFavorite).toBe(true);
    });

    it("should handle complex real-world scenario", () => {
      const agents = [
        createAgentMention("1", "Customer Support Agent", false),
        createAgentMention("2", "Code Assistant", true),
        createAgentMention(GLOBAL_AGENTS_SID.DUST, "Dust", false),
        createAgentMention("3", "Content Writer", false),
        createAgentMention("4", "Code Review Bot", true),
        createAgentMention(GLOBAL_AGENTS_SID.DEEP_DIVE, "Deep Dive", false),
      ];

      const result = filterAndSortEditorSuggestionAgents("co", agents);

      // Should filter to agents containing "co"
      const labels = result.map((a) => a.label);
      expect(labels).toContain("Code Assistant");
      expect(labels).toContain("Content Writer");
      expect(labels).toContain("Code Review Bot");
      expect(labels).not.toContain("Dust");

      // Favorites should be ranked higher than non-favorites
      const favoriteIndex = result.findIndex((a) => a.userFavorite);
      const nonFavoriteIndex = result.findIndex((a) => !a.userFavorite);
      if (favoriteIndex !== -1 && nonFavoriteIndex !== -1) {
        expect(favoriteIndex).toBeLessThan(nonFavoriteIndex);
      }
    });
  });
});
