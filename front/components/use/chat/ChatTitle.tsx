import { ChatSessionType } from "@app/types/chat";
import { UserType, WorkspaceType } from "@app/types/user";

export function AppLayoutChatTitle({
  owner,
  user,
  session,
  title,
  titleState,
}: {
  owner: WorkspaceType;
  user: UserType | null;
  session: ChatSessionType;
  title: string;
  titleState: "new" | "writing" | "saving" | "saved";
}) {
  return (
    <div className="flex h-full flex-row items-center">
      <div className="flex flex-initial font-bold">{title}</div>
    </div>
  );
}
