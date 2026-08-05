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
import { classNames } from "@app/lib/utils";
import {
  CheckCircle,
  Folder,
  MessageChatSquare,
  NavTabPill,
  NavTabPillList,
  NavTabPillTrigger,
  Settings01,
  Spinner,
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

  const isMobile = useIsMobile();

  const { currentTab, handleTabChange } = usePodTabs({
    podId,
    podUiPreferences,
    setPodUiPreferences,
  });

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
      <NavTabPill
        className="pt-2 flex min-h-0 flex-1 flex-col overflow-hidden"
        defaultValue="conversations"
        value={currentTab}
        onValueChange={(value) => handleTabChange(value as PodTab)}
      >
        <div
          className={classNames(
            "flex shrink-0 items-center justify-between border-b border-separator pb-2 px-2",
            isMobile && "pl-12"
          )}
        >
          <NavTabPillList>
            <NavTabPillTrigger value="conversations" icon={MessageChatSquare}>
              Conversations
            </NavTabPillTrigger>
            <NavTabPillTrigger value="tasks" icon={CheckCircle}>
              Tasks
            </NavTabPillTrigger>
            <NavTabPillTrigger value="files" icon={Folder}>
              Files
            </NavTabPillTrigger>
            <NavTabPillTrigger value="settings" icon={Settings01}>
              Settings
            </NavTabPillTrigger>
          </NavTabPillList>

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
      </NavTabPill>
    </div>
  );
}
