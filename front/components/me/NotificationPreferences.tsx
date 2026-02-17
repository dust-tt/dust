import { useSendNotification } from "@app/hooks/useNotification";
import { useNovuClient } from "@app/hooks/useNovuClient";
import { useSlackNotifications, useUserMetadata } from "@app/lib/swr/user";
import { useFeatureFlags } from "@app/lib/swr/workspaces";
import { setUserMetadataFromClient } from "@app/lib/user";
import type {
  NotificationCondition,
  NotificationPreferencesDelay,
} from "@app/types/notification_preferences";
import {
  CONVERSATION_NOTIFICATION_METADATA_KEYS,
  CONVERSATION_UNREAD_TRIGGER_ID,
  isNotificationCondition,
  isNotificationPreferencesDelay,
  makeNotificationPreferencesUserMetadata,
  NOTIFICATION_DELAY_OPTIONS,
  PROJECT_ADDED_AS_MEMBER_TRIGGER_ID,
  PROJECT_NEW_CONVERSATION_TRIGGER_ID,
} from "@app/types/notification_preferences";
import type { WorkspaceType } from "@app/types/user";
import {
  Button,
  Checkbox,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  InformationCircleIcon,
  Label,
  Spinner,
  Tooltip,
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
  daily: "once a day",
};

const NOTIFICATION_CONDITION_LABELS: Record<NotificationCondition, string> = {
  all_messages: "for all new messages",
  only_mentions: "only when I'm mentioned",
  never: "never",
};

const DEFAULT_NOTIFICATION_DELAY: NotificationPreferencesDelay = "1_hour";
const DEFAULT_NOTIFICATION_CONDITION: NotificationCondition = "all_messages";

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
  const { hasFeature } = useFeatureFlags({ workspaceId: owner.sId });

  const hasSlackNotificationsFeature = hasFeature(
    "conversations_slack_notifications"
  );

  const { isSlackSetupLoading, canConfigureSlack } = useSlackNotifications(
    owner.sId,
    {
      disabled: !hasSlackNotificationsFeature,
    }
  );

  // Novu workflow-specific channel preferences for conversation-unread
  const [conversationPreferences, setConversationPreferences] = useState<
    Preference | undefined
  >();
  // Novu workflow-specific channel preferences for project-added-as-member
  const [projectPreferences, setProjectPreferences] = useState<
    Preference | undefined
  >();
  // Novu workflow-specific channel preferences for project-new-conversation
  const [
    projectNewConversationPreferences,
    setProjectNewConversationPreferences,
  ] = useState<Preference | undefined>();
  const [isLoadingPreferences, setIsLoadingPreferences] = useState(true);

  // Email digest delay (for unread conversation email notifications)
  const [conversationEmailDelay, setConversationEmailDelay] =
    useState<NotificationPreferencesDelay>(DEFAULT_NOTIFICATION_DELAY);

  // Email digest delay (for project new conversation email notifications)
  const [
    projectNewConversationEmailDelay,
    setProjectNewConversationEmailDelay,
  ] = useState<NotificationPreferencesDelay>(DEFAULT_NOTIFICATION_DELAY);

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
    metadata: projectNewConversationEmailMetadata,
    mutateMetadata: mutateProjectNewConversationEmailDelay,
  } = useUserMetadata(
    makeNotificationPreferencesUserMetadata(
      "email",
      PROJECT_NEW_CONVERSATION_TRIGGER_ID
    )
  );

  const {
    metadata: notifyConditionMetadata,
    mutateMetadata: mutateNotifyCondition,
  } = useUserMetadata(CONVERSATION_NOTIFICATION_METADATA_KEYS.notifyCondition);

  // Store original values for reset/dirty checking
  const originalConversationPreferencesRef = useRef<Preference | undefined>();
  const originalProjectPreferencesRef = useRef<Preference | undefined>();
  const originalProjectNewConversationPreferencesRef = useRef<
    Preference | undefined
  >();
  const originalConversationEmailDelayRef =
    useRef<NotificationPreferencesDelay>(DEFAULT_NOTIFICATION_DELAY);
  const originalProjectNewConversationEmailDelayRef =
    useRef<NotificationPreferencesDelay>(DEFAULT_NOTIFICATION_DELAY);
  const originalNotifyConditionRef = useRef<NotificationCondition>(
    DEFAULT_NOTIFICATION_CONDITION
  );

  const isProjectsFeatureEnabled = hasFeature("projects");

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

  useEffect(() => {
    if (projectNewConversationEmailMetadata?.value) {
      const delay = projectNewConversationEmailMetadata.value;
      if (isNotificationPreferencesDelay(delay)) {
        setProjectNewConversationEmailDelay(delay);
        originalProjectNewConversationEmailDelayRef.current = delay;
      }
    }
  }, [projectNewConversationEmailMetadata]);

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
    void novuClient.preferences.list().then((preferences) => {
      const conversationPref = preferences.data?.find(
        (preference) =>
          preference.workflow?.identifier === CONVERSATION_UNREAD_TRIGGER_ID
      );
      setConversationPreferences(conversationPref);
      originalConversationPreferencesRef.current = conversationPref;

      const projectPref = preferences.data?.find(
        (preference) =>
          preference.workflow?.identifier === PROJECT_ADDED_AS_MEMBER_TRIGGER_ID
      );
      setProjectPreferences(projectPref);
      originalProjectPreferencesRef.current = projectPref;

      const projectNewConvPref = preferences.data?.find(
        (preference) =>
          preference.workflow?.identifier ===
          PROJECT_NEW_CONVERSATION_TRIGGER_ID
      );
      setProjectNewConversationPreferences(projectNewConvPref);
      originalProjectNewConversationPreferencesRef.current = projectNewConvPref;

      setIsLoadingPreferences(false);
    });
  }, [novuClient]);

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

          // Save project workflow preferences in Novu (if available)
          if (projectPreferences) {
            const projectResult = await novuClient.preferences.update({
              preference: projectPreferences,
              channels: projectPreferences.channels,
            });

            if (projectResult.error) {
              sendNotification({
                type: "error",
                title: "Error updating notification preferences",
                description: projectResult.error.message,
              });
              return false;
            }
          }

          // Save project new conversation workflow preferences in Novu (if available)
          if (projectNewConversationPreferences) {
            const projectNewConvResult = await novuClient.preferences.update({
              preference: projectNewConversationPreferences,
              channels: projectNewConversationPreferences.channels,
            });

            if (projectNewConvResult.error) {
              sendNotification({
                type: "error",
                title: "Error updating notification preferences",
                description: projectNewConvResult.error.message,
              });
              return false;
            }
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

          if (
            projectNewConversationEmailDelay !==
            originalProjectNewConversationEmailDelayRef.current
          ) {
            await setUserMetadataFromClient({
              key: makeNotificationPreferencesUserMetadata(
                "email",
                PROJECT_NEW_CONVERSATION_TRIGGER_ID
              ),
              value: projectNewConversationEmailDelay,
            });
            await mutateProjectNewConversationEmailDelay((current) =>
              current
                ? { ...current, value: projectNewConversationEmailDelay }
                : current
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
          originalProjectPreferencesRef.current = projectPreferences;
          originalProjectNewConversationPreferencesRef.current =
            projectNewConversationPreferences;
          originalConversationEmailDelayRef.current = conversationEmailDelay;
          originalProjectNewConversationEmailDelayRef.current =
            projectNewConversationEmailDelay;
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

        // Compare project channel preferences
        if (originalProjectPreferencesRef.current && projectPreferences) {
          const originalProj = originalProjectPreferencesRef.current;
          const currentProj = projectPreferences;
          for (const channel of Object.keys(originalProj.channels) as Array<
            keyof typeof originalProj.channels
          >) {
            if (
              originalProj.channels[channel] !== currentProj.channels[channel]
            ) {
              return true;
            }
          }
        }

        // Compare project new conversation channel preferences
        if (
          originalProjectNewConversationPreferencesRef.current &&
          projectNewConversationPreferences
        ) {
          const originalProjNewConv =
            originalProjectNewConversationPreferencesRef.current;
          const currentProjNewConv = projectNewConversationPreferences;
          for (const channel of Object.keys(
            originalProjNewConv.channels
          ) as Array<keyof typeof originalProjNewConv.channels>) {
            if (
              originalProjNewConv.channels[channel] !==
              currentProjNewConv.channels[channel]
            ) {
              return true;
            }
          }
        }

        // Compare other preferences
        if (
          conversationEmailDelay !== originalConversationEmailDelayRef.current
        ) {
          return true;
        }
        if (
          projectNewConversationEmailDelay !==
          originalProjectNewConversationEmailDelayRef.current
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
        if (originalProjectPreferencesRef.current) {
          setProjectPreferences(
            cloneDeep(originalProjectPreferencesRef.current)
          );
        }
        if (originalProjectNewConversationPreferencesRef.current) {
          setProjectNewConversationPreferences(
            cloneDeep(originalProjectNewConversationPreferencesRef.current)
          );
        }
        setConversationEmailDelay(originalConversationEmailDelayRef.current);
        setProjectNewConversationEmailDelay(
          originalProjectNewConversationEmailDelayRef.current
        );
        setNotifyCondition(originalNotifyConditionRef.current);
      },
    }),
    [
      conversationPreferences,
      projectPreferences,
      projectNewConversationPreferences,
      conversationEmailDelay,
      projectNewConversationEmailDelay,
      notifyCondition,
      mutateConversationEmailDelay,
      mutateProjectNewConversationEmailDelay,
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
    projectPreferences,
    projectNewConversationPreferences,
    conversationEmailDelay,
    projectNewConversationEmailDelay,
    notifyCondition,
    onChanged,
  ]);

  const updateConversationChannelPreference = (
    channel: keyof ChannelPreference,
    enabled: boolean
  ) => {
    if (channel === "chat" && enabled && !canConfigureSlack) {
      sendNotification({
        type: "error",
        title: "Slack Bot Not Configured",
        description:
          "Configure the Slack Bot integration to enable Slack notifications.",
      });
      return;
    }
    setConversationPreferences((prev) => {
      if (!prev) {
        return undefined;
      }
      const newPreferences = cloneDeep(prev);
      newPreferences.channels[channel] = enabled;
      return newPreferences;
    });
  };

  const updateProjectChannelPreference = (
    channel: keyof ChannelPreference,
    enabled: boolean
  ) => {
    if (channel === "chat" && enabled && !canConfigureSlack) {
      sendNotification({
        type: "error",
        title: "Slack Bot Not Configured",
        description:
          "Configure the Slack Bot integration to enable Slack notifications.",
      });
      return;
    }
    setProjectPreferences((prev) => {
      if (!prev) {
        return undefined;
      }
      const newPreferences = cloneDeep(prev);
      newPreferences.channels[channel] = enabled;
      return newPreferences;
    });
  };

  const updateProjectNewConversationChannelPreference = (
    channel: keyof ChannelPreference,
    enabled: boolean
  ) => {
    if (channel === "chat" && enabled && !canConfigureSlack) {
      sendNotification({
        type: "error",
        title: "Slack Bot Not Configured",
        description:
          "Configure the Slack Bot integration to enable Slack notifications.",
      });
      return;
    }
    setProjectNewConversationPreferences((prev) => {
      if (!prev) {
        return undefined;
      }
      const newPreferences = cloneDeep(prev);
      newPreferences.channels[channel] = enabled;
      return newPreferences;
    });
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
    canConfigureSlack &&
    conversationPreferences.channels.chat &&
    conversationPreferences.enabled;
  const isConversationEmailEnabled =
    conversationPreferences.channels.email && conversationPreferences.enabled;

  const isProjectInAppEnabled =
    projectPreferences?.channels.in_app && projectPreferences?.enabled;
  const isProjectSlackEnabled =
    canConfigureSlack &&
    projectPreferences?.channels.chat &&
    projectPreferences?.enabled;
  const isProjectEmailEnabled =
    projectPreferences?.channels.email && projectPreferences?.enabled;

  const isProjectNewConversationInAppEnabled =
    projectNewConversationPreferences?.channels.in_app &&
    projectNewConversationPreferences?.enabled;
  const isProjectNewConversationSlackEnabled =
    canConfigureSlack &&
    projectNewConversationPreferences?.channels.chat &&
    projectNewConversationPreferences?.enabled;
  const isProjectNewConversationEmailEnabled =
    projectNewConversationPreferences?.channels.email &&
    projectNewConversationPreferences?.enabled;

  return (
    <div className="flex flex-col gap-4">
      {/* Conversation notifications */}
      <div className="flex flex-wrap items-center gap-1.5">
        <Label className="text-foreground dark:text-foreground-night">
          Conversations
        </Label>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              isSelect
              label={NOTIFICATION_CONDITION_LABELS[notifyCondition]}
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem
              label={NOTIFICATION_CONDITION_LABELS["all_messages"]}
              onClick={() => setNotifyCondition("all_messages")}
            />
            <DropdownMenuItem
              label={NOTIFICATION_CONDITION_LABELS["only_mentions"]}
              onClick={() => setNotifyCondition("only_mentions")}
            />
            <DropdownMenuItem
              label={NOTIFICATION_CONDITION_LABELS["never"]}
              onClick={() => setNotifyCondition("never")}
            />
          </DropdownMenuContent>
        </DropdownMenu>
        {notifyCondition === "only_mentions" && (
          <Tooltip
            label="You'll still be notified if you're the only participant in a conversation."
            trigger={
              <InformationCircleIcon className="h-4 w-4 text-muted-foreground dark:text-muted-foreground-night" />
            }
          />
        )}
      </div>

      {/* Conversation notification channels */}
      <div className="flex flex-wrap items-center gap-1.5 pl-4">
        <Label className="text-muted-foreground dark:text-muted-foreground-night">
          Notify with
        </Label>
        <div className="flex items-center flex-wrap gap-4">
          {conversationPreferences.channels.in_app !== undefined && (
            <div className="flex items-center gap-1.5">
              <Checkbox
                id="conversation-in_app-preference"
                checked={isConversationInAppEnabled}
                disabled={notifyCondition === "never"}
                onCheckedChange={(checked) =>
                  updateConversationChannelPreference(
                    "in_app",
                    checked === true
                  )
                }
              />
              <Label
                htmlFor="conversation-in_app-preference"
                className={
                  notifyCondition === "never"
                    ? "text-muted-foreground dark:text-muted-foreground-night"
                    : "cursor-pointer"
                }
              >
                In-app popup
              </Label>
            </div>
          )}
          {hasSlackNotificationsFeature &&
            conversationPreferences.channels.chat !== undefined && (
              <div className="flex items-center gap-1.5">
                <Checkbox
                  id="conversation-slack-preference"
                  checked={isConversationSlackEnabled}
                  disabled={notifyCondition === "never"}
                  onCheckedChange={(checked) =>
                    updateConversationChannelPreference(
                      "chat",
                      checked === true
                    )
                  }
                />
                <Label
                  htmlFor="conversation-slack-preference"
                  className={
                    notifyCondition === "never"
                      ? "text-muted-foreground dark:text-muted-foreground-night"
                      : "cursor-pointer"
                  }
                >
                  Slack
                </Label>
              </div>
            )}
          {conversationPreferences.channels.email !== undefined && (
            <div className="flex items-center gap-1.5">
              <Checkbox
                id="conversation-email-preference"
                checked={isConversationEmailEnabled}
                disabled={notifyCondition === "never"}
                onCheckedChange={(checked) =>
                  updateConversationChannelPreference("email", checked === true)
                }
              />
              <Label
                htmlFor="conversation-email-preference"
                className={
                  notifyCondition === "never"
                    ? "text-muted-foreground dark:text-muted-foreground-night"
                    : "cursor-pointer"
                }
              >
                Email
              </Label>
              {isConversationEmailEnabled && (
                <>
                  <Label className="text-muted-foreground dark:text-muted-foreground-night">
                    at most
                  </Label>
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
                    <DropdownMenuContent>
                      {NOTIFICATION_DELAY_OPTIONS.map((delay) => (
                        <DropdownMenuItem
                          key={delay}
                          label={NOTIFICATION_PREFERENCES_DELAY_LABELS[delay]}
                          onClick={() => setConversationEmailDelay(delay)}
                        />
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Project notifications */}
      {projectPreferences && isProjectsFeatureEnabled && (
        <>
          <div className="flex flex-wrap items-center gap-1.5 pt-2">
            <Label className="text-foreground dark:text-foreground-night">
              Projects
            </Label>
            <span className="text-sm text-muted-foreground dark:text-muted-foreground-night">
              when added as member
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 pl-4">
            <Label className="text-muted-foreground dark:text-muted-foreground-night">
              Notify with
            </Label>
            <div className="flex items-center gap-4">
              {projectPreferences.channels.in_app !== undefined && (
                <div className="flex items-center gap-1.5">
                  <Checkbox
                    id="project-in_app-preference"
                    checked={isProjectInAppEnabled}
                    onCheckedChange={(checked) =>
                      updateProjectChannelPreference("in_app", checked === true)
                    }
                  />
                  <Label
                    htmlFor="project-in_app-preference"
                    className="cursor-pointer"
                  >
                    In-app popup
                  </Label>
                </div>
              )}
              {hasSlackNotificationsFeature &&
                projectPreferences.channels.chat !== undefined && (
                  <div className="flex items-center gap-1.5">
                    <Checkbox
                      id="project-slack-preference"
                      checked={isProjectSlackEnabled}
                      disabled={notifyCondition === "never"}
                      onCheckedChange={(checked) =>
                        updateProjectChannelPreference("chat", checked === true)
                      }
                    />
                    <Label
                      htmlFor="project-slack-preference"
                      className={
                        notifyCondition === "never"
                          ? "text-muted-foreground dark:text-muted-foreground-night"
                          : "cursor-pointer"
                      }
                    >
                      Slack
                    </Label>
                  </div>
                )}
              {projectPreferences.channels.email !== undefined && (
                <div className="flex items-center gap-1.5">
                  <Checkbox
                    id="project-email-preference"
                    checked={isProjectEmailEnabled}
                    onCheckedChange={(checked) =>
                      updateProjectChannelPreference("email", checked === true)
                    }
                  />
                  <Label
                    htmlFor="project-email-preference"
                    className="cursor-pointer"
                  >
                    Email
                  </Label>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Project new conversations notifications */}
      {!!projectNewConversationPreferences && isProjectsFeatureEnabled && (
        <>
          <div className="flex flex-wrap items-center gap-1.5 pt-2">
            <Label className="text-foreground dark:text-foreground-night">
              Projects
            </Label>
            <span className="text-sm text-muted-foreground dark:text-muted-foreground-night">
              when new conversation is created
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 pl-4">
            <Label className="text-muted-foreground dark:text-muted-foreground-night">
              Notify with
            </Label>
            <div className="flex items-center gap-4">
              {projectNewConversationPreferences.channels.in_app !==
                undefined && (
                <div className="flex items-center gap-1.5">
                  <Checkbox
                    id="project-new-conversation-in_app-preference"
                    checked={isProjectNewConversationInAppEnabled}
                    onCheckedChange={(checked) =>
                      updateProjectNewConversationChannelPreference(
                        "in_app",
                        checked === true
                      )
                    }
                  />
                  <Label
                    htmlFor="project-new-conversation-in_app-preference"
                    className="cursor-pointer"
                  >
                    In-app popup
                  </Label>
                </div>
              )}
              {hasSlackNotificationsFeature &&
                projectNewConversationPreferences.channels.chat !==
                  undefined && (
                  <div className="flex items-center gap-1.5">
                    <Checkbox
                      id="project-new-conversation-slack-preference"
                      checked={isProjectNewConversationSlackEnabled}
                      disabled={notifyCondition === "never"}
                      onCheckedChange={(checked) =>
                        updateProjectNewConversationChannelPreference(
                          "chat",
                          checked === true
                        )
                      }
                    />
                    <Label
                      htmlFor="project-new-conversation-slack-preference"
                      className={
                        notifyCondition === "never"
                          ? "text-muted-foreground dark:text-muted-foreground-night"
                          : "cursor-pointer"
                      }
                    >
                      Slack
                    </Label>
                  </div>
                )}
              {projectNewConversationPreferences.channels.email !==
                undefined && (
                <div className="flex items-center gap-1.5">
                  <Checkbox
                    id="project-new-conversation-email-preference"
                    checked={isProjectNewConversationEmailEnabled}
                    onCheckedChange={(checked) =>
                      updateProjectNewConversationChannelPreference(
                        "email",
                        checked === true
                      )
                    }
                  />
                  <Label
                    htmlFor="project-new-conversation-email-preference"
                    className="cursor-pointer"
                  >
                    Email
                  </Label>
                  {isProjectNewConversationEmailEnabled && (
                    <>
                      <Label className="text-muted-foreground dark:text-muted-foreground-night">
                        at most
                      </Label>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            isSelect
                            label={
                              NOTIFICATION_PREFERENCES_DELAY_LABELS[
                                projectNewConversationEmailDelay
                              ]
                            }
                          />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          {NOTIFICATION_DELAY_OPTIONS.map((delay) => (
                            <DropdownMenuItem
                              key={delay}
                              label={
                                NOTIFICATION_PREFERENCES_DELAY_LABELS[delay]
                              }
                              onClick={() =>
                                setProjectNewConversationEmailDelay(delay)
                              }
                            />
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
});
