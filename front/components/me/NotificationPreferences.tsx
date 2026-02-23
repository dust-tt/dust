import { useSendNotification } from "@app/hooks/useNotification";
import { useNovuClient } from "@app/hooks/useNovuClient";
import { useFeatureFlags } from "@app/lib/auth/AuthContext";
import { useSlackNotifications, useUserMetadata } from "@app/lib/swr/user";
import { setUserMetadataFromClient } from "@app/lib/user";
import type {
  NotificationCondition,
  NotificationPreferencesDelay,
  ProjectNewConversationNotificationConditionOptions,
} from "@app/types/notification_preferences";
import {
  CONVERSATION_NOTIFICATION_METADATA_KEYS,
  CONVERSATION_UNREAD_TRIGGER_ID,
  DEFAULT_PROJECT_NEW_CONVERSATION_NOTIFICATION_CONDITION,
  isNotificationCondition,
  isNotificationPreferencesDelay,
  isProjectNewConversationNotificationConditionOptions,
  makeNotificationPreferencesUserMetadata,
  NOTIFICATION_DELAY_OPTIONS,
  PROJECT_NEW_CONVERSATION_TRIGGER_ID,
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
  Label,
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
};

const NOTIFICATION_CONDITION_LABELS: Record<NotificationCondition, string> = {
  all_messages: "Notify me for all messages",
  only_mentions: "Notify me only when mentioned",
  never: "Never notify me",
};

const PROJECT_NEW_CONVERSATION_NOTIFICATION_CONDITION_LABELS: Record<
  ProjectNewConversationNotificationConditionOptions,
  string
> = {
  all_projects: "Notify me of new conversations",
  never: "Never notify me",
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

  // Novu workflow-specific channel preferences for conversation-unread
  const [conversationPreferences, setConversationPreferences] = useState<
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

  const [
    projectNewConversationNotifyCondition,
    setProjectNewConversationNotifyCondition,
  ] = useState<ProjectNewConversationNotificationConditionOptions>(
    DEFAULT_PROJECT_NEW_CONVERSATION_NOTIFICATION_CONDITION
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

  const {
    metadata: projectNewConversationNotifyConditionMetadata,
    mutateMetadata: mutateProjectNewConversationNotifyCondition,
  } = useUserMetadata(
    CONVERSATION_NOTIFICATION_METADATA_KEYS.projectNewConversationNotifyCondition
  );

  // Store original values for reset/dirty checking
  const originalConversationPreferencesRef = useRef<Preference | undefined>();
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
  const originalProjectNewConversationNotifyConditionRef =
    useRef<ProjectNewConversationNotificationConditionOptions>(
      DEFAULT_PROJECT_NEW_CONVERSATION_NOTIFICATION_CONDITION
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

  useEffect(() => {
    if (!projectNewConversationNotifyConditionMetadata?.value) {
      return;
    }
    const condition = projectNewConversationNotifyConditionMetadata.value;
    if (!isProjectNewConversationNotificationConditionOptions(condition)) {
      return;
    }
    setProjectNewConversationNotifyCondition(condition);
    originalProjectNewConversationNotifyConditionRef.current = condition;
  }, [projectNewConversationNotifyConditionMetadata]);

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

          if (
            projectNewConversationNotifyCondition !==
            originalProjectNewConversationNotifyConditionRef.current
          ) {
            await setUserMetadataFromClient({
              key: CONVERSATION_NOTIFICATION_METADATA_KEYS.projectNewConversationNotifyCondition,
              value: projectNewConversationNotifyCondition,
            });
            await mutateProjectNewConversationNotifyCondition((current) =>
              current
                ? { ...current, value: projectNewConversationNotifyCondition }
                : current
            );
          }

          // Update original references on successful save
          originalConversationPreferencesRef.current = conversationPreferences;
          originalProjectNewConversationPreferencesRef.current =
            projectNewConversationPreferences;
          originalConversationEmailDelayRef.current = conversationEmailDelay;
          originalProjectNewConversationEmailDelayRef.current =
            projectNewConversationEmailDelay;
          originalNotifyConditionRef.current = notifyCondition;
          originalProjectNewConversationNotifyConditionRef.current =
            projectNewConversationNotifyCondition;
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
        if (
          projectNewConversationNotifyCondition !==
          originalProjectNewConversationNotifyConditionRef.current
        ) {
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
        setProjectNewConversationNotifyCondition(
          originalProjectNewConversationNotifyConditionRef.current
        );
      },
    }),
    [
      conversationPreferences,
      projectNewConversationPreferences,
      conversationEmailDelay,
      projectNewConversationEmailDelay,
      notifyCondition,
      projectNewConversationNotifyCondition,
      mutateConversationEmailDelay,
      mutateProjectNewConversationEmailDelay,
      mutateNotifyCondition,
      mutateProjectNewConversationNotifyCondition,
      novuClient,
      sendNotification,
    ]
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: ignored using `--suppress`
  useEffect(() => {
    onChanged();
  }, [
    conversationPreferences,
    projectNewConversationPreferences,
    conversationEmailDelay,
    projectNewConversationEmailDelay,
    notifyCondition,
    projectNewConversationNotifyCondition,
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

  const updateProjectNewConversationChannelPreference = (
    channel: keyof ChannelPreference,
    enabled: boolean
  ) => {
    setProjectNewConversationPreferences((prev) => {
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

  const isProjectNewConversationInAppEnabled =
    projectNewConversationPreferences?.channels.in_app &&
    projectNewConversationPreferences?.enabled;
  const isProjectNewConversationSlackEnabled =
    projectNewConversationPreferences?.channels.chat &&
    projectNewConversationPreferences?.enabled;
  const isProjectNewConversationEmailEnabled =
    projectNewConversationPreferences?.channels.email &&
    projectNewConversationPreferences?.enabled;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label className="text-foreground dark:text-foreground-night">
          New messages
        </Label>
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
            </DropdownMenuPortal>
          </DropdownMenu>
          {notifyCondition !== "never" && (
            <>
              <span className="text-foreground dark:text-foreground-night">
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
                  <span className="text-foreground dark:text-foreground-night">
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

      {/* Project new conversations notifications */}
      {!!projectNewConversationPreferences && isProjectsFeatureEnabled && (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-1.5 pt-2">
            <Label className="text-foreground dark:text-foreground-night">
              New conversations
            </Label>
            <span className="text-sm text-muted-foreground dark:text-muted-foreground-night">
              (in projects)
            </span>
          </div>

          <div className="flex flex-wrap items-center">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  isSelect
                  label={
                    PROJECT_NEW_CONVERSATION_NOTIFICATION_CONDITION_LABELS[
                      projectNewConversationNotifyCondition
                    ]
                  }
                />
              </DropdownMenuTrigger>
              <DropdownMenuPortal>
                <DropdownMenuContent>
                  <DropdownMenuItem
                    label={
                      PROJECT_NEW_CONVERSATION_NOTIFICATION_CONDITION_LABELS[
                        "all_projects"
                      ]
                    }
                    onClick={() =>
                      setProjectNewConversationNotifyCondition("all_projects")
                    }
                  />
                  <DropdownMenuItem
                    label={
                      PROJECT_NEW_CONVERSATION_NOTIFICATION_CONDITION_LABELS[
                        "never"
                      ]
                    }
                    onClick={() =>
                      setProjectNewConversationNotifyCondition("never")
                    }
                  />
                </DropdownMenuContent>
              </DropdownMenuPortal>
            </DropdownMenu>

            {projectNewConversationNotifyCondition !== "never" && (
              <>
                <span className="text-foreground dark:text-foreground-night">
                  , by&nbsp;
                </span>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      isSelect
                      label={getSelectedChannelLabel(
                        projectNewConversationPreferences,
                        displaySlackOption
                      )}
                    />
                  </DropdownMenuTrigger>

                  <DropdownMenuPortal>
                    <DropdownMenuContent>
                      {projectNewConversationPreferences.channels.in_app !==
                        undefined && (
                        <DropdownMenuCheckboxItem
                          label="in-app popup"
                          checked={isProjectNewConversationInAppEnabled}
                          onCheckedChange={(checked) =>
                            updateProjectNewConversationChannelPreference(
                              "in_app",
                              checked
                            )
                          }
                        />
                      )}
                      {projectNewConversationPreferences.channels.chat !==
                        undefined &&
                        displaySlackOption && (
                          <DropdownMenuCheckboxItem
                            label="Slack"
                            checked={isProjectNewConversationSlackEnabled}
                            onCheckedChange={(checked) =>
                              updateProjectNewConversationChannelPreference(
                                "chat",
                                checked
                              )
                            }
                          />
                        )}
                      {projectNewConversationPreferences.channels.email !==
                        undefined && (
                        <DropdownMenuCheckboxItem
                          label="email"
                          checked={isProjectNewConversationEmailEnabled}
                          onCheckedChange={(checked) =>
                            updateProjectNewConversationChannelPreference(
                              "email",
                              checked
                            )
                          }
                        />
                      )}
                    </DropdownMenuContent>
                  </DropdownMenuPortal>
                </DropdownMenu>
                {isProjectNewConversationEmailEnabled && (
                  <>
                    <span className="text-foreground dark:text-foreground-night">
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
                              projectNewConversationEmailDelay
                            ]
                          }
                        />
                      </DropdownMenuTrigger>

                      <DropdownMenuPortal>
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
                      </DropdownMenuPortal>
                    </DropdownMenu>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
});
