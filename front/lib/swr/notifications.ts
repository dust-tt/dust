import { useNovuClient } from "@app/hooks/useNovuClient";
import { useSWRWithDefaults } from "@app/lib/swr/swr";
import datadogLogger from "@app/logger/datadogLogger";
import { CONVERSATION_UNREAD_TRIGGER_ID } from "@app/types/notification_preferences";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { LightWorkspaceType } from "@app/types/user";
import type { Preference } from "@novu/js";
import { useCallback } from "react";

const NOVU_SESSION_ERROR_CODE = "novu_session_initialization_failed";
const NOVU_REQUEST_ERROR_CODE = "novu_preferences_request_failed";
const MISSING_WORKFLOW_ERROR_CODE = "missing_conversation_unread_workflow";

export type ConversationNotificationPreferencesStatus =
  | "idle"
  | "loading"
  | "ready"
  | "error";

export function useConversationNotificationPreferences({
  owner,
  disabled,
}: {
  owner: LightWorkspaceType;
  disabled?: boolean;
}) {
  const { novuClient } = useNovuClient();

  const { data, error, mutate } = useSWRWithDefaults(
    novuClient ? ["novuConversationPreferences", owner.sId] : null,
    async () => {
      if (!novuClient) {
        return undefined;
      }

      let preferences;
      try {
        preferences = await novuClient.preferences.list();
      } catch (err) {
        const normalizedError = normalizeError(err);
        datadogLogger.error(
          {
            code: NOVU_REQUEST_ERROR_CODE,
            ownerId: owner.sId,
            error: normalizedError,
          },
          "Failed to load notification preferences from Novu (request error)."
        );
        throw normalizedError;
      }

      if (preferences.error) {
        datadogLogger.error(
          {
            code: NOVU_SESSION_ERROR_CODE,
            ownerId: owner.sId,
            message: preferences.error.message,
          },
          "Failed to load notification preferences from Novu (session error)."
        );
        throw new Error(preferences.error.message);
      }

      const preferenceList = preferences.data ?? [];
      const conversationPreference = preferenceList.find(
        (preference) =>
          preference.workflow?.identifier === CONVERSATION_UNREAD_TRIGGER_ID
      );

      if (!conversationPreference) {
        const availableWorkflowIdentifiers = preferenceList
          .map((preference) => preference.workflow?.identifier)
          .filter((identifier): identifier is string => Boolean(identifier));

        datadogLogger.error(
          {
            code: MISSING_WORKFLOW_ERROR_CODE,
            ownerId: owner.sId,
            missingWorkflowIdentifier: CONVERSATION_UNREAD_TRIGGER_ID,
            availableWorkflowIdentifiers,
          },
          "Failed to load notification preferences from Novu (workflow missing)."
        );
        throw new Error(MISSING_WORKFLOW_ERROR_CODE);
      }

      return conversationPreference;
    },
    { disabled, shouldRetryOnError: false }
  );

  let status: ConversationNotificationPreferencesStatus = "loading";
  if (disabled) {
    status = "idle";
  } else if (data) {
    status = "ready";
  } else if (error) {
    status = "error";
  }

  const saveConversationPreferences = useCallback(
    async (preference: Preference) => {
      if (!novuClient) {
        throw new Error("Novu client is not ready.");
      }
      const result = await novuClient.preferences.update({
        preference,
        channels: preference.channels,
      });
      if (result.error) {
        throw new Error(result.error.message);
      }
      await mutate(preference, { revalidate: false });
    },
    [novuClient, mutate]
  );

  return {
    conversationPreferences: data,
    status,
    saveConversationPreferences,
  };
}
