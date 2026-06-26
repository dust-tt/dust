import { useSendNotification } from "@app/hooks/useNotification";
import { useUserMetadata } from "@app/lib/swr/user";
import { setUserMetadataFromClient } from "@app/lib/user";
import {
  DEFAULT_SOUND_NOTIFICATION,
  isSoundNotificationType,
  SOUND_NOTIFICATION_METADATA_KEYS,
  SOUND_NOTIFICATION_OPTIONS,
} from "@app/types/notification_preferences";
import {
  Button,
  Check,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Icon,
  SliderToggle,
} from "@dust-tt/sparkle";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import type { Control } from "react-hook-form";
import { useController, useForm } from "react-hook-form";
import { z } from "zod";

const SoundNotificationFormSchema = z.object({
  enabled: z.boolean(),
  sound: z.enum(SOUND_NOTIFICATION_OPTIONS),
});

type SoundNotificationFormValues = z.infer<typeof SoundNotificationFormSchema>;

export function useSoundNotificationPreferencesForm() {
  const sendNotification = useSendNotification();
  const {
    metadata: enabledMetadata,
    mutateMetadata: mutateEnabled,
    isMetadataLoading: isEnabledLoading,
  } = useUserMetadata(SOUND_NOTIFICATION_METADATA_KEYS.enabled);
  const {
    metadata: soundMetadata,
    mutateMetadata: mutateSound,
    isMetadataLoading: isSoundLoading,
  } = useUserMetadata(SOUND_NOTIFICATION_METADATA_KEYS.sound);

  const isLoading = isEnabledLoading || isSoundLoading;

  const form = useForm<SoundNotificationFormValues>({
    resolver: zodResolver(SoundNotificationFormSchema),
    defaultValues: {
      enabled: false,
      sound: DEFAULT_SOUND_NOTIFICATION,
    },
  });

  useEffect(() => {
    if (form.formState.isDirty) {
      return;
    }
    form.reset({
      enabled: enabledMetadata?.value === "true",
      sound: isSoundNotificationType(soundMetadata?.value)
        ? soundMetadata.value
        : DEFAULT_SOUND_NOTIFICATION,
    });
  }, [enabledMetadata, soundMetadata, form]);

  const save = async (): Promise<boolean> => {
    let succeeded = false;
    await form.handleSubmit(async (data) => {
      try {
        const { dirtyFields } = form.formState;
        if (dirtyFields.enabled) {
          await setUserMetadataFromClient({
            key: SOUND_NOTIFICATION_METADATA_KEYS.enabled,
            value: String(data.enabled),
          });
          await mutateEnabled();
        }
        if (dirtyFields.sound) {
          await setUserMetadataFromClient({
            key: SOUND_NOTIFICATION_METADATA_KEYS.sound,
            value: data.sound,
          });
          await mutateSound();
        }
        form.reset(data);
        succeeded = true;
      } catch (error) {
        sendNotification({
          type: "error",
          title: "Error updating sound notification preferences",
          description: error instanceof Error ? error.message : String(error),
        });
      }
    })();
    return succeeded;
  };

  return {
    control: form.control,
    isDirty: form.formState.isDirty,
    isLoading,
    save,
  };
}

interface SoundNotificationPreferencesProps {
  control: Control<SoundNotificationFormValues>;
  disabled: boolean;
}

export function SoundNotificationPreferences({
  control,
  disabled,
}: SoundNotificationPreferencesProps) {
  const { field: enabledField } = useController({ name: "enabled", control });
  const { field: soundField } = useController({ name: "sound", control });

  const handlePlay = () => {
    const audio = new Audio(
      `/sounds/${encodeURIComponent(soundField.value)}.mp3`
    );
    void audio.play();
  };

  return (
    <div className="rounded-xl border border-border dark:border-border-night">
      <div className="flex items-center p-4">
        <div className="flex flex-1 flex-col">
          <span className="heading-sm text-foreground dark:text-foreground-night">
            Manual actions sound notification
          </span>
          <span className="copy-sm text-muted-foreground dark:text-muted-foreground-night">
            Play a sound when a manual action is required
          </span>
        </div>
        <SliderToggle
          selected={enabledField.value}
          disabled={disabled}
          onClick={() => {
            const next = !enabledField.value;
            enabledField.onChange(next);
            if (
              next &&
              typeof Notification !== "undefined" &&
              Notification.permission === "default"
            ) {
              void Notification.requestPermission();
            }
          }}
        />
      </div>

      <div className="border-t border-border dark:border-border-night" />

      <div className="flex items-center p-4">
        <div className="flex flex-1 flex-col">
          <span
            className={cn(
              "heading-sm",
              enabledField.value
                ? "text-foreground dark:text-foreground-night"
                : "text-faint dark:text-faint-night"
            )}
          >
            Customize sound notification
          </span>
          <span
            className={cn(
              "copy-sm",
              enabledField.value
                ? "text-muted-foreground dark:text-muted-foreground-night"
                : "text-faint dark:text-faint-night"
            )}
          >
            Choose the sound you prefer
          </span>
        </div>
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="xs"
                label={soundField.value}
                isSelect
                disabled={disabled || !enabledField.value}
              />
            </DropdownMenuTrigger>
            <DropdownMenuContent mountPortal={false}>
              {SOUND_NOTIFICATION_OPTIONS.map((sound) => (
                <DropdownMenuItem
                  key={sound}
                  label={sound}
                  onClick={() => soundField.onChange(sound)}
                  endComponent={
                    soundField.value === sound ? (
                      <Icon
                        visual={Check}
                        size="xs"
                        className="text-muted-foreground dark:text-muted-foreground-night"
                      />
                    ) : undefined
                  }
                />
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            variant="ghost"
            size="xs"
            label="Play"
            className="text-highlight-500 dark:text-highlight-500-night"
            onClick={handlePlay}
            disabled={disabled || !enabledField.value}
          />
        </div>
      </div>
    </div>
  );
}
