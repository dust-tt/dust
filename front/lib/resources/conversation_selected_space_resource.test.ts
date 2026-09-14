import { Authenticator } from "@app/lib/auth";
import { ConversationSelectedSpaceResource } from "@app/lib/resources/conversation_selected_space_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import type { UserType, WorkspaceType } from "@app/types/user";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("ConversationSelectedSpaceResource", () => {
  let auth: Authenticator;
  let user: UserType;
  let workspace: WorkspaceType;

  beforeEach(async () => {
    const setup = await createResourceTest({});
    auth = setup.authenticator;
    user = setup.user.toJSON();
    workspace = auth.getNonNullableWorkspace();
  });

  async function addCurrentUserToRegularGroup(space: SpaceResource) {
    const internalAdminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    const [memberGroup] = await space.fetchRegularAutoGroups(internalAdminAuth);
    if (!memberGroup) {
      throw new Error("Expected regular member group on Space");
    }

    await memberGroup.dangerouslyAddMembers(internalAdminAuth, {
      users: [user],
    });
    await auth.refresh();
  }

  async function createMemberRestrictedRegularSpace() {
    const space = await SpaceFactory.regular(workspace);
    await addCurrentUserToRegularGroup(space);

    return space;
  }

  async function createConversation(): Promise<ConversationWithoutContentType> {
    return ConversationFactory.create(auth, {
      agentConfigurationId: "test-agent",
      messagesCreatedAt: [],
      visibility: "unlisted",
    });
  }

  it("returns empty buckets for empty input", async () => {
    const conversation = await createConversation();

    const result =
      await ConversationSelectedSpaceResource.upsertForConversation(auth, {
        conversation,
        origin: "input_bar",
        spaces: [],
      });

    expect(result.selectedSpaces).toEqual([]);
    expect(result.createdSpaces).toEqual([]);
    expect(result.reactivatedSpaces).toEqual([]);
  });

  it("lists active rows and hydrates Spaces", async () => {
    const conversation = await createConversation();
    const firstSpace = await createMemberRestrictedRegularSpace();
    const secondSpace = await createMemberRestrictedRegularSpace();

    await ConversationSelectedSpaceResource.upsertForConversation(auth, {
      conversation,
      origin: "input_bar",
      spaces: [secondSpace, firstSpace],
    });
    await ConversationSelectedSpaceResource.removeForConversation(auth, {
      conversation,
      spaces: [firstSpace],
    });

    const activeRows =
      await ConversationSelectedSpaceResource.listByConversation(auth, {
        conversation,
      });
    expect(activeRows.map((row) => row.spaceId)).toEqual([secondSpace.id]);

    const allRows = await ConversationSelectedSpaceResource.listByConversation(
      auth,
      {
        activeOnly: false,
        conversation,
      }
    );
    expect(allRows.map((row) => row.spaceId)).toHaveLength(2);
    expect(allRows.map((row) => row.spaceId)).toEqual(
      expect.arrayContaining([secondSpace.id, firstSpace.id])
    );

    const activeSpaces =
      await ConversationSelectedSpaceResource.listActiveSpacesByConversation(
        auth,
        { conversation }
      );
    expect(activeSpaces.map((space) => space.sId)).toEqual([secondSpace.sId]);
  });

  it("creates and reactivates selected Spaces", async () => {
    const conversation = await createConversation();
    const space = await createMemberRestrictedRegularSpace();

    const created =
      await ConversationSelectedSpaceResource.upsertForConversation(auth, {
        conversation,
        origin: "input_bar",
        spaces: [space],
      });

    expect(created.selectedSpaces.map((row) => row.spaceId)).toEqual([
      space.id,
    ]);
    expect(
      created.createdSpaces.map((createdSpace) => createdSpace.sId)
    ).toEqual([space.sId]);
    expect(created.reactivatedSpaces).toEqual([]);

    await ConversationSelectedSpaceResource.removeForConversation(auth, {
      conversation,
      spaces: [space],
    });

    const reactivated =
      await ConversationSelectedSpaceResource.upsertForConversation(auth, {
        conversation,
        origin: "parent_conversation",
        spaces: [space],
      });

    expect(reactivated.createdSpaces).toEqual([]);
    expect(
      reactivated.reactivatedSpaces.map(
        (reactivatedSpace) => reactivatedSpace.sId
      )
    ).toEqual([space.sId]);

    const [row] = await ConversationSelectedSpaceResource.listByConversation(
      auth,
      { conversation }
    );
    expect(row.origin).toBe("parent_conversation");
    expect(row.removedAt).toBeNull();
  });

  it("preserves each source selector when reactivating Spaces", async () => {
    const sourceConversation = await createConversation();
    const childConversation = await createConversation();
    const firstSpace = await createMemberRestrictedRegularSpace();
    const secondSpace = await createMemberRestrictedRegularSpace();
    const otherUser = await UserFactory.basic();
    await MembershipFactory.associate(workspace, otherUser, { role: "user" });
    const otherAuth = await Authenticator.fromUserIdAndWorkspaceId(
      otherUser.sId,
      workspace.sId
    );

    await ConversationSelectedSpaceResource.upsertForConversation(auth, {
      conversation: sourceConversation,
      origin: "input_bar",
      spaces: [firstSpace],
    });
    await ConversationSelectedSpaceResource.upsertForConversation(otherAuth, {
      conversation: sourceConversation,
      origin: "input_bar",
      spaces: [secondSpace],
    });
    const sourceSelections =
      await ConversationSelectedSpaceResource.listByConversation(auth, {
        conversation: sourceConversation,
      });

    await ConversationSelectedSpaceResource.upsertForConversation(auth, {
      conversation: childConversation,
      origin: "parent_conversation",
      sourceSelections,
      spaces: [firstSpace, secondSpace],
    });
    await ConversationSelectedSpaceResource.removeForConversation(auth, {
      conversation: childConversation,
      spaces: [firstSpace, secondSpace],
    });
    await ConversationSelectedSpaceResource.upsertForConversation(auth, {
      conversation: childConversation,
      origin: "parent_conversation",
      sourceSelections,
      spaces: [firstSpace, secondSpace],
    });

    const childSelections =
      await ConversationSelectedSpaceResource.listByConversation(auth, {
        conversation: childConversation,
      });
    expect(
      new Map(
        childSelections.map((selection) => [
          selection.spaceId,
          selection.selectedByUserId,
        ])
      )
    ).toEqual(
      new Map([
        [firstSpace.id, user.id],
        [secondSpace.id, otherUser.id],
      ])
    );
  });

  it("requires a selector for userless selected Space creation", async () => {
    const conversation = await createConversation();
    const space = await createMemberRestrictedRegularSpace();
    const userSpy = vi.spyOn(auth, "user").mockReturnValue(null);

    await expect(
      ConversationSelectedSpaceResource.upsertForConversation(auth, {
        conversation,
        origin: "parent_conversation",
        spaces: [space],
      })
    ).rejects.toThrow("A selecting user is required for a selected Space.");
    userSpy.mockRestore();
  });

  it("deduplicates selected Spaces before creating rows", async () => {
    const conversation = await createConversation();
    const space = await createMemberRestrictedRegularSpace();

    const created =
      await ConversationSelectedSpaceResource.upsertForConversation(auth, {
        conversation,
        origin: "input_bar",
        spaces: [space, space],
      });

    expect(created.selectedSpaces.map((row) => row.spaceId)).toEqual([
      space.id,
    ]);
    expect(
      created.createdSpaces.map((createdSpace) => createdSpace.sId)
    ).toEqual([space.sId]);

    const alreadySelected =
      await ConversationSelectedSpaceResource.upsertForConversation(auth, {
        conversation,
        origin: "input_bar",
        spaces: [space, space],
      });

    expect(alreadySelected.selectedSpaces.map((row) => row.spaceId)).toEqual([
      space.id,
    ]);
    expect(alreadySelected.createdSpaces).toEqual([]);
    expect(alreadySelected.reactivatedSpaces).toEqual([]);
  });
});
