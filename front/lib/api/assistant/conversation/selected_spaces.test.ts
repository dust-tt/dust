import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockEmitAuditLogEvent } = vi.hoisted(() => ({
  mockEmitAuditLogEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@app/lib/api/audit/workos_audit", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@app/lib/api/audit/workos_audit")>();

  return { ...actual, emitAuditLogEvent: mockEmitAuditLogEvent };
});

import {
  addSelectedConversationSpaces,
  copySelectedConversationSpacesToChild,
  getEffectiveSpaceIdsForAgentRun,
  listSelectableSpaces,
  type SelectedConversationSpacesError,
  validateSelectableSpaces,
} from "@app/lib/api/assistant/conversation/selected_spaces";
import { Authenticator } from "@app/lib/auth";
import { ConversationSelectedSpaceResource } from "@app/lib/resources/conversation_selected_space_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { GroupSpaceFactory } from "@app/tests/utils/GroupSpaceFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
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
    const projectSpace = await SpaceFactory.project(workspace, user.id);
    await addCurrentUser(projectSpace);
    const projectConversation = await ConversationFactory.create(auth, {
      agentConfigurationId: "test-agent",
      messagesCreatedAt: [],
      spaceId: projectSpace.id,
      visibility: "unlisted",
    });

    expectErrCode(
      await addSelectedConversationSpaces(auth, {
        conversation: projectConversation,
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

  it("does not persist selected Spaces when ACL materialization fails", async () => {
    await enableFeature();
    const selectedSpace = await memberRestrictedSpace();
    const conv = await conversation();
    const missingConversationId = `${conv.sId}_missing`;

    expectErrCode(
      await addSelectedConversationSpaces(auth, {
        conversation: { ...conv, sId: missingConversationId },
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
