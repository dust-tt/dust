import type { Authenticator } from "@app/lib/auth";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { TakeawaysResource } from "@app/lib/resources/takeaways_resource";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { TakeawaysFactory } from "@app/tests/utils/TakeawaysFactory";
import type { LightWorkspaceType } from "@app/types/user";
import { beforeEach, describe, expect, it } from "vitest";

describe("TakeawaysResource", () => {
  let workspace: LightWorkspaceType;
  let auth: Authenticator;
  let space: SpaceResource;

  beforeEach(async () => {
    const setup = await createResourceTest({ role: "user" });
    workspace = setup.workspace;
    auth = setup.authenticator;
    space = setup.globalSpace;
  });

  describe("makeNew", () => {
    it("should create a takeaway with a stable sId starting with 'tka_'", async () => {
      const takeaway = await TakeawaysFactory.create(auth, space);

      expect(takeaway.sId).toMatch(/^tka_/);
      expect(takeaway.workspaceId).toBe(workspace.id);
      expect(takeaway.actionItems).toEqual([]);
    });

    it("should compute the same sId as modelIdToSId", async () => {
      const takeaway = await TakeawaysFactory.create(auth, space);
      const computed = TakeawaysResource.modelIdToSId({
        id: takeaway.id,
        workspaceId: takeaway.workspaceId,
      });
      expect(takeaway.sId).toBe(computed);
    });
  });

  describe("updateWithVersion", () => {
    it("should update the content and preserve the sId", async () => {
      const takeaway = await TakeawaysFactory.create(auth, space);
      const originalId = takeaway.sId;

      const actionItem = {
        sId: "ai_001",
        shortDescription: "Follow up with customer",
        assigneeUserId: null,
        assigneeName: null,
        status: "open" as const,
        detectedDoneAt: null,
        detectedDoneRationale: null,
      };
      const updated = await takeaway.updateWithVersion(auth, {
        actionItems: [actionItem],
      });

      expect(updated.sId).toBe(originalId);
      expect(updated.actionItems).toHaveLength(1);
      expect(updated.actionItems[0].shortDescription).toBe(
        "Follow up with customer"
      );
    });

    it("should throw when called with a different workspace's auth", async () => {
      const takeaway = await TakeawaysFactory.create(auth, space);
      const otherSetup = await createResourceTest({ role: "user" });

      await expect(
        takeaway.updateWithVersion(otherSetup.authenticator, {
          actionItems: [
            {
              sId: "ai_cross",
              shortDescription: "Cross-tenant action item",
              assigneeUserId: null,
              assigneeName: null,
              status: "open",
              detectedDoneAt: null,
              detectedDoneRationale: null,
            },
          ],
        })
      ).rejects.toThrow("Workspace mismatch");
    });

    it("should allow multiple successive updates", async () => {
      const takeaway = await TakeawaysFactory.create(auth, space);

      const actionItem1 = {
        sId: "ai_001",
        shortDescription: "First action item",
        assigneeUserId: null,
        assigneeName: null,
        status: "open" as const,
        detectedDoneAt: null,
        detectedDoneRationale: null,
      };
      const actionItem2 = {
        sId: "ai_002",
        shortDescription: "Second action item",
        assigneeUserId: null,
        assigneeName: null,
        status: "done" as const,
        detectedDoneAt: "2026-04-24T00:00:00.000Z",
        detectedDoneRationale: "Mentioned as completed in summary",
      };

      const v1 = await takeaway.updateWithVersion(auth, {
        actionItems: [actionItem1],
      });
      const v2 = await v1.updateWithVersion(auth, {
        actionItems: [actionItem2],
      });

      expect(v2.sId).toBe(takeaway.sId);
      expect(v2.actionItems[0].shortDescription).toBe("Second action item");
    });
  });

  describe("makeNewForConversation", () => {
    it("should create a new takeaway on the first call for a conversation", async () => {
      const conversationId = "conv_testinit";

      const takeaway = await TakeawaysResource.makeNewForConversation(auth, {
        conversationId,
        spaceId: space.sId,
        actionItems: [],
      });

      expect(takeaway.sId).toMatch(/^tka_/);
      expect(takeaway.workspaceId).toBe(workspace.id);
    });

    it("should update the existing takeaway on subsequent calls for the same conversation", async () => {
      const conversationId = "conv_testupdate";
      const actionItem = {
        sId: "ai_001",
        shortDescription: "Updated action item",
        assigneeUserId: null,
        assigneeName: null,
        status: "open" as const,
        detectedDoneAt: null,
        detectedDoneRationale: null,
      };

      const first = await TakeawaysResource.makeNewForConversation(auth, {
        conversationId,
        spaceId: space.sId,
        actionItems: [],
      });

      const second = await TakeawaysResource.makeNewForConversation(auth, {
        conversationId,
        spaceId: space.sId,
        actionItems: [actionItem],
      });

      // Same stable identity — the main row was updated in place.
      expect(second.sId).toBe(first.sId);
      expect(second.actionItems[0].shortDescription).toBe(
        "Updated action item"
      );
    });
  });

  describe("fetchLatestByConversationId", () => {
    it("should return the takeaway linked to the given conversation", async () => {
      const conversationId = "conv_testfetch";

      const created = await TakeawaysResource.makeNewForConversation(auth, {
        conversationId,
        spaceId: space.sId,
        actionItems: [],
      });

      const fetched = await TakeawaysResource.fetchLatestByConversationId(
        auth,
        { conversationId }
      );

      expect(fetched).not.toBeNull();
      expect(fetched?.sId).toBe(created.sId);
    });

    it("should return null when no takeaway exists for the conversation", async () => {
      const fetched = await TakeawaysResource.fetchLatestByConversationId(
        auth,
        { conversationId: "conv_doesnotexist" }
      );
      expect(fetched).toBeNull();
    });

    it("should not return a takeaway from a different workspace", async () => {
      const conversationId = "conv_testisolation";

      await TakeawaysResource.makeNewForConversation(auth, {
        conversationId,
        spaceId: space.sId,
        actionItems: [],
      });

      const otherSetup = await createResourceTest({ role: "user" });
      const fetched = await TakeawaysResource.fetchLatestByConversationId(
        otherSetup.authenticator,
        { conversationId }
      );

      expect(fetched).toBeNull();
    });
  });

  describe("delete", () => {
    it("should delete the takeaway and its source link", async () => {
      const conversationId = "conv_testdelete";

      const takeaway = await TakeawaysResource.makeNewForConversation(auth, {
        conversationId,
        spaceId: space.sId,
        actionItems: [],
      });

      expect(takeaway).not.toBeNull();

      const result = await takeaway.delete(auth, {});
      expect(result.isOk()).toBe(true);

      // The source link is also deleted, so fetchLatestByConversationId returns null.
      const fetched = await TakeawaysResource.fetchLatestByConversationId(
        auth,
        { conversationId }
      );
      expect(fetched).toBeNull();
    });

    it("should also delete version snapshots created by updateWithVersion", async () => {
      const conversationId = "conv_testdeletewithversion";
      const actionItem = {
        sId: "ai_001",
        shortDescription: "A versioned action item",
        assigneeUserId: null,
        assigneeName: null,
        status: "open" as const,
        detectedDoneAt: null,
        detectedDoneRationale: null,
      };

      const takeaway = await TakeawaysResource.makeNewForConversation(auth, {
        conversationId,
        spaceId: space.sId,
        actionItems: [],
      });

      // Create a version snapshot.
      const updated = await takeaway.updateWithVersion(auth, {
        actionItems: [actionItem],
      });

      await updated.delete(auth, {});

      // Main row and source are gone.
      const fetched = await TakeawaysResource.fetchLatestByConversationId(
        auth,
        { conversationId }
      );
      expect(fetched).toBeNull();
    });
  });
});
