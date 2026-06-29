import {
  listSelectableRestrictedSpaces,
  type SelectedConversationSpacesError,
  validateSelectableRestrictedSpaces,
} from "@app/lib/api/assistant/conversation/selected_spaces";
import { Authenticator } from "@app/lib/auth";
import { ConversationSelectedSpaceResource } from "@app/lib/resources/conversation_selected_space_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import type { Result } from "@app/types/shared/result";
import type { UserType, WorkspaceType } from "@app/types/user";
import { beforeEach, describe, expect, it } from "vitest";

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
  let globalSpace: SpaceResource;
  let user: UserType;
  let workspace: WorkspaceType;

  beforeEach(async () => {
    const setup = await createResourceTest({});
    auth = setup.authenticator;
    globalSpace = setup.globalSpace;
    user = setup.user.toJSON();
    workspace = auth.getNonNullableWorkspace();
  });

  async function enableFeature() {
    await FeatureFlagFactory.basic(auth, "restricted_spaces_in_input_bar");
  }

  function regularGroup(space: SpaceResource) {
    const group = space.groups.find((g) => g.kind === "regular");
    if (!group) {
      throw new Error("Expected regular member group on Space");
    }
    return group;
  }

  async function addCurrentUser(space: SpaceResource) {
    const internalAdminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    await regularGroup(space).dangerouslyAddMembers(internalAdminAuth, {
      users: [user],
    });
    await auth.refresh();
  }

  async function memberRestrictedSpace() {
    const space = await SpaceFactory.regular(workspace);
    await addCurrentUser(space);
    return space;
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
      await validateSelectableRestrictedSpaces(auth, {
        spaceIds: [restrictedSpace.sId],
      }),
      "feature_flag_not_found"
    );
  });

  it("rejects selected Spaces for project conversations", async () => {
    await enableFeature();
    const projectSpace = await SpaceFactory.project(workspace, user.id);
    await addCurrentUser(projectSpace);
    const projectConversation = await ConversationFactory.create(auth, {
      agentConfigurationId: "test-agent",
      messagesCreatedAt: [],
      spaceId: projectSpace.id,
      visibility: "unlisted",
    });

    expectErrCode(
      await listSelectableRestrictedSpaces(auth, {
        conversation: projectConversation,
      }),
      "conversation_not_mutable"
    );
  });

  it("lists selectable restricted regular Spaces and marks selected ones", async () => {
    await enableFeature();
    const selectedSpace = await memberRestrictedSpace();
    const selectableSpace = await memberRestrictedSpace();
    const inaccessibleSpace = await SpaceFactory.regular(workspace);
    const projectSpace = await SpaceFactory.project(workspace, user.id);
    const conv = await conversation();

    await ConversationSelectedSpaceResource.upsertForConversation(auth, {
      conversation: conv,
      origin: "input_bar",
      spaces: [selectedSpace],
    });

    const selectableSpaces = unwrapResult(
      await listSelectableRestrictedSpaces(auth, { conversation: conv })
    );
    expect(selectableSpaces).toHaveLength(2);
    expect(selectableSpaces).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sId: selectedSpace.sId, selected: true }),
        expect.objectContaining({ sId: selectableSpace.sId, selected: false }),
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

  it("rejects inaccessible and non-restricted Spaces", async () => {
    await enableFeature();
    const inaccessibleSpace = await SpaceFactory.regular(workspace);

    expectErrCode(
      await validateSelectableRestrictedSpaces(auth, {
        spaceIds: [inaccessibleSpace.sId],
      }),
      "space_not_found"
    );
    expectErrCode(
      await validateSelectableRestrictedSpaces(auth, {
        spaceIds: [globalSpace.sId],
      }),
      "space_not_restricted"
    );
  });
});
