import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockEmitAuditLogEvent } = vi.hoisted(() => ({
  mockEmitAuditLogEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@app/lib/api/audit/workos_audit", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@app/lib/api/audit/workos_audit")>();

  return { ...actual, emitAuditLogEvent: mockEmitAuditLogEvent };
});

import type { SelectedConversationSpacesError } from "@app/lib/api/assistant/conversation/selected_spaces";
import {
  addSelectedConversationSpaces,
  copySelectedConversationSpacesToChild,
  getEffectiveSpaceIdsForAgentRun,
  listSelectableSpaces,
  validateSelectableSpaces,
} from "@app/lib/api/assistant/conversation/selected_spaces";
import {
  moveConversationOutOfProject,
  moveConversationToProject,
} from "@app/lib/api/projects/conversations";
import { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { ConversationSelectedSpaceResource } from "@app/lib/resources/conversation_selected_space_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { GroupSpaceFactory } from "@app/tests/utils/GroupSpaceFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import { isPodConversation } from "@app/types/assistant/conversation";
import type { Result } from "@app/types/shared/result";
import type { UserType, WorkspaceType } from "@app/types/user";

function unwrapResult<T>(
  result: Result<T, SelectedConversationSpacesError>
): T {
  if (result.isErr()) {
    throw result.error;
  }
  return result.value;
}

function expectErrCode<T>(
  result: Result<T, SelectedConversationSpacesError>,
  code: SelectedConversationSpacesError["code"]
) {
  expect(result.isErr()).toBe(true);
  if (result.isErr()) {
    expect(result.error.code).toBe(code);
  }
}

describe("selected conversation Spaces", () => {
  let auth: Authenticator;
  let globalGroup: GroupResource;
  let globalSpace: SpaceResource;
  let user: UserType;
  let workspace: WorkspaceType;

  beforeEach(async () => {
    const setup = await createResourceTest({});
    auth = setup.authenticator;
    globalGroup = setup.globalGroup;
    globalSpace = setup.globalSpace;
    user = setup.user.toJSON();
    workspace = auth.getNonNullableWorkspace();
    mockEmitAuditLogEvent.mockClear();
  });

  async function enableFeature() {
    await FeatureFlagFactory.basic(auth, "restricted_spaces_in_input_bar");
  }

  async function regularGroup(space: SpaceResource, auth: Authenticator) {
    const groupReference = space.groups.find((group) => group.isRegularAuto());
    if (!groupReference) {
      throw new Error("Expected regular member group on Space");
    }
    const [group] = await space.fetchGroupResources(auth, {
      groupReferences: [groupReference],
    });
    return group;
  }

  async function addCurrentUser(space: SpaceResource) {
    const internalAdminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    const group = await regularGroup(space, internalAdminAuth);
    await group.dangerouslyAddMembers(internalAdminAuth, {
      users: [user],
    });
    await auth.refresh();
  }

  async function removeCurrentUser(space: SpaceResource) {
    const internalAdminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    const group = await regularGroup(space, internalAdminAuth);
    await group.dangerouslyRemoveMembers(internalAdminAuth, {
      users: [user],
    });
    await auth.refresh();
  }

  async function memberRestrictedSpace() {
    const space = await SpaceFactory.regular(workspace);
    await addCurrentUser(space);
    return space;
  }

  async function memberOpenSpace() {
    const memberGroup = await GroupResource.makeNew({
      name: "Open Space members",
      workspaceId: workspace.id,
      kind: "regular_auto",
    });
    return SpaceResource.makeNew(
      await Authenticator.internalAdminForWorkspace(workspace.sId),
      {
        name: "Open Space",
        kind: "regular",
        workspaceId: workspace.id,
      },
      { members: [memberGroup, globalGroup] }
    );
  }

  async function conversation() {
    return ConversationFactory.create(auth, {
      agentConfigurationId: "test-agent",
      messagesCreatedAt: [],
      visibility: "unlisted",
    });
  }

  // `ConversationFactory` does not create participants, so tests that exercise the creator gate
  // have to materialize them explicitly. The first participant by `createdAt` is the creator.
  async function participate(
    conv: ConversationWithoutContentType,
    participantAuth: Authenticator
  ) {
    await ConversationResource.upsertParticipation(participantAuth, {
      conversation: conv,
      action: "posted",
      user: participantAuth.getNonNullableUser().toJSON(),
    });
  }

  // `addSelectedConversationSpaces` materializes the new ACL on the row, so callers that need the
  // updated `requestedSpaceIds` have to re-read the conversation, like the routes do.
  async function refetchConversation(
    readerAuth: Authenticator,
    conversationId: string
  ) {
    const conversation = await ConversationResource.fetchById(
      readerAuth,
      conversationId
    );
    if (!conversation) {
      throw new Error("Conversation not found");
    }
    return conversation.toJSON();
  }

  async function otherWorkspaceMember() {
    const otherUser = await UserFactory.basic();
    await MembershipFactory.associate(workspace, otherUser, { role: "user" });
    return Authenticator.fromUserIdAndWorkspaceId(otherUser.sId, workspace.sId);
  }

  async function memberProjectSpace() {
    const space = await SpaceFactory.project(workspace, user.id);
    await addCurrentUser(space);
    return space;
  }

  async function persistedRequestedSpaceIds(conversationId: string) {
    const { requestedSpaceIds } = await refetchConversation(
      auth,
      conversationId
    );
    return [...requestedSpaceIds].sort();
  }

  it("rejects selected Spaces when the feature flag is disabled", async () => {
    const restrictedSpace = await memberRestrictedSpace();

    expectErrCode(
      await validateSelectableSpaces(auth, {
        spaceIds: [restrictedSpace.sId],
      }),
      "feature_flag_not_found"
    );
  });

  it("rejects selected Spaces for pod conversations", async () => {
    await enableFeature();
    const restrictedSpace = await memberRestrictedSpace();
    const projectSpace = await memberProjectSpace();
    const projectConversation = await ConversationFactory.create(auth, {
      agentConfigurationId: "test-agent",
      messagesCreatedAt: [],
      spaceId: projectSpace.id,
      visibility: "unlisted",
    });

    expectErrCode(
      await addSelectedConversationSpaces(auth, {
        conversation: projectConversation,
        enforceCreatorOnly: false,
        origin: "input_bar",
        spaceIds: [restrictedSpace.sId],
      }),
      "conversation_not_mutable"
    );
    expectErrCode(
      await listSelectableSpaces(auth, {
        conversation: projectConversation,
      }),
      "conversation_not_mutable"
    );
    expectErrCode(
      await validateSelectableSpaces(auth, {
        podId: projectSpace.sId,
        spaceIds: [restrictedSpace.sId],
      }),
      "conversation_not_mutable"
    );
  });

  it("lists selectable regular Spaces and marks selected ones", async () => {
    await enableFeature();
    const selectedSpace = await memberRestrictedSpace();
    const selectableSpace = await memberRestrictedSpace();
    const openSpace = await memberOpenSpace();
    const inaccessibleSpace = await SpaceFactory.regular(workspace);
    const projectSpace = await SpaceFactory.project(workspace, user.id);
    const conv = await conversation();

    await ConversationSelectedSpaceResource.upsertForConversation(auth, {
      conversation: conv,
      origin: "input_bar",
      spaces: [selectedSpace],
    });

    const selectableSpaces = unwrapResult(
      await listSelectableSpaces(auth, { conversation: conv })
    );
    expect(selectableSpaces).toHaveLength(3);
    expect(selectableSpaces).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sId: selectedSpace.sId, selected: true }),
        expect.objectContaining({ sId: selectableSpace.sId, selected: false }),
        expect.objectContaining({ sId: openSpace.sId, selected: false }),
      ])
    );
    expect(selectableSpaces.map((space) => space.sId)).not.toEqual(
      expect.arrayContaining([
        globalSpace.sId,
        inaccessibleSpace.sId,
        projectSpace.sId,
      ])
    );
  });

  it("accepts open Spaces and rejects inaccessible or non-regular Spaces", async () => {
    await enableFeature();
    const inaccessibleSpace = await SpaceFactory.regular(workspace);
    const openSpace = await memberOpenSpace();

    expectErrCode(
      await validateSelectableSpaces(auth, {
        spaceIds: [inaccessibleSpace.sId],
      }),
      "space_not_found"
    );
    expect(
      (
        await validateSelectableSpaces(auth, {
          spaceIds: [openSpace.sId],
        })
      ).isOk()
    ).toBe(true);
    expectErrCode(
      await validateSelectableSpaces(auth, {
        spaceIds: [globalSpace.sId],
      }),
      "space_not_selectable"
    );
  });

  it("materializes selected Spaces, dedupes input, and emits audit events", async () => {
    await enableFeature();
    const selectedSpace = await memberOpenSpace();
    const conv = await conversation();

    const result = unwrapResult(
      await addSelectedConversationSpaces(auth, {
        conversation: conv,
        enforceCreatorOnly: false,
        origin: "input_bar",
        spaceIds: [selectedSpace.sId, selectedSpace.sId],
      })
    );

    expect(result.selectedSpaces).toEqual([
      expect.objectContaining({ sId: selectedSpace.sId, selected: true }),
    ]);
    expect(result.effectiveAcl.spaceIds).toContain(selectedSpace.sId);
    expect(mockEmitAuditLogEvent).toHaveBeenCalledTimes(1);
    expect(mockEmitAuditLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "conversation.space_selected",
        metadata: {
          conversation_id: conv.sId,
          origin: "input_bar",
          space_id: selectedSpace.sId,
        },
      })
    );
  });

  it("merges Spaces added by successive requests into the conversation ACL", async () => {
    await enableFeature();
    const firstSpace = await memberRestrictedSpace();
    const secondSpace = await memberRestrictedSpace();
    const conv = await conversation();

    const firstResult = unwrapResult(
      await addSelectedConversationSpaces(auth, {
        conversation: conv,
        enforceCreatorOnly: false,
        origin: "input_bar",
        spaceIds: [firstSpace.sId],
      })
    );
    expect(firstResult.effectiveAcl.spaceIds).toContain(firstSpace.sId);

    const secondResult = unwrapResult(
      await addSelectedConversationSpaces(auth, {
        conversation: await refetchConversation(auth, conv.sId),
        enforceCreatorOnly: false,
        origin: "input_bar",
        spaceIds: [secondSpace.sId],
      })
    );

    expect(secondResult.effectiveAcl.spaceIds).toEqual(
      expect.arrayContaining([firstSpace.sId, secondSpace.sId])
    );
    expect(secondResult.selectedSpaces.map((space) => space.sId)).toEqual(
      expect.arrayContaining([firstSpace.sId, secondSpace.sId])
    );
    await expect(persistedRequestedSpaceIds(conv.sId)).resolves.toEqual(
      [firstSpace.sId, secondSpace.sId].sort()
    );
  });

  it("keeps Spaces added meanwhile when the caller holds a stale conversation", async () => {
    await enableFeature();
    const firstSpace = await memberRestrictedSpace();
    const secondSpace = await memberRestrictedSpace();
    const conv = await conversation();

    unwrapResult(
      await addSelectedConversationSpaces(auth, {
        conversation: await refetchConversation(auth, conv.sId),
        enforceCreatorOnly: false,
        origin: "input_bar",
        spaceIds: [firstSpace.sId],
      })
    );

    // `conv` still carries its pre-add `requestedSpaceIds`: the stale snapshot an overlapping
    // request would hold.
    const staleResult = unwrapResult(
      await addSelectedConversationSpaces(auth, {
        conversation: conv,
        enforceCreatorOnly: false,
        origin: "input_bar",
        spaceIds: [secondSpace.sId],
      })
    );

    // The Space added by the first request must stay in the ACL: both selections are active, so an
    // ACL that only requires one of them would expose the other's data to users without access.
    await expect(persistedRequestedSpaceIds(conv.sId)).resolves.toEqual(
      [firstSpace.sId, secondSpace.sId].sort()
    );
    expect(
      (
        await ConversationSelectedSpaceResource.listActiveSpacesByConversation(
          auth,
          { conversation: conv }
        )
      )
        .map((space) => space.sId)
        .sort()
    ).toEqual([firstSpace.sId, secondSpace.sId].sort());
    expect([...staleResult.effectiveAcl.spaceIds].sort()).toEqual(
      [firstSpace.sId, secondSpace.sId].sort()
    );
  });

  it("returns the persisted ACL as the effective ACL", async () => {
    await enableFeature();
    const selectedSpace = await memberRestrictedSpace();
    const conv = await conversation();

    const result = unwrapResult(
      await addSelectedConversationSpaces(auth, {
        conversation: conv,
        enforceCreatorOnly: false,
        origin: "input_bar",
        spaceIds: [selectedSpace.sId],
      })
    );

    expect(result.effectiveAcl.viewerMustHaveAll).toBe(true);
    await expect(persistedRequestedSpaceIds(conv.sId)).resolves.toEqual(
      [...result.effectiveAcl.spaceIds].sort()
    );
  });

  it("does not persist selected Spaces when ACL materialization fails", async () => {
    await enableFeature();
    const selectedSpace = await memberRestrictedSpace();
    const conv = await conversation();
    const missingConversationId = `${conv.sId}_missing`;

    expectErrCode(
      await addSelectedConversationSpaces(auth, {
        conversation: { ...conv, sId: missingConversationId },
        enforceCreatorOnly: false,
        origin: "input_bar",
        spaceIds: [selectedSpace.sId],
      }),
      "space_not_selectable"
    );
    expect(
      await ConversationSelectedSpaceResource.listActiveSpacesByConversation(
        auth,
        { conversation: conv }
      )
    ).toEqual([]);
    expect(mockEmitAuditLogEvent).not.toHaveBeenCalled();
  });

  it("rejects added Spaces from a participant who did not create the conversation", async () => {
    await enableFeature();
    const selectedSpace = await memberOpenSpace();
    const conv = await conversation();
    await participate(conv, auth);

    const otherAuth = await otherWorkspaceMember();
    // `isConversationCreator` orders participants by `createdAt`, so make sure the two rows do not
    // land on the same timestamp.
    await new Promise((resolve) => setTimeout(resolve, 10));
    await participate(conv, otherAuth);

    // The other participant can read the conversation and can read the Space...
    expect(
      await ConversationResource.fetchById(otherAuth, conv.sId)
    ).not.toBeNull();
    expect(
      (
        await validateSelectableSpaces(otherAuth, {
          spaceIds: [selectedSpace.sId],
        })
      ).isOk()
    ).toBe(true);

    // ...but they still cannot widen the conversation's access requirements.
    expectErrCode(
      await addSelectedConversationSpaces(otherAuth, {
        conversation: conv,
        enforceCreatorOnly: true,
        origin: "input_bar",
        spaceIds: [selectedSpace.sId],
      }),
      "conversation_not_creator"
    );
    expect(
      await ConversationSelectedSpaceResource.listActiveSpacesByConversation(
        auth,
        { conversation: conv }
      )
    ).toEqual([]);
    expect(mockEmitAuditLogEvent).not.toHaveBeenCalled();
  });

  it("lets the conversation creator add Spaces to an existing conversation", async () => {
    await enableFeature();
    const selectedSpace = await memberOpenSpace();
    const conv = await conversation();
    await participate(conv, auth);

    const otherAuth = await otherWorkspaceMember();
    await new Promise((resolve) => setTimeout(resolve, 10));
    await participate(conv, otherAuth);

    const result = unwrapResult(
      await addSelectedConversationSpaces(auth, {
        conversation: conv,
        enforceCreatorOnly: true,
        origin: "input_bar",
        spaceIds: [selectedSpace.sId],
      })
    );

    expect(result.selectedSpaces).toEqual([
      expect.objectContaining({ sId: selectedSpace.sId, selected: true }),
    ]);
    expect(result.effectiveAcl.spaceIds).toContain(selectedSpace.sId);
  });

  it("lets a non-creator participant re-send the Spaces the conversation already requires", async () => {
    await enableFeature();
    const selectedSpace = await memberOpenSpace();
    const conv = await conversation();
    await participate(conv, auth);

    const otherAuth = await otherWorkspaceMember();
    await new Promise((resolve) => setTimeout(resolve, 10));
    await participate(conv, otherAuth);

    unwrapResult(
      await addSelectedConversationSpaces(auth, {
        conversation: conv,
        enforceCreatorOnly: true,
        origin: "input_bar",
        spaceIds: [selectedSpace.sId],
      })
    );

    // The input bar resends the conversation's whole selection on every message, so a non-creator
    // participant must not be locked out of posting by the creator gate.
    const result = unwrapResult(
      await addSelectedConversationSpaces(otherAuth, {
        conversation: await refetchConversation(otherAuth, conv.sId),
        enforceCreatorOnly: true,
        origin: "input_bar",
        spaceIds: [selectedSpace.sId],
      })
    );

    expect(result.effectiveAcl.spaceIds).toContain(selectedSpace.sId);
    expect(result.selectedSpaces).toEqual([
      expect.objectContaining({ sId: selectedSpace.sId, selected: true }),
    ]);
  });

  it("selects Spaces on the conversation creation path, before any participant exists", async () => {
    await enableFeature();
    const selectedSpace = await memberOpenSpace();
    const conv = await conversation();

    // A conversation being created has no participant row yet (participation is upserted after the
    // Spaces are materialized), so the creator gate cannot be satisfied there, and the creation
    // path opts out of it.
    expectErrCode(
      await addSelectedConversationSpaces(auth, {
        conversation: conv,
        enforceCreatorOnly: true,
        origin: "input_bar",
        spaceIds: [selectedSpace.sId],
      }),
      "conversation_not_creator"
    );

    const result = unwrapResult(
      await addSelectedConversationSpaces(auth, {
        conversation: conv,
        enforceCreatorOnly: false,
        origin: "input_bar",
        spaceIds: [selectedSpace.sId],
      })
    );
    expect(result.effectiveAcl.spaceIds).toContain(selectedSpace.sId);
  });

  it("uses selected Spaces as effective runtime scope when still valid", async () => {
    await enableFeature();
    const selectedSpace = await memberOpenSpace();
    const requestedSpaceModelIds = [globalSpace.id];
    const agentConfiguration = await AgentConfigurationFactory.createTestAgent(
      auth,
      { requestedSpaceIds: requestedSpaceModelIds }
    );
    const conv = await conversation();

    await ConversationSelectedSpaceResource.upsertForConversation(auth, {
      conversation: conv,
      origin: "input_bar",
      spaces: [selectedSpace],
    });

    const effectiveSpaceIds = await getEffectiveSpaceIdsForAgentRun(auth, {
      agentConfiguration,
      conversation: conv,
    });

    expect(effectiveSpaceIds).toEqual(
      expect.arrayContaining([globalSpace.sId, selectedSpace.sId])
    );
  });

  it("keeps valid selected Spaces when another selection becomes invalid", async () => {
    await enableFeature();
    const validSelectedSpace = await memberRestrictedSpace();
    const invalidSelectedSpace = await memberRestrictedSpace();
    const agentConfiguration = await AgentConfigurationFactory.createTestAgent(
      auth,
      { requestedSpaceIds: [globalSpace.id] }
    );
    const conv = await conversation();

    await ConversationSelectedSpaceResource.upsertForConversation(auth, {
      conversation: conv,
      origin: "input_bar",
      spaces: [validSelectedSpace, invalidSelectedSpace],
    });
    await removeCurrentUser(invalidSelectedSpace);

    await expect(
      getEffectiveSpaceIdsForAgentRun(auth, {
        agentConfiguration,
        conversation: conv,
      })
    ).resolves.toEqual([globalSpace.sId, validSelectedSpace.sId]);
  });

  it("keeps a selected Space that becomes open", async () => {
    await enableFeature();
    const selectedSpace = await memberRestrictedSpace();
    const agentConfiguration = await AgentConfigurationFactory.createTestAgent(
      auth,
      { requestedSpaceIds: [globalSpace.id] }
    );
    const conv = await conversation();

    await ConversationSelectedSpaceResource.upsertForConversation(auth, {
      conversation: conv,
      origin: "input_bar",
      spaces: [selectedSpace],
    });
    const globalGroupResult = await GroupResource.fetchWorkspaceGlobalGroup(
      await Authenticator.internalAdminForWorkspace(workspace.sId)
    );
    if (globalGroupResult.isErr()) {
      throw globalGroupResult.error;
    }
    await GroupSpaceFactory.associate(selectedSpace, globalGroupResult.value);

    await expect(
      getEffectiveSpaceIdsForAgentRun(auth, {
        agentConfiguration,
        conversation: conv,
      })
    ).resolves.toEqual([globalSpace.sId, selectedSpace.sId]);
  });

  it("copies valid selected Spaces to a child conversation", async () => {
    await enableFeature();
    const selectedSpace = await memberRestrictedSpace();
    const parentConversation = await conversation();
    const childConversation = await conversation();

    await ConversationSelectedSpaceResource.upsertForConversation(auth, {
      conversation: parentConversation,
      origin: "input_bar",
      spaces: [selectedSpace],
    });
    const userSpy = vi.spyOn(auth, "user").mockReturnValue(null);

    unwrapResult(
      await copySelectedConversationSpacesToChild(auth, {
        parentConversation,
        childConversationId: childConversation.sId,
      })
    );
    userSpy.mockRestore();

    const childSelectedSpaces =
      await ConversationSelectedSpaceResource.listActiveSpacesByConversation(
        auth,
        { conversation: childConversation }
      );
    expect(childSelectedSpaces.map((space) => space.sId)).toEqual([
      selectedSpace.sId,
    ]);
    const [selectedSpaceRow] =
      await ConversationSelectedSpaceResource.listByConversation(auth, {
        conversation: childConversation,
      });
    expect(selectedSpaceRow.origin).toBe("parent_conversation");
  });

  it("copies selected Spaces to a child conversation when the caller did not create the parent", async () => {
    await enableFeature();
    const selectedSpace = await memberOpenSpace();
    const parentConversation = await conversation();
    const childConversation = await conversation();

    await ConversationSelectedSpaceResource.upsertForConversation(auth, {
      conversation: parentConversation,
      origin: "input_bar",
      spaces: [selectedSpace],
    });
    await participate(parentConversation, auth);

    // A participant who is not the creator can still run a sub-agent, and the child conversation
    // must inherit the parent's Spaces: inheritance is system-initiated and revalidated against the
    // caller, so the creator gate does not apply to it.
    const otherAuth = await otherWorkspaceMember();
    await new Promise((resolve) => setTimeout(resolve, 10));
    await participate(parentConversation, otherAuth);

    unwrapResult(
      await copySelectedConversationSpacesToChild(otherAuth, {
        parentConversation,
        childConversationId: childConversation.sId,
      })
    );

    const childSelectedSpaces =
      await ConversationSelectedSpaceResource.listActiveSpacesByConversation(
        auth,
        { conversation: childConversation }
      );
    expect(childSelectedSpaces.map((space) => space.sId)).toEqual([
      selectedSpace.sId,
    ]);
  });

  it("ignores selected Spaces at runtime for pod conversations", async () => {
    await enableFeature();
    const selectedSpace = await memberRestrictedSpace();
    const projectSpace = await memberProjectSpace();
    const agentConfiguration = await AgentConfigurationFactory.createTestAgent(
      auth,
      { requestedSpaceIds: [globalSpace.id] }
    );
    const podConversation = await ConversationFactory.create(auth, {
      agentConfigurationId: "test-agent",
      messagesCreatedAt: [],
      spaceId: projectSpace.id,
      visibility: "unlisted",
    });

    // Selections cannot be created through the service in a pod conversation, so go through the
    // resource directly to reproduce rows left over from before the conversation was moved.
    await ConversationSelectedSpaceResource.upsertForConversation(auth, {
      conversation: podConversation,
      origin: "input_bar",
      spaces: [selectedSpace],
    });

    await expect(
      getEffectiveSpaceIdsForAgentRun(auth, {
        agentConfiguration,
        conversation: podConversation,
      })
    ).resolves.toEqual([globalSpace.sId]);
  });

  it("removes selected Spaces when the conversation moves into a project", async () => {
    await enableFeature();
    const selectedSpace = await memberRestrictedSpace();
    const projectSpace = await memberProjectSpace();
    const conv = await conversation();

    unwrapResult(
      await addSelectedConversationSpaces(auth, {
        conversation: conv,
        enforceCreatorOnly: false,
        origin: "input_bar",
        spaceIds: [selectedSpace.sId],
      })
    );

    const moveResult = await moveConversationToProject(auth, {
      conversation: conv,
      spaceId: projectSpace.sId,
    });
    expect(moveResult.isOk()).toBe(true);

    expect(
      await ConversationSelectedSpaceResource.listActiveSpacesByConversation(
        auth,
        { conversation: conv }
      )
    ).toEqual([]);
    const allSelections =
      await ConversationSelectedSpaceResource.listByConversation(auth, {
        activeOnly: false,
        conversation: conv,
      });
    expect(allSelections).toHaveLength(1);
    expect(allSelections[0].removedAt).not.toBeNull();
  });

  it("does not resurrect selected Spaces when the conversation moves back out of a project", async () => {
    await enableFeature();
    const selectedSpace = await memberRestrictedSpace();
    const projectSpace = await memberProjectSpace();
    const agentConfiguration = await AgentConfigurationFactory.createTestAgent(
      auth,
      { requestedSpaceIds: [globalSpace.id] }
    );
    const conv = await conversation();

    unwrapResult(
      await addSelectedConversationSpaces(auth, {
        conversation: conv,
        enforceCreatorOnly: false,
        origin: "input_bar",
        spaceIds: [selectedSpace.sId],
      })
    );

    const moveInResult = await moveConversationToProject(auth, {
      conversation: conv,
      spaceId: projectSpace.sId,
    });
    expect(moveInResult.isOk()).toBe(true);

    const podConversation = await refetchConversation(auth, conv.sId);
    expect(isPodConversation(podConversation)).toBe(true);

    const moveOutResult = await moveConversationOutOfProject(auth, {
      conversation: podConversation,
    });
    expect(moveOutResult.isOk()).toBe(true);

    // Moving out rebuilds requestedSpaceIds from agents and content fragments only: the selected
    // Space has no ACL backing anymore, so it must not come back into the runtime scope either.
    const movedOutConversation = await refetchConversation(auth, conv.sId);
    expect(isPodConversation(movedOutConversation)).toBe(false);
    expect(movedOutConversation.requestedSpaceIds).not.toContain(
      selectedSpace.sId
    );
    await expect(
      getEffectiveSpaceIdsForAgentRun(auth, {
        agentConfiguration,
        conversation: movedOutConversation,
      })
    ).resolves.toEqual([globalSpace.sId]);
  });

  it("ignores selected Spaces at runtime when the feature flag is disabled", async () => {
    const selectedSpace = await memberRestrictedSpace();
    const requestedSpaceModelIds = [globalSpace.id];
    const agentConfiguration = await AgentConfigurationFactory.createTestAgent(
      auth,
      { requestedSpaceIds: requestedSpaceModelIds }
    );
    const conv = await conversation();

    await ConversationSelectedSpaceResource.upsertForConversation(auth, {
      conversation: conv,
      origin: "input_bar",
      spaces: [selectedSpace],
    });

    await expect(
      getEffectiveSpaceIdsForAgentRun(auth, {
        agentConfiguration,
        conversation: conv,
      })
    ).resolves.toEqual([globalSpace.sId]);
  });
});
