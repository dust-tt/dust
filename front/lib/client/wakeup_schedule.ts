import { getActiveLocale } from "@app/lib/i18n/active_locale";
import { prefersTwentyFourHourTime } from "@app/lib/i18n/format";
import {
  formatWakeUpTimeOfDay,
  rewordEnglishCronDescription,
  rewordFrenchCronDescription,
} from "@app/lib/utils/wakeup_description";
import type { WakeUpType } from "@app/types/assistant/wakeups";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import cronstrue from "cronstrue";
import "cronstrue/locales/fr";

type Translate = (descriptor: MessageDescriptor) => string;

// Human-friendly schedule phrase used in the wake-up banner and the
// "scheduled …" message in the input bar. Examples:
//   one_shot         -> "at 09:00"
//   "0 9 * * 1"      -> "at 09:00, only on Monday"
//   "0 * * * *"      -> "every hour"
//   "*/15 * * * *"   -> "every 15 minutes"
// Cron times are shown verbatim from the schedule's stored timezone — no
// shift to the viewer's zone, no zone suffix.
/**
 * @cc [owner:sfriquet,label:product] wakeup-schedule-in-ui-locale
 * Cron schedules MUST be described by cronstrue in the language of the UI locale
 * (`getActiveLocale`), and the one-shot "at …" phrase MUST come from the `t` passed by the caller,
 * so the phrase matches the language of the surrounding UI text. The English rewording of
 * cronstrue's output MUST only apply when that language is English, and the French rewording only
 * when it is French.
 */
export function describeWakeUpSchedule(
  wakeUp: Pick<WakeUpType, "scheduleConfig">,
  t: Translate
): string {
  const config = wakeUp.scheduleConfig;
  switch (config.type) {
    case "one_shot": {
      const time = formatWakeUpTimeOfDay(config.fireAt);
      return t(msg`at ${time}`);
    }
    case "cron": {
      const language = getActiveLocale().split("-")[0];
      let description = cronstrue.toString(config.cron, {
        locale: language,
        verbose: false,
        use24HourTimeFormat: prefersTwentyFourHourTime(),
      });
      if (language === "en") {
        description = rewordEnglishCronDescription(description);
      }
      if (language === "fr") {
        description = rewordFrenchCronDescription(description);
      }
      // Lowercase the first character so the phrase reads naturally after
      // the wake-up reason ("{reason} at 09:00, only on Monday").
      return description.charAt(0).toLowerCase() + description.slice(1);
    }
    default:
      assertNeverAndIgnore(config);
      return "";
  }
}
