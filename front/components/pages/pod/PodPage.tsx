import { PodFileTabNavTrigger } from "@app/components/pod/PodFileTabNavTrigger";
import { PodHeaderActions } from "@app/components/pod/PodHeaderActions";
import { PodNavAddFileTabButton } from "@app/components/pod/PodNavAddFileTabButton";
import { PodPageContent } from "@app/components/pod/PodPageContent";
import { useActivePodId } from "@app/hooks/useActivePodId";
import { useScopedPodUiPreferences } from "@app/hooks/useScopedUIPreferences";
import {
  DEFAULT_POD_UI_PREFERENCES,
  isValidPodTabValue,
  usePodTabs,
} from "@app/hooks/useSpaceProjectTabs";
import { useAuth, useWorkspace } from "@app/lib/auth/AuthContext";
import { useActivationPod } from "@app/lib/swr/activation";
import { usePodFiles } from "@app/lib/swr/pods";
import { useSpaceInfo } from "@app/lib/swr/spaces";
import { useIsMobile } from "@app/lib/swr/useIsMobile";
import { classNames } from "@app/lib/utils";
import {
  buildPodNavItemsBeforeSettings,
  normalizeTabsOrder,
  parsePodFileTabPath,
  sortPodFileTabs,
} from "@app/types/pod_file_tab";
import { assertNever } from "@app/types/shared/utils/assert_never";
import {
  CheckCircle,
  cn,
  Folder,
  MessageChatSquare,
  NavTabPill,
  NavTabPillList,
  NavTabPillTrigger,
  Settings01,
  Spinner,
} from "@dust-tt/sparkle";
import { useEffect, useMemo } from "react";

const SYSTEM_TAB_TRIGGERS = {
  conversations: {
    label: "Conversations",
    icon: MessageChatSquare,
  },
  tasks: {
    label: "Tasks",
    icon: CheckCircle,
  },
  files: {
    label: "Files",
    icon: Folder,
  },
} as const;

const MISSING_FILE_TAB_TRIGGER_CLASSNAME = cn(
  "text-warning-700 hover:bg-warning-50",
  "data-[state=active]:bg-warning-50 data-[state=active]:text-warning-700"
);

export function PodPage() {
  const owner = useWorkspace();
  const { user } = useAuth();
  const podId = useActivePodId();
  const { podKind } = useActivationPod({ workspaceId: owner.sId, podId });
  const isGoalPod = podKind === "goal";

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

  const { files: podFiles, isPodFilesLoading } = usePodFiles({
    owner,
    podId,
  });

  const fileTabs = useMemo(
    () => sortPodFileTabs(podInfo?.frameTabs ?? []),
    [podInfo?.frameTabs]
  );

  const podFilePaths = useMemo(
    () =>
      new Set(
        podFiles.filter((file) => !file.isDirectory).map((file) => file.path)
      ),
    [podFiles]
  );

  const tabsOrder = useMemo(
    () =>
      normalizeTabsOrder(
        podInfo?.tabsOrder ?? [],
        fileTabs.map((tab) => tab.path)
      ),
    [fileTabs, podInfo?.tabsOrder]
  );

  const navItemsBeforeSettings = useMemo(
    () => buildPodNavItemsBeforeSettings(fileTabs, tabsOrder),
    [fileTabs, tabsOrder]
  );

  // Drop file-tab selection when the flag is off or the tab was removed
  // (including restored preference pointing at a deleted tab).
  useEffect(() => {
    const filePath = parsePodFileTabPath(currentTab);
    if (!filePath) {
      return;
    }
    if (!fileTabs.some((tab) => tab.path === filePath)) {
      handleTabChange("conversations");
    }
  }, [currentTab, fileTabs, handleTabChange]);

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
        onValueChange={(value) => {
          if (isValidPodTabValue(value)) {
            handleTabChange(value);
          }
        }}
      >
        <div
          className={classNames(
            "flex shrink-0 items-center justify-between border-b border-separator pb-2 px-2",
            isMobile && "pl-12"
          )}
        >
          <NavTabPillList className="group/pod-tabs">
            {navItemsBeforeSettings.map((item) => {
              const kind = item.kind;
              switch (kind) {
                case "system": {
                  const trigger = SYSTEM_TAB_TRIGGERS[item.id];
                  return (
                    <NavTabPillTrigger
                      key={item.id}
                      value={item.id}
                      icon={trigger.icon}
                    >
                      {trigger.label}
                    </NavTabPillTrigger>
                  );
                }
                case "file": {
                  const isFileMissing =
                    !isPodFilesLoading && !podFilePaths.has(item.tab.path);
                  return (
                    <PodFileTabNavTrigger
                      key={item.tab.path}
                      owner={owner}
                      podId={podInfo.sId}
                      fileTabs={fileTabs}
                      tabsOrder={tabsOrder}
                      isEditor={podInfo.isEditor}
                      tab={item.tab}
                      className={
                        isFileMissing
                          ? MISSING_FILE_TAB_TRIGGER_CLASSNAME
                          : undefined
                      }
                    />
                  );
                }
                default: {
                  assertNever(kind);
                }
              }
            })}
            {podInfo.isEditor && (
              <PodNavAddFileTabButton
                owner={owner}
                podId={podInfo.sId}
                fileTabs={fileTabs}
                tabsOrder={tabsOrder}
              />
            )}
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
          isGoalPod={isGoalPod}
          onTabChange={handleTabChange}
          podUiPreferences={podUiPreferences}
          setPodUiPreferences={setPodUiPreferences}
          mutatePodInfo={mutatePodInfo}
          fileTabs={fileTabs}
        />
      </NavTabPill>
    </div>
  );
}
