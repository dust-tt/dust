// Common personal/free email providers
// These are legitimate email services used for personal (non-work) email
const PERSONAL_EMAIL_DOMAINS = new Set([
  // Google
  "gmail.com",
  "googlemail.com",
  // Microsoft
  "outlook.com",
  "outlook.fr",
  "outlook.de",
  "outlook.es",
  "outlook.it",
  "outlook.co.uk",
  "hotmail.com",
  "hotmail.fr",
  "hotmail.de",
  "hotmail.es",
  "hotmail.it",
  "hotmail.co.uk",
  "live.com",
  "live.fr",
  "live.de",
  "live.co.uk",
  "msn.com",
  // Yahoo
  "yahoo.com",
  "yahoo.fr",
  "yahoo.de",
  "yahoo.es",
  "yahoo.it",
  "yahoo.co.uk",
  "yahoo.co.jp",
  "ymail.com",
  "rocketmail.com",
  // Apple
  "icloud.com",
  "me.com",
  "mac.com",
  // ProtonMail
  "protonmail.com",
  "protonmail.ch",
  "proton.me",
  "pm.me",
  // Other major providers
  "aol.com",
  "zoho.com",
  "mail.com",
  "gmx.com",
  "gmx.de",
  "gmx.fr",
  "web.de",
  "t-online.de",
  "orange.fr",
  "free.fr",
  "laposte.net",
  "sfr.fr",
  "wanadoo.fr",
  "bbox.fr",
  "yandex.com",
  "yandex.ru",
  "mail.ru",
  "inbox.com",
  "fastmail.com",
  "tutanota.com",
  "hey.com",
]);

export function isPersonalEmailDomain(emailDomain: string): boolean {
  return PERSONAL_EMAIL_DOMAINS.has(emailDomain.toLowerCase());
}
