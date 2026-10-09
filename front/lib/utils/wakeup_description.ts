import { formatDate, formatTime } from "@app/lib/i18n/format";
import type { WakeUpScheduleConfig } from "@app/types/assistant/wakeups";
import type { SupportedLocale } from "@app/types/locale";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import { ONE_DAY_MS } from "@app/types/shared/utils/date_utils";
import { CronExpressionParser } from "cron-parser";

// Render an instant as a localized time of day in the viewer's local
// timezone. The locale is resolved from the browser/OS so users in 24h
// regions see "14:30" and users in 12h regions see "2:30 PM".
export function formatWakeUpTimeOfDay(timestamp: number): string {
  const date = new Date(timestamp);
  return formatTime(date, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Compute the millisecond timestamp of the next time a wake-up fires. For
// one-shot schedules this is the stored `fireAt`; for cron schedules we
// resolve the next firing in the schedule's stored timezone.
export function getNextWakeUpFireAtFromScheduleConfig(
  scheduleConfig: WakeUpScheduleConfig
): number | null {
  switch (scheduleConfig.type) {
    case "one_shot":
      return scheduleConfig.fireAt;
    case "cron":
      try {
        return CronExpressionParser.parse(scheduleConfig.cron, {
          tz: scheduleConfig.timezone,
        })
          .next()
          .toDate()
          .getTime();
      } catch {
        return null;
      }
    default:
      assertNeverAndIgnore(scheduleConfig);
      return null;
  }
}

// Compact label for the sidebar conversation-list wake-up indicator. When
// the next firing is more than a day away the time of day on its own gives
// the viewer no sense of when — show the abbreviated weekday instead.
export function formatWakeUpSidebarLabel(
  timestamp: number,
  locale: SupportedLocale
): string {
  if (timestamp - Date.now() > ONE_DAY_MS) {
    return formatDate(timestamp, { weekday: "short" }, locale);
  }
  return formatWakeUpTimeOfDay(timestamp);
}

// cronstrue renders DOM steps as ", every N days in a month", which reads
// awkwardly. Reword to natural English; "every 2" becomes "every other".
export function rewordEnglishCronDescription(description: string): string {
  return description.replace(/, every (\d+) days in a month/, (_, n: string) =>
    n === "2" ? ", every other day" : `, every ${n} days`
  );
}

const FRENCH_WEEKDAYS = "lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche";

export function rewordFrenchCronDescription(description: string): string {
  return description
    .replace(/'/g, "’")
    .replace(/\b(le|du) 1\b/g, "$1 1er")
    .replace(
      new RegExp(`\\bde (${FRENCH_WEEKDAYS}) à (${FRENCH_WEEKDAYS})\\b`, "g"),
      "du $1 au $2"
    );
}
