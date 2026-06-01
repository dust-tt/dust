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
  ChatBubbleLeftRightIcon,
  CheckCircleIcon,
  Spinner,
  Tabs,
  TabsList,
  TabsTrigger,
} from "@dust-tt/sparkle";
import { ConversationLayout } from "@extension/ui/components/conversation/ConversationLayout";
import { ExtensionInputBarProvider } from "@extension/ui/components/conversation/ExtensionInputBarProvider";
import { useParams } from "react-router-dom";

export const PodMainPage = () => {
  const { workspace } = useAuth();
  const { podId } = useParams<{ podId: string }>();

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
            <h2 className="text-lg font-semibold">Pod not found</h2>
            <p className="text-muted-foreground">
              The Pod you&apos;re looking for doesn&apos;t exist or you
              don&apos;t have access to it.
            </p>
          </div>
        </div>
      </ConversationLayout>
    );
  }

  return (
    <Tabs
      value={currentTab}
      onValueChange={(value) => handleTabChange(value as PodTab)}
    >
      <ConversationLayout
        title=""
        centerActions={
          <div className="flex h-14 items-end">
            <TabsList border={false}>
              <TabsTrigger
                value="conversations"
                label="Conversations"
                icon={ChatBubbleLeftRightIcon}
              />
              <TabsTrigger value="tasks" label="Tasks" icon={CheckCircleIcon} />
            </TabsList>
          </div>
        }
      >
        <BlockedActionsProvider owner={workspace}>
          <GenerationContextProvider>
            <ExtensionInputBarProvider workspace={workspace}>
              <PodPageContent
                podInfo={podInfo}
                onTabChange={handleTabChange}
                podUiPreferences={podUiPreferences}
                setPodUiPreferences={setPodUiPreferences}
                mutatePodInfo={mutatePodInfo}
              />
            </ExtensionInputBarProvider>
          </GenerationContextProvider>
        </BlockedActionsProvider>
      </ConversationLayout>
    </Tabs>
  );
};
