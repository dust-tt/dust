import { PodHeaderActions } from "@app/components/pod/PodHeaderActions";
import { PodPageContent } from "@app/components/pod/PodPageContent";
import { useActivePodId } from "@app/hooks/useActivePodId";
import { usePodFunctions } from "@app/hooks/usePodFunctions";
import { useScopedPodUiPreferences } from "@app/hooks/useScopedUIPreferences";
import {
  DEFAULT_POD_UI_PREFERENCES,
  type PodTab,
  usePodTabs,
} from "@app/hooks/useSpaceProjectTabs";
import {
  useAuth,
  useFeatureFlags,
  useWorkspace,
} from "@app/lib/auth/AuthContext";
import { useSpaceInfo } from "@app/lib/swr/spaces";
import { useIsMobile } from "@app/lib/swr/useIsMobile";
import {
  CheckCircle,
  Folder,
  MessageChatSquare,
  Settings01,
  Spinner,
  Tabs,
  TabsList,
  TabsTrigger,
  Zap,
} from "@dust-tt/sparkle";

export function PodPage() {
  const owner = useWorkspace();
  const { user } = useAuth();
  const podId = useActivePodId();
  const { hasFeature } = useFeatureFlags();

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

  // The Functions tab only exists once the pod has a function, so it costs nothing in the pods
  // that never get one. Same SWR key as the tab body, so this is one request, not two.
  const { podFunctions, isPodFunctionsLoading } = usePodFunctions({
    workspaceId: owner.sId,
    podId,
    disabled: !hasFeature("sandbox_functions"),
  });
  const hasPodFunctions = podFunctions.length > 0;

  // A pod can lose its last function while someone has the tab selected, which would strand them
  // on a tab with no trigger. Falling back at render rather than rewriting the stored preference
  // keeps the choice: if the pod gets a function again, the tab comes back selected. Waits for
  // the list to resolve so the tab does not flicker on every load.
  const effectiveTab =
    currentTab === "functions" && !isPodFunctionsLoading && !hasPodFunctions
      ? "conversations"
      : currentTab;

  if (isPodsInfoLoading) {
    return (
      <div className="flex h-full w-full items-center justify-center mt-8">
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
        value={effectiveTab}
        onValueChange={(value) => handleTabChange(value as PodTab)}
        className="flex min-h-0 flex-1 flex-col overflow-hidden pt-2"
      >
        <div className="flex shrink-0 items-start justify-between border-b border-separator pl-14 pr-6 lg:px-6">
          <TabsList border={false}>
            <TabsTrigger
              value="conversations"
              label={compactPodTabs ? undefined : "Conversations"}
              tooltip={compactPodTabs ? "Conversations" : undefined}
              icon={MessageChatSquare}
            />
            <TabsTrigger
              value="tasks"
              label={compactPodTabs ? undefined : "Tasks"}
              tooltip={compactPodTabs ? "Tasks" : undefined}
              icon={CheckCircle}
            />
            <TabsTrigger
              value="files"
              label={compactPodTabs ? undefined : "Files"}
              tooltip={compactPodTabs ? "Files" : undefined}
              icon={Folder}
            />
            {hasPodFunctions && (
              <TabsTrigger
                value="functions"
                label={compactPodTabs ? undefined : "Functions"}
                tooltip={compactPodTabs ? "Functions" : undefined}
                icon={Zap}
              />
            )}
            <TabsTrigger
              value="settings"
              label={compactPodTabs ? undefined : "Settings"}
              tooltip={compactPodTabs ? "Settings" : undefined}
              icon={Settings01}
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
