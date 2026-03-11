import { getCronTimezoneGeneration } from "@app/lib/api/assistant/configuration/triggers/cron_timezone";
import type { Authenticator } from "@app/lib/auth";
import type { ScheduleConfig } from "@app/types/assistant/triggers";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

function isValidIANATimezone(timezone: string): boolean {
  // Get the list of all supported IANA timezones
  const supportedTimezones = Intl.supportedValuesOf("timeZone");
  return supportedTimezones.includes(timezone);
}

function isTooFrequentCron(cron: string): boolean {
  return !cron.split(" ")[0].match(/^\d+$/);
}

export const GENERIC_ERROR_MESSAGE =
  "Unable to generate a schedule. Please try rephrasing.";
export const INVALID_TIMEZONE_MESSAGE =
  'Unable to generate the schedule, timezone returned by the model don\'t follow the IANA standard (i.e "Europe/Paris"). Please try rephrasing.';
export const TOO_FREQUENT_MESSAGE =
  "Unable to generate a schedule: it can't be more frequent than hourly. Please try rephrasing.";

// Standard cron regex - does NOT support # (nth occurrence) or L (last) operators
const CRON_REGEXP =
  /^((((\d+,)+\d+|(\d+(\/|-)\d+)|\d+|\*(\/\d+)?|\?|[A-Z]{3}(-[A-Z]{3})?) ?){5,7})|(@(annually|yearly|monthly|weekly|daily|hourly|reboot))|(@every (\d+(ns|us|µs|ms|s|m|h))+)$/;

function validateIntervalConfig(config: {
  intervalDays: number;
  dayOfWeek: number | null;
  hour: number;
  minute: number;
  timezone: string;
}): string | null {
  if (config.intervalDays <= 0 || !Number.isInteger(config.intervalDays)) {
    return "Invalid interval: intervalDays must be a positive integer.";
  }
  if (
    config.dayOfWeek !== null &&
    (config.dayOfWeek < 0 || config.dayOfWeek > 6)
  ) {
    return "Invalid interval: dayOfWeek must be 0-6 or null.";
  }
  if (config.hour < 0 || config.hour > 23) {
    return "Invalid interval: hour must be 0-23.";
  }
  if (config.minute < 0 || config.minute > 59) {
    return "Invalid interval: minute must be 0-59.";
  }
  if (!isValidIANATimezone(config.timezone)) {
    return INVALID_TIMEZONE_MESSAGE;
  }
  return null;
}

export async function generateScheduleRule(
  auth: Authenticator,
  inputs: { naturalDescription: string; defaultTimezone: string }
): Promise<Result<ScheduleConfig, Error>> {
  const res = await getCronTimezoneGeneration(auth, inputs);

  if (res.isErr()) {
    return res;
  }

  const config = res.value;

  if (config.type === "interval") {
    // Safety net: if intervalDays is 7 with a dayOfWeek, convert to weekly cron.
    if (config.intervalDays === 7 && config.dayOfWeek !== null) {
      const cronRule = `${config.minute} ${config.hour} * * ${config.dayOfWeek}`;
      return new Ok({
        type: "cron",
        cron: cronRule,
        timezone: config.timezone,
      });
    }

    const validationError = validateIntervalConfig(config);
    if (validationError) {
      return new Err(new Error(validationError));
    }

    return new Ok(config);
  }

  // Cron validation (existing logic).
  const cronRule = "cron" in config ? config.cron : undefined;
  const { timezone } = config;

  if (
    !cronRule ||
    cronRule.split(" ").length !== 5 ||
    !cronRule.match(CRON_REGEXP)
  ) {
    return new Err(new Error(GENERIC_ERROR_MESSAGE));
  }

  if (isTooFrequentCron(cronRule)) {
    return new Err(new Error(TOO_FREQUENT_MESSAGE));
  }

  if (!timezone || !isValidIANATimezone(timezone)) {
    return new Err(new Error(INVALID_TIMEZONE_MESSAGE));
  }

  return new Ok({ type: "cron", cron: cronRule, timezone });
}
