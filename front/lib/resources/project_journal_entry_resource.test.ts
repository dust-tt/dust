import { describe, expect, it } from "vitest";

import { ProjectJournalEntryResource } from "@app/lib/resources/project_journal_entry_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { ProjectJournalEntryFactory } from "@app/tests/utils/ProjectJournalEntryFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";

describe("ProjectJournalEntryResource", () => {
  describe("fetchBySpace", () => {
    it("should fetch journal entries for a specific space", async () => {
      const { workspace, authenticator: auth } = await createResourceTest({});

      // Create a project space
      const projectSpace = await SpaceFactory.project(workspace);

      // Create journal entries without conversations
      await ProjectJournalEntryFactory.createWithoutConversation({
        auth,
        space: projectSpace,
        journalEntry: "First entry",
      });
      await ProjectJournalEntryFactory.createWithoutConversation({
        auth,
        space: projectSpace,
        journalEntry: "Second entry",
      });

      // Fetch entries
      const entries = await ProjectJournalEntryResource.fetchBySpace(
        auth,
        projectSpace.id
      );

      expect(entries).toHaveLength(2);
      expect(entries[0].workspaceId).toBe(workspace.id);
      expect(entries[0].spaceId).toBe(projectSpace.id);
      expect(entries[1].workspaceId).toBe(workspace.id);
      expect(entries[1].spaceId).toBe(projectSpace.id);
    });

    it("should respect limit option", async () => {
      const { workspace, authenticator: auth } = await createResourceTest({});

      const projectSpace = await SpaceFactory.project(workspace);

      // Create multiple entries
      await ProjectJournalEntryFactory.createWithoutConversation({
        auth,
        space: projectSpace,
      });
      await ProjectJournalEntryFactory.createWithoutConversation({
        auth,
        space: projectSpace,
      });
      await ProjectJournalEntryFactory.createWithoutConversation({
        auth,
        space: projectSpace,
      });

      // Fetch with limit
      const entries = await ProjectJournalEntryResource.fetchBySpace(
        auth,
        projectSpace.id,
        { limit: 2 }
      );

      expect(entries).toHaveLength(2);
    });

    it("should return entries ordered by createdAt DESC", async () => {
      const { workspace, authenticator: auth } = await createResourceTest({});

      const projectSpace = await SpaceFactory.project(workspace);

      // Create entries with specific journal entry text
      await ProjectJournalEntryFactory.createWithoutConversation({
        auth,
        space: projectSpace,
        journalEntry: "First created",
      });
      await ProjectJournalEntryFactory.createWithoutConversation({
        auth,
        space: projectSpace,
        journalEntry: "Second created",
      });
      await ProjectJournalEntryFactory.createWithoutConversation({
        auth,
        space: projectSpace,
        journalEntry: "Third created",
      });

      // Fetch entries
      const entries = await ProjectJournalEntryResource.fetchBySpace(
        auth,
        projectSpace.id
      );

      expect(entries).toHaveLength(3);
      // Verify all three entries are returned
      const journalEntries = entries.map((e) => e.journalEntry);
      expect(journalEntries).toContain("First created");
      expect(journalEntries).toContain("Second created");
      expect(journalEntries).toContain("Third created");
      // Verify ordering by checking created timestamps
      expect(entries[0].createdAt.getTime()).toBeGreaterThanOrEqual(
        entries[1].createdAt.getTime()
      );
      expect(entries[1].createdAt.getTime()).toBeGreaterThanOrEqual(
        entries[2].createdAt.getTime()
      );
    });
  });

  describe("toJSON", () => {
    it("should correctly convert resource to JSON", async () => {
      const { workspace, authenticator: auth } = await createResourceTest({});

      const projectSpace = await SpaceFactory.project(workspace);

      // Create an entry
      const entryModel =
        await ProjectJournalEntryFactory.createWithoutConversation({
          auth,
          space: projectSpace,
          journalEntry: "Test journal entry",
        });

      // Wrap it in a resource
      const entry = new ProjectJournalEntryResource(
        ProjectJournalEntryResource.model,
        entryModel.get(),
        { user: auth.getNonNullableUser() }
      );

      const json = entry.toJSON();

      expect(json.sId).toBeDefined();
      expect(json.id).toBe(entry.id);
      expect(json.createdAt).toBeTypeOf("number");
      expect(json.updatedAt).toBeTypeOf("number");
      expect(json.spaceId).toBe(
        SpaceResource.modelIdToSId({
          id: projectSpace.id,
          workspaceId: workspace.id,
        })
      );
      expect(json.journalEntry).toBe("Test journal entry");
    });
  });
});
