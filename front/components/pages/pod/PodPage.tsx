import { EditPodFileTabDialog } from "@app/components/pod/files/EditPodFileTabDialog";
import { PodHeaderActions } from "@app/components/pod/PodHeaderActions";
import { PodPageContent } from "@app/components/pod/PodPageContent";
import { getIcon } from "@app/components/resources/resources_icons";
import { useActivePodId } from "@app/hooks/useActivePodId";
import { useScopedPodUiPreferences } from "@app/hooks/useScopedUIPreferences";
import {
  DEFAULT_POD_UI_PREFERENCES,
  isValidPodTabValue,
  usePodTabs,
} from "@app/hooks/useSpaceProjectTabs";
import {
  useAuth,
  useFeatureFlags,
  useWorkspace,
} from "@app/lib/auth/AuthContext";
import { useActivationPod } from "@app/lib/swr/activation";
import { useSpaceInfo } from "@app/lib/swr/spaces";
import { useIsMobile } from "@app/lib/swr/useIsMobile";
import { classNames } from "@app/lib/utils";
import type { PodFileTab } from "@app/types/pod_file_tab";
import {
  buildPodNavItemsBeforeSettings,
  makePodFileTabValue,
  normalizeTabsOrder,
  parsePodFileTabPath,
  sortPodFileTabs,
} from "@app/types/pod_file_tab";
import { assertNever } from "@app/types/shared/utils/assert_never";
import {
  CheckCircle,
  CloudArrowLeftRight,
  Folder,
  MessageChatSquare,
  NavTabPill,
  NavTabPillList,
  NavTabPillTrigger,
  Settings01,
  Spinner,
} from "@dust-tt/sparkle";
import { useEffect, useMemo, useState } from "react";

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
  connected_data: {
    label: "Connected Data",
    icon: CloudArrowLeftRight,
  },
} as const;

export function PodPage() {
  const owner = useWorkspace();
  const { user } = useAuth();
  const { hasFeature } = useFeatureFlags();
  const podId = useActivePodId();
  const { podKind } = useActivationPod({ workspaceId: owner.sId, podId });
  const isGoalPod = podKind === "goal";
  const hasFileTabs = hasFeature("pod_frame_tabs");
  const [editingFileTab, setEditingFileTab] = useState<PodFileTab | null>(null);

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
    isAdminControlled: podInfo?.isAdminControlled,
  });

  const fileTabs = useMemo(
    () => (hasFileTabs ? sortPodFileTabs(podInfo?.frameTabs ?? []) : []),
    [hasFileTabs, podInfo?.frameTabs]
  );

  const tabsOrder = useMemo(
    () =>
      hasFileTabs
        ? normalizeTabsOrder(
            podInfo?.tabsOrder ?? [],
            fileTabs.map((tab) => tab.path)
          )
        : [],
    [fileTabs, hasFileTabs, podInfo?.tabsOrder]
  );

  const navVisibility = useMemo(
    () => ({
      includeConnectedData: !!podInfo?.isAdminControlled,
    }),
    [podInfo?.isAdminControlled]
  );

  const navItemsBeforeSettings = useMemo(
    () => buildPodNavItemsBeforeSettings(fileTabs, tabsOrder, navVisibility),
    [fileTabs, tabsOrder, navVisibility]
  );

  // Drop file-tab selection when the flag is off or the tab was removed
  // (including restored preference pointing at a deleted tab).
  useEffect(() => {
    const filePath = parsePodFileTabPath(currentTab);
    if (!filePath) {
      return;
    }
    if (!hasFileTabs || !fileTabs.some((tab) => tab.path === filePath)) {
      handleTabChange("conversations");
    }
  }, [currentTab, fileTabs, handleTabChange, hasFileTabs]);

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
          <NavTabPillList>
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
                  const tabValue = makePodFileTabValue(item.tab.path);
                  return (
                    <NavTabPillTrigger
                      key={item.tab.path}
                      value={tabValue}
                      icon={getIcon(item.tab.icon)}
                      onPointerDown={() => {
                        // Re-click of the already-active tab opens the editor.
                        if (podInfo.isEditor && currentTab === tabValue) {
                          setEditingFileTab(item.tab);
                        }
                      }}
                    >
                      {item.tab.title}
                    </NavTabPillTrigger>
                  );
                }
                default: {
                  assertNever(kind);
                }
              }
            })}
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

      {editingFileTab && (
        <EditPodFileTabDialog
          key={editingFileTab.path}
          owner={owner}
          podId={podInfo.sId}
          fileTabs={fileTabs}
          tabsOrder={tabsOrder}
          isEditor={podInfo.isEditor}
          navVisibility={navVisibility}
          tab={editingFileTab}
          isOpen
          onClose={() => setEditingFileTab(null)}
        />
      )}
    </div>
  );
}
