import { isExternalSubscriberId } from "@app/lib/notifications/transactional_emails";
import { UserResource } from "@app/lib/resources/user_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import type { SupportedLocale } from "@app/types/locale";
import { DEFAULT_LOCALE } from "@app/types/locale";

/**
 * @cc [owner:Nils-Fedrigo,label:product] locale-of-the-notified-workspace
 * Returns the recipient user's own stored locale when `subscriberId` is a Dust user, and otherwise
 * the locale of `workspaceId`, the workspace the notification is about. Recipients without a Dust
 * user (no `subscriberId`, an external email subscriber, or an unknown user) MUST get
 * `workspaceId`'s locale. It MUST NOT fall back to any other workspace of the user. It returns
 * `DEFAULT_LOCALE` only when `workspaceId` does not exist.
 */
export async function getNotificationLocale(
  subscriberId: string | undefined,
  workspaceId: string
): Promise<SupportedLocale> {
  const workspace = await WorkspaceResource.fetchById(workspaceId);
  if (!workspace) {
    return DEFAULT_LOCALE;
  }
  if (!subscriberId || isExternalSubscriberId(subscriberId)) {
    return workspace.locale;
  }
  const user = await UserResource.fetchById(subscriberId);
  return user ? user.getLocale(workspace.locale) : workspace.locale;
}
