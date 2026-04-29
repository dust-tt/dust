import type { WakeUpType } from "@app/types/assistant/wakeups";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import { CronExpressionParser } from "cron-parser";
import cronstrue from "cronstrue";

// Render an instant as a localized time of day in the viewer's local
// timezone. The locale is resolved from the browser/OS so users in 24h
// regions see "14:30" and users in 12h regions see "2:30 PM".
export function formatWakeUpTimeOfDay(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Whether the viewer's locale prefers 24-hour time. Used to keep cron
// schedule descriptions (rendered by cronstrue) consistent with the
// time-of-day strings produced by `formatWakeUpTimeOfDay` above.
function prefers24HourTime(): boolean {
  const { hourCycle } = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
  }).resolvedOptions();
  return hourCycle === "h23" || hourCycle === "h24";
}

// Compute the millisecond timestamp of the next time a wake-up fires. For
// one-shot schedules this is the stored `fireAt`; for cron schedules we
// resolve the next firing in the schedule's stored timezone.
export function getNextWakeUpFireAt(wakeUp: WakeUpType): number {
  const config = wakeUp.scheduleConfig;
  switch (config.type) {
    case "one_shot":
      return config.fireAt;
    case "cron":
      return CronExpressionParser.parse(config.cron, { tz: config.timezone })
        .next()
        .toDate()
        .getTime();
    default:
      assertNeverAndIgnore(config);
      // Unknown schedule type from a newer server: treat as "fires now" so
      // the optimistic-clear timer clears the indicator on the next tick.
      return Date.now();
  }
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
//   one_shot         -> "at 09:00"
//   "0 9 * * 1"      -> "at 09:00, only on Monday"
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
      let description = cronstrue.toString(config.cron, {
        verbose: false,
        use24HourTimeFormat: prefers24HourTime(),
      });
      // cronstrue renders DOM steps as ", every N days in a month", which
      // reads awkwardly. Reword to natural English; "every 2" becomes
      // "every other".
      description = description.replace(
        /, every (\d+) days in a month/,
        (_, n: string) =>
          n === "2" ? ", every other day" : `, every ${n} days`
      );
      // Lowercase the first character so the phrase reads naturally after
      // the wake-up reason ("{reason} at 09:00, only on Monday").
      return description.charAt(0).toLowerCase() + description.slice(1);
    }
    default:
      assertNeverAndIgnore(config);
      return "";
  }
}
