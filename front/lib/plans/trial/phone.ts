import parsePhoneNumber from "libphonenumber-js";
import { isValidPhoneNumber as libIsValidPhoneNumber } from "react-phone-number-input";

export const CODE_LENGTH = 6;
export const RESEND_COOLDOWN_SECONDS = 60;

// TODO: Replace with actual verification service.
const VALID_TEST_CODE = "424242";

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

/**
 * Verifies the phone verification code.
 * TODO: Replace with actual SMS verification service.
 */
export function isValidVerificationCode(code: string): boolean {
  return code === VALID_TEST_CODE;
}
