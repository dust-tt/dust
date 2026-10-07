import { getActiveLocale } from "@app/lib/i18n/active_locale";
import {
  formatDate,
  formatRelativeTime,
  formatTime,
} from "@app/lib/i18n/format";
import type { SupportedLocale } from "@app/types/locale";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import {
  differenceInCalendarDays,
  isToday,
  isTomorrow,
  isValid,
  isYesterday,
  toDate,
} from "date-fns";
import capitalize from "lodash/capitalize";
import upperFirst from "lodash/upperFirst";

type Translate = (descriptor: MessageDescriptor) => string;

const NUMERIC_DATE_OPTIONS: Intl.DateTimeFormatOptions = {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
};

const TIME_WITH_SECONDS_OPTIONS: Intl.DateTimeFormatOptions = {
  timeStyle: "medium",
};

const TIME_WITHOUT_SECONDS_OPTIONS: Intl.DateTimeFormatOptions = {
  timeStyle: "short",
};

function formatRelativeDay(dayOffset: -1 | 0 | 1, locale: SupportedLocale) {
  return formatRelativeTime(dayOffset, "day", { numeric: "auto" }, locale);
}

function formatDayLabel(dayOffset: -1 | 0 | 1, locale: SupportedLocale) {
  return capitalize(formatRelativeDay(dayOffset, locale));
}

function formatWeekday(date: Date, locale: SupportedLocale) {
  return formatDate(date, { weekday: "long" }, locale);
}

// `kind` lets the caller's message choose the words around the day ("Updated yesterday", "Updated
// last Monday", "Updated on 09/02/2026"). A "relative" day is lowercase ("yesterday").
export interface CalendarDay {
  kind: "relative" | "lastWeekday" | "weekday" | "date";
  day: string;
}

export function getCalendarDay(date: Date | number): CalendarDay | null {
  const dateObj = toDate(date);
  if (!isValid(dateObj)) {
    return null;
  }

  const locale = getActiveLocale();

  if (isToday(dateObj)) {
    return { kind: "relative", day: formatRelativeDay(0, locale) };
  }
  if (isTomorrow(dateObj)) {
    return { kind: "relative", day: formatRelativeDay(1, locale) };
  }
  if (isYesterday(dateObj)) {
    return { kind: "relative", day: formatRelativeDay(-1, locale) };
  }

  const now = new Date();
  const diffInDays = Math.floor(
    (now.getTime() - dateObj.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (diffInDays > 0 && diffInDays <= 7) {
    return { kind: "lastWeekday", day: formatWeekday(dateObj, locale) };
  }

  if (diffInDays < 0 && diffInDays >= -7) {
    return { kind: "weekday", day: formatWeekday(dateObj, locale) };
  }

  return {
    kind: "date",
    day: formatDate(dateObj, NUMERIC_DATE_OPTIONS, locale),
  };
}

/**
 * @cc [owner:sfriquet,label:product] calendar-date-in-ui-locale
 * Calendar labels and `getCalendarDay` MUST format their day names, weekdays, times and dates in
 * the UI locale (`getActiveLocale`), passed explicitly to the formatters, and MUST NOT fall back to
 * the default locale of `lib/i18n/format.ts`, which is the browser's when the `localisation` flag
 * is off: a French browser MUST then get "Yesterday", not "Hier". "Today", "Yesterday" and
 * "Tomorrow" MUST come from `numeric: "auto"`. The words around them ("Last …", "… at …") MUST NOT
 * be part of a `CalendarDay`'s `day`: the labels take them from the `t` passed by the caller, as one
 * message per kind of day.
 */
/**
 * @cc [owner:sfriquet,label:product] calendar-label-starts-uppercase
 * Labels returned by `formatCalendarDate` and `formatCalendarDateTime` MUST start with an uppercase
 * letter when they start with a letter, in every locale: a French "dimanche dernier à 09:30" MUST
 * read "Dimanche dernier à 09:30", like "Hier à 09:30".
 */
export function formatCalendarDate(date: Date | number, t: Translate): string {
  const calendarDay = getCalendarDay(date);
  if (!calendarDay) {
    return t(msg`Invalid date`);
  }

  switch (calendarDay.kind) {
    case "relative":
      return capitalize(calendarDay.day);
    case "lastWeekday": {
      const weekday = calendarDay.day;
      return upperFirst(t(msg`Last ${weekday}`));
    }
    case "weekday":
    case "date":
      return upperFirst(calendarDay.day);
    default:
      assertNever(calendarDay.kind);
  }
}

export function formatCalendarDateTime(
  date: Date | number,
  t: Translate,
  now: Date = new Date()
): string {
  const dateObj = toDate(date);
  if (!isValid(dateObj)) {
    return t(msg`Invalid date`);
  }

  const locale = getActiveLocale();

  // Calendar-day distance is DST-safe: a 23h or 25h day still counts as exactly one day.
  const diffDays = differenceInCalendarDays(dateObj, now);
  const timeWithSeconds = formatTime(
    dateObj,
    TIME_WITH_SECONDS_OPTIONS,
    locale
  );

  if (diffDays === 0 || diffDays === -1) {
    const day = formatDayLabel(diffDays, locale);
    const time = timeWithSeconds;
    return t(msg`${day} at ${time}`);
  }
  if (diffDays >= -6 && diffDays < -1) {
    const weekday = formatWeekday(dateObj, locale);
    const time = timeWithSeconds;
    return upperFirst(t(msg`Last ${weekday} at ${time}`));
  }

  // moment's built-in future formats use LT (no seconds), unlike the overridden past ones.
  const timeWithoutSeconds = formatTime(
    dateObj,
    TIME_WITHOUT_SECONDS_OPTIONS,
    locale
  );
  if (diffDays === 1) {
    const day = formatDayLabel(1, locale);
    const time = timeWithoutSeconds;
    return t(msg`${day} at ${time}`);
  }
  if (diffDays > 1 && diffDays < 7) {
    const weekday = formatWeekday(dateObj, locale);
    const time = timeWithoutSeconds;
    return upperFirst(t(msg`${weekday} at ${time}`));
  }

  return upperFirst(formatDate(dateObj, NUMERIC_DATE_OPTIONS, locale));
}
