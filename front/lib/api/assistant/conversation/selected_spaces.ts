import { type Authenticator, getFeatureFlags } from "@app/lib/auth";
import { ConversationSelectedSpaceResource } from "@app/lib/resources/conversation_selected_space_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import type {
  ConversationWithoutContentType,
  SelectableConversationSpaceType,
} from "@app/types/assistant/conversation";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import uniq from "lodash/uniq";
import type { Transaction } from "sequelize";

export class SelectedConversationSpacesError extends Error {
  constructor(
    readonly code:
      | "conversation_not_mutable"
      | "feature_flag_not_found"
      | "space_not_found"
      | "space_not_restricted",
    message: string
  ) {
    super(message);
  }
}

export async function listSelectableRestrictedSpaces(
  auth: Authenticator,
  {
    conversation,
  }: {
    conversation: ConversationWithoutContentType;
  }
): Promise<
  Result<SelectableConversationSpaceType[], SelectedConversationSpacesError>
> {
  if (conversation.spaceId !== null) {
    return new Err(
      new SelectedConversationSpacesError(
        "conversation_not_mutable",
        "Restricted Spaces cannot be selected from the input bar in project conversations."
      )
    );
  }

  const featureFlags = await getFeatureFlags(auth);
  if (!featureFlags.includes("restricted_spaces_in_input_bar")) {
    return new Err(
      new SelectedConversationSpacesError(
        "feature_flag_not_found",
        "Restricted Spaces in the input bar is not enabled for this workspace."
      )
    );
  }

  const [spaces, selectedSpaces] = await Promise.all([
    SpaceResource.listWorkspaceSpacesAsMember(auth),
    ConversationSelectedSpaceResource.listActiveSpacesByConversation(auth, {
      conversation,
    }),
  ]);
  const selectedSpaceIds = new Set(
    selectedSpaces.map((selectedSpace) => selectedSpace.sId)
  );

  const selectableSpaces = spaces
    .filter((space) => space.isRegularAndRestricted())
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((space) => ({
      ...space.toJSON(),
      selected: selectedSpaceIds.has(space.sId),
    }));

  return new Ok(selectableSpaces);
}

export async function validateSelectableRestrictedSpaces(
  auth: Authenticator,
  {
    spaceIds,
    transaction,
  }: {
    spaceIds: string[];
    transaction?: Transaction;
  }
): Promise<Result<SpaceResource[], SelectedConversationSpacesError>> {
  const featureFlags = await getFeatureFlags(auth);
  if (!featureFlags.includes("restricted_spaces_in_input_bar")) {
    return new Err(
      new SelectedConversationSpacesError(
        "feature_flag_not_found",
        "Restricted Spaces in the input bar is not enabled for this workspace."
      )
    );
  }

  const dedupedSpaceIds = uniq(spaceIds);
  const spaces = await SpaceResource.fetchByIds(auth, dedupedSpaceIds, {
    transaction,
  });
  const foundSpaceIds = new Set(spaces.map((space) => space.sId));

  if (dedupedSpaceIds.some((spaceId) => !foundSpaceIds.has(spaceId))) {
    return new Err(
      new SelectedConversationSpacesError(
        "space_not_found",
        "One or more Spaces were not found or access was denied."
      )
    );
  }

  if (spaces.some((space) => !space.canRead(auth))) {
    return new Err(
      new SelectedConversationSpacesError(
        "space_not_found",
        "One or more Spaces were not found or access was denied."
      )
    );
  }

  if (spaces.some((space) => !space.isRegularAndRestricted())) {
    return new Err(
      new SelectedConversationSpacesError(
        "space_not_restricted",
        "Only restricted regular Spaces can be selected from the input bar."
      )
    );
  }

  return new Ok(spaces);
}
