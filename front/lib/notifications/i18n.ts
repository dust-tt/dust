import { loadCatalog } from "@app/lib/i18n/i18n";
import { UserResource } from "@app/lib/resources/user_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import type { SupportedLocale } from "@app/types/locale";
import { DEFAULT_LOCALE } from "@app/types/locale";
import type { I18n } from "@lingui/core";
import { setupI18n } from "@lingui/core";

export async function getNotificationLocale(
  subscriberId: string | undefined,
  workspaceId: string
): Promise<SupportedLocale> {
  if (!subscriberId) {
    return DEFAULT_LOCALE;
  }
  const [user, workspace] = await Promise.all([
    UserResource.fetchById(subscriberId),
    WorkspaceResource.fetchById(workspaceId),
  ]);
  if (!user || !workspace) {
    return DEFAULT_LOCALE;
  }
  return user.getLocale(renderLightWorkspaceType({ workspace }));
}

const i18nByLocale = new Map<SupportedLocale, Promise<I18n>>();

/**
 * @cc [owner:nfedrigo,label:product;concurrency] notifications-use-own-i18n
 * Notification text MUST be translated with the instance returned by `getNotificationI18n`, never
 * with the global `i18n` from `lib/i18n/i18n.ts`: the Novu bridge renders steps for different
 * recipients concurrently in one process, and activating the shared instance would leak one
 * recipient's locale into another's notification.
 */
export function getNotificationI18n(locale: SupportedLocale): Promise<I18n> {
  let instance = i18nByLocale.get(locale);
  if (!instance) {
    instance = loadCatalog(locale).then((messages) =>
      setupI18n({ locale, messages: { [locale]: messages } })
    );
    i18nByLocale.set(locale, instance);
  }
  return instance;
}
