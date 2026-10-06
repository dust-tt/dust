import type { RichUserMentionInConversation } from "@app/types/assistant/mentions";
import { describe, expect, it } from "vitest";

import { sortEditorSuggestionUsers } from "./suggestion";

describe("sortEditorSuggestionUsers", () => {
  const createUserMention = (
    id: string,
    label: string,
    options?: {
      isParticipant?: boolean;
      lastActivityAt?: number;
      isProjectMember?: boolean;
    }
  ): RichUserMentionInConversation => ({
    type: "user",
    id,
    label,
    pictureUrl: "",
    description: `${label}@example.com`,
    isParticipant: options?.isParticipant,
    isProjectMember: options?.isProjectMember,
    lastActivityAt: options?.lastActivityAt,
  });

  describe("participant sorting", () => {
    it("should prioritize participants over non-participants", () => {
      const users = [
        createUserMention("1", "Alice", { isParticipant: false }),
        createUserMention("2", "Bob", { isParticipant: true }),
        createUserMention("3", "Charlie", { isParticipant: false }),
      ];

      const result = sortEditorSuggestionUsers(users);

      expect(result[0].label).toBe("Bob");
      expect(result[0].isParticipant).toBe(true);
    });

    it("should prioritize project members over non-members", () => {
      const users = [
        createUserMention("1", "Alice", { isProjectMember: false }),
        createUserMention("2", "Bob", { isProjectMember: true }),
        createUserMention("3", "Charlie", { isProjectMember: false }),
      ];

      const result = sortEditorSuggestionUsers(users);

      expect(result[0].label).toBe("Bob");
      expect(result[0].isProjectMember).toBe(true);
    });

    it("should prioritize participants over project members", () => {
      const users = [
        createUserMention("1", "Alice", { isProjectMember: true }),
        createUserMention("2", "Bob", { isParticipant: true }),
        createUserMention("3", "Charlie", { isProjectMember: true }),
      ];
      const result = sortEditorSuggestionUsers(users);
      expect(result[0].label).toBe("Bob");
      expect(result[0].isParticipant).toBe(true);
    });

    it("should keep all participants at the top", () => {
      const users = [
        createUserMention("1", "Alice", { isParticipant: false }),
        createUserMention("2", "Bob", { isParticipant: true }),
        createUserMention("3", "Charlie", { isParticipant: true }),
        createUserMention("4", "David", { isParticipant: false }),
      ];

      const result = sortEditorSuggestionUsers(users);

      expect(result[0].isParticipant).toBe(true);
      expect(result[1].isParticipant).toBe(true);
      expect(result[2].isParticipant).toBe(false);
      expect(result[3].isParticipant).toBe(false);
    });

    it("should maintain non-participant order", () => {
      const users = [
        createUserMention("1", "Alice", { isParticipant: false }),
        createUserMention("2", "Bob", { isParticipant: true }),
        createUserMention("3", "Charlie", { isParticipant: false }),
        createUserMention("4", "David", { isParticipant: false }),
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
        createUserMention("1", "Alice", {
          isParticipant: true,
          lastActivityAt: 1000,
        }),
        createUserMention("2", "Bob", {
          isParticipant: true,
          lastActivityAt: 3000,
        }),
        createUserMention("3", "Charlie", {
          isParticipant: true,
          lastActivityAt: 2000,
        }),
      ];

      const result = sortEditorSuggestionUsers(users);

      expect(result[0].label).toBe("Bob");
      expect(result[1].label).toBe("Charlie");
      expect(result[2].label).toBe("Alice");
    });

    it("should handle undefined lastActivityAt as 0", () => {
      const users = [
        createUserMention("1", "Alice", {
          isParticipant: true,
          lastActivityAt: 1000,
        }),
        createUserMention("2", "Bob", {
          isParticipant: true,
          lastActivityAt: undefined,
        }),
        createUserMention("3", "Charlie", {
          isParticipant: true,
          lastActivityAt: 2000,
        }),
      ];

      const result = sortEditorSuggestionUsers(users);

      expect(result[0].label).toBe("Charlie");
      expect(result[1].label).toBe("Alice");
      expect(result[2].label).toBe("Bob"); // Bob with undefined should be last
    });

    it("should handle mix of defined and undefined lastActivityAt", () => {
      const users = [
        createUserMention("1", "Alice", {
          isParticipant: true,
          lastActivityAt: undefined,
        }),
        createUserMention("2", "Bob", {
          isParticipant: true,
          lastActivityAt: 1000,
        }),
        createUserMention("3", "Charlie", {
          isParticipant: true,
          lastActivityAt: undefined,
        }),
        createUserMention("4", "David", {
          isParticipant: true,
          lastActivityAt: 500,
        }),
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
        createUserMention("1", "Alice", {
          isParticipant: false,
          lastActivityAt: 1000,
        }),
        createUserMention("2", "Bob", {
          isParticipant: false,
          lastActivityAt: 3000,
        }),
        createUserMention("3", "Charlie", {
          isParticipant: false,
          lastActivityAt: 2000,
        }),
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
      const users = [
        createUserMention("1", "Alice", {
          isParticipant: true,
          lastActivityAt: 1000,
        }),
      ];

      const result = sortEditorSuggestionUsers(users);

      expect(result).toHaveLength(1);
      expect(result[0].label).toBe("Alice");
    });

    it("should handle all participants", () => {
      const users = [
        createUserMention("1", "Alice", {
          isParticipant: true,
          lastActivityAt: 1000,
        }),
        createUserMention("2", "Bob", {
          isParticipant: true,
          lastActivityAt: 2000,
        }),
        createUserMention("3", "Charlie", {
          isParticipant: true,
          lastActivityAt: 3000,
        }),
      ];

      const result = sortEditorSuggestionUsers(users);

      expect(result).toHaveLength(3);
      expect(result[0].label).toBe("Charlie");
      expect(result[1].label).toBe("Bob");
      expect(result[2].label).toBe("Alice");
    });

    it("should handle all non-participants", () => {
      const users = [
        createUserMention("1", "Alice", { isParticipant: false }),
        createUserMention("2", "Bob", { isParticipant: false }),
        createUserMention("3", "Charlie", { isParticipant: false }),
      ];

      const result = sortEditorSuggestionUsers(users);

      // Should maintain original order
      expect(result[0].label).toBe("Alice");
      expect(result[1].label).toBe("Bob");
      expect(result[2].label).toBe("Charlie");
    });

    it("should handle participants with undefined isParticipant flag", () => {
      const users = [
        createUserMention("1", "Alice"),
        createUserMention("2", "Bob", {
          isParticipant: true,
          lastActivityAt: 1000,
        }),
        createUserMention("3", "Charlie"),
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
        createUserMention("1", "Alice", { isParticipant: false }), // Not in conversation
        createUserMention("2", "Bob", {
          isParticipant: true,
          lastActivityAt: 1000,
        }), // Participant, older activity
        createUserMention("3", "Charlie", { isParticipant: false }), // Not in conversation
        createUserMention("4", "David", {
          isParticipant: true,
          lastActivityAt: 3000,
        }), // Participant, recent activity
        createUserMention("5", "Eve", {
          isParticipant: true,
          lastActivityAt: 2000,
        }), // Participant, middle activity
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
        createUserMention("1", "Alice", { isParticipant: false }),
        createUserMention("2", "Bob", {
          isParticipant: true,
          lastActivityAt: Date.now(),
        }),
        createUserMention("3", "Charlie", { isParticipant: false }),
        createUserMention("4", "David", { isParticipant: false }),
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
        createUserMention("1", "Alice", {
          isParticipant: true,
          lastActivityAt: 1000,
        }),
        createUserMention("2", "Bob", {
          isParticipant: true,
          lastActivityAt: 1000,
        }),
        createUserMention("3", "Charlie", {
          isParticipant: true,
          lastActivityAt: 1000,
        }),
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
