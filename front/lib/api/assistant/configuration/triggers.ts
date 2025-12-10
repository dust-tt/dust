import { getCronTimezoneGeneration } from "@app/lib/api/assistant/configuration/triggers/cron_timezone";
import type { Authenticator } from "@app/lib/auth";
import type { Result } from "@app/types";
import { Err, Ok } from "@app/types";

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

export async function generateCronRule(
  auth: Authenticator,
  inputs: { naturalDescription: string; defaultTimezone: string }
): Promise<Result<{ cron: string; timezone: string }, Error>> {
  const res = await getCronTimezoneGeneration(auth, inputs);

  if (res.isErr()) {
    return res;
  }

  const { cron: cronRule, timezone } = res.value;

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

  return new Ok({ cron: cronRule, timezone });
}
