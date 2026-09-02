import {
  buildAuditLogTarget,
  emitAuditLogEvent,
} from "@app/lib/api/audit/workos_audit";
import type { AuditLogContext } from "@app/lib/api/workos/organization";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import type { ConversationSelectedSpaceOrigin } from "@app/lib/models/agent/conversation_selected_space";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { ConversationSelectedSpaceResource } from "@app/lib/resources/conversation_selected_space_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { getResourceIdFromSId } from "@app/lib/resources/string_ids";
import { withTransaction } from "@app/lib/utils/sql_utils";
import type {
  ConversationSelectedSpacesResponse,
  ConversationWithoutContentType,
  SelectableConversationSpaceType,
} from "@app/types/assistant/conversation";
import { isPodConversation } from "@app/types/assistant/conversation";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { removeNulls } from "@app/types/shared/utils/general";
import uniq from "lodash/uniq";
import type { Transaction } from "sequelize";

export class SelectedConversationSpacesError extends Error {
  constructor(
    readonly code:
      | "conversation_not_creator"
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
    SpaceResource.listWorkspaceSpacesAsMember(auth, { kinds: ["regular"] }),
    ConversationSelectedSpaceResource.listActiveSpacesByConversation(auth, {
      conversation,
    }),
  ]);
  const selectedSpaceIds = new Set(
    selectedSpaces.map((selectedSpace) => selectedSpace.sId)
  );

  const selectableSpaceResources = spaces
    .filter((space) => space.isRegular())
    .sort((a, b) => a.name.localeCompare(b.name));

  const enriched = await SpaceResource.batchToJSONEnriched(
    auth,
    selectableSpaceResources
  );

  const selectableSpaces = selectableSpaceResources.map((space, i) => ({
    ...enriched[i],
    selected: selectedSpaceIds.has(space.sId),
  }));

  return new Ok(selectableSpaces);
}

export async function validateSelectableSpaces(
  auth: Authenticator,
  {
    podId,
    spaceIds,
    transaction,
  }: {
    podId?: string | null;
    spaceIds: string[];
    transaction?: Transaction;
  }
): Promise<Result<SpaceResource[], SelectedConversationSpacesError>> {
  if (podId) {
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

  if (spaces.some((space) => !auth.can("read", space))) {
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

/**
 * Selected Spaces are a conjunctive access requirement: a viewer must have read access to *every*
 * Space of `conversation.requestedSpaceIds` to read the conversation, and there is no removal path
 * once a Space is selected. Adding a Space to an existing conversation can therefore permanently
 * evict the other participants, so `enforceCreatorOnly` must be true whenever the caller is a user
 * widening the scope of a conversation that already exists. It is only false on paths where there
 * is no one to evict: conversation creation (the conversation is brand new, and has no participant
 * row yet) and sub-agent inheritance (the child conversation is system-created and its Spaces were
 * already validated against the same user on the parent). Even when it is true, the gate only fires
 * on calls that actually widen `conversation.requestedSpaceIds`.
 */
export async function addSelectedConversationSpaces(
  auth: Authenticator,
  {
    conversation,
    spaceIds,
    origin,
    auditContext,
    enforceCreatorOnly,
    sourceSelections,
    transaction,
  }: {
    conversation: ConversationWithoutContentType;
    spaceIds: string[];
    origin: ConversationSelectedSpaceOrigin;
    auditContext?: AuditLogContext;
    enforceCreatorOnly: boolean;
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

    const enriched = await SpaceResource.batchToJSONEnriched(
      auth,
      selectedSpaces
    );

    return new Ok({
      selectedSpaces: selectedSpaces.map((_space, i) => ({
        ...enriched[i],
        selected: true,
      })),
      effectiveAcl: {
        spaceIds: conversation.requestedSpaceIds,
        viewerMustHaveAll: true as const,
      },
    });
  }

  // The input bar resends the conversation's whole current selection with every message, so most
  // calls do not actually widen anything. Re-selecting a Space the conversation already requires
  // cannot evict anyone, so the creator gate only applies to a real widening of the ACL.
  const requestedSpaceIds = new Set(conversation.requestedSpaceIds);
  const widensConversationAcl = dedupedSpaceIds.some(
    (spaceId) => !requestedSpaceIds.has(spaceId)
  );

  if (enforceCreatorOnly && widensConversationAcl) {
    const conversationResource = await ConversationResource.fetchById(
      auth,
      conversation.sId
    );
    if (!conversationResource) {
      return new Err(
        new SelectedConversationSpacesError(
          "conversation_not_found",
          "Conversation not found or access was denied."
        )
      );
    }

    // `isConversationCreator` errors when the conversation has no participant at all, which is the
    // same as "the caller is not the creator" from this endpoint's point of view.
    const isCreatorRes = await conversationResource.isConversationCreator(auth);
    if (isCreatorRes.isErr() || !isCreatorRes.value) {
      return new Err(
        new SelectedConversationSpacesError(
          "conversation_not_creator",
          "Only the user who created the conversation can select Spaces for it."
        )
      );
    }
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

    // The ACL must be merged against locked, current state rather than against `conversation`,
    // which is the caller snapshot: the input bar fires one request per Space toggle, and two
    // overlapping requests each writing the union of their own snapshot would drop one of the
    // Spaces from the ACL while both selections stay active.
    const appendResult = await ConversationResource.appendRequestedSpaceIds(
      auth,
      conversation.sId,
      spaces.map((space) => space.id),
      t
    );
    if (appendResult.isErr()) {
      return new Err(
        new SelectedConversationSpacesError(
          "space_not_selectable",
          appendResult.error.message
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

    const enriched = await SpaceResource.batchToJSONEnriched(
      auth,
      allSelectedSpaces
    );

    return new Ok({
      selectedSpaces: allSelectedSpaces.map((_space, i) => ({
        ...enriched[i],
        selected: true,
      })),
      effectiveAcl: {
        // The persisted ACL, not an optimistic local union: callers feed it back into their own
        // conversation object.
        spaceIds: appendResult.value,
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

/**
 * An agent's configured Spaces are only its default scope. A conversation can
 * add other Spaces, so runtime skill and tool resolution must combine both
 * sources after revalidating the conversation selections. Centralizing that
 * merge keeps every runtime consumer on the same authorization-safe scope.
 */
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
async function getValidSelectedSpaceIdsForAgentRun(
  auth: Authenticator,
  {
    conversation,
    transaction,
  }: {
    conversation: ConversationWithoutContentType;
    transaction?: Transaction;
  }
): Promise<string[]> {
  // A pod conversation's ACL is pinned to its project space, so it cannot express the extra space
  // requirements a selection implies. Honouring selections here would decouple the agent's runtime
  // scope from the conversation's visibility: every project member would read retrieved content
  // from Spaces they may not have access to. Selection write paths already bail out for pod
  // conversations, and so does updateConversationRequirementsForSkills.
  if (isPodConversation(conversation)) {
    return [];
  }

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
    .filter((space) => auth.can("read", space) && space.isRegular())
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
    // System-initiated inheritance: the child conversation is created by the run_agent tool and has
    // no participant, and the inherited Spaces were revalidated against the same `auth` on the
    // parent just above. There is no one to evict here.
    enforceCreatorOnly: false,
    sourceSelections,
  });
  if (result.isErr()) {
    return new Err(result.error);
  }

  return new Ok(undefined);
}
