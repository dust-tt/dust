import config from "@app/lib/api/config";
import type { I18n } from "@lingui/core";
import { msg } from "@lingui/core/macro";

// Transactional emails come from a no-reply sender: point recipients to support instead.
export function contactSupportLine(i18n: I18n): string {
  const supportEmail = config.getSupportEmailAddress().email;
  return i18n._(msg`If you have any questions, contact us at ${supportEmail}.`);
}
