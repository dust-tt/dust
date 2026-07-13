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
      | "conversation_not_found"
      | "feature_flag_not_found"
      | "space_not_found"
      | "space_not_selectable",
    message: string
  ) {
    super(message);
  }
}

export async function listSelectableSpaces(
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
        "Spaces cannot be selected from the input bar in pod conversations."
      )
    );
  }

  const featureFlags = await getFeatureFlags(auth);
  if (!featureFlags.includes("restricted_spaces_in_input_bar")) {
    return new Err(
      new SelectedConversationSpacesError(
        "feature_flag_not_found",
        "Space selection in the input bar is not enabled for this workspace."
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
    .filter((space) => space.isRegular())
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((space) => ({
      ...space.toJSON(),
      selected: selectedSpaceIds.has(space.sId),
    }));

  return new Ok(selectableSpaces);
}

export async function validateSelectableSpaces(
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
        "Space selection in the input bar is not enabled for this workspace."
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

  if (spaces.some((space) => !space.isRegular())) {
    return new Err(
      new SelectedConversationSpacesError(
        "space_not_selectable",
        "Only regular Spaces can be selected from the input bar."
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
    sourceSelections,
    transaction,
  }: {
    conversation: ConversationWithoutContentType;
    spaceIds: string[];
    origin: ConversationSelectedSpaceOrigin;
    auditContext?: AuditLogContext;
    sourceSelections?: ConversationSelectedSpaceResource[];
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
          "Spaces cannot be selected from the input bar in pod conversations."
        )
      );
    }

    const selectableSpacesResult = await validateSelectableSpaces(auth, {
      spaceIds: dedupedSpaceIds,
      transaction: t,
    });
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
        sourceSelections,
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
        action: "conversation.space_selected",
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

export async function getEffectiveSpaceIdsForAgentRun(
  auth: Authenticator,
  {
    agentConfiguration,
    conversation,
    transaction,
  }: {
    agentConfiguration: { requestedSpaceIds: string[] };
    conversation: ConversationWithoutContentType;
    transaction?: Transaction;
  }
): Promise<string[]> {
  const selectedSpaceIds = await getValidSelectedSpaceIdsForAgentRun(auth, {
    conversation,
    transaction,
  });

  return uniq([...agentConfiguration.requestedSpaceIds, ...selectedSpaceIds]);
}

/**
 * Validates durable conversation selections against the runtime authenticator.
 * Selector provenance is audit history, not an ongoing authorization grant;
 * system-key runs intentionally preserve selections materialized in the ACL.
 */
export async function getValidSelectedSpaceIdsForAgentRun(
  auth: Authenticator,
  {
    conversation,
    transaction,
  }: {
    conversation: ConversationWithoutContentType;
    transaction?: Transaction;
  }
): Promise<string[]> {
  const featureFlags = await getFeatureFlags(auth);
  if (!featureFlags.includes("restricted_spaces_in_input_bar")) {
    return [];
  }

  const selectedSpaces =
    await ConversationSelectedSpaceResource.listActiveSpacesByConversation(
      auth,
      {
        conversation,
        transaction,
      }
    );

  return selectedSpaces
    .filter((space) => space.canRead(auth) && space.isRegular())
    .map((space) => space.sId);
}

export async function copySelectedConversationSpacesToChild(
  auth: Authenticator,
  {
    parentConversation,
    childConversationId,
  }: {
    parentConversation: ConversationWithoutContentType;
    childConversationId: string;
  }
): Promise<Result<undefined, SelectedConversationSpacesError>> {
  const selectedSpaceIds = await getValidSelectedSpaceIdsForAgentRun(auth, {
    conversation: parentConversation,
  });
  if (selectedSpaceIds.length === 0) {
    return new Ok(undefined);
  }

  const childConversation = await ConversationResource.fetchById(
    auth,
    childConversationId
  );
  if (!childConversation) {
    return new Err(
      new SelectedConversationSpacesError(
        "conversation_not_found",
        "Child conversation not found or access was denied."
      )
    );
  }

  const parentSelections =
    await ConversationSelectedSpaceResource.listByConversation(auth, {
      activeOnly: false,
      conversation: parentConversation,
    });
  const selectedSpaceModelIds = new Set(
    removeNulls(selectedSpaceIds.map(getResourceIdFromSId))
  );
  const sourceSelections = parentSelections.filter((selection) =>
    selectedSpaceModelIds.has(selection.spaceId)
  );
  if (sourceSelections.length !== selectedSpaceModelIds.size) {
    return new Err(
      new SelectedConversationSpacesError(
        "space_not_selectable",
        "Selected Space provenance changed while creating the child conversation."
      )
    );
  }

  const result = await addSelectedConversationSpaces(auth, {
    conversation: childConversation.toJSON(),
    spaceIds: selectedSpaceIds,
    origin: "parent_conversation",
    sourceSelections,
  });
  if (result.isErr()) {
    return new Err(result.error);
  }

  return new Ok(undefined);
}
