import { InputBarProvider } from "@app/components/assistant/conversation/input_bar/InputBarContext";
import { SpaceConversationsPage } from "@app/components/pages/conversation/SpaceConversationsPage";
import { useAuth } from "@app/lib/auth/AuthContext";
import { useSpaceInfo } from "@app/lib/swr/spaces";
import { ConversationLayout } from "@extension/ui/components/conversation/ConversationLayout";
import { useParams } from "react-router-dom";

export const ProjectMainPage = () => {
  const { workspace } = useAuth();
  const { spaceId } = useParams<{ spaceId: string }>();

  const { spaceInfo } = useSpaceInfo({
    workspaceId: workspace.sId,
    spaceId: spaceId ?? null,
  });

  return (
    <ConversationLayout title={spaceInfo?.name ?? ""}>
      <InputBarProvider origin="extension">
        <SpaceConversationsPage />
      </InputBarProvider>
    </ConversationLayout>
  );
};
