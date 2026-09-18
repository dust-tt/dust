import parsePhoneNumber, {
  parsePhoneNumberFromString,
} from "libphonenumber-js";
import { isValidPhoneNumber as libIsValidPhoneNumber } from "react-phone-number-input";

export const CODE_LENGTH = 6;
export const RESEND_COOLDOWN_SECONDS = 60;

/**
 * Validates a phone number using libphonenumber-js.
 * This validation ensures the phone number is valid for SMS services like Twilio.
 * @param phone - Phone number in E.164 format (e.g., "+33612345678")
 * @returns true if the phone number is valid and can receive SMS
 */
export function isValidPhoneNumber(phone: string): boolean {
  if (!phone || !phone.trim()) {
    return false;
  }

  return libIsValidPhoneNumber(phone);
}

/**
 * Try to parse a string as a phone number and return the E.164 format.
 * Handles: "+33612345678", "+33 6 12 34 56 78", "33612345678" (missing +).
 * @returns E.164 string (e.g., "+33612345678") or null if not a valid phone number
 */
export function tryParsePhoneNumber(input: string): string | null {
  const cleaned = input.replace(/[\s\-()]/g, "");

  // Try parsing as-is (works for E.164 like "+33612345678").
  const parsed = parsePhoneNumberFromString(cleaned);
  if (parsed && isValidPhoneNumber(parsed.number)) {
    return parsed.number;
  }

  // If the input is all digits, try adding a "+" prefix (handles "33612345678").
  if (/^\d{7,15}$/.test(cleaned)) {
    const withPlus = parsePhoneNumberFromString(`+${cleaned}`);
    if (withPlus && isValidPhoneNumber(withPlus.number)) {
      return withPlus.number;
    }
  }

  return null;
}

/**
 * Masks a phone number for display, showing only the last two digits.
 * @param phone - Phone number in E.164 format (e.g., "+33612345678")
 * @returns Masked phone number (e.g., "+33 ********78")
 */
export function maskPhoneNumber(phone: string): string {
  const parsed = parsePhoneNumber(phone);
  if (!parsed) {
    return phone;
  }

  const national = parsed.nationalNumber;
  const lastDigits = national.slice(-2);
  const masked = "*".repeat(Math.max(0, national.length - 2)) + lastDigits;

  return `+${parsed.countryCallingCode} ${masked}`;
}
