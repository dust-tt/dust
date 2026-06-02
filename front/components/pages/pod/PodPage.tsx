import { PodHeaderActions } from "@app/components/pod/PodHeaderActions";
import { PodPageContent } from "@app/components/pod/PodPageContent";
import { useActivePodId } from "@app/hooks/useActivePodId";
import { useScopedPodUiPreferences } from "@app/hooks/useScopedUIPreferences";
import {
  DEFAULT_POD_UI_PREFERENCES,
  type PodTab,
  usePodTabs,
} from "@app/hooks/useSpaceProjectTabs";
import { useAuth, useWorkspace } from "@app/lib/auth/AuthContext";
import { useSpaceInfo } from "@app/lib/swr/spaces";
import { useIsMobile } from "@app/lib/swr/useIsMobile";
import {
  ChatBubbleLeftRightIcon,
  CheckCircleIcon,
  Cog6ToothIcon,
  FolderIcon,
  Spinner,
  Tabs,
  TabsList,
  TabsTrigger,
} from "@dust-tt/sparkle";

export function PodPage() {
  const owner = useWorkspace();
  const { user } = useAuth();
  const podId = useActivePodId();

  const {
    spaceInfo: podInfo,
    isSpaceInfoLoading: isPodsInfoLoading,
    isSpaceInfoError: podInfoError,
    mutateSpaceInfo: mutatePodInfo,
  } = useSpaceInfo({
    workspaceId: owner.sId,
    spaceId: podId,
    includeAllMembers: true,
  });

  const { value: podUiPreferences, setValue: setPodUiPreferences } =
    useScopedPodUiPreferences({
      scope: "podUi",
      resourceId: podId,
      defaultValue: DEFAULT_POD_UI_PREFERENCES,
    });

  const compactPodTabs = useIsMobile();

  const { currentTab, handleTabChange } = usePodTabs({
    podId,
    podUiPreferences,
    setPodUiPreferences,
  });

  if (isPodsInfoLoading) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (podInfoError || !podInfo) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <div className="text-center">
          <h2 className="text-lg font-semibold">Pod not found</h2>
          <p className="text-muted-foreground">
            The Pod you&apos;re looking for doesn&apos;t exist or you don&apos;t
            have access to it.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden">
      <Tabs
        value={currentTab}
        onValueChange={(value) => handleTabChange(value as PodTab)}
        className="flex min-h-0 flex-1 flex-col overflow-hidden pt-3"
      >
        <div className="flex shrink-0 items-start justify-between border-b border-separator pl-14 pr-6 lg:px-6 dark:border-separator-night">
          <TabsList border={false}>
            <TabsTrigger
              value="conversations"
              label={compactPodTabs ? undefined : "Conversations"}
              tooltip={compactPodTabs ? "Conversations" : undefined}
              icon={ChatBubbleLeftRightIcon}
            />
            <TabsTrigger
              value="tasks"
              label={compactPodTabs ? undefined : "Tasks"}
              tooltip={compactPodTabs ? "Tasks" : undefined}
              icon={CheckCircleIcon}
            />
            <TabsTrigger
              value="files"
              label={compactPodTabs ? undefined : "Files"}
              tooltip={compactPodTabs ? "Files" : undefined}
              icon={FolderIcon}
            />
            <TabsTrigger
              value="settings"
              label={compactPodTabs ? undefined : "Settings"}
              tooltip={compactPodTabs ? "Settings" : undefined}
              icon={Cog6ToothIcon}
            />
          </TabsList>

          {podInfo.kind === "project" &&
            (podInfo.isMember || !podInfo.isRestricted) && (
              <PodHeaderActions
                isMember={podInfo.isMember}
                isRestricted={podInfo.isRestricted}
                members={podInfo.members}
                owner={owner}
                podId={podInfo.sId}
                podName={podInfo.name}
                user={user}
              />
            )}
        </div>

        <PodPageContent
          podInfo={podInfo}
          onTabChange={handleTabChange}
          podUiPreferences={podUiPreferences}
          setPodUiPreferences={setPodUiPreferences}
          mutatePodInfo={mutatePodInfo}
        />
      </Tabs>
    </div>
  );
}
