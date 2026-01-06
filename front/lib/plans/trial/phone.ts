export const CODE_LENGTH = 6;
export const RESEND_COOLDOWN_SECONDS = 60;

// NOTE: This is a limited list of country codes for demonstration purposes.
export const COUNTRY_CODES = [
  { code: "+33", flag: "\u{1F1EB}\u{1F1F7}", country: "France" },
  { code: "+1", flag: "\u{1F1FA}\u{1F1F8}", country: "United States" },
  { code: "+44", flag: "\u{1F1EC}\u{1F1E7}", country: "United Kingdom" },
  { code: "+49", flag: "\u{1F1E9}\u{1F1EA}", country: "Germany" },
  { code: "+34", flag: "\u{1F1EA}\u{1F1F8}", country: "Spain" },
  { code: "+39", flag: "\u{1F1EE}\u{1F1F9}", country: "Italy" },
  { code: "+81", flag: "\u{1F1EF}\u{1F1F5}", country: "Japan" },
  { code: "+86", flag: "\u{1F1E8}\u{1F1F3}", country: "China" },
  { code: "+91", flag: "\u{1F1EE}\u{1F1F3}", country: "India" },
  { code: "+61", flag: "\u{1F1E6}\u{1F1FA}", country: "Australia" },
] as const;

// TODO: Replace with actual verification service.
const VALID_TEST_CODE = "424242";

export type CountryCode = (typeof COUNTRY_CODES)[number];

// NOTE: Placeholder implementation. Will be reworked with the phone validation service.
export function isValidPhoneNumber(phone: string): boolean {
  const digitsOnly = phone.replace(/[\s\-().]/g, "");
  return /^\d{6,15}$/.test(digitsOnly);
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
