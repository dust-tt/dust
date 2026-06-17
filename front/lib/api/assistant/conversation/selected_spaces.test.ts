import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockEmitAuditLogEvent } = vi.hoisted(() => ({
  mockEmitAuditLogEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@app/lib/api/audit/workos_audit", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@app/lib/api/audit/workos_audit")>();

  return {
    ...actual,
    emitAuditLogEvent: mockEmitAuditLogEvent,
  };
});

import {
  addSelectedConversationSpaces,
  getEffectiveSpaceIdsForAgentRun,
  listSelectableRestrictedSpaces,
} from "@app/lib/api/assistant/conversation/selected_spaces";
import { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { ConversationSelectedSpaceResource } from "@app/lib/resources/conversation_selected_space_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import type { UserType, WorkspaceType } from "@app/types/user";

describe("selected conversation Spaces", () => {
  let auth: Authenticator;
  let globalSpace: SpaceResource;
  let user: UserType;
  let workspace: WorkspaceType;

  beforeEach(async () => {
    const setup = await createResourceTest({});
    auth = setup.authenticator;
    globalSpace = setup.globalSpace;
    user = setup.user.toJSON();
    workspace = auth.getNonNullableWorkspace();
    mockEmitAuditLogEvent.mockClear();
  });

  async function addCurrentUserToRegularGroup(space: SpaceResource) {
    const internalAdminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    const memberGroup = space.groups.find((group) => group.kind === "regular");
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

  async function fetchConversationWithoutContent(
    conversationId: string
  ): Promise<ConversationWithoutContentType> {
    const result = await ConversationResource.fetchConversationWithoutContent(
      auth,
      conversationId
    );
    if (result.isErr()) {
      throw result.error;
    }

    return result.value;
  }

  it("rejects selected Spaces when the feature flag is disabled", async () => {
    const restrictedSpace = await createMemberRestrictedRegularSpace();
    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: "test-agent",
      messagesCreatedAt: [],
      visibility: "unlisted",
    });

    const result = await addSelectedConversationSpaces(auth, {
      conversation,
      origin: "input_bar",
      spaceIds: [restrictedSpace.sId],
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe("feature_flag_not_found");
    }
    expect(mockEmitAuditLogEvent).not.toHaveBeenCalled();
  });

  it("rejects selected Spaces for project conversations", async () => {
    await FeatureFlagFactory.basic(auth, "restricted_spaces_in_input_bar");
    const restrictedSpace = await createMemberRestrictedRegularSpace();
    const projectSpace = await SpaceFactory.project(workspace, user.id);
    await addCurrentUserToRegularGroup(projectSpace);
    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: "test-agent",
      messagesCreatedAt: [],
      spaceId: projectSpace.id,
      visibility: "unlisted",
    });

    const result = await addSelectedConversationSpaces(auth, {
      conversation,
      origin: "input_bar",
      spaceIds: [restrictedSpace.sId],
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe("conversation_not_mutable");
    }
    expect(mockEmitAuditLogEvent).not.toHaveBeenCalled();
  });

  it("materializes selected restricted Spaces and uses them as effective runtime scope", async () => {
    await FeatureFlagFactory.basic(auth, "restricted_spaces_in_input_bar");
    const restrictedSpace = await createMemberRestrictedRegularSpace();
    const agentConfiguration = await AgentConfigurationFactory.createTestAgent(
      auth,
      {
        requestedSpaceIds: [globalSpace.id],
      }
    );
    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: agentConfiguration.sId,
      messagesCreatedAt: [],
      visibility: "unlisted",
    });

    const result = await addSelectedConversationSpaces(auth, {
      conversation,
      origin: "input_bar",
      spaceIds: [restrictedSpace.sId],
    });

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      throw result.error;
    }

    expect(result.value.selectedSpaces).toEqual([
      expect.objectContaining({
        sId: restrictedSpace.sId,
        selected: true,
      }),
    ]);
    expect(result.value.effectiveAcl.spaceIds).toContain(restrictedSpace.sId);

    const updatedConversation = await fetchConversationWithoutContent(
      conversation.sId
    );
    expect(updatedConversation.requestedSpaceIds).toContain(
      restrictedSpace.sId
    );

    const selectedRows =
      await ConversationSelectedSpaceResource.listByConversation(auth, {
        conversation: updatedConversation,
      });
    expect(selectedRows).toHaveLength(1);
    expect(selectedRows[0].origin).toBe("input_bar");
    expect(selectedRows[0].spaceId).toBe(restrictedSpace.id);
    expect(selectedRows[0].selectedByUserId).toBe(user.id);

    const selectableSpaces = await listSelectableRestrictedSpaces(auth, {
      conversation: updatedConversation,
    });
    expect(selectableSpaces.isOk()).toBe(true);
    if (selectableSpaces.isErr()) {
      throw selectableSpaces.error;
    }
    expect(selectableSpaces.value).toContainEqual(
      expect.objectContaining({
        sId: restrictedSpace.sId,
        selected: true,
      })
    );

    const effectiveSpaceIds = await getEffectiveSpaceIdsForAgentRun(auth, {
      agentConfiguration,
      conversation: updatedConversation,
    });
    expect(effectiveSpaceIds).toEqual(
      expect.arrayContaining([globalSpace.sId, restrictedSpace.sId])
    );

    expect(mockEmitAuditLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "conversation.restricted_space_selected",
        metadata: {
          conversation_id: conversation.sId,
          origin: "input_bar",
          space_id: restrictedSpace.sId,
        },
      })
    );
  });
});
