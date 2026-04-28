import type { WakeUpType } from "@app/types/assistant/wakeups";
import { assertNever } from "@app/types/shared/utils/assert_never";
import cronstrue from "cronstrue";

// Render an instant as "h:mm" (12-hour, no AM/PM) in the viewer's local
// timezone.
export function formatWakeUpTimeOfDay(timestamp: number): string {
  const date = new Date(timestamp);
  const hours = date.getHours() % 12 || 12;
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

// Compact label for the sidebar conversation-list wake-up indicator. When
// the next firing is more than a day away the time of day on its own gives
// the viewer no sense of when — show the abbreviated weekday instead.
export function formatWakeUpSidebarLabel(timestamp: number): string {
  if (timestamp - Date.now() > ONE_DAY_MS) {
    return new Date(timestamp).toLocaleDateString("en-US", {
      weekday: "short",
    });
  }
  return formatWakeUpTimeOfDay(timestamp);
}

// Human-friendly schedule phrase used in the wake-up banner and the
// "scheduled …" message in the input bar. Examples:
//   one_shot         -> "at 9:00"
//   "0 9 * * 1"      -> "at 09:00 AM, only on Monday"
//   "0 * * * *"      -> "every hour"
//   "*/15 * * * *"   -> "every 15 minutes"
// Cron times are shown verbatim from the schedule's stored timezone — no
// shift to the viewer's zone, no zone suffix.
export function describeWakeUpSchedule(wakeUp: WakeUpType): string {
  const config = wakeUp.scheduleConfig;
  switch (config.type) {
    case "one_shot":
      return `at ${formatWakeUpTimeOfDay(config.fireAt)}`;
    case "cron": {
      let description = cronstrue.toString(config.cron, { verbose: false });
      // cronstrue renders DOM steps as ", every N days in a month", which
      // reads awkwardly. Reword to natural English; "every 2" becomes
      // "every other".
      description = description.replace(
        /, every (\d+) days in a month/,
        (_, n: string) =>
          n === "2" ? ", every other day" : `, every ${n} days`
      );
      // Lowercase the first character so the phrase reads naturally after
      // the wake-up reason ("{reason} at 09:00 AM, only on Monday").
      return description.charAt(0).toLowerCase() + description.slice(1);
    }
    default:
      return assertNever(config);
  }
}
