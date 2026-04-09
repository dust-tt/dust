import { Authenticator } from "@app/lib/auth";
import type { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { SkillSuggestionResource } from "@app/lib/resources/skill_suggestion_resource";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { SkillSuggestionFactory } from "@app/tests/utils/SkillSuggestionFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import type { WorkspaceType } from "@app/types/user";
import { beforeEach, describe, expect, it } from "vitest";

describe("SkillSuggestionResource", () => {
  let workspace: WorkspaceType;
  let authenticator: Authenticator;
  let skill: SkillResource;

  beforeEach(async () => {
    const testSetup = await createResourceTest({ role: "builder" });
    workspace = testSetup.workspace;
    authenticator = testSetup.authenticator;

    skill = await SkillFactory.create(authenticator);

    // Refresh authenticator to pick up the skill's editor group membership
    // (created during SkillResource.makeNew).
    await authenticator.refresh();
  });

  describe("canWrite", () => {
    it("should return true for admin", async () => {
      const adminAuth = await Authenticator.internalAdminForWorkspace(
        workspace.sId
      );

      const suggestion = await SkillSuggestionFactory.create(
        authenticator,
        skill
      );

      expect(suggestion.canWrite(adminAuth)).toBe(true);
    });

    it("should return false for non-admin", async () => {
      const otherUser = await UserFactory.basic();
      await MembershipFactory.associate(workspace, otherUser, { role: "user" });
      const otherAuth = await Authenticator.fromUserIdAndWorkspaceId(
        otherUser.sId,
        workspace.sId
      );

      const suggestion = await SkillSuggestionFactory.create(
        authenticator,
        skill
      );

      expect(suggestion.canWrite(otherAuth)).toBe(false);
    });
  });

  describe("baseFetch / fetchById / fetchByIds", () => {
    it("should create and fetch a suggestion by id", async () => {
      const suggestion = await SkillSuggestionFactory.create(
        authenticator,
        skill,
        {
          suggestion: {
            instructionEdits: [
              {
                old_string: "original",
                new_string: "Be more detailed",
                expected_occurrences: 1,
              },
            ],
          },
          analysis: "Improving instructions",
          source: "reinforcement",
        }
      );

      expect(suggestion).toBeDefined();
      expect(suggestion.sId).toMatch(/^ssu_/);
      expect(suggestion.workspaceId).toBe(workspace.id);
      expect(suggestion.skillConfigurationId).toBe(skill.id);
      expect(suggestion.kind).toBe("edit");
      expect(suggestion.state).toBe("pending");
      expect(suggestion.source).toBe("reinforcement");

      const fetched = await SkillSuggestionResource.fetchById(
        authenticator,
        suggestion.sId
      );
      expect(fetched).toBeDefined();
      expect(fetched?.sId).toBe(suggestion.sId);
      expect(fetched?.kind).toBe("edit");
    });

    it("should fetch multiple suggestions by ids", async () => {
      const s1 = await SkillSuggestionFactory.create(authenticator, skill);
      const s2 = await SkillSuggestionFactory.create(authenticator, skill);

      const fetched = await SkillSuggestionResource.fetchByIds(authenticator, [
        s1.sId,
        s2.sId,
      ]);
      expect(fetched).toHaveLength(2);
      expect(fetched.map((s) => s.sId).sort()).toEqual([s1.sId, s2.sId].sort());
    });

    it("should not return suggestion when user is not an editor of the skill", async () => {
      const suggestion = await SkillSuggestionFactory.create(
        authenticator,
        skill
      );

      const otherUser = await UserFactory.basic();
      await MembershipFactory.associate(workspace, otherUser, { role: "user" });
      const otherAuth = await Authenticator.fromUserIdAndWorkspaceId(
        otherUser.sId,
        workspace.sId
      );

      const fetched = await SkillSuggestionResource.fetchById(
        otherAuth,
        suggestion.sId
      );
      expect(fetched).toBeNull();
    });
  });

  describe("listBySkillConfigurationId", () => {
    it("should list all suggestions for a skill", async () => {
      await SkillSuggestionFactory.create(authenticator, skill);
      await SkillSuggestionFactory.create(authenticator, skill);

      const suggestions =
        await SkillSuggestionResource.listBySkillConfigurationId(
          authenticator,
          skill.sId
        );

      expect(suggestions).toHaveLength(2);
    });

    it("should filter by state", async () => {
      await SkillSuggestionFactory.create(authenticator, skill, {
        state: "pending",
      });
      await SkillSuggestionFactory.create(authenticator, skill, {
        state: "approved",
      });

      const pendingSuggestions =
        await SkillSuggestionResource.listBySkillConfigurationId(
          authenticator,
          skill.sId,
          { states: ["pending"] }
        );

      expect(pendingSuggestions).toHaveLength(1);
      expect(pendingSuggestions[0].state).toBe("pending");
    });

    it("should filter by kind", async () => {
      await SkillSuggestionFactory.create(authenticator, skill);

      const editSuggestions =
        await SkillSuggestionResource.listBySkillConfigurationId(
          authenticator,
          skill.sId,
          { kind: "edit" }
        );

      expect(editSuggestions).toHaveLength(1);
      expect(editSuggestions[0].kind).toBe("edit");
    });

    it("should exclude synthetic suggestions by default", async () => {
      await SkillSuggestionFactory.create(authenticator, skill, {
        source: "reinforcement",
      });
      await SkillSuggestionFactory.create(authenticator, skill, {
        source: "synthetic",
      });

      const suggestions =
        await SkillSuggestionResource.listBySkillConfigurationId(
          authenticator,
          skill.sId
        );

      expect(suggestions).toHaveLength(1);
      expect(suggestions[0].source).toBe("reinforcement");
    });

    it("should return only synthetic suggestions when filtering by source", async () => {
      await SkillSuggestionFactory.create(authenticator, skill, {
        source: "reinforcement",
      });
      await SkillSuggestionFactory.create(authenticator, skill, {
        source: "synthetic",
      });

      const suggestions =
        await SkillSuggestionResource.listBySkillConfigurationId(
          authenticator,
          skill.sId,
          { sources: ["synthetic"] }
        );

      expect(suggestions).toHaveLength(1);
      expect(suggestions[0].source).toBe("synthetic");
    });

    it("should limit the number of returned suggestions and return most recent first", async () => {
      const created = [];
      for (let i = 0; i < 3; i++) {
        const suggestion = await SkillSuggestionFactory.create(
          authenticator,
          skill,
          {
            suggestion: {
              instructionEdits: [
                {
                  old_string: "old",
                  new_string: `instruction-${i}`,
                  expected_occurrences: 1,
                },
              ],
            },
          }
        );
        created.push(suggestion);
      }

      const suggestions =
        await SkillSuggestionResource.listBySkillConfigurationId(
          authenticator,
          skill.sId,
          { limit: 2 }
        );

      expect(suggestions).toHaveLength(2);
      // Most recent first.
      expect(suggestions[0].sId).toBe(created[2].sId);
      expect(suggestions[1].sId).toBe(created[1].sId);
    });

    it("should return empty array for non-existent skill", async () => {
      const suggestions =
        await SkillSuggestionResource.listBySkillConfigurationId(
          authenticator,
          "non_existent_sid"
        );

      expect(suggestions).toHaveLength(0);
    });

    it("should not return suggestions when user is not an editor of the skill", async () => {
      await SkillSuggestionFactory.create(authenticator, skill);

      const otherUser = await UserFactory.basic();
      await MembershipFactory.associate(workspace, otherUser, { role: "user" });
      const otherAuth = await Authenticator.fromUserIdAndWorkspaceId(
        otherUser.sId,
        workspace.sId
      );

      const suggestions =
        await SkillSuggestionResource.listBySkillConfigurationId(
          otherAuth,
          skill.sId
        );

      expect(suggestions).toHaveLength(0);
    });
  });

  describe("delete", () => {
    it("should delete a suggestion", async () => {
      const adminAuth = await Authenticator.internalAdminForWorkspace(
        workspace.sId
      );
      const suggestion = await SkillSuggestionFactory.create(
        authenticator,
        skill
      );
      const sId = suggestion.sId;

      const result = await suggestion.delete(adminAuth);
      expect(result.isOk()).toBe(true);

      const fetched = await SkillSuggestionResource.fetchById(
        authenticator,
        sId
      );
      expect(fetched).toBeNull();
    });

    it("should fail to delete when user does not have permission", async () => {
      const otherUser = await UserFactory.basic();
      await MembershipFactory.associate(workspace, otherUser, { role: "user" });
      const otherAuth = await Authenticator.fromUserIdAndWorkspaceId(
        otherUser.sId,
        workspace.sId
      );

      const suggestion = await SkillSuggestionFactory.create(
        authenticator,
        skill
      );

      const result = await suggestion.delete(otherAuth);
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toBe(
          "User does not have permission to edit this skill"
        );
      }
    });
  });

  describe("bulkDelete", () => {
    it("should delete all given suggestions", async () => {
      const s1 = await SkillSuggestionFactory.create(authenticator, skill);
      const s2 = await SkillSuggestionFactory.create(authenticator, skill);

      const result = await SkillSuggestionResource.bulkDelete(authenticator, [
        s1,
        s2,
      ]);
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toBe(2);
      }

      const fetched1 = await SkillSuggestionResource.fetchById(
        authenticator,
        s1.sId
      );
      const fetched2 = await SkillSuggestionResource.fetchById(
        authenticator,
        s2.sId
      );
      expect(fetched1).toBeNull();
      expect(fetched2).toBeNull();
    });

    it("should return Ok(0) for empty array", async () => {
      const result = await SkillSuggestionResource.bulkDelete(
        authenticator,
        []
      );
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toBe(0);
      }
    });

    it("should fail when user cannot write on one of the suggestions", async () => {
      const s1 = await SkillSuggestionFactory.create(authenticator, skill);

      const otherUser = await UserFactory.basic();
      await MembershipFactory.associate(workspace, otherUser, { role: "user" });
      const otherAuth = await Authenticator.fromUserIdAndWorkspaceId(
        otherUser.sId,
        workspace.sId
      );

      const result = await SkillSuggestionResource.bulkDelete(otherAuth, [s1]);
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toBe(
          "User does not have permission to delete all the given suggestions"
        );
      }

      // Verify suggestion was not deleted.
      const fetched = await SkillSuggestionResource.fetchById(
        authenticator,
        s1.sId
      );
      expect(fetched).not.toBeNull();
    });
  });

  describe("deleteExpiredSynthetic", () => {
    it("should delete synthetic suggestions older than cutoff date", async () => {
      const adminAuth = await Authenticator.internalAdminForWorkspace(
        workspace.sId
      );

      const recent = await SkillSuggestionFactory.create(authenticator, skill, {
        source: "synthetic",
      });
      const old = await SkillSuggestionFactory.create(authenticator, skill, {
        source: "synthetic",
      });
      await SkillSuggestionFactory.setCreatedAt(
        old,
        new Date(Date.now() - 40 * 24 * 60 * 60 * 1000)
      );

      // Also create a non-synthetic suggestion that should not be deleted.
      const reinforcement = await SkillSuggestionFactory.create(
        authenticator,
        skill,
        { source: "reinforcement" }
      );
      await SkillSuggestionFactory.setCreatedAt(
        reinforcement,
        new Date(Date.now() - 40 * 24 * 60 * 60 * 1000)
      );

      const cutoffDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
      const deletedCount = await SkillSuggestionResource.deleteExpiredSynthetic(
        adminAuth,
        cutoffDate
      );

      expect(deletedCount).toBe(1);

      // Recent synthetic should still exist.
      const fetchedRecent = await SkillSuggestionResource.fetchById(
        authenticator,
        recent.sId
      );
      expect(fetchedRecent).toBeDefined();

      // Old reinforcement should still exist.
      const fetchedReinforcement = await SkillSuggestionResource.fetchById(
        authenticator,
        reinforcement.sId
      );
      expect(fetchedReinforcement).toBeDefined();
    });

    it("should fail when user is not an admin", async () => {
      const otherUser = await UserFactory.basic();
      await MembershipFactory.associate(workspace, otherUser, { role: "user" });
      const otherAuth = await Authenticator.fromUserIdAndWorkspaceId(
        otherUser.sId,
        workspace.sId
      );

      await expect(
        SkillSuggestionResource.deleteExpiredSynthetic(otherAuth, new Date())
      ).rejects.toThrow(
        "Only workspace admins can delete expired synthetic suggestions"
      );
    });

    it("should respect the limit parameter", async () => {
      const adminAuth = await Authenticator.internalAdminForWorkspace(
        workspace.sId
      );

      // Create 3 old synthetic suggestions.
      for (let i = 0; i < 3; i++) {
        const s = await SkillSuggestionFactory.create(authenticator, skill, {
          source: "synthetic",
        });
        await SkillSuggestionFactory.setCreatedAt(
          s,
          new Date(Date.now() - 40 * 24 * 60 * 60 * 1000)
        );
      }

      const cutoffDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
      const deletedCount = await SkillSuggestionResource.deleteExpiredSynthetic(
        adminAuth,
        cutoffDate,
        { limit: 2 }
      );

      expect(deletedCount).toBe(2);
    });
  });

  describe("bulkUpdateState", () => {
    it("should update state for multiple suggestions", async () => {
      const s1 = await SkillSuggestionFactory.create(authenticator, skill, {
        source: "synthetic",
        state: "pending",
      });
      const s2 = await SkillSuggestionFactory.create(authenticator, skill, {
        source: "synthetic",
        state: "pending",
      });

      await SkillSuggestionResource.bulkUpdateState(
        authenticator,
        [s1, s2],
        "approved"
      );

      const fetched = await SkillSuggestionResource.fetchByIds(authenticator, [
        s1.sId,
        s2.sId,
      ]);
      expect(fetched).toHaveLength(2);
      expect(fetched.every((s) => s.state === "approved")).toBe(true);
    });

    it("should not affect other suggestions", async () => {
      const s1 = await SkillSuggestionFactory.create(authenticator, skill, {
        source: "synthetic",
        state: "pending",
      });
      const s2 = await SkillSuggestionFactory.create(authenticator, skill, {
        source: "reinforcement",
        state: "pending",
      });

      await SkillSuggestionResource.bulkUpdateState(
        authenticator,
        [s1],
        "approved"
      );

      const fetchedS2 = await SkillSuggestionResource.fetchById(
        authenticator,
        s2.sId
      );
      expect(fetchedS2?.state).toBe("pending");
    });

    it("should be a no-op for empty array", async () => {
      await SkillSuggestionResource.bulkUpdateState(
        authenticator,
        [],
        "approved"
      );
      // No error thrown.
    });
  });

  describe("toJSON", () => {
    it("should return a properly formatted JSON object", async () => {
      const suggestion = await SkillSuggestionFactory.create(
        authenticator,
        skill,
        {
          suggestion: {
            instructionEdits: [
              {
                old_string: "old text",
                new_string: "New instructions",
                expected_occurrences: 1,
              },
            ],
          },
          analysis: "Improved clarity",
        }
      );

      const json = suggestion.toJSON();

      expect(json.sId).toBe(suggestion.sId);
      expect(json.kind).toBe("edit");
      expect(json.suggestion).toMatchObject({
        instructionEdits: [
          {
            old_string: "old text",
            new_string: "New instructions",
            expected_occurrences: 1,
          },
        ],
      });
      expect(json.analysis).toBe("Improved clarity");
      expect(json.state).toBe("pending");
      expect(json.source).toBe("reinforcement");
      expect(json.skillConfigurationId).toBe(skill.sId);
      expect(json.sourceConversationId).toBeNull();
      expect(typeof json.createdAt).toBe("number");
      expect(typeof json.updatedAt).toBe("number");
    });
  });
});
