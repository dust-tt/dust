import { useUserMetadata } from "@app/lib/swr/user";
import { setUserMetadataFromClient } from "@app/lib/user";
import type { SoundNotificationType } from "@app/types/notification_preferences";
import {
  DEFAULT_SOUND_NOTIFICATION,
  isSoundNotificationType,
  SOUND_NOTIFICATION_METADATA_KEYS,
  SOUND_NOTIFICATION_OPTIONS,
} from "@app/types/notification_preferences";
import {
  Button,
  Check,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Icon,
  SliderToggle,
} from "@dust-tt/sparkle";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

export interface SoundNotificationPreferencesRefProps {
  savePreferences: () => Promise<boolean>;
  isDirty: () => boolean;
  reset: () => void;
}

interface SoundNotificationPreferencesProps {
  onChanged: () => void;
}

export const SoundNotificationPreferences = forwardRef<
  SoundNotificationPreferencesRefProps,
  SoundNotificationPreferencesProps
>(({ onChanged }, ref) => {
  const { metadata: enabledMetadata, mutateMetadata: mutateEnabled } =
    useUserMetadata(SOUND_NOTIFICATION_METADATA_KEYS.enabled);
  const { metadata: soundMetadata, mutateMetadata: mutateSound } =
    useUserMetadata(SOUND_NOTIFICATION_METADATA_KEYS.sound);

  const [isEnabled, setIsEnabled] = useState(false);
  const [selectedSound, setSelectedSound] = useState<SoundNotificationType>(
    DEFAULT_SOUND_NOTIFICATION
  );

  const originalEnabledRef = useRef(false);
  const originalSoundRef = useRef<SoundNotificationType>(
    DEFAULT_SOUND_NOTIFICATION
  );
  // Mirror the live values in refs so the parent can read `isDirty()`
  // synchronously from the change handler, without an effect that calls
  // `onChanged` on every render to keep the parent in sync.
  const currentEnabledRef = useRef(false);
  const currentSoundRef = useRef<SoundNotificationType>(
    DEFAULT_SOUND_NOTIFICATION
  );

  useEffect(() => {
    if (enabledMetadata?.value !== undefined) {
      const enabled = enabledMetadata.value === "true";
      setIsEnabled(enabled);
      currentEnabledRef.current = enabled;
      originalEnabledRef.current = enabled;
    }
  }, [enabledMetadata]);

  useEffect(() => {
    if (soundMetadata?.value && isSoundNotificationType(soundMetadata.value)) {
      setSelectedSound(soundMetadata.value);
      currentSoundRef.current = soundMetadata.value;
      originalSoundRef.current = soundMetadata.value;
    }
  }, [soundMetadata]);

  // Notify the parent at the moment the value changes so it can re-check the
  // dirty state for the Save button.
  const updateEnabled = (next: boolean) => {
    setIsEnabled(next);
    currentEnabledRef.current = next;
    onChanged();
  };

  const updateSelectedSound = (next: SoundNotificationType) => {
    setSelectedSound(next);
    currentSoundRef.current = next;
    onChanged();
  };

  useImperativeHandle(
    ref,
    () => ({
      savePreferences: async () => {
        try {
          if (isEnabled !== originalEnabledRef.current) {
            await setUserMetadataFromClient({
              key: SOUND_NOTIFICATION_METADATA_KEYS.enabled,
              value: String(isEnabled),
            });
            await mutateEnabled((current) =>
              current?.metadata
                ? {
                    metadata: { ...current.metadata, value: String(isEnabled) },
                  }
                : current
            );
            originalEnabledRef.current = isEnabled;
          }
          if (selectedSound !== originalSoundRef.current) {
            await setUserMetadataFromClient({
              key: SOUND_NOTIFICATION_METADATA_KEYS.sound,
              value: selectedSound,
            });
            await mutateSound((current) =>
              current?.metadata
                ? { metadata: { ...current.metadata, value: selectedSound } }
                : current
            );
            originalSoundRef.current = selectedSound;
          }
          return true;
        } catch {
          return false;
        }
      },
      isDirty: () =>
        currentEnabledRef.current !== originalEnabledRef.current ||
        currentSoundRef.current !== originalSoundRef.current,
      reset: () => {
        setIsEnabled(originalEnabledRef.current);
        setSelectedSound(originalSoundRef.current);
        currentEnabledRef.current = originalEnabledRef.current;
        currentSoundRef.current = originalSoundRef.current;
        onChanged();
      },
    }),
    [isEnabled, selectedSound, mutateEnabled, mutateSound, onChanged]
  );

  const handlePlay = () => {
    const audio = new Audio(`/sounds/${encodeURIComponent(selectedSound)}.mp3`);
    void audio.play();
  };

  return (
    <div className="rounded-xl border border-border dark:border-border-night">
      <div className="flex items-center p-4">
        <div className="flex flex-1 flex-col gap-1">
          <span className="text-sm font-semibold text-foreground dark:text-foreground-night">
            Manual actions sound notification
          </span>
          <span className="text-sm text-muted-foreground dark:text-muted-foreground-night">
            Play a sound when a manual action is required
          </span>
        </div>
        <SliderToggle
          selected={isEnabled}
          onClick={() => {
            const next = !isEnabled;
            updateEnabled(next);
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
        <div className="flex flex-1 flex-col gap-1">
          <span className="text-sm font-semibold text-foreground dark:text-foreground-night">
            Customize sound notification
          </span>
          <span className="text-sm text-muted-foreground dark:text-muted-foreground-night">
            Choose the sound you prefer
          </span>
        </div>
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="xs"
                label={selectedSound}
                isSelect
              />
            </DropdownMenuTrigger>
            <DropdownMenuContent mountPortal={false}>
              {SOUND_NOTIFICATION_OPTIONS.map((sound) => (
                <DropdownMenuItem
                  key={sound}
                  label={sound}
                  onClick={() => updateSelectedSound(sound)}
                  endComponent={
                    selectedSound === sound ? (
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
          />
        </div>
      </div>
    </div>
  );
});

SoundNotificationPreferences.displayName = "SoundNotificationPreferences";
