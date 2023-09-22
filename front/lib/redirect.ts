import { getUserMetadata } from "@app/lib/api/user";
import { isOnAssistantV2 } from "@app/lib/assistant";
import { UserType, WorkspaceType } from "@app/types/user";

export async function getRedirectPathFromStickyPath(
  user: UserType,
  workspace: WorkspaceType
): Promise<string | null> {
  const m = await getUserMetadata(user, "sticky_path");
  if (!m) {
    return null;
  }

  if (isOnAssistantV2(workspace) && m.value.indexOf("/u/chat") > -1) {
    return m.value.replace("/u/chat", "/assistant/new");
  }
  return m.value;
}
