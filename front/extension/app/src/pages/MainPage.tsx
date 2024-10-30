import type { ProtectedRouteChildrenProps } from "@app/extension/app/src/components/auth/ProtectedRoute";
import { ConversationContainer } from "@app/extension/app/src/components/conversation/ConversationContainer";
import { Button, HistoryIcon, Page } from "@dust-tt/sparkle";
import { useNavigate } from "react-router-dom";

export const MainPage = ({ user, workspace }: ProtectedRouteChildrenProps) => {
  const navigate = useNavigate();

  return (
    <div className="h-full w-full pt-4">
      <div className="flex items-center justify-between pb-2">
        <Page.SectionHeader title={`Hi ${user.firstName},`} />
        <Button
          icon={HistoryIcon}
          variant="outline"
          onClick={() => navigate("/conversations")}
          size="xs"
        />
      </div>
      <ConversationContainer owner={workspace} conversationId={null} />
    </div>
  );
};
