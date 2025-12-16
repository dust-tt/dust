import { describe, expect, it } from "vitest";

import type {
  RichAgentMentionInConversation,
  RichUserMentionInConversation,
} from "@app/types";
import { GLOBAL_AGENTS_SID } from "@app/types";

import {
  filterAndSortEditorSuggestionAgents,
  sortEditorSuggestionUsers,
  SUGGESTION_PRIORITY,
} from "./suggestion";

describe("filterAndSortEditorSuggestionAgents", () => {
  const createAgentMention = (
    id: string,
    label: string,
    userFavorite = false,
    isParticipant?: boolean,
    lastActivityAt?: number
  ): RichAgentMentionInConversation => ({
    type: "agent",
    id,
    label,
    pictureUrl: "",
    description: "",
    userFavorite,
    isParticipant,
    lastActivityAt,
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

  describe("participant sorting (isParticipant)", () => {
    it("should prioritize participants over non-participants", () => {
      const agents = [
        createAgentMention("1", "Agent A", false, false),
        createAgentMention("2", "Agent B", false, true),
        createAgentMention("3", "Agent C", false, false),
      ];

      const result = filterAndSortEditorSuggestionAgents("", agents);

      expect(result[0].label).toBe("Agent B");
      expect(result[0].isParticipant).toBe(true);
    });

    it("should prioritize participants even over user favorites", () => {
      const agents = [
        createAgentMention("1", "Agent A", true, false),
        createAgentMention("2", "Agent B", false, true),
        createAgentMention("3", "Agent C", true, false),
      ];

      const result = filterAndSortEditorSuggestionAgents("", agents);

      expect(result[0].label).toBe("Agent B");
      expect(result[0].isParticipant).toBe(true);
      expect(result[0].userFavorite).toBe(false);
    });

    it("should prioritize participants even over priority agents", () => {
      const agents = [
        createAgentMention(GLOBAL_AGENTS_SID.DUST, "Dust", false, false),
        createAgentMention("1", "Agent A", false, true, 1000),
        createAgentMention(
          GLOBAL_AGENTS_SID.DEEP_DIVE,
          "Deep Dive",
          false,
          false
        ),
      ];

      const result = filterAndSortEditorSuggestionAgents("", agents);

      expect(result[0].label).toBe("Agent A");
      expect(result[0].isParticipant).toBe(true);
    });

    it("should sort participants by lastActivityAt (most recent first)", () => {
      const agents = [
        createAgentMention("1", "Agent A", false, true, 1000),
        createAgentMention("2", "Agent B", false, true, 3000),
        createAgentMention("3", "Agent C", false, true, 2000),
      ];

      const result = filterAndSortEditorSuggestionAgents("", agents);

      expect(result[0].label).toBe("Agent B");
      expect(result[1].label).toBe("Agent C");
      expect(result[2].label).toBe("Agent A");
    });

    it("should handle undefined lastActivityAt as 0", () => {
      const agents = [
        createAgentMention("1", "Agent A", false, true, 1000),
        createAgentMention("2", "Agent B", false, true, undefined),
        createAgentMention("3", "Agent C", false, true, 2000),
      ];

      const result = filterAndSortEditorSuggestionAgents("", agents);

      expect(result[0].label).toBe("Agent C");
      expect(result[1].label).toBe("Agent A");
      expect(result[2].label).toBe("Agent B");
    });

    it("should handle mix of participants with and without lastActivityAt", () => {
      const agents = [
        createAgentMention("1", "Agent A", false, true, undefined),
        createAgentMention("2", "Agent B", false, true, 1500),
        createAgentMention("3", "Agent C", false, true, undefined),
        createAgentMention("4", "Agent D", false, true, 500),
      ];

      const result = filterAndSortEditorSuggestionAgents("", agents);

      expect(result[0].label).toBe("Agent B");
      expect(result[1].label).toBe("Agent D");
      // Agents with undefined lastActivityAt are treated as 0
      expect(result[2].label).toBe("Agent A");
      expect(result[3].label).toBe("Agent C");
    });

    it("should maintain non-participant sorting when all are participants", () => {
      const agents = [
        createAgentMention("1", "Agent A", true, true, 1000),
        createAgentMention(GLOBAL_AGENTS_SID.DUST, "Dust", false, true, 500),
        createAgentMention("2", "Agent B", false, true, 2000),
      ];

      const result = filterAndSortEditorSuggestionAgents("", agents);

      // All are participants, so sorted by lastActivityAt
      expect(result[0].label).toBe("Agent B");
      expect(result[1].label).toBe("Agent A");
      expect(result[2].label).toBe("Dust");
    });

    it("should keep non-participants after participants regardless of other properties", () => {
      const agents = [
        createAgentMention(GLOBAL_AGENTS_SID.DUST, "Dust", false, false),
        createAgentMention("1", "Regular Agent", false, true, 100),
        createAgentMention("2", "Favorite Agent", true, false),
      ];

      const result = filterAndSortEditorSuggestionAgents("", agents);

      // Participant should be first
      expect(result[0].label).toBe("Regular Agent");
      expect(result[0].isParticipant).toBe(true);

      // Non-participants follow their usual sorting (priority, then favorite)
      expect(result[1].id).toBe(GLOBAL_AGENTS_SID.DUST);
      expect(result[2].label).toBe("Favorite Agent");
    });

    it("should handle undefined isParticipant as non-participant", () => {
      const agents = [
        createAgentMention("1", "Agent A", false, undefined),
        createAgentMention("2", "Agent B", false, true, 1000),
        createAgentMention("3", "Agent C", false, undefined),
      ];

      const result = filterAndSortEditorSuggestionAgents("", agents);

      // Only Agent B is explicitly a participant
      expect(result[0].label).toBe("Agent B");
      expect(result[0].isParticipant).toBe(true);

      // Others are treated as non-participants
      expect(result[1].label).toBe("Agent A");
      expect(result[2].label).toBe("Agent C");
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

describe("sortEditorSuggestionUsers", () => {
  const createUserMention = (
    id: string,
    label: string,
    isParticipant?: boolean,
    lastActivityAt?: number
  ): RichUserMentionInConversation => ({
    type: "user",
    id,
    label,
    pictureUrl: "",
    description: `${label}@example.com`,
    isParticipant,
    lastActivityAt,
  });

  describe("participant sorting", () => {
    it("should prioritize participants over non-participants", () => {
      const users = [
        createUserMention("1", "Alice", false),
        createUserMention("2", "Bob", true),
        createUserMention("3", "Charlie", false),
      ];

      const result = sortEditorSuggestionUsers(users);

      expect(result[0].label).toBe("Bob");
      expect(result[0].isParticipant).toBe(true);
    });

    it("should keep all participants at the top", () => {
      const users = [
        createUserMention("1", "Alice", false),
        createUserMention("2", "Bob", true),
        createUserMention("3", "Charlie", true),
        createUserMention("4", "David", false),
      ];

      const result = sortEditorSuggestionUsers(users);

      expect(result[0].isParticipant).toBe(true);
      expect(result[1].isParticipant).toBe(true);
      expect(result[2].isParticipant).toBe(false);
      expect(result[3].isParticipant).toBe(false);
    });

    it("should maintain non-participant order", () => {
      const users = [
        createUserMention("1", "Alice", false),
        createUserMention("2", "Bob", true),
        createUserMention("3", "Charlie", false),
        createUserMention("4", "David", false),
      ];

      const result = sortEditorSuggestionUsers(users);

      // First should be the participant
      expect(result[0].label).toBe("Bob");
      // Non-participants should maintain their relative order
      expect(result[1].label).toBe("Alice");
      expect(result[2].label).toBe("Charlie");
      expect(result[3].label).toBe("David");
    });
  });

  describe("lastActivityAt sorting", () => {
    it("should sort participants by lastActivityAt (most recent first)", () => {
      const users = [
        createUserMention("1", "Alice", true, 1000),
        createUserMention("2", "Bob", true, 3000),
        createUserMention("3", "Charlie", true, 2000),
      ];

      const result = sortEditorSuggestionUsers(users);

      expect(result[0].label).toBe("Bob");
      expect(result[1].label).toBe("Charlie");
      expect(result[2].label).toBe("Alice");
    });

    it("should handle undefined lastActivityAt as 0", () => {
      const users = [
        createUserMention("1", "Alice", true, 1000),
        createUserMention("2", "Bob", true, undefined),
        createUserMention("3", "Charlie", true, 2000),
      ];

      const result = sortEditorSuggestionUsers(users);

      expect(result[0].label).toBe("Charlie");
      expect(result[1].label).toBe("Alice");
      expect(result[2].label).toBe("Bob"); // Bob with undefined should be last
    });

    it("should handle mix of defined and undefined lastActivityAt", () => {
      const users = [
        createUserMention("1", "Alice", true, undefined),
        createUserMention("2", "Bob", true, 1000),
        createUserMention("3", "Charlie", true, undefined),
        createUserMention("4", "David", true, 500),
      ];

      const result = sortEditorSuggestionUsers(users);

      expect(result[0].label).toBe("Bob");
      expect(result[1].label).toBe("David");
      // Alice and Charlie have undefined, so they're treated as 0
      // Their relative order from input is maintained
      expect(result[2].label).toBe("Alice");
      expect(result[3].label).toBe("Charlie");
    });

    it("should not sort non-participants by lastActivityAt", () => {
      const users = [
        createUserMention("1", "Alice", false, 1000),
        createUserMention("2", "Bob", false, 3000),
        createUserMention("3", "Charlie", false, 2000),
      ];

      const result = sortEditorSuggestionUsers(users);

      // Should maintain original order since none are participants
      expect(result[0].label).toBe("Alice");
      expect(result[1].label).toBe("Bob");
      expect(result[2].label).toBe("Charlie");
    });
  });

  describe("edge cases", () => {
    it("should handle empty array", () => {
      const result = sortEditorSuggestionUsers([]);

      expect(result).toHaveLength(0);
    });

    it("should handle array with single user", () => {
      const users = [createUserMention("1", "Alice", true, 1000)];

      const result = sortEditorSuggestionUsers(users);

      expect(result).toHaveLength(1);
      expect(result[0].label).toBe("Alice");
    });

    it("should handle all participants", () => {
      const users = [
        createUserMention("1", "Alice", true, 1000),
        createUserMention("2", "Bob", true, 2000),
        createUserMention("3", "Charlie", true, 3000),
      ];

      const result = sortEditorSuggestionUsers(users);

      expect(result).toHaveLength(3);
      expect(result[0].label).toBe("Charlie");
      expect(result[1].label).toBe("Bob");
      expect(result[2].label).toBe("Alice");
    });

    it("should handle all non-participants", () => {
      const users = [
        createUserMention("1", "Alice", false),
        createUserMention("2", "Bob", false),
        createUserMention("3", "Charlie", false),
      ];

      const result = sortEditorSuggestionUsers(users);

      // Should maintain original order
      expect(result[0].label).toBe("Alice");
      expect(result[1].label).toBe("Bob");
      expect(result[2].label).toBe("Charlie");
    });

    it("should handle participants with undefined isParticipant flag", () => {
      const users = [
        createUserMention("1", "Alice", undefined),
        createUserMention("2", "Bob", true, 1000),
        createUserMention("3", "Charlie", undefined),
      ];

      const result = sortEditorSuggestionUsers(users);

      // Bob should be first since he's explicitly a participant
      expect(result[0].label).toBe("Bob");
      // Alice and Charlie with undefined should be treated as non-participants
      expect(result[1].label).toBe("Alice");
      expect(result[2].label).toBe("Charlie");
    });
  });

  describe("combined real-world scenarios", () => {
    it("should handle typical conversation with multiple participants", () => {
      const users = [
        createUserMention("1", "Alice", false), // Not in conversation
        createUserMention("2", "Bob", true, 1000), // Participant, older activity
        createUserMention("3", "Charlie", false), // Not in conversation
        createUserMention("4", "David", true, 3000), // Participant, recent activity
        createUserMention("5", "Eve", true, 2000), // Participant, middle activity
      ];

      const result = sortEditorSuggestionUsers(users);

      // Participants first, sorted by recent activity
      expect(result[0].label).toBe("David");
      expect(result[0].lastActivityAt).toBe(3000);
      expect(result[1].label).toBe("Eve");
      expect(result[1].lastActivityAt).toBe(2000);
      expect(result[2].label).toBe("Bob");
      expect(result[2].lastActivityAt).toBe(1000);
      // Non-participants maintain original order
      expect(result[3].label).toBe("Alice");
      expect(result[4].label).toBe("Charlie");
    });

    it("should handle conversation with one active participant", () => {
      const users = [
        createUserMention("1", "Alice", false),
        createUserMention("2", "Bob", true, Date.now()),
        createUserMention("3", "Charlie", false),
        createUserMention("4", "David", false),
      ];

      const result = sortEditorSuggestionUsers(users);

      expect(result[0].label).toBe("Bob");
      expect(result[0].isParticipant).toBe(true);
      // Others maintain order
      expect(result.slice(1).map((u) => u.label)).toEqual([
        "Alice",
        "Charlie",
        "David",
      ]);
    });

    it("should handle participants with same lastActivityAt", () => {
      const users = [
        createUserMention("1", "Alice", true, 1000),
        createUserMention("2", "Bob", true, 1000),
        createUserMention("3", "Charlie", true, 1000),
      ];

      const result = sortEditorSuggestionUsers(users);

      // When timestamps are equal, should maintain stable sort (original order)
      expect(result[0].label).toBe("Alice");
      expect(result[1].label).toBe("Bob");
      expect(result[2].label).toBe("Charlie");
      expect(result.every((u) => u.lastActivityAt === 1000)).toBe(true);
    });
  });
});
