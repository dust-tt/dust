import { useUserMetadata } from "@app/lib/swr/user";
import {
  DEFAULT_SOUND_NOTIFICATION,
  isSoundNotificationType,
  SOUND_NOTIFICATION_METADATA_KEYS,
} from "@app/types/notification_preferences";
import { useCallback, useEffect, useRef, useState } from "react";

const MANUAL_ACTION_SOUND_DEBOUNCE_MS = 1000;
const MANUAL_ACTION_SOUND_LAST_CHIME_KEY =
  "dust:manual-action-sound:last-chime-ms";
const MANUAL_ACTION_SOUND_LOCK_NAME = "dust:manual-action-sound";

function showNotification(): void {
  if (Notification.permission === "granted") {
    new Notification("Dust — Action required", {
      body: "A manual action requires your approval.",
      icon: "/favicon.ico",
    });
  }
}

function claimChimeFromStorage(nowMs: number): boolean {
  try {
    const lastChimeAtMs = Number(
      window.localStorage.getItem(MANUAL_ACTION_SOUND_LAST_CHIME_KEY)
    );
    if (
      lastChimeAtMs &&
      nowMs - lastChimeAtMs < MANUAL_ACTION_SOUND_DEBOUNCE_MS
    ) {
      return false;
    }
    window.localStorage.setItem(
      MANUAL_ACTION_SOUND_LAST_CHIME_KEY,
      String(nowMs)
    );
    return true;
  } catch {
    return true;
  }
}

async function canChimeManualActionSound(nowMs: number): Promise<boolean> {
  if (!("locks" in navigator)) {
    return claimChimeFromStorage(nowMs);
  }
  return navigator.locks.request(MANUAL_ACTION_SOUND_LOCK_NAME, () =>
    claimChimeFromStorage(nowMs)
  );
}

export function useSoundNotification() {
  const { metadata: enabledMetadata, isMetadataLoading: isEnabledLoading } =
    useUserMetadata(SOUND_NOTIFICATION_METADATA_KEYS.enabled);
  const { metadata: soundMetadata, isMetadataLoading: isSoundLoading } =
    useUserMetadata(SOUND_NOTIFICATION_METADATA_KEYS.sound);

  const [pendingSound, setPendingSound] = useState(false);

  const audioContextRef = useRef<AudioContext | null>(null);
  const audioBufferCacheRef = useRef<Map<string, AudioBuffer>>(new Map());

  const getAudioContext = useCallback(() => {
    if (
      !audioContextRef.current ||
      audioContextRef.current.state === "closed"
    ) {
      audioContextRef.current = new AudioContext();
    }
    return audioContextRef.current;
  }, []);

  useEffect(() => {
    const unlock = () => {
      const ctx = getAudioContext();
      if (ctx.state === "suspended") {
        void ctx.resume();
      }
    };

    window.addEventListener("click", unlock);
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("click", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, [getAudioContext]);

  const playSound = useCallback(
    async (soundName: string) => {
      try {
        const ctx = getAudioContext();
        if (ctx.state === "suspended") {
          await ctx.resume();
        }
        if (ctx.state !== "running") {
          throw new Error("AudioContext could not resume — no user gesture");
        }

        let buffer = audioBufferCacheRef.current.get(soundName);
        if (!buffer) {
          const response = await fetch(
            `/sounds/${encodeURIComponent(soundName)}.mp3`
          );
          if (!response.ok) {
            throw new Error(`Failed to fetch sound: ${response.status}`);
          }
          const arrayBuffer = await response.arrayBuffer();
          buffer = await ctx.decodeAudioData(arrayBuffer);
          audioBufferCacheRef.current.set(soundName, buffer);
        }

        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        source.start(0);
      } catch {
        showNotification();
      }
    },
    [getAudioContext]
  );

  const requestManualActionSound = useCallback(() => {
    void canChimeManualActionSound(Date.now()).then((canChime) => {
      if (canChime) {
        setPendingSound(true);
      }
    });
  }, []);

  useEffect(() => {
    if (!pendingSound || isEnabledLoading || isSoundLoading) {
      return;
    }
    if (enabledMetadata?.value === "true") {
      const sound =
        soundMetadata?.value && isSoundNotificationType(soundMetadata.value)
          ? soundMetadata.value
          : DEFAULT_SOUND_NOTIFICATION;
      void playSound(sound);
    }
    setPendingSound(false);
  }, [
    pendingSound,
    enabledMetadata,
    isEnabledLoading,
    soundMetadata,
    isSoundLoading,
    playSound,
  ]);

  return { requestManualActionSound };
}
