import { describe, expect, it } from "vitest";

import type { RichAgentMention, RichUserMention } from "@app/types";
import { GLOBAL_AGENTS_SID } from "@app/types";

import {
  filterAndSortEditorSuggestionAgents,
  filterAndSortUserSuggestions,
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

describe("filterAndSortUserSuggestions", () => {
  const createUserMention = (id: string, label: string): RichUserMention => ({
    type: "user",
    id,
    label,
    pictureUrl: "",
    description: "",
  });

  describe("filtering", () => {
    it("should filter users by label substring", () => {
      const users = [
        createUserMention("1", "Alice Johnson"),
        createUserMention("2", "Bob Smith"),
        createUserMention("3", "Alice Cooper"),
      ];

      const result = filterAndSortUserSuggestions("alice", users);

      expect(result).toHaveLength(2);
      expect(result.map((u) => u.label)).toContain("Alice Johnson");
      expect(result.map((u) => u.label)).toContain("Alice Cooper");
    });

    it("should return empty array when no matches", () => {
      const users = [
        createUserMention("1", "Alice Johnson"),
        createUserMention("2", "Bob Smith"),
      ];

      const result = filterAndSortUserSuggestions("charlie", users);

      expect(result).toHaveLength(0);
    });

    it("should handle empty input array", () => {
      const result = filterAndSortUserSuggestions("test", []);

      expect(result).toHaveLength(0);
    });

    it("should handle empty query string", () => {
      const users = [
        createUserMention("1", "Alice Johnson"),
        createUserMention("2", "Bob Smith"),
      ];

      const result = filterAndSortUserSuggestions("", users);

      expect(result).toHaveLength(2);
    });

    it("should filter case insensitively when query is lowercase", () => {
      const users = [
        createUserMention("1", "Alice Johnson"),
        createUserMention("2", "Bob Smith"),
      ];

      const result = filterAndSortUserSuggestions("bob", users);

      expect(result).toHaveLength(1);
      expect(result[0].label).toBe("Bob Smith");
    });

    it("should match partial substrings", () => {
      const users = [
        createUserMention("1", "JavaScript Developer"),
        createUserMention("2", "Python Programmer"),
      ];

      const result = filterAndSortUserSuggestions("script", users);

      expect(result).toHaveLength(1);
      expect(result[0].label).toBe("JavaScript Developer");
    });

    it("should match against full names", () => {
      const users = [
        createUserMention("1", "John Doe"),
        createUserMention("2", "Jane Smith"),
        createUserMention("3", "John Smith"),
      ];

      const result = filterAndSortUserSuggestions("john", users);

      expect(result).toHaveLength(2);
      expect(result.map((u) => u.label)).toContain("John Doe");
      expect(result.map((u) => u.label)).toContain("John Smith");
    });
  });

  describe("sorting by fuzzy match quality", () => {
    it("should prioritize by spread (character proximity)", () => {
      const users = [
        createUserMention("1", "A b c d e"), // Very spread out (matches "abcde")
        createUserMention("2", "Abcde Johnson"), // Compact at start
        createUserMention("3", "Someone Abcde"), // Compact at end
      ];

      const result = filterAndSortUserSuggestions("abcde", users);

      // Items with lower spread (more compact matches) rank higher
      expect(result[0].label).toBe("Abcde Johnson");
      expect(result[1].label).toBe("Someone Abcde");
      expect(result[2].label).toBe("A b c d e");
    });

    it("should prioritize earlier matches in the string", () => {
      const users = [
        createUserMention("1", "Johnson Alice"),
        createUserMention("2", "Alice Johnson"),
      ];

      const result = filterAndSortUserSuggestions("alice", users);

      expect(result[0].label).toBe("Alice Johnson");
    });

    it("should handle equal spread by checking last index", () => {
      const users = [
        createUserMention("1", "Test User"), // "test" completes at position 4
        createUserMention("2", "Tester Name"), // "test" completes at position 4 in "Tester"
      ];

      const result = filterAndSortUserSuggestions("test", users);

      // Both have same spread (4), both complete "test" at same position
      // Original order preserved
      expect(result[0].label).toBe("Test User");
    });

    it("should sort by fuzzy match spread", () => {
      const users = [
        createUserMention("1", "T e s t"), // Very spread out
        createUserMention("2", "Test Name"), // Compact match
        createUserMention("3", "Testing"), // Very compact match
      ];

      const result = filterAndSortUserSuggestions("test", users);

      // More compact matches should rank higher
      expect(result[0].label).toBe("Test Name");
    });
  });

  describe("ordering behavior", () => {
    it("should preserve original order when fuzzy scores are equal", () => {
      const users = [
        createUserMention("1", "Zoe"),
        createUserMention("2", "Alice"),
        createUserMention("3", "Bob"),
      ];

      const result = filterAndSortUserSuggestions("", users);

      // With empty query, all items have equal fuzzy score
      // Original order is preserved (stable sort)
      expect(result[0].label).toBe("Zoe");
      expect(result[1].label).toBe("Alice");
      expect(result[2].label).toBe("Bob");
    });

    it("should preserve order when fuzzy scores are identical", () => {
      const users = [
        createUserMention("1", "User C"),
        createUserMention("2", "User A"),
        createUserMention("3", "User B"),
      ];

      const result = filterAndSortUserSuggestions("user", users);

      // All have identical fuzzy scores for "user"
      // Original order is preserved
      expect(result[0].label).toBe("User C");
      expect(result[1].label).toBe("User A");
      expect(result[2].label).toBe("User B");
    });
  });

  describe("edge cases", () => {
    it("should handle single character query", () => {
      const users = [
        createUserMention("1", "Alice"),
        createUserMention("2", "Bob"),
        createUserMention("3", "Adam"),
      ];

      const result = filterAndSortUserSuggestions("a", users);

      expect(result).toHaveLength(2);
      expect(result.map((u) => u.label)).toContain("Alice");
      expect(result.map((u) => u.label)).toContain("Adam");
    });

    it("should handle special characters in names", () => {
      const users = [
        createUserMention("1", "O'Brien"),
        createUserMention("2", "Smith-Jones"),
        createUserMention("3", "Jean-Pierre"),
      ];

      const result = filterAndSortUserSuggestions("jean", users);

      expect(result).toHaveLength(1);
      expect(result[0].label).toBe("Jean-Pierre");
    });

    it("should handle numbers in names", () => {
      const users = [
        createUserMention("1", "User123"),
        createUserMention("2", "Test456"),
      ];

      const result = filterAndSortUserSuggestions("123", users);

      expect(result).toHaveLength(1);
      expect(result[0].label).toBe("User123");
    });

    it("should handle unicode characters", () => {
      const users = [
        createUserMention("1", "François"),
        createUserMention("2", "José"),
        createUserMention("3", "Müller"),
      ];

      const result = filterAndSortUserSuggestions("josé", users);

      expect(result).toHaveLength(1);
      expect(result[0].label).toBe("José");
    });
  });

  describe("complex real-world scenarios", () => {
    it("should handle typical user search scenario", () => {
      const users = [
        createUserMention("1", "John Smith"),
        createUserMention("2", "Jane Johnson"),
        createUserMention("3", "Bob Jones"),
        createUserMention("4", "Alice Johnson"),
        createUserMention("5", "John Doe"),
      ];

      const result = filterAndSortUserSuggestions("john", users);

      expect(result).toHaveLength(4);
      // "John Smith" and "John Doe" should rank higher as "john" appears at the start
      expect(result[0].label).toMatch(/^John/);
      expect(result[1].label).toMatch(/^John/);
    });

    it("should handle lastname search", () => {
      const users = [
        createUserMention("1", "John Smith"),
        createUserMention("2", "Jane Smith"),
        createUserMention("3", "Bob Johnson"),
      ];

      const result = filterAndSortUserSuggestions("smith", users);

      expect(result).toHaveLength(2);
      expect(result.map((u) => u.label)).toContain("John Smith");
      expect(result.map((u) => u.label)).toContain("Jane Smith");
    });
  });
});
