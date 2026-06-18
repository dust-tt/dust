import { useUserMetadata } from "@app/lib/swr/user";
import {
  DEFAULT_SOUND_NOTIFICATION,
  isSoundNotificationType,
  SOUND_NOTIFICATION_METADATA_KEYS,
} from "@app/types/notification_preferences";
import { useCallback, useEffect, useState } from "react";

let audioContext: AudioContext | null = null;
const audioBufferCache = new Map<string, AudioBuffer>();
let unlockListenerAttached = false;

function getAudioContext(): AudioContext {
  if (!audioContext || audioContext.state === "closed") {
    audioContext = new AudioContext();
  }
  return audioContext;
}

function attachUnlockListener(): void {
  if (unlockListenerAttached) {
    return;
  }
  unlockListenerAttached = true;

  const unlock = () => {
    const ctx = getAudioContext();
    if (ctx.state === "suspended") {
      void ctx.resume();
    }
  };

  window.addEventListener("click", unlock);
  window.addEventListener("keydown", unlock);
}

function showNotification(): void {
  if (Notification.permission === "granted") {
    new Notification("Dust — Action required", {
      body: "A manual action requires your approval.",
      icon: "/favicon.ico",
    });
  }
}

async function playViaAudioContext(soundName: string): Promise<void> {
  const ctx = getAudioContext();
  if (ctx.state === "suspended") {
    await ctx.resume();
  }
  if (ctx.state !== "running") {
    throw new Error("AudioContext could not resume — no user gesture");
  }

  let buffer = audioBufferCache.get(soundName);
  if (!buffer) {
    const response = await fetch(
      `/sounds/${encodeURIComponent(soundName)}.mp3`
    );
    const arrayBuffer = await response.arrayBuffer();
    buffer = await ctx.decodeAudioData(arrayBuffer);
    audioBufferCache.set(soundName, buffer);
  }

  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(ctx.destination);
  source.start(0);
}

async function playSound(soundName: string): Promise<void> {
  // AudioContext works in background tabs — always try audio first.
  // Fall back to a browser notification only if the context is not running
  // (e.g. no prior user gesture since page load).
  try {
    await playViaAudioContext(soundName);
  } catch {
    showNotification();
  }
}

export function useSoundNotification() {
  const { metadata: enabledMetadata, isMetadataLoading: isEnabledLoading } =
    useUserMetadata(SOUND_NOTIFICATION_METADATA_KEYS.enabled);
  const { metadata: soundMetadata, isMetadataLoading: isSoundLoading } =
    useUserMetadata(SOUND_NOTIFICATION_METADATA_KEYS.sound);

  const [pendingSound, setPendingSound] = useState(false);

  useEffect(() => {
    attachUnlockListener();
  }, []);

  const requestManualActionSound = useCallback(() => {
    setPendingSound(true);
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
  ]);

  return { requestManualActionSound };
}
