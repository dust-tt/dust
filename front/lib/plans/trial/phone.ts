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
 * Masks a phone number for display, showing only the first and last two digits.
 */
export function maskPhoneNumber(countryCode: string, phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 3) {
    return `${countryCode} ${digits}`;
  }
  const first = digits[0];
  const last = digits.slice(-2);
  const middleLength = digits.length - 3;
  const masked = "** ".repeat(Math.ceil(middleLength / 2)).trim();
  return `${countryCode} ${first} ${masked} ${last}`;
}

/**
 * Verifies the phone verification code.
 * TODO: Replace with actual SMS verification service.
 */
export function isValidVerificationCode(code: string): boolean {
  return code === VALID_TEST_CODE;
}
