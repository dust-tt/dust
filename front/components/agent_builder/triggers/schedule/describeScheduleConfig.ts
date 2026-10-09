import { getActiveLocale } from "@app/lib/i18n/active_locale";
import {
  formatDate,
  formatTime,
  prefersTwentyFourHourTime,
} from "@app/lib/i18n/format";
import { rewordFrenchCronDescription } from "@app/lib/utils/wakeup_description";
import type { ScheduleConfig } from "@app/types/assistant/triggers";
import { isCronScheduleConfig } from "@app/types/assistant/triggers";
import type { SupportedLocale } from "@app/types/locale";
import type { MessageDescriptor } from "@lingui/core";
import { msg, plural } from "@lingui/core/macro";
import cronstrue from "cronstrue";
import "cronstrue/locales/fr";

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

export function describeScheduleConfig(
  config: ScheduleConfig,
  t: (descriptor: MessageDescriptor) => string
): string {
  const locale = getActiveLocale();

  if (isCronScheduleConfig(config)) {
    try {
      const language = locale.split("-")[0];
      const description = cronstrue.toString(config.cron, {
        locale: language,
        use24HourTimeFormat: prefersTwentyFourHourTime(locale),
      });
      return language === "fr"
        ? rewordFrenchCronDescription(description)
        : description;
    } catch {
      return "";
    }
  }

  const time = formatTimeOfDay(config.hour, config.minute, locale);

  if (config.dayOfWeek !== null && config.intervalDays % 7 === 0) {
    const weeks = config.intervalDays / 7;
    const weekday = formatWeekday(config.dayOfWeek, locale);
    if (weeks === 1) {
      return t(msg`Every ${weekday} at ${time}`);
    }
    return t(
      msg`${plural(weeks, {
        one: `Every # week on ${weekday} at ${time}`,
        other: `Every # weeks on ${weekday} at ${time}`,
      })}`
    );
  }

  const intervalDays = config.intervalDays;
  if (intervalDays === 1) {
    return t(msg`Every day at ${time}`);
  }
  return t(
    msg`${plural(intervalDays, {
      one: `Every # day at ${time}`,
      other: `Every # days at ${time}`,
    })}`
  );
}
