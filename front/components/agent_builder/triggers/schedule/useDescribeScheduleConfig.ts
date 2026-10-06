import { getActiveLocale } from "@app/lib/i18n/active_locale";
import {
  formatDate,
  formatTime,
  prefersTwentyFourHourTime,
} from "@app/lib/i18n/format";
import type { ScheduleConfig } from "@app/types/assistant/triggers";
import { isCronScheduleConfig } from "@app/types/assistant/triggers";
import type { SupportedLocale } from "@app/types/locale";
import { plural } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import cronstrue from "cronstrue";
import "cronstrue/locales/fr";
import { useCallback } from "react";

function formatWeekday(dayOfWeek: number, locale: SupportedLocale): string {
  return formatDate(
    new Date(2023, 0, 1 + dayOfWeek),
    { weekday: "long" },
    locale
  );
}

function formatTimeOfDay(
  hour: number,
  minute: number,
  locale: SupportedLocale
): string {
  return formatTime(
    new Date(2000, 0, 1, hour, minute),
    { hour: "numeric", minute: "2-digit" },
    locale
  );
}

export function useDescribeScheduleConfig() {
  const { t } = useLingui();

  return useCallback(
    (config: ScheduleConfig): string => {
      const locale = getActiveLocale();

      if (isCronScheduleConfig(config)) {
        try {
          return cronstrue.toString(config.cron, {
            locale: locale.split("-")[0],
            use24HourTimeFormat: prefersTwentyFourHourTime(locale),
          });
        } catch {
          return "";
        }
      }

      const time = formatTimeOfDay(config.hour, config.minute, locale);

      if (config.dayOfWeek !== null && config.intervalDays % 7 === 0) {
        const weeks = config.intervalDays / 7;
        const weekday = formatWeekday(config.dayOfWeek, locale);
        if (weeks === 1) {
          return t`Every ${weekday} at ${time}`;
        }
        return t`${plural(weeks, {
          one: `Every # week on ${weekday} at ${time}`,
          other: `Every # weeks on ${weekday} at ${time}`,
        })}`;
      }

      const intervalDays = config.intervalDays;
      if (intervalDays === 1) {
        return t`Every day at ${time}`;
      }
      return t`${plural(intervalDays, {
        one: `Every # day at ${time}`,
        other: `Every # days at ${time}`,
      })}`;
    },
    [t]
  );
}
