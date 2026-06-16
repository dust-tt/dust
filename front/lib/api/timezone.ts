import moment from "moment-timezone";
import { z } from "zod";

const VALID_TIMEZONES = new Set(moment.tz.names());

export function isValidTimezone(timezone: string): boolean {
  return VALID_TIMEZONES.has(timezone);
}

export const timezoneSchema = z
  .string()
  .optional()
  .default("UTC")
  .refine((timezone) => isValidTimezone(timezone), {
    message: "Invalid IANA timezone",
  });
