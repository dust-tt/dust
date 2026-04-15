import { useSendNotification } from "@app/hooks/useNotification";
import { useNovuClient } from "@app/hooks/useNovuClient";
import { useFeatureFlags } from "@app/lib/auth/AuthContext";
import { useSlackNotifications, useUserMetadata } from "@app/lib/swr/user";
import { setUserMetadataFromClient } from "@app/lib/user";
import datadogLogger from "@app/logger/datadogLogger";
import type {
  NotificationCondition,
  NotificationPreferencesDelay,
} from "@app/types/notification_preferences";
import {
  CONVERSATION_NOTIFICATION_METADATA_KEYS,
  CONVERSATION_UNREAD_TRIGGER_ID,
  DEFAULT_NOTIFICATION_CONDITION,
  DEFAULT_NOTIFICATION_DELAY,
  isNotificationCondition,
  isNotificationPreferencesDelay,
  makeNotificationPreferencesUserMetadata,
  NOTIFICATION_DELAY_OPTIONS,
} from "@app/types/notification_preferences";
import type { WorkspaceType } from "@app/types/user";
import {
  Button,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuTrigger,
  Spinner,
} from "@dust-tt/sparkle";
import type { ChannelPreference, Preference } from "@novu/js";
import cloneDeep from "lodash/cloneDeep";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

const NOTIFICATION_PREFERENCES_DELAY_LABELS: Record<
  NotificationPreferencesDelay,
  string
> = {
  "5_minutes": "every 5 minutes",
  "15_minutes": "every 15 minutes",
  "30_minutes": "every 30 minutes",
  "1_hour": "every hour",
  daily: "a day",
  weekly: "a week",
};

const NOTIFICATION_CONDITION_LABELS: Record<NotificationCondition, string> = {
  all_messages: "Notify me for all activity",
  only_mentions: "Notify me when mentioned",
  never: "Never notify me",
};

const NOTIFICATION_CONDITION_DESCRIPTIONS: Record<
  NotificationCondition,
  string
> = {
  all_messages: "New messages in projects and conversations",
  only_mentions: "New messages when directly mentioned",
  never: "No notifications",
};

const NOVU_SESSION_ERROR_CODE = "novu_session_initialization_failed";
const NOVU_REQUEST_ERROR_CODE = "novu_preferences_request_failed";
const MISSING_WORKFLOW_ERROR_CODE = "missing_conversation_unread_workflow";

export interface NotificationPreferencesRefProps {
  savePreferences: () => Promise<boolean>;
  isDirty: () => boolean;
  reset: () => void;
}

interface NotificationPreferencesProps {
  onChanged: () => void;
  owner: WorkspaceType;
}

export const NotificationPreferences = forwardRef<
  NotificationPreferencesRefProps,
  NotificationPreferencesProps
>(({ onChanged, owner }, ref) => {
  const sendNotification = useSendNotification();
  const { hasFeature } = useFeatureFlags();

  const hasSlackNotificationsFeature = hasFeature(
    "conversations_slack_notifications"
  );

  const { isSlackSetupLoading, canConfigureSlack } = useSlackNotifications(
    owner.sId,
    {
      disabled: !hasSlackNotificationsFeature,
    }
  );

  const displaySlackOption = hasSlackNotificationsFeature && canConfigureSlack;

  const isProjectsFeatureEnabled = hasFeature("projects");

  // Novu workflow-specific channel preferences for conversation-unread
  const [conversationPreferences, setConversationPreferences] = useState<
    Preference | undefined
  >();
  const [isLoadingPreferences, setIsLoadingPreferences] = useState(true);

  // Email digest delay (for unread conversation email notifications)
  const [conversationEmailDelay, setConversationEmailDelay] =
    useState<NotificationPreferencesDelay>(DEFAULT_NOTIFICATION_DELAY);

  // Conversation notification condition
  const [notifyCondition, setNotifyCondition] = useState<NotificationCondition>(
    DEFAULT_NOTIFICATION_CONDITION
  );

  const { novuClient } = useNovuClient();

  // User metadata hooks
  const {
    metadata: conversationEmailMetadata,
    mutateMetadata: mutateConversationEmailDelay,
  } = useUserMetadata(makeNotificationPreferencesUserMetadata("email"));

  const {
    metadata: notifyConditionMetadata,
    mutateMetadata: mutateNotifyCondition,
  } = useUserMetadata(CONVERSATION_NOTIFICATION_METADATA_KEYS.notifyCondition);

  // Store original values for reset/dirty checking
  const originalConversationPreferencesRef = useRef<Preference | undefined>();
  const originalConversationEmailDelayRef =
    useRef<NotificationPreferencesDelay>(DEFAULT_NOTIFICATION_DELAY);
  const originalNotifyConditionRef = useRef<NotificationCondition>(
    DEFAULT_NOTIFICATION_CONDITION
  );

  // Load email delay from user metadata
  useEffect(() => {
    if (conversationEmailMetadata?.value) {
      const delay = conversationEmailMetadata.value;
      if (isNotificationPreferencesDelay(delay)) {
        setConversationEmailDelay(delay);
        originalConversationEmailDelayRef.current = delay;
      }
    }
  }, [conversationEmailMetadata]);

  // Load notify condition from user metadata
  useEffect(() => {
    if (notifyConditionMetadata?.value) {
      const condition = notifyConditionMetadata.value as NotificationCondition;
      if (isNotificationCondition(condition)) {
        setNotifyCondition(condition);
        originalNotifyConditionRef.current = condition;
      }
    }
  }, [notifyConditionMetadata]);

  // Load workflow-specific preferences from Novu
  useEffect(() => {
    if (!novuClient) {
      return;
    }
    setIsLoadingPreferences(true);

    void novuClient.preferences
      .list()
      .then((preferences) => {
        if (preferences.error) {
          datadogLogger.error(
            {
              code: NOVU_SESSION_ERROR_CODE,
              ownerId: owner.sId,
              message: preferences.error.message,
            },
            "Failed to load notification preferences from Novu (session error)."
          );
          setConversationPreferences(undefined);
          originalConversationPreferencesRef.current = undefined;
          return;
        }

        const preferenceList = preferences.data ?? [];
        const conversationPref = preferenceList.find(
          (preference) =>
            preference.workflow?.identifier === CONVERSATION_UNREAD_TRIGGER_ID
        );
        setConversationPreferences(conversationPref);
        originalConversationPreferencesRef.current = conversationPref;

        if (!conversationPref) {
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
        }
      })
      .catch((error) => {
        datadogLogger.error(
          {
            code: NOVU_REQUEST_ERROR_CODE,
            ownerId: owner.sId,
            error,
          },
          "Failed to load notification preferences from Novu (request error)."
        );
        setConversationPreferences(undefined);
        originalConversationPreferencesRef.current = undefined;
      })
      .finally(() => {
        setIsLoadingPreferences(false);
      });
  }, [novuClient, owner.sId]);

  // Expose methods to parent component
  useImperativeHandle(
    ref,
    () => ({
      savePreferences: async () => {
        if (!conversationPreferences || !novuClient) {
          return false;
        }

        try {
          // Save conversation workflow preferences in Novu
          const conversationResult = await novuClient.preferences.update({
            preference: conversationPreferences,
            channels: conversationPreferences.channels,
          });

          if (conversationResult.error) {
            sendNotification({
              type: "error",
              title: "Error updating notification preferences",
              description: conversationResult.error.message,
            });
            return false;
          }

          // Save email delay if changed
          if (
            conversationEmailDelay !== originalConversationEmailDelayRef.current
          ) {
            await setUserMetadataFromClient({
              key: makeNotificationPreferencesUserMetadata("email"),
              value: conversationEmailDelay,
            });
            await mutateConversationEmailDelay((current) =>
              current ? { ...current, value: conversationEmailDelay } : current
            );
          }

          // Save notify condition if changed
          if (notifyCondition !== originalNotifyConditionRef.current) {
            await setUserMetadataFromClient({
              key: CONVERSATION_NOTIFICATION_METADATA_KEYS.notifyCondition,
              value: notifyCondition,
            });
            await mutateNotifyCondition((current) =>
              current ? { ...current, value: notifyCondition } : current
            );
          }

          // Update original references on successful save
          originalConversationPreferencesRef.current = conversationPreferences;
          originalConversationEmailDelayRef.current = conversationEmailDelay;
          originalNotifyConditionRef.current = notifyCondition;
          return true;
        } catch (error) {
          sendNotification({
            type: "error",
            title: "Error updating notification preferences",
            description: error instanceof Error ? error.message : String(error),
          });
          return false;
        }
      },
      isDirty: () => {
        if (
          !originalConversationPreferencesRef.current ||
          !conversationPreferences
        ) {
          return false;
        }

        // Compare conversation channel preferences
        const originalConv = originalConversationPreferencesRef.current;
        const currentConv = conversationPreferences;
        for (const channel of Object.keys(originalConv.channels) as Array<
          keyof typeof originalConv.channels
        >) {
          if (
            originalConv.channels[channel] !== currentConv.channels[channel]
          ) {
            return true;
          }
        }

        // Compare other preferences
        if (
          conversationEmailDelay !== originalConversationEmailDelayRef.current
        ) {
          return true;
        }
        if (notifyCondition !== originalNotifyConditionRef.current) {
          return true;
        }

        return false;
      },
      reset: () => {
        if (originalConversationPreferencesRef.current) {
          setConversationPreferences(
            cloneDeep(originalConversationPreferencesRef.current)
          );
        }
        setConversationEmailDelay(originalConversationEmailDelayRef.current);
        setNotifyCondition(originalNotifyConditionRef.current);
      },
    }),
    [
      conversationPreferences,
      conversationEmailDelay,
      notifyCondition,
      mutateConversationEmailDelay,
      mutateNotifyCondition,
      novuClient,
      sendNotification,
    ]
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: ignored using `--suppress`
  useEffect(() => {
    onChanged();
  }, [
    conversationPreferences,
    conversationEmailDelay,
    notifyCondition,
    onChanged,
  ]);

  const updateConversationChannelPreference = (
    channel: keyof ChannelPreference,
    enabled: boolean
  ) => {
    setConversationPreferences((prev) => {
      if (!prev) {
        return undefined;
      }
      const newPreferences = cloneDeep(prev);
      newPreferences.channels[channel] = enabled;
      return newPreferences;
    });
  };

  const getSelectedChannelLabel = (
    preference: Preference,
    displaySlackOption: boolean
  ) => {
    const displayedChannels: string[] = [];
    if (preference.channels.in_app) {
      displayedChannels.push("in-app popup");
    }
    if (preference.channels.chat && displaySlackOption) {
      displayedChannels.push("Slack");
    }
    if (preference.channels.email) {
      displayedChannels.push("email");
    }
    return displayedChannels.length > 0 ? displayedChannels.join(", ") : "none";
  };

  if (isLoadingPreferences || isSlackSetupLoading) {
    return <Spinner />;
  }

  if (!conversationPreferences) {
    return (
      <div className="text-sm text-muted-foreground dark:text-muted-foreground-night">
        Unable to load notification preferences. Please contact support.
      </div>
    );
  }

  const isConversationInAppEnabled =
    conversationPreferences.channels.in_app && conversationPreferences.enabled;
  const isConversationSlackEnabled =
    conversationPreferences.channels.chat && conversationPreferences.enabled;
  const isConversationEmailEnabled =
    conversationPreferences.channels.email && conversationPreferences.enabled;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        {/* Conversation notifications */}
        <div className="flex flex-wrap items-center">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                isSelect
                label={NOTIFICATION_CONDITION_LABELS[notifyCondition]}
              />
            </DropdownMenuTrigger>
            <DropdownMenuPortal>
              <DropdownMenuContent>
                <DropdownMenuItem
                  label={NOTIFICATION_CONDITION_LABELS["all_messages"]}
                  description={
                    isProjectsFeatureEnabled
                      ? NOTIFICATION_CONDITION_DESCRIPTIONS["all_messages"]
                      : undefined
                  }
                  onClick={() => setNotifyCondition("all_messages")}
                />
                <DropdownMenuItem
                  label={NOTIFICATION_CONDITION_LABELS["only_mentions"]}
                  description={
                    isProjectsFeatureEnabled
                      ? NOTIFICATION_CONDITION_DESCRIPTIONS["only_mentions"]
                      : undefined
                  }
                  onClick={() => setNotifyCondition("only_mentions")}
                />
                <DropdownMenuItem
                  label={NOTIFICATION_CONDITION_LABELS["never"]}
                  description={
                    isProjectsFeatureEnabled
                      ? NOTIFICATION_CONDITION_DESCRIPTIONS["never"]
                      : undefined
                  }
                  onClick={() => setNotifyCondition("never")}
                />
              </DropdownMenuContent>
            </DropdownMenuPortal>
          </DropdownMenu>
          {notifyCondition !== "never" && (
            <>
              <span className="text-foreground dark:text-foreground-night ml-0.5">
                , by&nbsp;
              </span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    isSelect
                    label={getSelectedChannelLabel(
                      conversationPreferences,
                      displaySlackOption
                    )}
                  />
                </DropdownMenuTrigger>

                <DropdownMenuPortal>
                  <DropdownMenuContent>
                    {conversationPreferences.channels.in_app !== undefined && (
                      <DropdownMenuCheckboxItem
                        label="in-app popup"
                        checked={isConversationInAppEnabled}
                        onCheckedChange={(checked) =>
                          updateConversationChannelPreference("in_app", checked)
                        }
                      />
                    )}
                    {conversationPreferences.channels.chat !== undefined &&
                      displaySlackOption && (
                        <DropdownMenuCheckboxItem
                          label="Slack"
                          checked={isConversationSlackEnabled}
                          onCheckedChange={(checked) =>
                            updateConversationChannelPreference("chat", checked)
                          }
                        />
                      )}
                    {conversationPreferences.channels.email !== undefined && (
                      <DropdownMenuCheckboxItem
                        label="email"
                        checked={isConversationEmailEnabled}
                        onCheckedChange={(checked) =>
                          updateConversationChannelPreference("email", checked)
                        }
                      />
                    )}
                  </DropdownMenuContent>
                </DropdownMenuPortal>
              </DropdownMenu>
              {isConversationEmailEnabled && (
                <>
                  <span className="text-foreground dark:text-foreground-night ml-0.5">
                    . Email me max once&nbsp;
                  </span>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        isSelect
                        label={
                          NOTIFICATION_PREFERENCES_DELAY_LABELS[
                            conversationEmailDelay
                          ]
                        }
                      />
                    </DropdownMenuTrigger>

                    <DropdownMenuPortal>
                      <DropdownMenuContent>
                        {NOTIFICATION_DELAY_OPTIONS.map((delay) => (
                          <DropdownMenuItem
                            key={delay}
                            label={NOTIFICATION_PREFERENCES_DELAY_LABELS[delay]}
                            onClick={() => setConversationEmailDelay(delay)}
                          />
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenuPortal>
                  </DropdownMenu>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
});
