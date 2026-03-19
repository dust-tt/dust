import { SpaceConversationsPage } from "@app/components/pages/conversation/SpaceConversationsPage";
import { useAuth } from "@app/lib/auth/AuthContext";
import { useSpaceInfo } from "@app/lib/swr/spaces";
import { ConversationLayout } from "@extension/ui/components/conversation/ConversationLayout";
import { ExtensionInputBarProvider } from "@extension/ui/components/conversation/ExtensionInputBarProvider";
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
      <ExtensionInputBarProvider workspace={workspace}>
        <SpaceConversationsPage />
      </ExtensionInputBarProvider>
    </ConversationLayout>
  );
};
