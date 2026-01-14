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

import { useSendNotification } from "@app/hooks/useNotification";
import { useNovuClient } from "@app/hooks/useNovuClient";
import { useUserMetadata } from "@app/lib/swr/user";
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
} from "@app/types/notification_preferences";

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
}

export const NotificationPreferences = forwardRef<
  NotificationPreferencesRefProps,
  NotificationPreferencesProps
>(({ onChanged }, ref) => {
  const sendNotification = useSendNotification();

  // Novu workflow-specific channel preferences for conversation-unread
  const [workflowPreferences, setWorkflowPreferences] = useState<
    Preference | undefined
  >();
  const [isLoadingPreferences, setIsLoadingPreferences] = useState(true);

  // Email digest delay
  const [emailDelay, setEmailDelay] = useState<NotificationPreferencesDelay>(
    DEFAULT_NOTIFICATION_DELAY
  );

  // Conversation notification condition
  const [notifyCondition, setNotifyCondition] = useState<NotificationCondition>(
    DEFAULT_NOTIFICATION_CONDITION
  );

  const { novuClient } = useNovuClient();

  // User metadata hooks
  const { metadata: emailDelayMetadata, mutateMetadata: mutateEmailDelay } =
    useUserMetadata(makeNotificationPreferencesUserMetadata("email"));
  const {
    metadata: notifyConditionMetadata,
    mutateMetadata: mutateNotifyCondition,
  } = useUserMetadata(CONVERSATION_NOTIFICATION_METADATA_KEYS.notifyCondition);

  // Store original values for reset/dirty checking
  const originalPreferencesRef = useRef<Preference | undefined>();
  const originalEmailDelayRef = useRef<NotificationPreferencesDelay>(
    DEFAULT_NOTIFICATION_DELAY
  );
  const originalNotifyConditionRef = useRef<NotificationCondition>(
    DEFAULT_NOTIFICATION_CONDITION
  );

  // Load email delay from user metadata
  useEffect(() => {
    if (emailDelayMetadata?.value) {
      const delay = emailDelayMetadata.value as NotificationPreferencesDelay;
      if (isNotificationPreferencesDelay(delay)) {
        setEmailDelay(delay);
        originalEmailDelayRef.current = delay;
      }
    }
  }, [emailDelayMetadata]);

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
      const workflowPref = preferences.data?.find(
        (preference) =>
          preference.workflow?.identifier === CONVERSATION_UNREAD_TRIGGER_ID
      );
      setWorkflowPreferences(workflowPref);
      originalPreferencesRef.current = workflowPref;
      setIsLoadingPreferences(false);
    });
  }, [novuClient]);

  // Expose methods to parent component
  useImperativeHandle(
    ref,
    () => ({
      savePreferences: async () => {
        if (!workflowPreferences || !novuClient) {
          return false;
        }

        try {
          // Save workflow preferences in Novu
          const result = await novuClient.preferences.update({
            preference: workflowPreferences,
            channels: workflowPreferences.channels,
          });

          if (result.error) {
            sendNotification({
              type: "error",
              title: "Error updating notification preferences",
              description: result.error.message,
            });
            return false;
          }

          // Save email delay if changed
          if (emailDelay !== originalEmailDelayRef.current) {
            await setUserMetadataFromClient({
              key: makeNotificationPreferencesUserMetadata("email"),
              value: emailDelay,
            });
            await mutateEmailDelay((current) =>
              current ? { ...current, value: emailDelay } : current
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
          originalPreferencesRef.current = workflowPreferences;
          originalEmailDelayRef.current = emailDelay;
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
        if (!originalPreferencesRef.current || !workflowPreferences) {
          return false;
        }

        const original = originalPreferencesRef.current;
        const current = workflowPreferences;

        // Compare channel preferences
        for (const channel of Object.keys(original.channels) as Array<
          keyof typeof original.channels
        >) {
          if (original.channels[channel] !== current.channels[channel]) {
            return true;
          }
        }

        // Compare other preferences
        if (emailDelay !== originalEmailDelayRef.current) {
          return true;
        }
        if (notifyCondition !== originalNotifyConditionRef.current) {
          return true;
        }

        return false;
      },
      reset: () => {
        if (originalPreferencesRef.current) {
          setWorkflowPreferences(cloneDeep(originalPreferencesRef.current));
        }
        setEmailDelay(originalEmailDelayRef.current);
        setNotifyCondition(originalNotifyConditionRef.current);
      },
    }),
    [
      workflowPreferences,
      emailDelay,
      notifyCondition,
      mutateEmailDelay,
      mutateNotifyCondition,
      novuClient,
      sendNotification,
    ]
  );

  useEffect(() => {
    onChanged();
  }, [workflowPreferences, emailDelay, notifyCondition, onChanged]);

  const updateChannelPreference = (
    channel: keyof ChannelPreference,
    enabled: boolean
  ) => {
    setWorkflowPreferences((prev) => {
      if (!prev) {
        return undefined;
      }
      const newPreferences = cloneDeep(prev);
      newPreferences.channels[channel] = enabled;
      return newPreferences;
    });
  };

  if (isLoadingPreferences) {
    return <Spinner />;
  }

  if (!workflowPreferences) {
    return (
      <div className="text-sm text-muted-foreground dark:text-muted-foreground-night">
        Unable to load notification preferences. Please contact support.
      </div>
    );
  }

  const isInAppEnabled =
    workflowPreferences.channels.in_app && workflowPreferences.enabled;
  const isEmailEnabled =
    workflowPreferences.channels.email && workflowPreferences.enabled;

  return (
    <div className="flex flex-col gap-4">
      {/* Notify preference */}
      <div className="flex flex-wrap items-center gap-1.5">
        <Label className="text-foreground dark:text-foreground-night">
          Notify me on conversations
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

      {/* Notification channels */}
      <div className="flex flex-wrap items-center gap-1.5 pl-4">
        <Label className="text-muted-foreground dark:text-muted-foreground-night">
          Notify with
        </Label>
        <div className="flex items-center gap-4">
          {workflowPreferences.channels.in_app !== undefined && (
            <div className="flex items-center gap-1.5">
              <Checkbox
                id="in_app-preference"
                checked={isInAppEnabled}
                disabled={notifyCondition === "never"}
                onCheckedChange={(checked) =>
                  updateChannelPreference("in_app", checked === true)
                }
              />
              <Label
                htmlFor="in_app-preference"
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
          {workflowPreferences.channels.email !== undefined && (
            <div className="flex items-center gap-1.5">
              <Checkbox
                id="email-preference"
                checked={isEmailEnabled}
                disabled={notifyCondition === "never"}
                onCheckedChange={(checked) =>
                  updateChannelPreference("email", checked === true)
                }
              />
              <Label
                htmlFor="email-preference"
                className={
                  notifyCondition === "never"
                    ? "text-muted-foreground dark:text-muted-foreground-night"
                    : "cursor-pointer"
                }
              >
                Email
              </Label>
            </div>
          )}
        </div>
      </div>

      {/* Email frequency - only shown when email is enabled */}
      {isEmailEnabled && (
        <div className="flex flex-wrap items-center gap-1.5 pl-4">
          <Label className="text-muted-foreground dark:text-muted-foreground-night">
            Email me at most
          </Label>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                isSelect
                label={NOTIFICATION_PREFERENCES_DELAY_LABELS[emailDelay]}
              />
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {NOTIFICATION_DELAY_OPTIONS.map((delay) => (
                <DropdownMenuItem
                  key={delay}
                  label={NOTIFICATION_PREFERENCES_DELAY_LABELS[delay]}
                  onClick={() => setEmailDelay(delay)}
                />
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </div>
  );
});
