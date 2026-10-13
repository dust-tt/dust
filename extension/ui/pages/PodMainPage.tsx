import { BlockedActionsProvider } from "@app/components/assistant/conversation/BlockedActionsProvider";
import { GenerationContextProvider } from "@app/components/assistant/conversation/GenerationContextProvider";
import { PodPageContent } from "@app/components/pod/PodPageContent";
import { useScopedPodUiPreferences } from "@app/hooks/useScopedUIPreferences";
import {
  DEFAULT_POD_UI_PREFERENCES,
  type PodTab,
  usePodTabs,
} from "@app/hooks/useSpaceProjectTabs";
import { useAuth } from "@app/lib/auth/AuthContext";
import { useSpaceInfo } from "@app/lib/swr/spaces";
import {
  CheckCircle,
  Folder,
  MessageChatSquare,
  Spinner,
  Tabs,
  TabsList,
  TabsTrigger,
} from "@dust-tt/sparkle";
import { usePanelStateListener } from "@extension/shared/hooks/usePanelStateListener";
import { ConversationLayout } from "@extension/ui/components/conversation/ConversationLayout";
import { useClientSideMCPServerIds } from "@extension/ui/components/conversation/ExtensionClientSideMCPServerProvider";
import { Trans, useLingui } from "@lingui/react/macro";
import { useParams } from "react-router-dom";

export const PodMainPage = () => {
  const { t } = useLingui();
  const { workspace } = useAuth();
  const { podId } = useParams<{ podId: string }>();
  const clientSideMCPServerIds = useClientSideMCPServerIds();

  const {
    spaceInfo: podInfo,
    isSpaceInfoLoading: isPodInfoLoading,
    isSpaceInfoError: isPodInfoError,
    mutateSpaceInfo: mutatePodInfo,
  } = useSpaceInfo({
    workspaceId: workspace.sId,
    spaceId: podId ?? null,
    includeAllMembers: true,
  });

  const { value: podUiPreferences, setValue: setPodUiPreferences } =
    useScopedPodUiPreferences({
      scope: "podUi",
      resourceId: podId,
      defaultValue: DEFAULT_POD_UI_PREFERENCES,
    });

  const { currentTab, handleTabChange } = usePodTabs({
    podId: podId ?? null,
    podUiPreferences,
    setPodUiPreferences,
  });

  usePanelStateListener({
    workspaceId: workspace.sId,
    conversationId: null,
    podId: podId ?? null,
    isLoading: isPodInfoLoading,
  });

  if (isPodInfoLoading) {
    return (
      <ConversationLayout title="">
        <div className="flex h-full w-full items-center justify-center">
          <Spinner />
        </div>
      </ConversationLayout>
    );
  }

  if (isPodInfoError || !podInfo) {
    return (
      <ConversationLayout title="">
        <div className="flex h-full w-full items-center justify-center">
          <div className="text-center">
            <h2 className="text-lg font-semibold">
              <Trans>Pod not found</Trans>
            </h2>
            <p className="text-muted-foreground">
              <Trans>
                The Pod you’re looking for doesn’t exist or you don’t have
                access to it.
              </Trans>
            </p>
          </div>
        </div>
      </ConversationLayout>
    );
  }

  const conversationsLabel = t`Conversations`;
  const tasksLabel = t`Tasks`;
  const filesLabel = t`Files`;

  return (
    <Tabs
      value={currentTab}
      onValueChange={(value) => handleTabChange(value as PodTab)}
    >
      <ConversationLayout
        title=""
        centerActions={
          <div className="flex h-title items-end">
            <TabsList border={false}>
              <TabsTrigger
                value="conversations"
                {...(currentTab === "conversations"
                  ? { label: conversationsLabel }
                  : { tooltip: conversationsLabel })}
                icon={MessageChatSquare}
              />
              <TabsTrigger
                value="tasks"
                {...(currentTab === "tasks"
                  ? { label: tasksLabel }
                  : { tooltip: tasksLabel })}
                icon={CheckCircle}
              />
              <TabsTrigger
                value="files"
                {...(currentTab === "files"
                  ? { label: filesLabel }
                  : { tooltip: filesLabel })}
                icon={Folder}
              />
            </TabsList>
          </div>
        }
      >
        <BlockedActionsProvider owner={workspace}>
          <GenerationContextProvider>
            <PodPageContent
              podInfo={podInfo}
              onTabChange={handleTabChange}
              podUiPreferences={podUiPreferences}
              setPodUiPreferences={setPodUiPreferences}
              mutatePodInfo={mutatePodInfo}
              clientSideMCPServerIds={clientSideMCPServerIds}
            />
          </GenerationContextProvider>
        </BlockedActionsProvider>
      </ConversationLayout>
    </Tabs>
  );
};
