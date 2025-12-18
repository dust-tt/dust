import {
  Button,
  Checkbox,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Label,
  Spinner,
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
import type { NotificationPreferencesDelay } from "@app/types/notification_preferences";
import {
  isNotificationPreferencesDelay,
  makeNotificationPreferencesUserMetadata,
  NOTIFICATION_DELAY_OPTIONS,
} from "@app/types/notification_preferences";

const CHANNELS_TO_NAMES: Record<keyof ChannelPreference, string> = {
  in_app: "In-App",
  email: "Email",
  sms: "SMS",
  chat: "Chat",
  push: "Push",
};

const NOTIFICATION_PREFERENCES_DELAY_LABELS: Record<
  NotificationPreferencesDelay,
  string
> = {
  "5_minutes": "Every 5 minutes",
  "15_minutes": "Every 15 minutes",
  "30_minutes": "Every 30 minutes",
  "1_hour": "Every hour",
  daily: "Once a day",
};

const DEFAULT_NOTIFICATION_DELAY = "1_hour";

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
  const [globalPreferences, setGlobalPreferences] = useState<
    Preference | undefined
  >();
  const [emailDelay, setEmailDelay] = useState<NotificationPreferencesDelay>(
    DEFAULT_NOTIFICATION_DELAY
  );

  const { novuClient } = useNovuClient();
  const { metadata: emailDelayMetadata, mutateMetadata: mutateEmailDelay } =
    useUserMetadata(makeNotificationPreferencesUserMetadata("email"));

  // Store the original preferences to allow resetting on cancel
  const originalPreferencesRef = useRef<Preference | undefined>();
  const originalEmailDelayRef = useRef<NotificationPreferencesDelay>(
    DEFAULT_NOTIFICATION_DELAY
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

  useEffect(() => {
    // Load global preferences from Novu
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

          // Save email delay in user metadata only if it changed
          if (emailDelay !== originalEmailDelayRef.current) {
            await setUserMetadataFromClient({
              key: makeNotificationPreferencesUserMetadata("email"),
              value: emailDelay,
            });
            await mutateEmailDelay((current) => {
              if (current) {
                return {
                  ...current,
                  value: emailDelay,
                };
              }
              return current;
            });
          }

          // Update the original references on successful save
          originalPreferencesRef.current = globalPreferences;
          originalEmailDelayRef.current = emailDelay;
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

        // Compare email delay
        if (emailDelay !== originalEmailDelayRef.current) {
          return true;
        }

        return false;
      },
      reset: () => {
        // Reset to original preferences
        if (originalPreferencesRef.current) {
          setGlobalPreferences(cloneDeep(originalPreferencesRef.current));
        }
        setEmailDelay(originalEmailDelayRef.current);
      },
    }),
    [
      globalPreferences,
      emailDelay,
      mutateEmailDelay,
      novuClient,
      sendNotification,
    ]
  );

  useEffect(() => {
    // Notify parent component of changes
    onChanged();
  }, [globalPreferences, emailDelay, onChanged]);

  return (
    <div>
      {!globalPreferences ? (
        <Spinner />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-row gap-6">
            {(
              Object.entries(CHANNELS_TO_NAMES) as [
                keyof typeof CHANNELS_TO_NAMES,
                string,
              ][]
            ).map(([channel, name]) =>
              globalPreferences.channels[channel] === undefined ? null : (
                <div key={channel} className="flex items-center gap-1.5">
                  <Checkbox
                    id={`${channel}-preference`}
                    checked={
                      globalPreferences.channels[channel] &&
                      globalPreferences.enabled
                    }
                    onCheckedChange={(checked) => {
                      setGlobalPreferences((prev) => {
                        if (!prev) {
                          return undefined;
                        }

                        const newPreferences = cloneDeep(prev);

                        // Modifying in place because the preference class is not just a plain object.
                        newPreferences.channels[channel] =
                          checked === true ? true : false;

                        // Need to clone the preference to trigger the state update.
                        return newPreferences;
                      });
                    }}
                  />
                  <Label
                    htmlFor={`${channel}-preference`}
                    className="cursor-pointer"
                  >
                    {name}
                  </Label>
                </div>
              )
            )}
          </div>

          <div className="flex items-center gap-2">
            <Label>Email notification delay:</Label>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  isSelect
                  label={NOTIFICATION_PREFERENCES_DELAY_LABELS[emailDelay]}
                  disabled={!globalPreferences.channels.email}
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                {NOTIFICATION_DELAY_OPTIONS.map((delay) => (
                  <DropdownMenuItem
                    key={delay}
                    label={NOTIFICATION_PREFERENCES_DELAY_LABELS[delay]}
                    onClick={() => {
                      setEmailDelay(delay);
                    }}
                  />
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      )}
    </div>
  );
});
