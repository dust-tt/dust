import type { I18n } from "@lingui/core";

/**
 * Returns ` <url|Continue on Dust>.`, to append to a sentence, or an empty string without URL.
 */
export function makeContinueOnDustSuffix(
  i18n: I18n,
  conversationUrl: string | null
): string {
  return conversationUrl
    ? ` <${conversationUrl}|${i18n._("Continue on Dust")}>.`
    : "";
}
