import { getActiveLocale } from "@app/lib/i18n/active_locale";
import {
  formatDate,
  formatRelativeTime,
  formatTime,
} from "@app/lib/i18n/format";
import { INVALID_DATE_LABEL } from "@app/lib/utils/timestamps";
import type { SupportedLocale } from "@app/types/locale";
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

function formatDayLabel(dayOffset: -1 | 0 | 1, locale: SupportedLocale) {
  return capitalize(
    formatRelativeTime(dayOffset, "day", { numeric: "auto" }, locale)
  );
}

function formatWeekday(date: Date, locale: SupportedLocale) {
  return formatDate(date, { weekday: "long" }, locale);
}

function formatDayAtTime(day: string, time: string, t: Translate) {
  return t(msg`${day} at ${time}`);
}

/**
 * @cc [owner:sfriquet,label:product] calendar-date-in-ui-locale
 * Calendar labels MUST format their day names, weekdays, times and dates in the UI locale
 * (`getActiveLocale`), passed explicitly to the formatters, and MUST NOT fall back to the default
 * locale of `lib/i18n/format.ts`, which is the browser's when the `localisation` flag is off: a
 * French browser MUST then get "Yesterday", not "Hier". "Today", "Yesterday" and "Tomorrow" MUST
 * come from `numeric: "auto"`, capitalized. The words around them ("Last …", "… at …") MUST come
 * from the `t` passed by the caller.
 */
export function formatCalendarDate(date: Date | number, t: Translate): string {
  const dateObj = toDate(date);
  if (!isValid(dateObj)) {
    return INVALID_DATE_LABEL;
  }

  const locale = getActiveLocale();

  if (isToday(dateObj)) {
    return formatDayLabel(0, locale);
  }
  if (isTomorrow(dateObj)) {
    return formatDayLabel(1, locale);
  }
  if (isYesterday(dateObj)) {
    return formatDayLabel(-1, locale);
  }

  const now = new Date();
  const diffInDays = Math.floor(
    (now.getTime() - dateObj.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (diffInDays > 0 && diffInDays <= 7) {
    const weekday = formatWeekday(dateObj, locale);
    return t(msg`Last ${weekday}`);
  }

  if (diffInDays < 0 && diffInDays >= -7) {
    return formatWeekday(dateObj, locale);
  }

  return formatDate(dateObj, NUMERIC_DATE_OPTIONS, locale);
}

export function formatCalendarDateTime(
  date: Date | number,
  t: Translate,
  now: Date = new Date()
): string {
  const dateObj = toDate(date);
  if (!isValid(dateObj)) {
    return INVALID_DATE_LABEL;
  }

  const locale = getActiveLocale();

  // Calendar-day distance is DST-safe: a 23h or 25h day still counts as exactly one day.
  const diffDays = differenceInCalendarDays(dateObj, now);
  const timeWithSeconds = formatTime(
    dateObj,
    TIME_WITH_SECONDS_OPTIONS,
    locale
  );

  if (diffDays === 0) {
    return formatDayAtTime(formatDayLabel(0, locale), timeWithSeconds, t);
  }
  if (diffDays === -1) {
    return formatDayAtTime(formatDayLabel(-1, locale), timeWithSeconds, t);
  }
  if (diffDays >= -6 && diffDays < -1) {
    const weekday = formatWeekday(dateObj, locale);
    const time = timeWithSeconds;
    return t(msg`Last ${weekday} at ${time}`);
  }

  // moment's built-in future formats use LT (no seconds), unlike the overridden past ones.
  const timeWithoutSeconds = formatTime(
    dateObj,
    TIME_WITHOUT_SECONDS_OPTIONS,
    locale
  );
  if (diffDays === 1) {
    return formatDayAtTime(formatDayLabel(1, locale), timeWithoutSeconds, t);
  }
  if (diffDays > 1 && diffDays < 7) {
    return formatDayAtTime(
      formatWeekday(dateObj, locale),
      timeWithoutSeconds,
      t
    );
  }

  return formatDate(dateObj, NUMERIC_DATE_OPTIONS, locale);
}
