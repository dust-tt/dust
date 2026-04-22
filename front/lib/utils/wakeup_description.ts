import type { WakeUpType } from "@app/types/assistant/wakeups";

// Short time label for the next firing of a wake-up. V1 only handles the
// two supported scheduleConfig shapes; PR 7 will replace this with richer
// formatting when we support non-daily cron patterns.
export function formatWakeUpTime(wakeUp: WakeUpType): string {
  if (wakeUp.scheduleConfig.type === "one_shot") {
    return new Date(wakeUp.scheduleConfig.fireAt).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  const [minute, hour] = wakeUp.scheduleConfig.cron.split(/\s+/);
  return `${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`;
}

// Human-friendly schedule phrase for the banner.
export function describeWakeUpSchedule(wakeUp: WakeUpType): string {
  const time = formatWakeUpTime(wakeUp);
  return wakeUp.scheduleConfig.type === "one_shot"
    ? `at ${time}`
    : `Run everyday at ${time}`;
}
