import type { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { LightWorkspaceType } from "@app/types/user";

import {
  isWorkspaceConversationKillSwitchValue,
  isWorkspaceKillSwitchedForAllAPIs,
  KILL_SWITCH_METADATA_KEY,
  type WorkspaceConversationKillSwitchOperation,
} from "./workspace";

export type UpdateWorkspaceConversationKillSwitchResult = {
  wasBlockedBefore: boolean;
  wasUpdated: boolean;
};

type WorkspaceMetadataValue = string | number | boolean | object;
type WorkspaceMetadata = Record<string, WorkspaceMetadataValue | undefined>;

const WORKSPACE_FULLY_BLOCKED_ERROR_MESSAGE =
  "Workspace is fully blocked. Use `workspace unblock` before managing conversation blocks.";

const INVALID_WORKSPACE_KILL_SWITCH_METADATA_ERROR_PREFIX =
  "Invalid workspace kill switch metadata:";

type WorkspaceForConversationKillSwitchUpdate = Pick<
  LightWorkspaceType,
  "id" | "metadata"
>;

function removeUndefinedMetadataValues(
  metadata: WorkspaceMetadata
): Record<string, WorkspaceMetadataValue> {
  return Object.fromEntries(
    Object.entries(metadata).filter(
      (entry): entry is [string, WorkspaceMetadataValue] =>
        entry[1] !== undefined
    )
  );
}

export async function updateWorkspaceConversationKillSwitch(
  auth: Authenticator,
  workspace: WorkspaceForConversationKillSwitchUpdate,
  {
    conversationId,
    operation,
  }: {
    conversationId: string;
    operation: WorkspaceConversationKillSwitchOperation;
  }
): Promise<Result<UpdateWorkspaceConversationKillSwitchResult, Error>> {
  const currentKillSwitch = workspace.metadata?.[KILL_SWITCH_METADATA_KEY];
  if (isWorkspaceKillSwitchedForAllAPIs(currentKillSwitch)) {
    return new Err(new Error(WORKSPACE_FULLY_BLOCKED_ERROR_MESSAGE));
  }
  if (
    currentKillSwitch !== undefined &&
    !isWorkspaceConversationKillSwitchValue(currentKillSwitch)
  ) {
    return new Err(
      new Error(
        `${INVALID_WORKSPACE_KILL_SWITCH_METADATA_ERROR_PREFIX} ${JSON.stringify(currentKillSwitch)}`
      )
    );
  }

  const conversationIds = currentKillSwitch?.conversationIds ?? [];
  const wasBlockedBefore = conversationIds.includes(conversationId);

  let metadata: WorkspaceMetadata;

  switch (operation) {
    case "block": {
      if (wasBlockedBefore) {
        return new Ok({
          wasBlockedBefore,
          wasUpdated: false,
        });
      }

      const conversation = await ConversationResource.fetchById(
        auth,
        conversationId
      );
      if (!conversation) {
        return new Err(
          new Error(`Conversation not found: cId='${conversationId}'`)
        );
      }

      const updatedConversationIds = wasBlockedBefore
        ? conversationIds
        : [...conversationIds, conversationId];
      metadata = {
        ...(workspace.metadata ?? {}),
        [KILL_SWITCH_METADATA_KEY]: {
          conversationIds: updatedConversationIds,
        },
      };
      break;
    }

    case "unblock": {
      if (!wasBlockedBefore) {
        return new Ok({
          wasBlockedBefore,
          wasUpdated: false,
        });
      }

      const updatedConversationIds = conversationIds.filter(
        (cId) => cId !== conversationId
      );
      metadata = { ...(workspace.metadata ?? {}) };
      if (updatedConversationIds.length === 0) {
        delete metadata[KILL_SWITCH_METADATA_KEY];
      } else {
        metadata[KILL_SWITCH_METADATA_KEY] = {
          conversationIds: updatedConversationIds,
        };
      }
      break;
    }

    default:
      return assertNever(operation);
  }

  const updateResult = await WorkspaceResource.updateMetadata(
    workspace.id,
    removeUndefinedMetadataValues(metadata)
  );
  if (updateResult.isErr()) {
    return new Err(updateResult.error);
  }

  return new Ok({
    wasBlockedBefore,
    wasUpdated: true,
  });
}
