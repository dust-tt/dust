import { Page } from "@dust-tt/sparkle";
import type { ProtectedRouteChildrenProps } from "@extension/components/auth/ProtectedRoute";
import { ConversationContainer } from "@extension/components/conversation/ConversationContainer";

export const MainPage = ({ user, workspace }: ProtectedRouteChildrenProps) => {
  return (
    <div className="h-full w-full pt-28">
      <Page.SectionHeader title={`Hi ${user.firstName},`} />
      <ConversationContainer
        owner={workspace}
        conversationId={null}
        user={user}
      />
    </div>
  );
};
