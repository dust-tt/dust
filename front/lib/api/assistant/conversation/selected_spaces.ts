import {
  buildAuditLogTarget,
  emitAuditLogEvent,
} from "@app/lib/api/audit/workos_audit";
import type { AuditLogContext } from "@app/lib/api/workos/organization";
import { type Authenticator, getFeatureFlags } from "@app/lib/auth";
import type { ConversationSelectedSpaceOrigin } from "@app/lib/models/agent/conversation_selected_space";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { ConversationSelectedSpaceResource } from "@app/lib/resources/conversation_selected_space_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { getResourceIdFromSId } from "@app/lib/resources/string_ids";
import { withTransaction } from "@app/lib/utils/sql_utils";
import {
  type ConversationSelectedSpacesResponse,
  type ConversationWithoutContentType,
  isPodConversation,
  type SelectableConversationSpaceType,
} from "@app/types/assistant/conversation";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { removeNulls } from "@app/types/shared/utils/general";
import uniq from "lodash/uniq";
import type { Transaction } from "sequelize";

export class SelectedConversationSpacesError extends Error {
  constructor(
    readonly code:
      | "conversation_not_mutable"
      | "feature_flag_not_found"
      | "space_not_found"
      | "space_not_restricted"
      | "space_not_selectable",
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
  if (isPodConversation(conversation)) {
    return new Err(
      new SelectedConversationSpacesError(
        "conversation_not_mutable",
        "Restricted Spaces cannot be selected from the input bar in pod conversations."
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

export async function addSelectedConversationSpaces(
  auth: Authenticator,
  {
    conversation,
    spaceIds,
    origin,
    auditContext,
    transaction,
  }: {
    conversation: ConversationWithoutContentType;
    spaceIds: string[];
    origin: ConversationSelectedSpaceOrigin;
    auditContext?: AuditLogContext;
    transaction?: Transaction;
  }
): Promise<
  Result<ConversationSelectedSpacesResponse, SelectedConversationSpacesError>
> {
  const dedupedSpaceIds = uniq(spaceIds);

  if (dedupedSpaceIds.length === 0) {
    const selectedSpaces =
      await ConversationSelectedSpaceResource.listActiveSpacesByConversation(
        auth,
        {
          conversation,
          transaction,
        }
      );

    return new Ok({
      selectedSpaces: selectedSpaces.map((space) => ({
        ...space.toJSON(),
        selected: true,
      })),
      effectiveAcl: {
        spaceIds: conversation.requestedSpaceIds,
        viewerMustHaveAll: true as const,
      },
    });
  }

  let newlyActiveSpaces: SpaceResource[] = [];
  const result = await withTransaction(async (t) => {
    if (isPodConversation(conversation)) {
      return new Err(
        new SelectedConversationSpacesError(
          "conversation_not_mutable",
          "Restricted Spaces cannot be selected from the input bar in pod conversations."
        )
      );
    }

    const selectableSpacesResult = await validateSelectableRestrictedSpaces(
      auth,
      {
        spaceIds: dedupedSpaceIds,
        transaction: t,
      }
    );
    if (selectableSpacesResult.isErr()) {
      return selectableSpacesResult;
    }

    const spaces = selectableSpacesResult.value;
    const requestedSpaceModelIds = removeNulls(
      conversation.requestedSpaceIds.map(getResourceIdFromSId)
    );
    const selectedSpaceModelIds = spaces.map((space) => space.id);
    const effectiveAclSpaceModelIds = uniq([
      ...requestedSpaceModelIds,
      ...selectedSpaceModelIds,
    ]);

    const updateResult = await ConversationResource.updateRequirements(
      auth,
      conversation.sId,
      effectiveAclSpaceModelIds,
      t
    );
    if (updateResult.isErr()) {
      return new Err(
        new SelectedConversationSpacesError(
          "space_not_selectable",
          updateResult.error.message
        )
      );
    }

    const { createdSpaces, reactivatedSpaces } =
      await ConversationSelectedSpaceResource.upsertForConversation(auth, {
        conversation,
        spaces,
        origin,
        transaction: t,
      });
    newlyActiveSpaces = [...createdSpaces, ...reactivatedSpaces];

    const allSelectedSpaces =
      await ConversationSelectedSpaceResource.listActiveSpacesByConversation(
        auth,
        {
          conversation,
          transaction: t,
        }
      );
    const effectiveAclSpaceIds = uniq([
      ...conversation.requestedSpaceIds,
      ...spaces.map((space) => space.sId),
    ]);

    return new Ok({
      selectedSpaces: allSelectedSpaces.map((space) => ({
        ...space.toJSON(),
        selected: true,
      })),
      effectiveAcl: {
        spaceIds: effectiveAclSpaceIds,
        viewerMustHaveAll: true as const,
      },
    });
  }, transaction);

  if (result.isOk()) {
    for (const space of newlyActiveSpaces) {
      void emitAuditLogEvent({
        auth,
        action: "conversation.restricted_space_selected",
        targets: [
          buildAuditLogTarget("workspace", auth.getNonNullableWorkspace()),
          buildAuditLogTarget("conversation", {
            sId: conversation.sId,
            name: conversation.title ?? "",
          }),
          buildAuditLogTarget("space", space),
        ],
        context: auditContext,
        metadata: {
          conversation_id: conversation.sId,
          space_id: space.sId,
          origin,
        },
      });
    }
  }

  return result;
}
