import { setupI18n } from "@lingui/core";
import { SPARKLE_SOURCE_LOCALE } from "@sparkle/lib/i18n/locales";
import { messages as sourceLocaleMessages } from "@sparkle/locales/en-US/messages";

// Lingui has one global `i18n` object, and it belongs to the app using sparkle (e.g. front). If
// sparkle used it too, sparkle could change the app's language and vice versa, and sparkle would
// show no text in apps that never set Lingui up. So sparkle creates its own object, already loaded
// and set to English.
// Synchronous, so that sparkle renders before any other catalog loads.
export const sourceLocaleI18n = setupI18n({
  locale: SPARKLE_SOURCE_LOCALE,
  messages: { [SPARKLE_SOURCE_LOCALE]: sourceLocaleMessages },
});
