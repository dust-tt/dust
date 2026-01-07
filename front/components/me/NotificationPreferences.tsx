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
import { PreferenceLevel } from "@novu/js";
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
  NotificationPreferencesDelay,
  NotificationTrigger,
} from "@app/types/notification_preferences";
import {
  CONVERSATION_NOTIFICATION_METADATA_KEYS,
  isNotificationPreferencesDelay,
  isNotificationTrigger,
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

const NOTIFICATION_TRIGGER_LABELS: Record<NotificationTrigger, string> = {
  all_messages: "for all new messages",
  only_mentions: "only when I'm mentioned",
};

const DEFAULT_NOTIFICATION_DELAY: NotificationPreferencesDelay = "1_hour";
const DEFAULT_NOTIFICATION_TRIGGER: NotificationTrigger = "all_messages";

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

  // Novu channel preferences
  const [globalPreferences, setGlobalPreferences] = useState<
    Preference | undefined
  >();

  // Email digest delay
  const [emailDelay, setEmailDelay] = useState<NotificationPreferencesDelay>(
    DEFAULT_NOTIFICATION_DELAY
  );

  // Conversation notification triggers
  const [unreadTrigger, setUnreadTrigger] = useState<NotificationTrigger>(
    DEFAULT_NOTIFICATION_TRIGGER
  );
  const [notifyTrigger, setNotifyTrigger] = useState<NotificationTrigger>(
    DEFAULT_NOTIFICATION_TRIGGER
  );

  const { novuClient } = useNovuClient();

  // User metadata hooks
  const { metadata: emailDelayMetadata, mutateMetadata: mutateEmailDelay } =
    useUserMetadata(makeNotificationPreferencesUserMetadata("email"));
  const {
    metadata: unreadTriggerMetadata,
    mutateMetadata: mutateUnreadTrigger,
  } = useUserMetadata(CONVERSATION_NOTIFICATION_METADATA_KEYS.unreadTrigger);
  const {
    metadata: notifyTriggerMetadata,
    mutateMetadata: mutateNotifyTrigger,
  } = useUserMetadata(CONVERSATION_NOTIFICATION_METADATA_KEYS.notifyTrigger);

  // Store original values for reset/dirty checking
  const originalPreferencesRef = useRef<Preference | undefined>();
  const originalEmailDelayRef = useRef<NotificationPreferencesDelay>(
    DEFAULT_NOTIFICATION_DELAY
  );
  const originalUnreadTriggerRef = useRef<NotificationTrigger>(
    DEFAULT_NOTIFICATION_TRIGGER
  );
  const originalNotifyTriggerRef = useRef<NotificationTrigger>(
    DEFAULT_NOTIFICATION_TRIGGER
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

  // Load unread trigger from user metadata
  useEffect(() => {
    if (unreadTriggerMetadata?.value) {
      const trigger = unreadTriggerMetadata.value as NotificationTrigger;
      if (isNotificationTrigger(trigger)) {
        setUnreadTrigger(trigger);
        originalUnreadTriggerRef.current = trigger;
      }
    }
  }, [unreadTriggerMetadata]);

  // Load notify trigger from user metadata
  useEffect(() => {
    if (notifyTriggerMetadata?.value) {
      const trigger = notifyTriggerMetadata.value as NotificationTrigger;
      if (isNotificationTrigger(trigger)) {
        setNotifyTrigger(trigger);
        originalNotifyTriggerRef.current = trigger;
      }
    }
  }, [notifyTriggerMetadata]);

  // Load global preferences from Novu
  useEffect(() => {
    void novuClient?.preferences.list().then((preferences) => {
      const globalPref = preferences.data?.find(
        (preference) => preference.level === PreferenceLevel.GLOBAL
      );
      setGlobalPreferences(globalPref);
      originalPreferencesRef.current = globalPref;
    });
  }, [novuClient]);

  // Expose methods to parent component
  useImperativeHandle(
    ref,
    () => ({
      savePreferences: async () => {
        if (!globalPreferences || !novuClient) {
          return false;
        }

        try {
          // Save global preferences in Novu
          const result = await novuClient.preferences.update({
            preference: globalPreferences,
            channels: globalPreferences.channels,
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

          // Save unread trigger if changed
          if (unreadTrigger !== originalUnreadTriggerRef.current) {
            await setUserMetadataFromClient({
              key: CONVERSATION_NOTIFICATION_METADATA_KEYS.unreadTrigger,
              value: unreadTrigger,
            });
            await mutateUnreadTrigger((current) =>
              current ? { ...current, value: unreadTrigger } : current
            );
          }

          // Save notify trigger if changed
          if (notifyTrigger !== originalNotifyTriggerRef.current) {
            await setUserMetadataFromClient({
              key: CONVERSATION_NOTIFICATION_METADATA_KEYS.notifyTrigger,
              value: notifyTrigger,
            });
            await mutateNotifyTrigger((current) =>
              current ? { ...current, value: notifyTrigger } : current
            );
          }

          // Update original references on successful save
          originalPreferencesRef.current = globalPreferences;
          originalEmailDelayRef.current = emailDelay;
          originalUnreadTriggerRef.current = unreadTrigger;
          originalNotifyTriggerRef.current = notifyTrigger;
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
        if (!originalPreferencesRef.current || !globalPreferences) {
          return false;
        }

        const original = originalPreferencesRef.current;
        const current = globalPreferences;

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
        if (unreadTrigger !== originalUnreadTriggerRef.current) {
          return true;
        }
        if (notifyTrigger !== originalNotifyTriggerRef.current) {
          return true;
        }

        return false;
      },
      reset: () => {
        if (originalPreferencesRef.current) {
          setGlobalPreferences(cloneDeep(originalPreferencesRef.current));
        }
        setEmailDelay(originalEmailDelayRef.current);
        setUnreadTrigger(originalUnreadTriggerRef.current);
        setNotifyTrigger(originalNotifyTriggerRef.current);
      },
    }),
    [
      globalPreferences,
      emailDelay,
      unreadTrigger,
      notifyTrigger,
      mutateEmailDelay,
      mutateUnreadTrigger,
      mutateNotifyTrigger,
      novuClient,
      sendNotification,
    ]
  );

  useEffect(() => {
    onChanged();
  }, [globalPreferences, emailDelay, unreadTrigger, notifyTrigger, onChanged]);

  const updateChannelPreference = (
    channel: keyof ChannelPreference,
    enabled: boolean
  ) => {
    setGlobalPreferences((prev) => {
      if (!prev) {
        return undefined;
      }
      const newPreferences = cloneDeep(prev);
      newPreferences.channels[channel] = enabled;
      return newPreferences;
    });
  };

  if (!globalPreferences) {
    return <Spinner />;
  }

  const isInAppEnabled =
    globalPreferences.channels.in_app && globalPreferences.enabled;
  const isEmailEnabled =
    globalPreferences.channels.email && globalPreferences.enabled;

  return (
    <div className="flex flex-col gap-4">
      {/* Mark as unread preference */}
      <div className="flex flex-wrap items-center gap-1.5">
        <Label className="text-foreground dark:text-foreground-night">
          Mark conversations as unread
        </Label>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              isSelect
              label={NOTIFICATION_TRIGGER_LABELS[unreadTrigger]}
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem
              label={NOTIFICATION_TRIGGER_LABELS["all_messages"]}
              onClick={() => setUnreadTrigger("all_messages")}
            />
            <DropdownMenuItem
              label={NOTIFICATION_TRIGGER_LABELS["only_mentions"]}
              onClick={() => setUnreadTrigger("only_mentions")}
            />
          </DropdownMenuContent>
        </DropdownMenu>
        {unreadTrigger === "only_mentions" && (
          <Tooltip
            label="Conversations where you're the only participant will still be marked as unread."
            trigger={
              <InformationCircleIcon className="text-muted-foreground dark:text-muted-foreground-night h-4 w-4" />
            }
          />
        )}
      </div>

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
              label={NOTIFICATION_TRIGGER_LABELS[notifyTrigger]}
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem
              label={NOTIFICATION_TRIGGER_LABELS["all_messages"]}
              onClick={() => setNotifyTrigger("all_messages")}
            />
            <DropdownMenuItem
              label={NOTIFICATION_TRIGGER_LABELS["only_mentions"]}
              onClick={() => setNotifyTrigger("only_mentions")}
            />
          </DropdownMenuContent>
        </DropdownMenu>
        {notifyTrigger === "only_mentions" && (
          <Tooltip
            label="You'll still be notified if you're the only participant in a conversation."
            trigger={
              <InformationCircleIcon className="text-muted-foreground dark:text-muted-foreground-night h-4 w-4" />
            }
          />
        )}
      </div>

      {/* Notification channels */}
      <div className="flex flex-wrap items-center gap-1.5">
        <Label className="text-foreground dark:text-foreground-night">
          Notify me with
        </Label>
        <div className="flex items-center gap-4">
          {globalPreferences.channels.in_app !== undefined && (
            <div className="flex items-center gap-1.5">
              <Checkbox
                id="in_app-preference"
                checked={isInAppEnabled}
                onCheckedChange={(checked) =>
                  updateChannelPreference("in_app", checked === true)
                }
              />
              <Label htmlFor="in_app-preference" className="cursor-pointer">
                In-app popup
              </Label>
            </div>
          )}
          {globalPreferences.channels.email !== undefined && (
            <div className="flex items-center gap-1.5">
              <Checkbox
                id="email-preference"
                checked={isEmailEnabled}
                onCheckedChange={(checked) =>
                  updateChannelPreference("email", checked === true)
                }
              />
              <Label htmlFor="email-preference" className="cursor-pointer">
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
