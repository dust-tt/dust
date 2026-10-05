import { UserResource } from "@app/lib/resources/user_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import type { SupportedLocale } from "@app/types/locale";
import { DEFAULT_LOCALE } from "@app/types/locale";

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
  return user.getLocale(workspace.locale);
}
