import { useQueryParams } from "@app/hooks/useQueryParams";
import { useState } from "react";

export type FilesTab = "conversation" | "pod";

type ConversationFileExplorerState = {
  activeTab: FilesTab;
  setActiveTab: (tab: FilesTab) => void;
  convFolderPath: string;
  setConvFolderPath: (path: string) => void;
  podFolderPath: string;
  setPodFolderPath: (path: string) => void;
};

// Keeps the file explorer state in sync with the URL while only ever exposing a
// single `folderPath` query param. The active tab's folder navigation lives in
// the URL; the inactive tab's path is held in memory so it is preserved when
// switching tabs (a reload only restores the active tab, which is all a URL can
// meaningfully carry).
export function useConversationFileExplorerState({
  isPod,
}: {
  isPod: boolean;
}): ConversationFileExplorerState {
  const {
    fet: filesTab,
    fep: folderPath,
    setParams,
  } = useQueryParams(["fet", "fep"]);

  const activeTab: FilesTab =
    isPod && filesTab.value === "pod" ? "pod" : "conversation";

  const [stashedPaths, setStashedPaths] = useState<Record<FilesTab, string>>({
    conversation: "",
    pod: "",
  });

  const urlPath = folderPath.value ?? "";
  const convFolderPath =
    activeTab === "conversation" ? urlPath : stashedPaths.conversation;
  const podFolderPath = activeTab === "pod" ? urlPath : stashedPaths.pod;

  const setActiveTab = (tab: FilesTab) => {
    if (tab === activeTab) {
      return;
    }
    // Stash the current tab's path and restore the target tab's path to the URL
    // in a single navigation.
    setStashedPaths((prev) => ({ ...prev, [activeTab]: urlPath }));
    setParams({ fet: tab, fep: stashedPaths[tab] || undefined });
  };

  const setActivePath = (path: string) =>
    folderPath.setParam(path === "" ? undefined : path);

  const setConvFolderPath = (path: string) => {
    if (activeTab === "conversation") {
      setActivePath(path);
    } else {
      setStashedPaths((prev) => ({ ...prev, conversation: path }));
    }
  };

  const setPodFolderPath = (path: string) => {
    if (activeTab === "pod") {
      setActivePath(path);
    } else {
      setStashedPaths((prev) => ({ ...prev, pod: path }));
    }
  };

  return {
    activeTab,
    setActiveTab,
    convFolderPath,
    setConvFolderPath,
    podFolderPath,
    setPodFolderPath,
  };
}
