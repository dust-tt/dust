import { useSendNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import { emptyArray, fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import datadogLogger from "@app/logger/datadogLogger";
import type {
  ConversationSkillActionRequest,
  FetchConversationSkillsResponse,
} from "@app/pages/api/w/[wId]/assistant/conversations/[cId]/skills";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { useCallback } from "react";
import type { Fetcher } from "swr";

export function useConversationSkills({
  conversationId,
  workspaceId,
  options,
}: {
  conversationId?: string | null;
  workspaceId: string;
  options?: { disabled: boolean };
}) {
  const conversationSkillsFetcher: Fetcher<FetchConversationSkillsResponse> =
    fetcher;

  const { data, error, mutate, isLoading } = useSWRWithDefaults(
    conversationId
      ? `/api/w/${workspaceId}/assistant/conversations/${conversationId}/skills`
      : null,
    conversationSkillsFetcher,
    { ...options, focusThrottleInterval: 30 * 60 * 1000 } // 30 minutes
  );

  return {
    conversationSkills: data?.skills ?? emptyArray(),
    isConversationSkillsLoading: !options?.disabled && isLoading,
    isConversationSkillsError: !!error,
    mutateConversationSkills: mutate,
  };
}

export function useAddDeleteConversationSkill({
  conversationId,
  workspaceId,
}: {
  conversationId?: string | null;
  workspaceId: string;
}) {
  const sendNotification = useSendNotification();
  const addSkill = useCallback(
    async (skillId: string): Promise<boolean> => {
      if (!conversationId) {
        return false;
      }

      try {
        const response = await clientFetch(
          `/api/w/${workspaceId}/assistant/conversations/${conversationId}/skills`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              action: "add",
              skillId,
            } satisfies ConversationSkillActionRequest),
          }
        );

        if (!response.ok) {
          throw new Error("Failed to add skill to conversation");
        }

        const result = await response.json();
        return result.success === true;
      } catch (err) {
        const error = normalizeError(err);
        datadogLogger.error(
          {
            error,
            conversationId,
            workspaceId,
          },
          "[JIT Skill] Error adding skill to conversation"
        );
        sendNotification({
          type: "error",
          title: "Failed to add skill to conversation",
          description: error.message,
        });
        return false;
      }
    },
    [conversationId, workspaceId, sendNotification]
  );

  const deleteSkill = useCallback(
    async (skillId: string): Promise<boolean> => {
      if (!conversationId) {
        return false;
      }

      try {
        const response = await clientFetch(
          `/api/w/${workspaceId}/assistant/conversations/${conversationId}/skills`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              action: "delete",
              skillId,
            } satisfies ConversationSkillActionRequest),
          }
        );

        if (!response.ok) {
          throw new Error("Failed to remove skill from conversation");
        }

        const result = await response.json();
        return result.success === true;
      } catch (err) {
        const error = normalizeError(err);
        datadogLogger.error(
          {
            error,
            conversationId,
            workspaceId,
            skillId,
          },
          "[JIT Skill] Error removing skill from conversation"
        );
        sendNotification({
          type: "error",
          title: "Failed to remove skill from conversation",
          description: error.message,
        });
        return false;
      }
    },
    [conversationId, workspaceId, sendNotification]
  );

  return { addSkill, deleteSkill };
}
